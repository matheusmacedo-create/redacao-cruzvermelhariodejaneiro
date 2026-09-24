import 'server-only'

import { configDoR2, enviarObjeto, infoDoObjeto, md5Hex, type ConfigDoR2 } from '@/lib/armazenamento/r2'
import type { ChaveDaTrilha } from './assinatura'

/**
 * Espelho da trilha no Cloudflare R2 (docs/auditoria-publica.md §4), no bucket
 * de R2_BUCKET_TRILHA:
 *
 *   verificar/  o mesmo que o site tem em /verificar/, com os mesmos nomes,
 *               substituído a cada mudança — quem não alcança o site confere
 *               por aqui;
 *   registro/   cada arquivo que não muda mais, enviado uma vez só. O bucket
 *               tem trava permanente nesse prefixo: nem a filial apaga ou
 *               troca. Arquivo que já está lá com outro conteúdo é
 *               divergência — o banco mudou algo já registrado — e vira
 *               alerta, nunca substituição.
 *
 * O .ots muda até o Bitcoin confirmar (pendente → confirmado): em verificar/
 * vai o de agora; em registro/, só o confirmado.
 */

type Lote = { manifesto: string; assinatura: string | null; tsr: string | null; ots: string | null; ots_estado: 'pendente' | 'enviado' | 'confirmado' }

export type LoteParaEspelhar = Lote & { dia: string; versao: string }

export type ArquivoDoLote = { nome: string; conteudo: Buffer; tipo: string; permanente: boolean }

const hex = (h: string) => Buffer.from(h, 'hex')
const MUTAVEL = 'no-cache'
const IMUTAVEL = 'public, max-age=31536000, immutable'

/** Os arquivos de um lote, com os nomes de /verificar/lotes/<dia>/ (o site e o espelho usam esta mesma lista). */
export function arquivosDoLote(l: Lote): ArquivoDoLote[] {
  const m = JSON.parse(l.manifesto) as { raiz: string; cabecas: string; anterior: string }
  const arquivos: ArquivoDoLote[] = [
    { nome: 'manifesto.json', conteudo: Buffer.from(l.manifesto, 'utf8'), tipo: 'application/json; charset=utf-8', permanente: true },
    { nome: 'compromisso.bin', conteudo: Buffer.concat([hex(m.raiz), hex(m.cabecas), hex(m.anterior)]), tipo: 'application/octet-stream', permanente: true },
  ]
  if (l.assinatura) arquivos.push({ nome: 'manifesto.json.sig', conteudo: Buffer.from(l.assinatura, 'base64'), tipo: 'application/octet-stream', permanente: true })
  if (l.tsr) arquivos.push({ nome: 'manifesto.json.tsr', conteudo: Buffer.from(l.tsr, 'base64'), tipo: 'application/timestamp-reply', permanente: true })
  if (l.ots) arquivos.push({ nome: 'compromisso.bin.ots', conteudo: Buffer.from(l.ots, 'base64'), tipo: 'application/octet-stream', permanente: l.ots_estado === 'confirmado' })
  return arquivos
}

export type Espelho = { config: ConfigDoR2; bucket: string }

/** O espelho configurado, ou null (sem as variáveis do R2, a trilha segue só com o site). */
export function espelhoConfigurado(): Espelho | null {
  const bucket = process.env.R2_BUCKET_TRILHA?.trim()
  if (!bucket) return null
  const config = configDoR2()
  return config ? { config, bucket } : null
}

/** Envia ao registro permanente, uma vez; devolve a divergência, se o que já está lá for outro. */
async function registrar(e: Espelho, chave: string, conteudo: Buffer | string, tipo: string): Promise<string | null> {
  const resultado = await enviarObjeto(e.config, e.bucket, chave, conteudo, { tipo, cache: IMUTAVEL, soSeNaoExistir: true })
  if (resultado === 'enviado') return null
  const info = await infoDoObjeto(e.config, e.bucket, chave)
  const esperado = md5Hex(conteudo)
  return info && info.etag === esperado ? null : `${chave}: o registro permanente tem outro conteúdo (MD5 ${info?.etag ?? 'ilegível'}, o banco dá ${esperado})`
}

/** A chave pública atual e a cópia por impressão digital. */
export async function espelharChave(e: Espelho, chave: ChaveDaTrilha): Promise<string[]> {
  await enviarObjeto(e.config, e.bucket, 'verificar/chave-publica.pem', chave.publicaPem, { tipo: 'application/x-pem-file', cache: MUTAVEL })
  await enviarObjeto(e.config, e.bucket, `verificar/chaves/${chave.id}.pem`, chave.publicaPem, { tipo: 'application/x-pem-file', cache: IMUTAVEL })
  const divergencia = await registrar(e, `registro/chaves/${chave.id}.pem`, chave.publicaPem, 'application/x-pem-file')
  return divergencia ? [divergencia] : []
}

/** Os arquivos de um lote: todos em verificar/, os que não mudam mais também em registro/. */
export async function espelharLote(e: Espelho, l: LoteParaEspelhar): Promise<string[]> {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(l.dia)) throw new Error(`Dia de lote inválido: ${l.dia}`)
  const divergencias: string[] = []
  for (const a of arquivosDoLote(l)) {
    await enviarObjeto(e.config, e.bucket, `verificar/lotes/${l.dia}/${a.nome}`, a.conteudo, { tipo: a.tipo, cache: MUTAVEL })
    if (a.permanente) {
      const d = await registrar(e, `registro/lotes/${l.dia}/${a.nome}`, a.conteudo, a.tipo)
      if (d) divergencias.push(d)
    }
  }
  return divergencias
}

export async function espelharIndice(e: Espelho, indice: unknown): Promise<void> {
  await enviarObjeto(e.config, e.bucket, 'verificar/lotes/indice.json', `${JSON.stringify(indice, null, 2)}\n`, { tipo: 'application/json; charset=utf-8', cache: MUTAVEL })
}
