import 'server-only'

import { createHash, createHmac } from 'node:crypto'

/**
 * Cloudflare R2 pela API compatível com S3 (docs/armazenamento-r2.md). A
 * assinatura AWS SigV4 é feita aqui, sem SDK: só o que a Redação usa —
 * enviar, conferir, ler, listar e apagar objetos.
 *
 * Variáveis: R2_ACCOUNT_ID (ou R2_ENDPOINT, para jurisdição), R2_ACCESS_KEY_ID
 * e R2_SECRET_ACCESS_KEY. Sem elas, configDoR2() devolve null e quem chama
 * segue sem o R2.
 */

export type ConfigDoR2 = { endpoint: string; chave: string; segredo: string }

export function configDoR2(): ConfigDoR2 | null {
  const conta = process.env.R2_ACCOUNT_ID?.trim()
  const endpoint = (process.env.R2_ENDPOINT?.trim() || (conta ? `https://${conta}.r2.cloudflarestorage.com` : '')).replace(/\/+$/, '')
  const chave = process.env.R2_ACCESS_KEY_ID?.trim()
  const segredo = process.env.R2_SECRET_ACCESS_KEY?.trim()
  if (!endpoint || !chave || !segredo) return null
  if (!/^https:\/\/[a-z0-9.-]+$/i.test(endpoint)) throw new Error('R2_ENDPOINT precisa ser o endereço https da conta, sem caminho.')
  return { endpoint, chave, segredo }
}

export class ErroDoR2 extends Error {
  constructor(readonly status: number, readonly codigo: string | null, mensagem: string) {
    super(mensagem)
    this.name = 'ErroDoR2'
  }
}

const REGIAO = 'auto'
const SERVICO = 's3'

const sha256Hex = (dados: Buffer | string) => createHash('sha256').update(dados).digest('hex')
const hmac = (chave: Buffer | string, texto: string) => createHmac('sha256', chave).update(texto, 'utf8').digest()
/** RFC 3986, como o SigV4 pede (encodeURIComponent deixa !'()* passarem). */
const codificar = (s: string) => encodeURIComponent(s).replace(/[!'()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`)
const desfazerXml = (s: string) => s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&')

type Pedido = {
  metodo: 'GET' | 'PUT' | 'HEAD' | 'DELETE'
  bucket: string
  chave?: string
  consulta?: Record<string, string>
  corpo?: Buffer
  cabecalhos?: Record<string, string>
}

async function pedir(config: ConfigDoR2, p: Pedido): Promise<Response> {
  if (!/^[a-z0-9][a-z0-9-]{1,61}[a-z0-9]$/.test(p.bucket)) throw new Error(`Nome de bucket inválido: ${p.bucket}`)
  const caminho = `/${p.bucket}${p.chave ? `/${p.chave.split('/').map(codificar).join('/')}` : ''}`
  const consulta = Object.entries(p.consulta ?? {})
    .map(([k, v]) => [codificar(k), codificar(v)] as const)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([k, v]) => `${k}=${v}`)
    .join('&')
  const url = new URL(`${config.endpoint}${caminho}${consulta ? `?${consulta}` : ''}`)
  const agora = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '')
  const dia = agora.slice(0, 8)
  const hashDoCorpo = sha256Hex(p.corpo ?? '')
  const cabecalhos: Record<string, string> = {
    ...Object.fromEntries(Object.entries(p.cabecalhos ?? {}).map(([k, v]) => [k.toLowerCase(), v.trim()])),
    host: url.host,
    'x-amz-content-sha256': hashDoCorpo,
    'x-amz-date': agora,
  }
  const nomes = Object.keys(cabecalhos).sort()
  const assinados = nomes.join(';')
  const pedidoCanonico = [p.metodo, caminho, consulta, nomes.map((n) => `${n}:${cabecalhos[n]}\n`).join(''), assinados, hashDoCorpo].join('\n')
  const escopo = `${dia}/${REGIAO}/${SERVICO}/aws4_request`
  const texto = ['AWS4-HMAC-SHA256', agora, escopo, sha256Hex(pedidoCanonico)].join('\n')
  const chaveDeAssinatura = hmac(hmac(hmac(hmac(`AWS4${config.segredo}`, dia), REGIAO), SERVICO), 'aws4_request')
  const assinatura = createHmac('sha256', chaveDeAssinatura).update(texto, 'utf8').digest('hex')
  // O host vai pelo próprio endereço (o fetch não deixa definir).
  const { host: _host, ...enviar } = cabecalhos
  void _host
  return fetch(url, {
    method: p.metodo,
    headers: { ...enviar, authorization: `AWS4-HMAC-SHA256 Credential=${config.chave}/${escopo}, SignedHeaders=${assinados}, Signature=${assinatura}` },
    body: p.corpo ? new Uint8Array(p.corpo) : undefined,
    cache: 'no-store',
    signal: AbortSignal.timeout(30_000),
  })
}

