import 'server-only'
import { GRAPH_URL, metaEnv } from './config'
import { appSecretProof } from './crypto'

/**
 * Cliente da Graph API da Meta.
 *
 * Duas responsabilidades além de fazer HTTP:
 *  - anexar appsecret_proof em toda chamada autenticada;
 *  - traduzir o erro da Meta para uma frase que a equipe de comunicação
 *    entenda, sem deixar de guardar o erro cru para o histórico.
 */

export class MetaError extends Error {
  readonly code?: number
  readonly subcode?: number
  readonly type?: string
  readonly fbtrace?: string
  /** true quando repetir a mesma chamada pode dar certo (rede, throttle). */
  readonly retryable: boolean

  constructor(mensagem: string, opcoes: {
    code?: number
    subcode?: number
    type?: string
    fbtrace?: string
    retryable?: boolean
  } = {}) {
    super(mensagem)
    this.name = 'MetaError'
    this.code = opcoes.code
    this.subcode = opcoes.subcode
    this.type = opcoes.type
    this.fbtrace = opcoes.fbtrace
    this.retryable = opcoes.retryable ?? false
  }

  toJSON() {
    return {
      message: this.message,
      code: this.code,
      subcode: this.subcode,
      type: this.type,
      fbtrace: this.fbtrace,
      retryable: this.retryable,
    }
  }
}

/** Códigos de erro da Meta que valem uma nova tentativa. */
const CODIGOS_TEMPORARIOS = new Set([1, 2, 4, 17, 32, 341, 368, 613])

/** Códigos que significam "o token morreu" — precisa reconectar o canal. */
export const CODIGOS_TOKEN_INVALIDO = new Set([102, 190, 463, 467])

function traduzir(code: number | undefined, mensagemOriginal: string): string {
  switch (code) {
    case 190:
    case 102:
      return 'A conexão com a Meta expirou. Reconecte o canal em Configurações → Canais.'
    case 200:
    case 10:
      return 'O aplicativo não tem permissão para publicar nesta conta. Verifique as permissões no Meta Business.'
    case 4:
    case 17:
    case 32:
      return 'A Meta está limitando as requisições no momento. A publicação será tentada de novo automaticamente.'
    case 9007:
      return 'O limite de 50 publicações em 24 horas desta conta do Instagram foi atingido.'
    case 2207026:
      return 'O formato do vídeo não é aceito pelo Instagram. Verifique duração, proporção e codec.'
    case 36003:
    case 2207003:
      return 'A Meta não conseguiu baixar o arquivo de mídia. Verifique se o arquivo ainda está na Biblioteca.'
    default:
      return mensagemOriginal || 'A Meta recusou a requisição.'
  }
}

type GraphOpcoes = {
  method?: 'GET' | 'POST' | 'DELETE'
  accessToken: string
  params?: Record<string, string | number | boolean | undefined>
  /** Timeout por chamada. O worker tem orçamento total limitado. */
  timeoutMs?: number
}

