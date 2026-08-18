import 'server-only'

/**
 * Versão da Graph API fixada de propósito.
 *
 * A Meta descontinua versões a cada ~2 anos e muda o comportamento entre elas.
 * Deixar sem versão faz a aplicação quebrar sozinha num dia qualquer, sem
 * nenhum deploy nosso. Ao subir a versão aqui, reteste o fluxo inteiro.
 */
export const GRAPH_VERSION = 'v21.0'
export const GRAPH_URL = `https://graph.facebook.com/${GRAPH_VERSION}`

/** Permissões pedidas no login e submetidas no App Review. */
export const META_SCOPES = [
  'pages_show_list',
  'pages_read_engagement',
  'pages_manage_posts',
  'instagram_basic',
  'instagram_content_publish',
  'business_management',
].join(',')

/** Limite da Meta: 50 publicações por conta do Instagram a cada 24h. */
export const IG_LIMITE_24H = 50

/**
 * Janela mínima do agendamento nativo do Facebook: 10 minutos.
 * Abaixo disso a Meta recusa, então publicamos pelo nosso próprio worker.
 */
export const FB_AGENDAMENTO_MINIMO_MS = 10 * 60 * 1000

/** Containers do Instagram expiram em 24h. Nossa margem de segurança. */
export const IG_CONTAINER_VALIDADE_MS = 20 * 60 * 60 * 1000

function required(name: string): string {
  const value = process.env[name]
  if (!value) throw new Error(`Variável de ambiente ausente: ${name}`)
  return value
}

export const metaEnv = {
  get appId() {
    return required('META_APP_ID')
  },
  get appSecret() {
    return required('META_APP_SECRET')
  },
  /** URL pública da aplicação. Usada no callback do OAuth e na mídia assinada. */
  get siteUrl() {
    const raw =
      process.env.NEXT_PUBLIC_SITE_URL ||
      (process.env.VERCEL_PROJECT_PRODUCTION_URL
        ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
        : '')
    if (!raw) throw new Error('Variável de ambiente ausente: NEXT_PUBLIC_SITE_URL')
    return raw.replace(/\/$/, '')
  },
  get redirectUri() {
    return `${this.siteUrl}/api/social/oauth/callback`
  },
  get workerSecret() {
    return required('SOCIAL_WORKER_SECRET')
  },
}
