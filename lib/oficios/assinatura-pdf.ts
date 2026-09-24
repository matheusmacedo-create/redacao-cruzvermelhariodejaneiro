/**
 * Conferência de assinaturas digitais em PDF (PAdES/CMS), como as do
 * assinador do gov.br e dos certificados ICP-Brasil.
 *
 * Para cada assinatura do arquivo:
 * 1. recorta os bytes que ela cobre (ByteRange) e confere a matemática da
 *    assinatura (o resumo bate e a chave do certificado confirma);
 * 2. monta a cadeia do certificado até uma das raízes fixadas em
 *    ./raizes.ts, buscando os certificados intermediários pelo endereço que
 *    o próprio certificado indica (AIA) quando não vierem no arquivo;
 * 3. confere a validade de cada certificado na data da assinatura.
 *
 * Não consulta listas de revogação: para isso fica o validador oficial do
 * ITI (validar.iti.gov.br), a que a tela manda quem quiser a conferência
 * completa.
 */

import * as asn1js from 'asn1js'
import * as pkijs from 'pkijs'
import { createHash, webcrypto } from 'node:crypto'
import { ANCORAS } from './raizes'

pkijs.setEngine('node', new pkijs.CryptoEngine({ name: 'node', crypto: webcrypto as unknown as Crypto }))

export type Infraestrutura = 'gov.br' | 'ICP-Brasil' | 'teste'

export type AncoraDeConfianca = { der: Uint8Array; papel: 'raiz' | 'intermediaria'; infraestrutura: Infraestrutura }

export type AssinaturaNoPdf = {
  /** Até onde o arquivo estava quando esta assinatura foi feita. */
  cobreAte: number
  cobreTudo: boolean
  integra: boolean
  confiavel: boolean
  validaNaData: boolean
  infraestrutura: Infraestrutura | null
  titular: string | null
  cpfMascarado: string | null
  emissor: string | null
  serial: string | null
  assinadoEm: string | null
  erro: string | null
}

export type OpcoesDeConferencia = {
  ancoras?: AncoraDeConfianca[]
  /** Busca um certificado pelo endereço AIA; null quando não conseguir. */
  buscar?: (url: string) => Promise<Uint8Array | null>
  /** Data usada quando a assinatura não traz a própria (testes). */
  agora?: Date
}

const OID = {
  signingTime: '1.2.840.113549.1.9.5',
  tstInfo: '1.2.840.113549.1.9.16.1.4',
  carimboDaAssinatura: '1.2.840.113549.1.9.16.2.14',
  aia: '1.3.6.1.5.5.7.1.1',
  caIssuers: '1.3.6.1.5.5.7.48.2',
  keyUsage: '2.5.29.15',
  cn: '2.5.4.3',
}

const pemParaDer = (pem: string) => new Uint8Array(Buffer.from(pem.replace(/-----[^-]+-----/g, '').replace(/\s+/g, ''), 'base64'))

export const ANCORAS_OFICIAIS: AncoraDeConfianca[] = ANCORAS.map((a) => ({ der: pemParaDer(a.pem), papel: a.papel, infraestrutura: a.infraestrutura }))

const ab = (u: Uint8Array): ArrayBuffer => u.buffer.slice(u.byteOffset, u.byteOffset + u.byteLength) as ArrayBuffer
const derDe = (c: pkijs.Certificate) => new Uint8Array(c.toSchema(true).toBER(false))
const igual = (a: Uint8Array, b: Uint8Array) => a.length === b.length && Buffer.from(a).equals(Buffer.from(b))
const nomeBer = (n: pkijs.RelativeDistinguishedNames) => Buffer.from(n.toSchema().toBER(false)).toString('hex')

function atributo(n: pkijs.RelativeDistinguishedNames, oid: string): string | null {
  const t = n.typesAndValues.find((x) => x.type === oid)
  return t ? String((t.value as unknown as { valueBlock: { value: string } }).valueBlock.value) : null
}

