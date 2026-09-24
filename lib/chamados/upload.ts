'use client'

import { upload as enviarAoBlob } from '@vercel/blob/client'

/**
 * Envia um anexo do navegador direto ao Blob (a função da Vercel corta o
 * corpo em 4,5 MB — ver lib/upload-cliente.ts). Devolve o caminho, que a
 * action registra como anexo depois de conferir no servidor.
 */
export async function enviarAnexoDeChamado(arquivo: File, workspaceId: string, onProgresso?: (p: number) => void) {
  const agora = new Date()
  const seguro = arquivo.name.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^A-Za-z0-9._-]+/g, '-').slice(-80) || 'anexo'
  const caminho = `workspaces/${workspaceId}/chamados/${agora.getFullYear()}/${String(agora.getMonth() + 1).padStart(2, '0')}/${crypto.randomUUID()}-${seguro}`
  const blob = await enviarAoBlob(caminho, arquivo, {
    access: 'private',
    handleUploadUrl: '/api/chamados/anexos/upload-token',
    clientPayload: String(arquivo.size),
    onUploadProgress: ({ percentage }) => onProgresso?.(Math.round(percentage)),
  })
  return { pathname: blob.pathname, nome: arquivo.name }
}
