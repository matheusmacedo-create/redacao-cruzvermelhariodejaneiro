export type SocialPlatform = 'facebook' | 'instagram'

export type PostType = 'feed' | 'carousel' | 'reels' | 'story'

export type PostStatus =
  | 'rascunho'
  | 'aguardando_aprovacao'
  | 'aprovado'
  | 'agendado'
  | 'publicando'
  | 'publicado'
  | 'parcial'
  | 'falhou'
  | 'cancelado'

export type TargetStatus = 'pendente' | 'publicando' | 'publicado' | 'falhou' | 'cancelado'

export type ChannelStatus = 'active' | 'expired' | 'revoked' | 'error'

export const POST_TYPE_LABEL: Record<PostType, string> = {
  feed: 'Publicação no feed',
  carousel: 'Carrossel',
  reels: 'Reels',
  story: 'Story',
}

export const POST_STATUS_LABEL: Record<PostStatus, string> = {
  rascunho: 'Rascunho',
  aguardando_aprovacao: 'Aguardando aprovação',
  aprovado: 'Aprovado',
  agendado: 'Agendado',
  publicando: 'Publicando',
  publicado: 'Publicado',
  parcial: 'Publicado em parte',
  falhou: 'Falhou',
  cancelado: 'Cancelado',
}

export const PLATFORM_LABEL: Record<SocialPlatform, string> = {
  facebook: 'Facebook',
  instagram: 'Instagram',
}

export type SocialChannel = {
  id: string
  workspace_id: string
  platform: SocialPlatform
  external_id: string
  account_name: string
  username: string | null
  avatar_url: string | null
  facebook_page_id: string | null
  token_expires_at: string | null
  status: ChannelStatus
  last_checked_at: string | null
  last_error: string | null
}

export type SocialPostMedia = {
  id: string
  file_id: string
  position: number
  role: 'media' | 'cover'
  alt_text: string | null
}

export type SocialPostTarget = {
  id: string
  post_id: string
  channel_id: string
  status: TargetStatus
  container_id: string | null
  external_post_id: string | null
  permalink: string | null
  error: string | null
  published_at: string | null
}

export type SocialPost = {
  id: string
  workspace_id: string
  content_id: string | null
  pauta_id: string | null
  post_type: PostType
  caption: string
  first_comment: string | null
  scheduled_for: string | null
  timezone: string
  status: PostStatus
  attempts: number
  next_attempt_at: string | null
  last_error: string | null
  created_by: string | null
  approved_by: string | null
  approved_at: string | null
  published_by: string | null
  published_at: string | null
  created_at: string
  updated_at: string
}

/** Arquivo da Biblioteca, na forma que o motor de publicação precisa. */
export type MediaFile = {
  id: string
  name: string
  content_type: string
  storage_path: string
  size_bytes: number
}
