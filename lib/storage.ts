// Limites elevados para caber vídeo de Reels, que não passava nos 10 MB
// originais. O Instagram aceita até ~300 MB por Reels; 200 MB cobre a
// prática da equipe sem virar depósito de arquivo bruto.
export const LIBRARY_FILE_LIMIT = 200 * 1024 * 1024
export const AVATAR_FILE_LIMIT = 2 * 1024 * 1024
export const WORKSPACE_STORAGE_LIMIT = 5 * 1024 * 1024 * 1024

/** Formata bytes para as mensagens de erro, evitando números mágicos no texto. */
export function formatarLimite(bytes: number) {
  const gb = bytes / (1024 * 1024 * 1024)
  return gb >= 1 ? `${Number(gb.toFixed(1))} GB` : `${Math.round(bytes / (1024 * 1024))} MB`
}

export const LIBRARY_MIME_TYPES = new Set([
  'image/jpeg', 'image/png', 'image/webp', 'image/gif',
  'application/pdf', 'text/plain', 'text/csv',
  'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-powerpoint', 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'audio/mpeg', 'audio/wav', 'audio/ogg',
  'video/mp4', 'video/webm', 'video/quicktime',
])

export const AVATAR_MIME_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp'])

export function safeExtension(name: string) {
  const extension = name.split('.').pop()?.toLowerCase().replace(/[^a-z0-9]/g, '')
  return extension ? `.${extension.slice(0, 8)}` : ''
}

export function fileKind(contentType: string) {
  if (contentType.startsWith('image/')) return 'foto'
  if (contentType.startsWith('video/')) return 'video'
  if (contentType.startsWith('audio/')) return 'audio'
  return 'documento'
}