export async function graph<T = any>(caminho: string, opcoes: GraphOpcoes): Promise<T> {
  const { method = 'GET', accessToken, params = {}, timeoutMs = 20_000 } = opcoes

  const busca = new URLSearchParams()
  for (const [chave, valor] of Object.entries(params)) {
    if (valor !== undefined && valor !== null && valor !== '') busca.set(chave, String(valor))
  }
  busca.set('access_token', accessToken)
  busca.set('appsecret_proof', appSecretProof(accessToken, metaEnv.appSecret))

  const url = `${GRAPH_URL}/${caminho.replace(/^\//, '')}`
  const controle = new AbortController()
  const timer = setTimeout(() => controle.abort(), timeoutMs)

  let resposta: Response
  try {
    resposta = await fetch(method === 'GET' ? `${url}?${busca}` : url, {
      method,
      body: method === 'GET' ? undefined : busca,
      signal: controle.signal,
      cache: 'no-store',
    })
  } catch (erro) {
    // Rede caiu ou estourou o timeout: sempre vale tentar de novo.
    const motivo = erro instanceof Error && erro.name === 'AbortError' ? 'tempo esgotado' : 'falha de rede'
    throw new MetaError(`Não foi possível falar com a Meta (${motivo}).`, { retryable: true })
  } finally {
    clearTimeout(timer)
  }

  const corpo = await resposta.json().catch(() => null)

  if (!resposta.ok || corpo?.error) {
    const erro = corpo?.error ?? {}
    const code = typeof erro.code === 'number' ? erro.code : undefined
    throw new MetaError(traduzir(code, erro.message ?? ''), {
      code,
      subcode: erro.error_subcode,
      type: erro.type,
      fbtrace: erro.fbtrace_id,
      // 5xx da Meta também é temporário.
      retryable: (code !== undefined && CODIGOS_TEMPORARIOS.has(code)) || resposta.status >= 500,
    })
  }

  return corpo as T
}

/**
 * Troca o código do OAuth por um token de usuário de curta duração.
 * Não passa por graph(): ainda não existe token para assinar o appsecret_proof.
 */
export async function trocarCodigoPorToken(code: string): Promise<{ access_token: string }> {
  const busca = new URLSearchParams({
    client_id: metaEnv.appId,
    client_secret: metaEnv.appSecret,
    redirect_uri: metaEnv.redirectUri,
    code,
  })
  const resposta = await fetch(`${GRAPH_URL}/oauth/access_token?${busca}`, { cache: 'no-store' })
  const corpo = await resposta.json().catch(() => null)
  if (!resposta.ok || corpo?.error) {
    throw new MetaError(corpo?.error?.message ?? 'Falha ao autenticar com a Meta.')
  }
  return corpo
}

/** Converte o token de curta duração em um de longa duração (~60 dias). */
export async function tokenLongaDuracao(shortLivedToken: string): Promise<{ access_token: string; expires_in?: number }> {
  const busca = new URLSearchParams({
    grant_type: 'fb_exchange_token',
    client_id: metaEnv.appId,
    client_secret: metaEnv.appSecret,
    fb_exchange_token: shortLivedToken,
  })
  const resposta = await fetch(`${GRAPH_URL}/oauth/access_token?${busca}`, { cache: 'no-store' })
  const corpo = await resposta.json()
  if (corpo?.error) throw new MetaError(corpo.error.message ?? 'Falha ao renovar o token.')
  return corpo
}

export type PaginaDescoberta = {
  id: string
  name: string
  access_token: string
  picture?: { data?: { url?: string } }
  instagram_business_account?: { id: string; username?: string; name?: string; profile_picture_url?: string }
}

/**
 * Lista as Páginas que o usuário administra e, em cada uma, a conta do
 * Instagram vinculada. É daqui que saem os canais conectáveis.
 */
export async function listarPaginas(userToken: string): Promise<PaginaDescoberta[]> {
  const resposta = await graph<{ data: PaginaDescoberta[] }>('me/accounts', {
    accessToken: userToken,
    params: {
      fields:
        'id,name,access_token,picture{url},' +
        'instagram_business_account{id,username,name,profile_picture_url}',
      limit: 100,
    },
  })
  return resposta.data ?? []
}

/** Quantas publicações ainda cabem nas próximas 24h nesta conta do Instagram. */
export async function limitePublicacaoIg(igUserId: string, token: string): Promise<number> {
  const resposta = await graph<{ data: Array<{ quota_usage: number; config?: { quota_total?: number } }> }>(
    `${igUserId}/content_publishing_limit`,
    { accessToken: token, params: { fields: 'config,quota_usage' } },
  )
  const linha = resposta.data?.[0]
  if (!linha) return Number.POSITIVE_INFINITY
  const total = linha.config?.quota_total ?? 50
  return Math.max(0, total - (linha.quota_usage ?? 0))
}
