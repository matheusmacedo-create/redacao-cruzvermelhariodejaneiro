'use client'

import { upload as enviarAoBlob } from '@vercel/blob/client'
import { caminhoDaBiblioteca } from '@/lib/storage'

/**
 * Envia um arquivo do navegador para a Biblioteca.
 *
 * Vai direto do navegador para o armazenamento porque a função serverless da
 * Vercel corta o corpo da requisição em 4,5 MB: pelo caminho antigo, foto de
 * celular acima disso já falhava e vídeo nenhum passava — o botão existia e
 * não funcionava. A função continua sendo o guarda (confere sessão, tipo,
 * tamanho e espaço em /api/files/upload-token) e o registro no banco acontece
 * depois, contra o tamanho real do arquivo gravado.
 */
export type ArquivoEnviado = { id: string; storagePath: string; previa: string }

export async function enviarParaBiblioteca(
  arquivo: File,
  opcoes: {
    workspaceId: string
    tags?: string[]
    /** Quem envia declara o uso de imagem. O padrão nega, não permite. */
    autorizacao?: 'pending' | 'authorized' | 'internal'
    onProgresso?: (porcentagem: number) => void
  },
): Promise<ArquivoEnviado> {
  const blob = await enviarAoBlob(caminhoDaBiblioteca(opcoes.workspaceId, arquivo.name), arquivo, {
    access: 'private',
    handleUploadUrl: '/api/files/upload-token',
    clientPayload: String(arquivo.size),
    onUploadProgress: ({ percentage }) => opcoes.onProgresso?.(Math.round(percentage)),
  })

  const resposta = await fetch('/api/files/register', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      pathname: blob.pathname,
      name: arquivo.name,
      tags: opcoes.tags ?? [],
      authorization: opcoes.autorizacao ?? 'pending',
    }),
  })
  const resultado = await resposta.json()
  if (!resposta.ok) throw new Error(resultado.error || 'Não foi possível registrar o arquivo.')

  return {
    id: resultado.id,
    storagePath: resultado.storagePath,
    previa: `/api/private-blob?pathname=${encodeURIComponent(resultado.storagePath)}`,
  }
}
