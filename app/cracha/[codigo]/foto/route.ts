import { get } from '@vercel/blob'
import { NextResponse, type NextRequest } from 'next/server'
import { caminhoDaFotoPublica } from '@/lib/cracha/servidor'

export const dynamic = 'force-dynamic'

/**
 * /cracha/<código>/foto — a foto do crachá, para o próprio crachá e para quem
 * confere o QR. Só com o código assinado e só de quem está ativo: a foto é o
 * que o segurança compara com o rosto de quem mostra o crachá.
 */
export async function GET(request: NextRequest, { params }: { params: Promise<{ codigo: string }> }) {
  const caminho = await caminhoDaFotoPublica((await params).codigo)
  if (!caminho) return new NextResponse('Não encontrado', { status: 404 })
  const result = await get(caminho, { access: 'private', ifNoneMatch: request.headers.get('if-none-match') ?? undefined }).catch(() => null)
  if (!result) return new NextResponse('Não encontrado', { status: 404 })
  const cache = 'private, max-age=600'
  if (result.statusCode === 304) return new NextResponse(null, { status: 304, headers: { ETag: result.blob.etag, 'Cache-Control': cache } })
  return new NextResponse(result.stream, {
    headers: { 'Content-Type': result.blob.contentType || 'image/jpeg', ETag: result.blob.etag, 'Cache-Control': cache, 'Content-Disposition': 'inline', 'X-Content-Type-Options': 'nosniff' },
  })
}
