import { NextResponse } from 'next/server'
import { get, put } from '@vercel/blob'
import { obterWorkspace } from '@/lib/session'
import { ehCodigoDoTexto, TETO_DO_TEXTO_FALADO } from '@/lib/ajuda/ouvir'
import { textoPeloCodigo } from '@/lib/ajuda/ouvir-servidor'
import { falar, narrar, vozDaAjuda } from '@/lib/voz/elevenlabs'
import { nomeDoAudio } from '@/lib/voz/nome-do-audio'
import { TAMANHO_DO_TRECHO } from '@/lib/voz/regras'

export const dynamic = 'force-dynamic'
// A primeira vez de um texto espera a ElevenLabs gravar (uns segundos; a resposta mais longa da ajuda, uns 20 s).
export const maxDuration = 60

const CACHE = 'private, max-age=86400'
const PRAZO_MS = 50_000

/**
 * O áudio de um texto da ajuda (docs/AJUDA.md §12), pelo código do texto (?c=). Só para quem está logado no
 * Palácio. Gravado na primeira vez que alguém pede e guardado no Blob (`ajuda/ouvir/<nome>.mp3`, privado); das
 * outras vezes, sai de lá. O nome muda quando muda o texto, a voz ou o modelo: texto editado grava de novo, e o
 * antigo fica sem uso. Sem voz configurada ou com a ElevenLabs fora, 503: o botão lê com a voz do aparelho.
 */
export async function GET(request: Request) {
  const contexto = await obterWorkspace({ escola: true })
  if (!contexto) return new NextResponse('Entre no Palácio para ouvir a ajuda.', { status: 401 })
  const codigo = new URL(request.url).searchParams.get('c')
  if (!ehCodigoDoTexto(codigo)) return new NextResponse('Pedido inválido.', { status: 400 })
  const texto = await textoPeloCodigo(codigo)
  if (!texto || texto.length > TETO_DO_TEXTO_FALADO) return new NextResponse('Este texto não é da ajuda.', { status: 404 })

  const voz = await vozDaAjuda(contexto.workspace.id)
  if (!voz) return new NextResponse('A voz da filial não está configurada.', { status: 503 })
  const caminho = `ajuda/ouvir/${nomeDoAudio(texto, voz.vozId, voz.modelo)}`

  try {
    const guardado = await get(caminho, { access: 'private', ifNoneMatch: request.headers.get('if-none-match') ?? undefined })
    if (guardado?.statusCode === 304) return new NextResponse(null, { status: 304, headers: { ETag: guardado.blob.etag, 'Cache-Control': CACHE } })
    if (guardado) return audio(guardado.stream, guardado.blob.etag)
  } catch (causa) {
    console.warn('[ajuda/ouvir] não li o Blob:', causa instanceof Error ? causa.message : causa)
  }

  const prazo = Date.now() + PRAZO_MS
  const fala = texto.length > TAMANHO_DO_TRECHO ? await narrar(voz, texto, prazo) : await falar(voz, texto, 'mp3_44100_128', { prazo })
  if (!fala.ok) {
    console.warn('[ajuda/ouvir] a ElevenLabs não gravou:', fala.motivo)
    return new NextResponse(fala.erro, { status: 503 })
  }
  // Guardar é melhor esforço: se falhar, a pessoa ouve do mesmo jeito, e o próximo pedido grava de novo.
  try {
    await put(caminho, fala.bytes, { access: 'private', addRandomSuffix: false, allowOverwrite: true, contentType: 'audio/mpeg' })
  } catch (causa) {
    console.warn('[ajuda/ouvir] não guardei no Blob:', causa instanceof Error ? causa.message : causa)
  }
  return audio(new Uint8Array(fala.bytes))
}

function audio(corpo: ReadableStream | Uint8Array, etag?: string) {
  return new NextResponse(corpo as BodyInit, {
    headers: { 'Content-Type': 'audio/mpeg', 'Cache-Control': CACHE, 'Content-Disposition': 'inline', 'X-Content-Type-Options': 'nosniff', ...(etag ? { ETag: etag } : {}) },
  })
}
