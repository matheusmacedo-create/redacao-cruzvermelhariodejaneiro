import 'server-only'

import { del, put } from '@vercel/blob'
import { caminhoDaFotoDoBem } from './fotos'

/** Grava a foto no Blob privado e devolve o caminho. Quem chama já conferiu sessão e arquivo. */
export async function guardarFotoDoBem(workspaceId: string, bemId: string, bytes: Uint8Array): Promise<string> {
  const blob = await put(caminhoDaFotoDoBem(workspaceId, bemId, crypto.randomUUID()), Buffer.from(bytes), { access: 'private', addRandomSuffix: false, contentType: 'image/jpeg' })
  return blob.pathname
}

/** Apagar o arquivo é melhor esforço: o banco já não aponta para ele. */
export async function apagarFotoDoBem(caminho: string | null | undefined) {
  if (!caminho || !caminho.startsWith('patrimonio/')) return
  try {
    await del(caminho)
  } catch (causa) {
    console.error('[patrimônio] não foi possível apagar a foto do Blob:', causa instanceof Error ? causa.message : causa)
  }
}
