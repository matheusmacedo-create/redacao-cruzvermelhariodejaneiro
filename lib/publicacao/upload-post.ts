import 'server-only'

/**
 * Cliente do Upload-Post (https://api.upload-post.com).
 *
 * Por que existe: publicar direto nas APIs da Meta exige passar pelo App Review
 * — semanas de análise, vídeo de demonstração, política de privacidade revisada
 * e um app que pode ser reprovado. O Upload-Post já passou por essa aprovação e
 * empresta a dele: as contas da Cruz Vermelha são ligadas por OAuth numa página
 * hospedada por eles, e nós só chamamos um REST.
 *
 * O que isso custa em troca: um intermediário no caminho e um limite de posts
 * por plano. As duas coisas estão medidas nas funções abaixo.
 */

const BASE = 'https://api.upload-post.com/api'

/** Tempo máximo por chamada. Envio síncrono do Upload-Post vira assíncrono aos
 * 59s, então esperar mais que isso é esperar por nada. */
const TIMEOUT_MS = 60_000

export class UploadPostConfigError extends Error {
  constructor(public missing: string[]) {
    super(`Faltam variáveis de ambiente do Upload-Post: ${missing.join(', ')}.`)
    this.name = 'UploadPostConfigError'
  }
}

export class UploadPostError extends Error {
  constructor(message: string, public status: number, public body: unknown) {
    super(message)
    this.name = 'UploadPostError'
  }
}

/**
 * A chave nunca pode ganhar o prefixo NEXT_PUBLIC_: ela publica em nome da
 * instituição, e qualquer variável com esse prefixo é embutida no JavaScript
 * que vai para o navegador de todo visitante.
 */
export function apiKey(): string {
  const key = process.env.UPLOAD_POST_API_KEY
  if (!key) throw new UploadPostConfigError(['UPLOAD_POST_API_KEY'])
  return key
}

/** O "perfil" do Upload-Post é o cofre onde ficam as contas conectadas. Um por
 * instituição basta; o nome é livre e só precisa ser estável. */
export function perfilPadrao(): string {
  return process.env.UPLOAD_POST_PROFILE || 'cvrj'
}

/** Página do Facebook de destino. O Upload-Post só dispensa este valor quando
 * existe exatamente uma página conectada — não é o caso de quem administra mais
 * de uma, então preferimos deixar explícito. */
export function paginaFacebookPadrao(): string | undefined {
  return process.env.UPLOAD_POST_FACEBOOK_PAGE_ID || undefined
}

/** Recorta a chave de qualquer texto antes de ele virar log ou resposta HTTP. */
export function semSegredo(texto: string): string {
  const key = process.env.UPLOAD_POST_API_KEY
  return key ? texto.split(key).join('«chave»') : texto
}

export type LimiteDeUso = { limite: string | null; restante: string | null; reset: string | null }

function lerLimites(res: Response): LimiteDeUso {
  return {
    limite: res.headers.get('x-ratelimit-limit'),
    restante: res.headers.get('x-ratelimit-remaining'),
    reset: res.headers.get('x-ratelimit-reset'),
  }
}

type Chamada = { method?: string; json?: unknown; form?: FormData; headers?: Record<string, string> }

async function chamar<T>(caminho: string, opcoes: Chamada = {}): Promise<{ dados: T; limites: LimiteDeUso }> {
  const headers: Record<string, string> = {
    Authorization: `Apikey ${apiKey()}`,
    ...opcoes.headers,
  }

  let body: BodyInit | undefined
  if (opcoes.json !== undefined) {
    headers['Content-Type'] = 'application/json'
    body = JSON.stringify(opcoes.json)
  } else if (opcoes.form) {
    // Sem Content-Type manual: o fetch precisa gerar o boundary do multipart.
    body = opcoes.form
  }

  let res: Response
  try {
    res = await fetch(`${BASE}${caminho}`, {
      method: opcoes.method || 'GET',
      headers,
      body,
      cache: 'no-store',
      signal: AbortSignal.timeout(TIMEOUT_MS),
    })
  } catch (cause) {
    const motivo = cause instanceof Error ? cause.message : String(cause)
    throw new UploadPostError(`Não foi possível falar com o Upload-Post: ${semSegredo(motivo)}`, 0, null)
  }

  const limites = lerLimites(res)
  const texto = await res.text()
  let dados: unknown = null
  try {
    dados = texto ? JSON.parse(texto) : null
  } catch {
    dados = { raw: texto.slice(0, 500) }
  }

  if (!res.ok) {
    const corpo = dados as { message?: string; error?: string } | null
    const mensagem = corpo?.message || corpo?.error || `HTTP ${res.status}`
    throw new UploadPostError(semSegredo(mensagem), res.status, dados)
  }

  return { dados: dados as T, limites }
}

