import { get } from '@vercel/blob'
import { caminhoDaFoto } from '@/lib/imagem/servidor'

export const dynamic = 'force-dynamic'

/**
 * A foto que a pessoa vê antes de assinar. Só sai com o token do link e se a
 * foto faz parte daquela coleta; o resto da Biblioteca continua privado.
 */
export async function GET(request: Request, { params }: { params: Promise<{ token: string; fileId: string }> }) {
  const { token, fileId } = await params
  const caminho = await caminhoDaFoto(token, fileId)
  if (!caminho) return new Response('Não encontrado', { status: 404 })
  const resultado = await get(caminho, { access: 'private', ifNoneMatch: request.headers.get('if-none-match') ?? undefined })
  if (!resultado) return new Response('Não encontrado', { status: 404 })
  const cabecalhos = { ETag: resultado.blob.etag, 'Cache-Control': 'private, no-cache', 'X-Robots-Tag': 'noindex' }
  if (resultado.statusCode === 304) return new Response(null, { status: 304, headers: cabecalhos })
  return new Response(resultado.stream, { headers: { ...cabecalhos, 'Content-Type': resultado.blob.contentType, 'Content-Disposition': 'inline' } })
}