function lerCertificado(bytes: Uint8Array): pkijs.Certificate[] {
  // DER solto, PEM, ou um pacote PKCS#7 (.p7b) com vários.
  const texto = Buffer.from(bytes).toString('latin1')
  if (texto.includes('-----BEGIN CERTIFICATE-----')) {
    return [...texto.matchAll(/-----BEGIN CERTIFICATE-----[\s\S]*?-----END CERTIFICATE-----/g)].flatMap((m) => lerCertificado(pemParaDer(m[0])))
  }
  try { return [pkijs.Certificate.fromBER(ab(bytes))] } catch { /* tenta PKCS#7 */ }
  try {
    const ci = pkijs.ContentInfo.fromBER(ab(bytes))
    const sd = new pkijs.SignedData({ schema: ci.content })
    return (sd.certificates ?? []).filter((c): c is pkijs.Certificate => c instanceof pkijs.Certificate)
  } catch { return [] }
}

function enderecosAia(c: pkijs.Certificate): string[] {
  const ext = c.extensions?.find((e) => e.extnID === OID.aia)
  const parsed = ext?.parsedValue as { accessDescriptions?: { accessMethod: string; accessLocation: { type: number; value: string } }[] } | undefined
  return (parsed?.accessDescriptions ?? [])
    .filter((d) => d.accessMethod === OID.caIssuers && d.accessLocation.type === 6 && /^https?:\/\//.test(d.accessLocation.value))
    .map((d) => d.accessLocation.value)
}

function usoPermiteAssinar(c: pkijs.Certificate): boolean {
  const ext = c.extensions?.find((e) => e.extnID === OID.keyUsage)
  if (!ext) return true
  const bits = new Uint8Array((ext.parsedValue as asn1js.BitString).valueBlock.valueHexView)
  // bit 0 digitalSignature, bit 1 nonRepudiation (contentCommitment)
  return Boolean(bits[0] & 0x80) || Boolean(bits[0] & 0x40)
}

function dataDoAtributo(sd: pkijs.SignedData): Date | null {
  const attrs = sd.signerInfos[0]?.signedAttrs?.attributes ?? []
  const a = attrs.find((x) => x.type === OID.signingTime)
  const v = a?.values?.[0] as unknown as { toDate?: () => Date } | undefined
  return v?.toDate ? v.toDate() : null
}

/** A hora do carimbo de tempo da assinatura (PAdES-T), quando houver. */
function dataDoCarimbo(sd: pkijs.SignedData): Date | null {
  const attrs = sd.signerInfos[0]?.unsignedAttrs?.attributes ?? []
  const a = attrs.find((x) => x.type === OID.carimboDaAssinatura)
  if (!a?.values?.[0]) return null
  try {
    const ci = new pkijs.ContentInfo({ schema: a.values[0] })
    const tsd = new pkijs.SignedData({ schema: ci.content })
    const conteudo = tsd.encapContentInfo.eContent
    if (!conteudo) return null
    const tst = pkijs.TSTInfo.fromBER(ab(new Uint8Array(conteudo.getValue())))
    return tst.genTime
  } catch {
    return null
  }
}

export function mascararCpf(cpf: string): string | null {
  const d = cpf.replace(/\D/g, '')
  return d.length === 11 ? `***.${d.slice(3, 6)}.${d.slice(6, 9)}-**` : null
}

/** "NOME COMPLETO:12345678900" (padrão ICP-Brasil) → nome e CPF mascarado. */
export function titularDoCn(cn: string | null): { titular: string | null; cpfMascarado: string | null } {
  if (!cn) return { titular: null, cpfMascarado: null }
  const [nome, resto] = cn.split(':')
  return { titular: nome.trim() || null, cpfMascarado: resto ? mascararCpf(resto) : null }
}

type Recorte = { a: number; b: number; c: number; d: number; der: Uint8Array; declarada: Date | null }

/** Desfaz os escapes de uma string literal do PDF ("D\\07220240911" → "D:20240911"). */
export function textoLiteral(s: string): string {
  const simples: Record<string, string> = { n: '\n', r: '\r', t: '\t', b: '\b', f: '\f' }
  return s.replace(/\\([0-7]{1,3}|.)/g, (_, e: string) => (/^[0-7]+$/.test(e) ? String.fromCharCode(parseInt(e, 8)) : simples[e] ?? e))
}

/** "D:20240911122845-03'00'" → Date. */
export function dataDoPdf(s: string): Date | null {
  const m = /^D:(\d{4})(\d{2})?(\d{2})?(\d{2})?(\d{2})?(\d{2})?(Z|[+-])?(\d{2})?'?(\d{2})?'?/.exec(s)
  if (!m) return null
  const [, a, mes = '01', d = '01', h = '00', mi = '00', se = '00', z, oh = '00', om = '00'] = m
  const off = !z || z === 'Z' ? 'Z' : `${z}${oh}:${om}`
  const data = new Date(`${a}-${mes}-${d}T${h}:${mi}:${se}${off}`)
  return Number.isNaN(data.getTime()) ? null : data
}

/** As assinaturas do arquivo, pela posição dos bytes que cada uma cobre. */
export function extrairAssinaturas(pdf: Uint8Array): Recorte[] {
  const texto = Buffer.from(pdf).toString('latin1')
  const out: Recorte[] = []
  const vistos = new Set<string>()
  for (const m of texto.matchAll(/\/ByteRange\s*\[\s*(\d+)\s+(\d+)\s+(\d+)\s+(\d+)\s*\]/g)) {
    const [a, b, c, d] = m.slice(1, 5).map(Number)
    const chave = `${a}:${b}:${c}:${d}`
    if (vistos.has(chave)) continue
    vistos.add(chave)
    if (a !== 0 || b <= 0 || c <= b || d < 0 || c + d > pdf.length) continue
    const entre = texto.slice(b, c).trim()
    if (!entre.startsWith('<') || !entre.endsWith('>')) continue
    const hex = entre.slice(1, -1).replace(/\s+/g, '')
    if (!/^[0-9a-fA-F]*$/.test(hex) || hex.length % 2) continue
    // A data que o assinador declarou (/M), no mesmo objeto da assinatura.
    const inicio = Math.max(0, texto.lastIndexOf(' obj', b))
    const fimObj = texto.indexOf('endobj', c)
    const objeto = texto.slice(inicio, b) + texto.slice(c, fimObj === -1 ? c + 2000 : fimObj)
    const mm = /\/M\s*\(((?:\\.|[^\\)])*)\)/.exec(objeto)
    out.push({ a, b, c, d, der: new Uint8Array(Buffer.from(hex, 'hex')), declarada: mm ? dataDoPdf(textoLiteral(mm[1])) : null })
  }
  return out.sort((x, y) => x.c + x.d - (y.c + y.d))
}