// ---------------------------------------------------------------- conta

export type Conta = { success: boolean; email?: string; plan?: string; message?: string }

/** Confere se a chave é válida e diz em que plano ela está. O plano decide o
 * teto mensal de publicações — no gratuito são 10 por mês, no total. */
export async function conta() {
  return chamar<Conta>('/uploadposts/me')
}

// ---------------------------------------------------------------- perfis

/** Uma conta conectada. O Upload-Post devolve string vazia ou null quando a
 * rede foi listada mas a autorização não foi concluída. */
export type ContaSocial = { username?: string; display_name?: string; social_images?: string } | string | null

export type Perfil = {
  username: string
  created_at?: string
  social_accounts?: Record<string, ContaSocial>
}

export async function listarPerfis() {
  return chamar<{ success: boolean; plan?: string; limit?: number; profiles: Perfil[] }>('/uploadposts/users')
}

export async function obterPerfil(username: string) {
  return chamar<{ success: boolean; profile?: Perfil; message?: string }>(
    `/uploadposts/users/${encodeURIComponent(username)}`,
  )
}

export async function criarPerfil(username: string) {
  return chamar<{ success: boolean; profile: Perfil }>('/uploadposts/users', {
    method: 'POST',
    json: { username },
  })
}

/**
 * Cria o perfil se ainda não existir e devolve o que está lá.
 *
 * 409 aqui não é falha: significa que outra requisição — ou o próprio painel do
 * Upload-Post — já criou o perfil, que é exatamente o estado desejado.
 */
export async function garantirPerfil(username: string): Promise<Perfil> {
  try {
    const { dados } = await criarPerfil(username)
    return dados.profile
  } catch (cause) {
    if (!(cause instanceof UploadPostError) || cause.status !== 409) throw cause
    const { dados } = await obterPerfil(username)
    if (!dados.profile) throw cause
    return dados.profile
  }
}

/** Só as redes efetivamente autorizadas. Serve para a tela não oferecer botão
 * de publicar numa rede que ninguém conectou. */
export function redesConectadas(perfil: Perfil): string[] {
  const contas = perfil.social_accounts || {}
  return Object.entries(contas)
    .filter(([, valor]) => valor !== null && valor !== '' && valor !== undefined)
    .map(([rede]) => rede)
    .sort()
}

// ---------------------------------------------------------------- conexão

export type OpcoesDeConexao = {
  username: string
  redirect_url?: string
  logo_image?: string
  connect_title?: string
  connect_description?: string
  platforms?: string[]
  language?: string
  show_calendar?: boolean
}

/**
 * Gera a URL onde a pessoa autoriza as contas da instituição. É este passo que
 * substitui o App Review da Meta: o OAuth acontece contra o app já aprovado do
 * Upload-Post, não contra um app nosso.
 *
 * O link vale 48 horas e carrega um JWT — ele autoriza conectar e desconectar
 * contas, então é tão sensível quanto uma senha e não deve ser compartilhado.
 */
export async function linkDeConexao(opcoes: OpcoesDeConexao) {
  return chamar<{ success: boolean; access_url: string; duration: string }>(
    '/uploadposts/users/generate-jwt',
    { method: 'POST', json: { language: 'pt', ...opcoes } },
  )
}

// ---------------------------------------------------------------- facebook

export type PaginaFacebook = { id: string; nome: string }

/**
 * O retorno cru. Os nomes das chaves não estão garantidos: a documentação
 * promete page_id/page_name, mas a resposta real trouxe outra coisa. Tipar como
 * registro aberto e normalizar depois evita silenciar o problema em undefined.
 */
type PaginaBruta = Record<string, unknown>

export async function paginasDoFacebook(perfil?: string) {
  const busca = perfil ? `?profile=${encodeURIComponent(perfil)}` : ''
  return chamar<{ success: boolean; pages: PaginaBruta[] }>(`/uploadposts/facebook/pages${busca}`)
}

const texto = (valor: unknown): string =>
  typeof valor === 'string' ? valor : typeof valor === 'number' ? String(valor) : ''

/**
 * Aceita as grafias plausíveis para id e nome. Uma página sem id não serve para
 * publicar, então é descartada em vez de virar uma linha vazia na tela.
 */
export function normalizarPaginas(brutas: PaginaBruta[]): PaginaFacebook[] {
  return brutas
    .map((p) => ({
      id: texto(p.page_id ?? p.pageId ?? p.id),
      nome: texto(p.page_name ?? p.pageName ?? p.name) || '(sem nome)',
    }))
    .filter((p) => p.id)
}

/** As chaves que a API realmente devolveu, para diagnosticar quando o formato
 * mudar de novo em vez de adivinhar. */
export function chavesDaPagina(brutas: PaginaBruta[]): string[] {
  return brutas.length ? Object.keys(brutas[0]) : []
}

