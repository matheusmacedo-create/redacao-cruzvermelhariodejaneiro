import 'server-only'

/**
 * O conector da Hunter.io: encontrar e verificar e-mail de contato de
 * imprensa.
 *
 * Mesma forma dos outros conectores do projeto (Upload-Post, OpenAI) — chave
 * lida do ambiente, erro com status e dica, segredo raspado de qualquer
 * mensagem que possa ir para tela ou banco. A chave NUNCA pode ganhar o
 * prefixo NEXT_PUBLIC_: ela é cobrada por uso, e no navegador vira gasto de
 * quem achar.
 */

const BASE = 'https://api.hunter.io/v2'

export class HunterConfigError extends Error {
  constructor() {
    super('Falta a variável HUNTER_API_KEY. Cadastre a chave nas variáveis de ambiente da Vercel — nunca com o prefixo NEXT_PUBLIC_ — e republique.')
    this.name = 'HunterConfigError'
  }
}

export class HunterError extends Error {
  constructor(message: string, public status: number, public codigo?: string) {
    super(message)
    this.name = 'HunterError'
  }
}

function apiKey(): string {
  const chave = process.env.HUNTER_API_KEY?.trim()
  if (!chave) throw new HunterConfigError()
  return chave
}

export const hunterConfigurado = () => Boolean(process.env.HUNTER_API_KEY?.trim())

/** Tira a chave de qualquer mensagem que vá parar no banco ou na tela. */
export function semSegredo(texto: string): string {
  const chave = process.env.HUNTER_API_KEY
  return chave && chave.length >= 8 ? texto.split(chave).join('«oculto»') : texto
}

async function chamar<T>(caminho: string, params: Record<string, string | number | undefined>): Promise<T> {
  const url = new URL(`${BASE}${caminho}`)
  url.searchParams.set('api_key', apiKey())
  for (const [chave, valor] of Object.entries(params)) {
    if (valor !== undefined && valor !== '') url.searchParams.set(chave, String(valor))
  }

  let res: Response
  try {
    res = await fetch(url, { cache: 'no-store', signal: AbortSignal.timeout(20_000) })
  } catch (causa) {
    const motivo = causa instanceof Error && causa.name === 'AbortError'
      ? 'A Hunter.io demorou demais para responder.'
      : semSegredo(causa instanceof Error ? causa.message : String(causa))
    throw new HunterError(motivo, 0)
  }

  const bruto = await res.text()
  let dados: unknown = null
  try { dados = bruto ? JSON.parse(bruto) : null } catch { dados = null }

  if (!res.ok) {
    const corpo = dados as { errors?: { id?: string; code?: number; details?: string }[] } | null
    const primeiro = corpo?.errors?.[0]
    const detalhe = primeiro?.details || `HTTP ${res.status}`
    throw new HunterError(semSegredo(detalhe), res.status, primeiro?.id)
  }

  return dados as T
}

/** Erro da Hunter traduzido, com a dica que poupa a caçada — mesmo espírito
 * de explicarErroDeConexao (FTP) e traduzirErro (Anthropic). */
export function explicarErroDaHunter(causa: unknown): string {
  if (!(causa instanceof HunterError)) {
    return semSegredo(causa instanceof Error ? causa.message : String(causa))
  }
  if (causa.status === 401 || causa.status === 403) {
    return 'A Hunter.io recusou a chave. Confira HUNTER_API_KEY na Vercel — chave revogada precisa ser trocada e republicada.'
  }
  if (causa.status === 429) {
    return 'Limite de chamadas por minuto da Hunter.io atingido. Espere um pouco e tente de novo.'
  }
  if (causa.codigo === 'claimed_email') {
    return 'Esta pessoa pediu à Hunter.io para não ter dados processados — a busca não devolve nada sobre ela, por respeito ao pedido.'
  }
  if (causa.status === 400) {
    return `A Hunter.io recusou o pedido: ${causa.message}`
  }
  return causa.message
}

// ---------------------------------------------------------------- domain search

export type EmailDoDominio = {
  email: string
  tipo: 'personal' | 'generic' | null
  confianca: number | null
  nome: string
  sobrenome: string
  cargo: string
  status: 'valid' | 'invalid' | 'accept_all' | 'webmail' | 'disposable' | 'unknown' | null
}

export type ResultadoDominio = {
  dominio: string
  organizacao: string
  padrao: string
  contatos: EmailDoDominio[]
}

const texto = (v: unknown): string => typeof v === 'string' ? v : ''
const numero = (v: unknown): number | null => typeof v === 'number' ? v : null