async function montarCadeia(
  folha: pkijs.Certificate,
  doArquivo: pkijs.Certificate[],
  ancoras: AncoraDeConfianca[],
  buscar: OpcoesDeConferencia['buscar'],
  momento: Date,
): Promise<{ confiavel: boolean; validaNaData: boolean; infraestrutura: Infraestrutura | null; erro: string | null }> {
  const conhecidos = [...doArquivo, ...ancoras.map((a) => pkijs.Certificate.fromBER(ab(a.der)))]
  const buscados = new Set<string>()
  let atual = folha
  let validaNaData = true
  for (let passo = 0; passo < 8; passo++) {
    if (momento < atual.notBefore.value || momento > atual.notAfter.value) validaNaData = false
    const der = derDe(atual)
    const raiz = ancoras.find((a) => a.papel === 'raiz' && igual(a.der, der))
    if (raiz) return { confiavel: true, validaNaData, infraestrutura: raiz.infraestrutura, erro: validaNaData ? null : 'Um certificado da cadeia não era válido na data da assinatura.' }

    const emissorNome = nomeBer(atual.issuer)
    let candidatos = conhecidos.filter((c) => nomeBer(c.subject) === emissorNome && !igual(derDe(c), der))
    if (!candidatos.length && buscar) {
      for (const url of enderecosAia(atual)) {
        if (buscados.has(url)) continue
        buscados.add(url)
        const bytes = await buscar(url).catch(() => null)
        if (bytes) conhecidos.push(...lerCertificado(bytes))
      }
      candidatos = conhecidos.filter((c) => nomeBer(c.subject) === emissorNome && !igual(derDe(c), der))
    }
    let proximo: pkijs.Certificate | null = null
    for (const c of candidatos) {
      if (await atual.verify(c).catch(() => false)) { proximo = c; break }
    }
    if (!proximo) {
      return { confiavel: false, validaNaData, infraestrutura: null, erro: 'O certificado não leva a uma raiz do gov.br ou da ICP-Brasil.' }
    }
    atual = proximo
  }
  return { confiavel: false, validaNaData, infraestrutura: null, erro: 'Cadeia de certificados longa demais.' }
}

