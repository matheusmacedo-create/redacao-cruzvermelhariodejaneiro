import 'server-only'

import { del, get, put } from '@vercel/blob'
import { NextResponse } from 'next/server'
import { LIMITE_DA_FOTO, caminhoDaFoto, conferirFoto } from './foto'

/**
 * O lado do servidor da foto do voluntário, comum às duas portas: a Área do
 * Voluntário (app/api/membro/foto) e a ficha da equipe
 * (app/api/voluntariado/[id]/foto). Quem chama já conferiu a sessão e a
 * permissão; aqui é o arquivo.
 */

export const erroDaFoto = (mensagem: string, status: number) => NextResponse.json({ error: mensagem }, { status })

/** Lê a foto do formulário e confere. Devolve os bytes (já sem metadados), ou a resposta de erro. */
export async function lerFotoEnviada(request: Request): Promise<Uint8Array | NextResponse> {
  let formData: FormData
  try {
    formData = await request.formData()
  } catch {
    return erroDaFoto('Não foi possível ler a foto enviada.', 400)
  }
  const file = formData.get('foto')
  if (!(file instanceof File)) return erroDaFoto('Selecione uma foto.', 400)
  // O tamanho antes de ler: não carrega na memória um arquivo que já se sabe recusado.
  if (file.size > LIMITE_DA_FOTO) return erroDaFoto('A foto chegou grande demais. Tente de novo pela tela do perfil.', 400)
  const r = conferirFoto(new Uint8Array(await file.arrayBuffer()))
  return 'erro' in r ? erroDaFoto(r.erro, 400) : r.bytes
}

/**
 * Grava a foto nova no Blob, registra no banco (`definir` devolve o caminho
 * anterior) e só então apaga a antiga. Se o banco recusar, o arquivo novo sai
 * do Blob: não fica foto órfã.
 */
export async function trocarFoto(p: { workspaceId: string; participanteId: string; bytes: Uint8Array; definir: (caminho: string) => Promise<string | null> }): Promise<string> {
  const pathname = caminhoDaFoto(p.workspaceId, p.participanteId, crypto.randomUUID())
  const blob = await put(pathname, Buffer.from(p.bytes), { access: 'private', addRandomSuffix: false, contentType: 'image/jpeg' })
  let anterior: string | null
  try {
    anterior = await p.definir(blob.pathname)
  } catch (causa) {
    await apagarFoto(blob.pathname)
    throw causa
  }
  if (anterior && anterior !== blob.pathname) await apagarFoto(anterior)
  return blob.pathname
}

/** Apagar o arquivo é melhor esforço: o banco já não aponta para ele. */
export async function apagarFoto(caminho: string | null | undefined) {
  if (!caminho || !caminho.startsWith('voluntarios/')) return
  try {
    await del(caminho)
  } catch (causa) {
    console.error('[foto do voluntário] não foi possível apagar do Blob:', causa instanceof Error ? causa.message : causa)
  }
}

/**
 * Entrega a foto. Cache só no navegador de quem pediu (`private`): o endereço
 * muda a cada troca (`?v=`), então um dia de cache não mostra foto velha.
 */
export async function servirFoto(caminho: string | null | undefined, request: Request): Promise<Response> {
  if (!caminho) return new NextResponse('Não encontrado', { status: 404 })
  const result = await get(caminho, { access: 'private', ifNoneMatch: request.headers.get('if-none-match') ?? undefined })
  if (!result) return new NextResponse('Não encontrado', { status: 404 })
  const cache = 'private, max-age=86400'
  if (result.statusCode === 304) return new NextResponse(null, { status: 304, headers: { ETag: result.blob.etag, 'Cache-Control': cache } })
  return new NextResponse(result.stream, {
    headers: { 'Content-Type': 'image/jpeg', ETag: result.blob.etag, 'Cache-Control': cache, 'Content-Disposition': 'inline', 'X-Content-Type-Options': 'nosniff' },
  })
}
