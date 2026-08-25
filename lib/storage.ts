/**
 * Teto por arquivo. 300 MB é o limite do Instagram para vídeo — não adianta
 * aceitar mais do que a rede de destino aceita.
 *
 * Arquivos deste tamanho não passam pela função serverless da Vercel, que
 * corta o corpo da requisição em 4,5 MB. Por isso o envio vai direto do
 * navegador para o Blob, e a função só emite a permissão e registra depois.
 */
export const LIBRARY_FILE_LIMIT = 300 * 1024 * 1024
export const AVATAR_FILE_LIMIT = 2 * 1024 * 1024

/** Espaço total do workspace. É uma constante: ajuste conforme o plano de
 * armazenamento contratado na Vercel. */
export const WORKSPACE_STORAGE_LIMIT = 1024 * 1024 * 1024

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

/**
 * Monta o caminho de um arquivo da Biblioteca.
 *
 * Vive aqui porque quem chama é o navegador — o SDK do Blob não deixa o
 * servidor escolher o caminho no momento de emitir a permissão, só aceitar ou
 * recusar o que foi pedido. A conferência de que o caminho pertence ao espaço
 * acontece em /api/files/upload-token e de novo em /api/files/register.
 */
export function caminhoDaBiblioteca(workspaceId: string, nomeOriginal: string) {
  return `workspaces/${workspaceId}/library/${crypto.randomUUID()}${safeExtension(nomeOriginal)}`
}