/** Confere todas as assinaturas do PDF. Carimbos de tempo do documento ficam de fora. */
export async function conferirPdf(pdf: Uint8Array, o: OpcoesDeConferencia = {}): Promise<AssinaturaNoPdf[]> {
  const ancoras = o.ancoras ?? ANCORAS_OFICIAIS
  const out: AssinaturaNoPdf[] = []
  for (const r of extrairAssinaturas(pdf)) {
    const base: AssinaturaNoPdf = {
      cobreAte: r.c + r.d, cobreTudo: r.c + r.d === pdf.length, integra: false, confiavel: false, validaNaData: false,
      infraestrutura: null, titular: null, cpfMascarado: null, emissor: null, serial: null, assinadoEm: null, erro: null,
    }
    let sd: pkijs.SignedData
    try {
      const asn = asn1js.fromBER(ab(r.der))
      if (asn.offset === -1) throw new Error()
      sd = new pkijs.SignedData({ schema: new pkijs.ContentInfo({ schema: asn.result }).content })
    } catch {
      out.push({ ...base, erro: 'Assinatura ilegível.' })
      continue
    }
    if (sd.encapContentInfo?.eContentType === OID.tstInfo) continue // carimbo de tempo do documento

    const certificados = (sd.certificates ?? []).filter((c): c is pkijs.Certificate => c instanceof pkijs.Certificate)
    const dados = Buffer.concat([Buffer.from(pdf.subarray(r.a, r.a + r.b)), Buffer.from(pdf.subarray(r.c, r.c + r.d))])
    let integra = false
    let folha: pkijs.Certificate | undefined
    try {
      const v = await sd.verify({ signer: 0, data: ab(new Uint8Array(dados)), checkChain: false, extendedMode: true })
      integra = Boolean(v.signatureVerified)
      folha = v.signerCertificate ?? undefined
    } catch (e) {
      const detalhe = e as { signatureVerified?: boolean; signerCertificate?: pkijs.Certificate }
      folha = detalhe?.signerCertificate
    }
    if (!folha) {
      out.push({ ...base, erro: 'A assinatura não traz o certificado de quem assinou.' })
      continue
    }
    const { titular, cpfMascarado } = titularDoCn(atributo(folha.subject, OID.cn))
    // Hora da assinatura: a do carimbo de tempo (de terceiro) vale mais que a
    // declarada no próprio PDF; sem nenhuma, vale o momento da conferência.
    const quando = dataDoCarimbo(sd) ?? dataDoAtributo(sd) ?? r.declarada
    const momento = quando ?? o.agora ?? new Date()
    const cadeia = await montarCadeia(folha, certificados, ancoras, o.buscar, momento)
    const podeAssinar = usoPermiteAssinar(folha)
    out.push({
      ...base,
      integra,
      confiavel: cadeia.confiavel && podeAssinar,
      validaNaData: cadeia.validaNaData,
      infraestrutura: cadeia.infraestrutura,
      titular, cpfMascarado,
      emissor: atributo(folha.issuer, OID.cn),
      serial: Buffer.from(folha.serialNumber.valueBlock.valueHexView).toString('hex'),
      assinadoEm: quando?.toISOString() ?? null,
      erro: !integra ? 'O arquivo foi alterado depois desta assinatura, ou a assinatura não confere.'
        : !podeAssinar ? 'O certificado não é de assinatura.'
          : cadeia.erro,
    })
  }
  return out
}

