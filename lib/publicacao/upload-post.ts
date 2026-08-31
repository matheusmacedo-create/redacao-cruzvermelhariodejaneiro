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
/**
 * Tira do texto qualquer segredo que possa ter vindo junto na mensagem de erro.
 *
 * Mensagem de erro viaja longe: vai para o banco, para a tela do Registro e
 * para o CSV que a instituição arquiva. Basta uma biblioteca ecoar a URL da
 * chamada — com credencial dentro — para o segredo virar documento. Cobre
 * também a senha do FTP, porque o erro de publicação do site passa pelo mesmo
 * caminho até a tela.
 */
export function semSegredo(texto: string): string {
  const segredos = [process.env.UPLOAD_POST_API_KEY, process.env.FTP_PASSWORD, process.env.SUPABASE_SERVICE_ROLE_KEY]
  let limpo = texto
  for (const segredo of segredos) {
    // Segredo curto demais viraria substituição em cima de texto legítimo.
    if (segredo && segredo.length >= 8) limpo = limpo.split(segredo).join('«oculto»')
  }
  return limpo
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

/**
 * Só as redes efetivamente autorizadas. Serve para a tela não oferecer botão
 * de publicar numa rede que ninguém conectou.
 *
 * O X aparece na documentação ora como "x", ora como "twitter"; o resto do
 * sistema só conhece "x". Normalizar aqui evita a conta conectada aparecer
 * como desconectada na tela por causa do nome.
 */
export function redesConectadas(perfil: Perfil): string[] {
  const contas = perfil.social_accounts || {}
  const nomes = Object.entries(contas)
    .filter(([, valor]) => valor !== null && valor !== '' && valor !== undefined)
    .map(([rede]) => (rede === 'twitter' ? 'x' : rede))
  return [...new Set(nomes)].sort()
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
  'telegram', 'discord', 'mastodon',
] as const

/** Redes que aceitam post com imagem. */
export const REDES_DE_FOTO = [
  'instagram', 'facebook', 'linkedin', 'x', 'threads', 'bluesky', 'pinterest', 'google_business',
  'tiktok', 'reddit', 'telegram', 'discord', 'mastodon',
] as const

/** Redes que aceitam vídeo. YouTube só existe aqui: não publica texto nem foto. */
export const REDES_DE_VIDEO = [
  'instagram', 'facebook', 'linkedin', 'x', 'threads', 'bluesky', 'pinterest',
  'tiktok', 'youtube', 'reddit', 'telegram', 'discord', 'mastodon',
] as const

export type Rede =
  | (typeof REDES_DE_TEXTO)[number]
  | (typeof REDES_DE_FOTO)[number]
  | (typeof REDES_DE_VIDEO)[number]

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

/**
 * O formato decide três coisas ao mesmo tempo: qual endpoint atende, que mídia
 * é obrigatória e quais redes aceitam. Manter isso num lugar só evita que a
 * tela ofereça uma combinação que a API vai recusar.
 */
export const FORMATOS = {
  texto: {
    rotulo: 'Texto',
    midia: 'nenhuma',
    redes: [
      'facebook', 'linkedin', 'x', 'threads', 'bluesky', 'google_business',
      'reddit', 'telegram', 'discord', 'mastodon',
    ],
  },
  feed: {
    rotulo: 'Feed',
    midia: 'imagem',
    redes: [
      'instagram', 'facebook', 'linkedin', 'x', 'threads', 'bluesky', 'pinterest',
      'google_business', 'tiktok', 'reddit', 'telegram', 'discord', 'mastodon',
    ],
  },
  stories: {
    rotulo: 'Stories',
    midia: 'imagem-ou-video',
    // Só Meta tem stories. Oferecer LinkedIn aqui seria mentira de interface.
    redes: ['instagram', 'facebook'],
  },
  reels: {
    rotulo: 'Reels',
    midia: 'video',
    redes: ['instagram', 'facebook'],
  },
  // Vídeo comum, sem o enquadramento vertical do Reels: é o formato do
  // YouTube e do TikTok, e o que Telegram, Discord e Mastodon entendem.
  video: {
    rotulo: 'Vídeo',
    midia: 'video',
    redes: [
      'tiktok', 'youtube', 'linkedin', 'x', 'facebook', 'threads', 'bluesky',
      'pinterest', 'reddit', 'telegram', 'discord', 'mastodon',
    ],
  },
} as const

export type Formato = keyof typeof FORMATOS

export function redesDoFormato(formato: Formato): readonly string[] {
  return FORMATOS[formato].redes
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
  formato?: Formato
  /** Campos extras da variante (hub): firstComment, pinterestBoardId, ctaTipo… */
  extras?: Record<string, string>
  /**
   * A mídia enviada foi gerada por IA. As redes têm campo próprio para isso —
   * o Instagram mostra o selo "AI info" sob o nome da conta. Declarar é o que
   * separa ilustração de registro fotográfico numa publicação humanitária.
   */
  iaGerada?: boolean
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

  // Alias entre plataformas: o conector reparte para made_with_ai (X) e
  // containsSyntheticMedia (YouTube) sozinho.
  if (envio.iaGerada) form.set('is_ai_generated', 'true')

  for (const [rede, texto] of Object.entries(envio.textoPorRede || {})) {
    if (texto) form.set(`${rede}_title`, texto)
  }

  aplicarFormato(form, envio)
  aplicarExtras(form, envio)
}

/**
 * Campos extras confirmados na documentação do conector (ago/2026):
 * first_comment (IG, FB, Threads, Bluesky, X, LinkedIn), pinterest_title,
 * pinterest_board_id (obrigatório para pin) e gbp_cta_type/gbp_cta_url.
 * Chave que o conector não conhece não é enviada — descartar em silêncio do
 * lado de cá é melhor do que um 400 opaco do lado de lá.
 */
function aplicarExtras(form: FormData, envio: EnvioComum) {
  const extras = envio.extras
  if (!extras) return
  if (extras.firstComment) form.set('first_comment', extras.firstComment)
  if (envio.redes.includes('pinterest')) {
    if (extras.pinTitle) form.set('pinterest_title', extras.pinTitle)
    if (extras.pinterestBoardId) form.set('pinterest_board_id', extras.pinterestBoardId)
  }
  if (envio.redes.includes('google_business')) {
    if (extras.ctaTipo) form.set('gbp_cta_type', extras.ctaTipo)
    if (extras.ctaUrl) form.set('gbp_cta_url', extras.ctaUrl)
  }
  if (envio.redes.includes('tiktok')) {
    // No post de fotos o "title" do TikTok tem 90 caracteres; o texto longo é
    // outro campo. Mandar a legenda inteira como título seria recusa na API.
    if (extras.tiktokDescricao) form.set('tiktok_description', extras.tiktokDescricao)
    if (extras.tiktokPrivacidade) form.set('privacy_level', extras.tiktokPrivacidade)
  }
  if (envio.redes.includes('youtube')) {
    // O YouTube exige título próprio: o texto do post é a descrição do vídeo.
    if (extras.youtubeTitulo) form.set('youtube_title', extras.youtubeTitulo)
    if (extras.youtubePrivacidade) form.set('privacyStatus', extras.youtubePrivacidade)
  }
  if (envio.redes.includes('reddit')) {
    // No Reddit o título é o que aparece na lista, e o corpo é outro campo.
    // Sem separar, o post sairia com o texto inteiro como título.
    if (extras.subreddit) form.set('subreddit', extras.subreddit)
    if (extras.redditTitulo) form.set('reddit_title', extras.redditTitulo)
    if (extras.redditFlairId) form.set('flair_id', extras.redditFlairId)
    if (extras.redditTitulo && envio.texto) form.set('description', envio.texto)
  }
}

/**
 * Traduz o formato para os nomes que cada rede espera. Os defaults da API não
 * servem: em foto o Instagram assume IMAGE, em vídeo assume REELS — então
 * Stories precisa ser dito explicitamente nos dois casos.
 */
function aplicarFormato(form: FormData, envio: EnvioComum) {
  const formato = envio.formato
  if (!formato || formato === 'texto') return

  if (envio.redes.includes('instagram') && formato !== 'video') {
    // Foto aceita IMAGE|STORIES; vídeo aceita REELS|STORIES. O formato 'video'
    // não é do Instagram (lá vídeo é Reels) — declarar IMAGE nele seria mentir
    // sobre o conteúdo enviado.
    form.set('media_type', formato === 'stories' ? 'STORIES' : formato === 'reels' ? 'REELS' : 'IMAGE')
  }

  if (envio.redes.includes('facebook')) {
    form.set(
      'facebook_media_type',
      formato === 'stories' ? 'STORIES' : formato === 'reels' ? 'REELS' : 'POSTS',
    )
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

export type EnvioComVideo = EnvioComum & {
  /** URL pública do vídeo, ou o próprio arquivo. */
  video: string | Blob
}

/**
 * Reels e stories em vídeo. O endpoint é /upload mesmo — não /upload_video,
 * apesar do nome da página na documentação.
 */
export async function publicarVideo(envio: EnvioComVideo) {
  const form = new FormData()
  montarComum(form, envio)
  form.append('video', envio.video)
  return chamar<RespostaDeEnvio>('/upload', {
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