async function erroDaResposta(r: Response, oQue: string): Promise<ErroDoR2> {
  const corpo = r.headers.get('content-type')?.includes('xml') ? await r.text().catch(() => '') : ''
  const codigo = /<Code>([^<]*)<\/Code>/.exec(corpo)?.[1] ?? null
  const mensagem = /<Message>([^<]*)<\/Message>/.exec(corpo)?.[1]
  return new ErroDoR2(r.status, codigo, `R2 recusou ${oQue} (HTTP ${r.status}${codigo ? `, ${codigo}` : ''}${mensagem ? `: ${desfazerXml(mensagem).slice(0, 200)}` : ''}).`)
}

export type OpcoesDeEnvio = {
  /** Content-Type do objeto. */
  tipo: string
  /** Cache-Control guardado com o objeto (vale quando o bucket for servido na web). */
  cache?: string
  /** Não substitui: se a chave já existe, devolve 'ja_existia' sem mexer nela. */
  soSeNaoExistir?: boolean
}

export async function enviarObjeto(config: ConfigDoR2, bucket: string, chave: string, conteudo: Buffer | string, opcoes: OpcoesDeEnvio): Promise<'enviado' | 'ja_existia'> {
  const corpo = typeof conteudo === 'string' ? Buffer.from(conteudo, 'utf8') : conteudo
  const cabecalhos: Record<string, string> = { 'content-type': opcoes.tipo }
  if (opcoes.cache) cabecalhos['cache-control'] = opcoes.cache
  if (opcoes.soSeNaoExistir) cabecalhos['if-none-match'] = '*'
  const r = await pedir(config, { metodo: 'PUT', bucket, chave, corpo, cabecalhos })
  if (r.ok) return 'enviado'
  if (opcoes.soSeNaoExistir && r.status === 412) return 'ja_existia'
  const erro = await erroDaResposta(r, `o envio de ${chave}`)
  // Sob trava do bucket, o R2 responde 409 antes de olhar o If-None-Match: o objeto existe.
  if (opcoes.soSeNaoExistir && erro.status === 409 && erro.codigo === 'ObjectLockedByBucketPolicy') return 'ja_existia'
  throw erro
}

export type InfoDoObjeto = { tamanho: number; etag: string; tipo: string | null }

export async function infoDoObjeto(config: ConfigDoR2, bucket: string, chave: string): Promise<InfoDoObjeto | null> {
  const r = await pedir(config, { metodo: 'HEAD', bucket, chave })
  if (r.status === 404) return null
  if (!r.ok) throw await erroDaResposta(r, `a consulta de ${chave}`)
  // Texto pode vir com ETag fraco (W/"…"): o valor continua sendo o MD5.
  return { tamanho: Number(r.headers.get('content-length') ?? 0), etag: (r.headers.get('etag') ?? '').replace(/^W\//, '').replace(/"/g, ''), tipo: r.headers.get('content-type') }
}

export async function lerObjeto(config: ConfigDoR2, bucket: string, chave: string): Promise<Buffer | null> {
  const r = await pedir(config, { metodo: 'GET', bucket, chave })
  if (r.status === 404) return null
  if (!r.ok) throw await erroDaResposta(r, `a leitura de ${chave}`)
  return Buffer.from(await r.arrayBuffer())
}

export async function apagarObjeto(config: ConfigDoR2, bucket: string, chave: string): Promise<void> {
  const r = await pedir(config, { metodo: 'DELETE', bucket, chave })
  if (!r.ok && r.status !== 404) throw await erroDaResposta(r, `a remoção de ${chave}`)
}

/** Tudo sob o prefixo (ListObjectsV2, de mil em mil). */
export async function listarObjetos(config: ConfigDoR2, bucket: string, prefixo: string): Promise<{ chave: string; tamanho: number }[]> {
  const achados: { chave: string; tamanho: number }[] = []
  let continuacao: string | undefined
  do {
    const consulta: Record<string, string> = { 'list-type': '2', prefix: prefixo, 'max-keys': '1000' }
    if (continuacao) consulta['continuation-token'] = continuacao
    const r = await pedir(config, { metodo: 'GET', bucket, consulta })
    if (!r.ok) throw await erroDaResposta(r, `a listagem de ${prefixo || 'tudo'}`)
    const xml = await r.text()
    for (const [, bloco] of xml.matchAll(/<Contents>([\s\S]*?)<\/Contents>/g)) {
      const chave = /<Key>([\s\S]*?)<\/Key>/.exec(bloco)?.[1]
      if (chave !== undefined) achados.push({ chave: desfazerXml(chave), tamanho: Number(/<Size>(\d+)<\/Size>/.exec(bloco)?.[1] ?? 0) })
    }
    continuacao = /<IsTruncated>true<\/IsTruncated>/.test(xml) ? desfazerXml(/<NextContinuationToken>([^<]*)<\/NextContinuationToken>/.exec(xml)?.[1] ?? '') || undefined : undefined
  } while (continuacao)
  return achados
}

/** MD5 em hex: o ETag que o R2 dá a um objeto enviado de uma vez (sem multipart). */
export const md5Hex = (dados: Buffer | string) => createHash('md5').update(dados).digest('hex')