const CONECTIVOS = new Set(['de', 'da', 'do', 'das', 'dos', 'e'])
const tokens = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z\s]/g, ' ').split(/\s+/).filter((t) => t && !CONECTIVOS.has(t))

/**
 * O nome do certificado é o da pessoa do perfil? O primeiro nome tem de ser o
 * mesmo e todo sobrenome do perfil tem de estar no certificado — "Ana Lima"
 * confere com "ANA MARIA DE SOUZA LIMA"; "Ana Souza" não confere com "ANA LIMA".
 */
export function nomeConfere(perfil: string, titular: string | null): boolean {
  if (!titular) return false
  const p = tokens(perfil)
  const t = tokens(titular)
  if (!p.length || !t.length || p[0] !== t[0]) return false
  const resto = new Set(t.slice(1))
  return p.slice(1).every((x) => resto.has(x))
}

export type ResultadoDoEnvio =
  | { ok: true; nova: AssinaturaNoPdf; todas: AssinaturaNoPdf[]; sha256: string }
  | { ok: false; erro: string }

/**
 * O PDF que volta do assinador serve? Tem de ser o arquivo que o Redação
 * entregou com exatamente uma assinatura a mais, todas conferindo, e a nova
 * cobrindo o arquivo inteiro. Assinadores PAdES acrescentam a assinatura ao
 * fim do arquivo sem mexer no que já estava: por isso o PDF anterior tem de
 * aparecer, byte a byte, no começo do novo.
 */
export async function avaliarEnvio(anterior: Uint8Array, novo: Uint8Array, nomeDoPerfil: string, o: OpcoesDeConferencia = {}): Promise<ResultadoDoEnvio> {
  if (Buffer.from(novo.subarray(0, 5)).toString('latin1') !== '%PDF-') return { ok: false, erro: 'O arquivo enviado não é um PDF.' }
  if (novo.length <= anterior.length || !Buffer.from(novo.subarray(0, anterior.length)).equals(Buffer.from(anterior))) {
    return { ok: false, erro: 'Este PDF não é o ofício baixado aqui, ou foi alterado antes de assinar. Baixe o PDF do ofício de novo e assine sem editar nem salvar por outro programa.' }
  }
  const antes = (await conferirPdf(anterior, o)).length
  const todas = await conferirPdf(novo, o)
  if (todas.length !== antes + 1) {
    return { ok: false, erro: todas.length <= antes ? 'Não encontramos uma assinatura nova neste PDF.' : 'O PDF traz mais de uma assinatura nova. Cada pessoa envia a própria assinatura.' }
  }
  const ruim = todas.find((a) => !a.integra || !a.confiavel || !a.validaNaData)
  if (ruim) return { ok: false, erro: `Assinatura recusada${ruim.titular ? ` (${ruim.titular})` : ''}: ${ruim.erro ?? 'não conferiu.'}` }
  const nova = todas[todas.length - 1]
  if (!nova.cobreTudo) return { ok: false, erro: 'O arquivo tem conteúdo acrescentado depois da última assinatura.' }
  if (!nomeConfere(nomeDoPerfil, nova.titular)) {
    return { ok: false, erro: `A assinatura é de ${nova.titular ?? 'outra pessoa'}, não de ${nomeDoPerfil}. Quem assina no gov.br precisa ser a mesma pessoa que envia; se o nome do seu perfil estiver diferente, peça a um admin para ajustar.` }
  }
  return { ok: true, nova, todas, sha256: createHash('sha256').update(novo).digest('hex') }
}