// ---------------------------------------------------------------- publicar

/** Redes que aceitam post só de texto. O Instagram não está aqui de propósito:
 * a API da Meta não permite post sem mídia. */
export const REDES_DE_TEXTO = [
  'facebook', 'linkedin', 'x', 'threads', 'bluesky', 'reddit', 'google_business',
] as const

/** Redes que aceitam post com imagem. */
export const REDES_DE_FOTO = [
  'instagram', 'facebook', 'linkedin', 'x', 'threads', 'bluesky', 'pinterest', 'google_business',
] as const

export type Rede = (typeof REDES_DE_TEXTO)[number] | (typeof REDES_DE_FOTO)[number]

export type ResultadoPorRede = {
  platform: string
  success: boolean
  message?: string
  post_url?: string | null
  skipped?: boolean
  skip_reason?: string
}

export type RespostaDeEnvio = {
  success?: boolean
  request_id?: string
  job_id?: string
  external_id?: string | null
  status?: string
  results?: ResultadoPorRede[]
  message?: string
}

export type EnvioComum = {
  /** Perfil do Upload-Post. Omitido, usa o padrão do ambiente. */
  perfil?: string
  redes: string[]
  texto: string
  /** Identificador nosso, ecoado de volta pelo status e pelo histórico. Use o
   * id da matéria para reencontrar a publicação sem depender do título. */
  externalId?: string
  /** Chave de idempotência. Sem ela, um retry do fetch depois de timeout pode
   * publicar duas vezes na página da instituição. */
  idempotencyKey?: string
  /** ISO-8601 no futuro, até 365 dias. Omitido, publica agora. */
  agendarPara?: string
  timezone?: string
  linkUrl?: string
  paginaFacebookId?: string
  /** Textos por rede, quando o mesmo texto não serve para todas. */
  textoPorRede?: Partial<Record<string, string>>
}

function montarComum(form: FormData, envio: EnvioComum) {
  const perfil = envio.perfil || perfilPadrao()
  form.set('user', perfil)
  for (const rede of envio.redes) form.append('platform[]', rede)
  form.set('title', envio.texto)

  // Assíncrono sempre: a documentação avisa que o síncrono vira assíncrono aos
  // 59s de qualquer forma, e a função serverless da Vercel morre antes disso.
  form.set('async_upload', 'true')

  if (envio.externalId) form.set('external_id', envio.externalId)
  if (envio.agendarPara) form.set('scheduled_date', envio.agendarPara)
  if (envio.timezone) form.set('timezone', envio.timezone)
  if (envio.linkUrl) form.set('link_url', envio.linkUrl)

  const pagina = envio.paginaFacebookId || paginaFacebookPadrao()
  if (pagina && envio.redes.includes('facebook')) form.set('facebook_page_id', pagina)

  for (const [rede, texto] of Object.entries(envio.textoPorRede || {})) {
    if (texto) form.set(`${rede}_title`, texto)
  }
}

function cabecalhosDeEnvio(envio: EnvioComum): Record<string, string> {
  return envio.idempotencyKey ? { 'Idempotency-Key': envio.idempotencyKey } : {}
}

/** Publica um post só de texto (com link opcional, que vira card de preview). */
export async function publicarTexto(envio: EnvioComum) {
  const form = new FormData()
  montarComum(form, envio)
  return chamar<RespostaDeEnvio>('/upload_text', {
    method: 'POST',
    form,
    headers: cabecalhosDeEnvio(envio),
  })
}

export type EnvioComFotos = EnvioComum & {
  /** URLs públicas das imagens, ou os próprios arquivos. URL só funciona se o
   * endereço for acessível sem autenticação — o Upload-Post baixa a imagem do
   * servidor dele, não do navegador de quem publicou. */
  fotos: (string | Blob)[]
  legenda?: string
}

export async function publicarFotos(envio: EnvioComFotos) {
  const form = new FormData()
  montarComum(form, envio)
  for (const foto of envio.fotos) form.append('photos[]', foto)
  if (envio.legenda) form.set('description', envio.legenda)
  return chamar<RespostaDeEnvio>('/upload_photos', {
    method: 'POST',
    form,
    headers: cabecalhosDeEnvio(envio),
  })
}

/** Acompanha um envio assíncrono ou agendado. Não vale a pena consultar mais de
 * uma vez a cada 5s: o Upload-Post serve resposta de cache nesse intervalo. */
export async function statusDoEnvio(chave: { requestId?: string; jobId?: string }) {
  const busca = chave.requestId
    ? `request_id=${encodeURIComponent(chave.requestId)}`
    : `job_id=${encodeURIComponent(chave.jobId || '')}`
  return chamar<RespostaDeEnvio & { completed?: number; total?: number }>(
    `/uploadposts/status?${busca}`,
  )
}