/**
 * Todos os e-mails que a Hunter já viu associados a este domínio — o ponto de
 * partida para achar contatos num veículo que ainda não está no banco.
 * Consome 1 requisição de busca por chamada, contra a cota do plano.
 */
export async function buscarPorDominio(pedido: { dominio: string; limite?: number }): Promise<ResultadoDominio> {
  const dados = await chamar<{ data?: Record<string, unknown> }>('/domain-search', {
    domain: pedido.dominio.trim().toLowerCase(),
    limit: pedido.limite ?? 20,
  })
  const d = dados.data ?? {}
  const brutos = Array.isArray(d.emails) ? d.emails as Record<string, unknown>[] : []
  return {
    dominio: texto(d.domain) || pedido.dominio,
    organizacao: texto(d.organization),
    padrao: texto(d.pattern),
    contatos: brutos.map((e) => {
      const verificacao = (e.verification ?? {}) as Record<string, unknown>
      return {
        email: texto(e.value),
        tipo: (['personal', 'generic'] as const).find((t) => t === e.type) ?? null,
        confianca: numero(e.confidence),
        nome: texto(e.first_name),
        sobrenome: texto(e.last_name),
        cargo: texto(e.position),
        status: (['valid', 'invalid', 'accept_all', 'webmail', 'disposable', 'unknown'] as const)
          .find((s) => s === verificacao.status) ?? null,
      }
    }).filter((c) => c.email),
  }
}

// ---------------------------------------------------------------- email finder

export type ResultadoEmailFinder = {
  email: string | null
  confianca: number | null
  cargo: string
  status: 'valid' | 'accept_all' | 'unknown' | null
}

/**
 * O e-mail mais provável de UMA pessoa específica, dado o domínio do veículo
 * e o nome. Consome 1 requisição, mesmo quando não encontra nada.
 */
export async function encontrarEmail(pedido: { dominio: string; nome: string; sobrenome: string }): Promise<ResultadoEmailFinder> {
  const dados = await chamar<{ data?: Record<string, unknown> }>('/email-finder', {
    domain: pedido.dominio.trim().toLowerCase(),
    first_name: pedido.nome.trim(),
    last_name: pedido.sobrenome.trim(),
  })
  const d = dados.data ?? {}
  const verificacao = (d.verification ?? {}) as Record<string, unknown>
  return {
    email: texto(d.email) || null,
    confianca: numero(d.score),
    cargo: texto(d.position),
    status: (['valid', 'accept_all', 'unknown'] as const).find((s) => s === verificacao.status) ?? null,
  }
}

// ---------------------------------------------------------------- verifier

export type ResultadoDeVerificacao = {
  status: 'valid' | 'invalid' | 'accept_all' | 'webmail' | 'disposable' | 'unknown'
  confianca: number | null
}

const STATUS_VALIDOS = ['valid', 'invalid', 'accept_all', 'webmail', 'disposable', 'unknown'] as const

/** Confirma se um e-mail existe de verdade antes de contar com ele. Consome
 * 1 requisição de verificação por chamada. */
export async function verificarEmail(email: string): Promise<ResultadoDeVerificacao> {
  const dados = await chamar<{ data?: Record<string, unknown> }>('/email-verifier', { email: email.trim() })
  const d = dados.data ?? {}
  return {
    status: STATUS_VALIDOS.find((s) => s === d.status) ?? 'unknown',
    confianca: numero(d.score),
  }
}

// ---------------------------------------------------------------- conta

export type ContaHunter = {
  email: string
  plano: string
  buscas: { usadas: number; disponiveis: number } | null
  verificacoes: { usadas: number; disponiveis: number } | null
}

/**
 * Saldo e plano da conta — não consome cota (a própria Hunter documenta este
 * endpoint como gratuito). Lida em campos soltos, sem presumir formato
 * fechado: já houve resposta de API de terceiro em formato diferente do
 * prometido, e travar o diagnóstico por isso é pior do que um campo nulo.
 */
export async function contaHunter(): Promise<ContaHunter> {
  const dados = await chamar<{ data?: Record<string, unknown> }>('/account', {})
  const d = dados.data ?? {}
  const req = (d.requests ?? {}) as Record<string, unknown>
  const parPar = (v: unknown) => {
    const o = (v ?? {}) as Record<string, unknown>
    const usadas = numero(o.used)
    const disponiveis = numero(o.available)
    return usadas !== null && disponiveis !== null ? { usadas, disponiveis } : null
  }
  return {
    email: texto(d.email),
    plano: texto((d.plan_name ?? d.plan)),
    buscas: parPar(req.searches),
    verificacoes: parPar(req.verifications),
  }
}
