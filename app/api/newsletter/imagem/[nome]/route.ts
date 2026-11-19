import { get } from '@vercel/blob'
import { NextResponse, type NextRequest } from 'next/server'
import { nomeDaImagem } from '@/lib/newsletter/edicao'

export const runtime = 'nodejs'

/**
 * Serve a imagem do topo de uma edição a quem abre o e-mail. Rota PÚBLICA, de propósito: quem lê a newsletter não tem
 * sessão no Palácio.
 *
 * Só entrega o que está na pasta das imagens de edição, e só pelo nome exato (um identificador aleatório, conferido
 * por `nomeDaImagem`): não há caminho livre, então não dá para pedir por aqui um arquivo da Biblioteca. O nome nunca
 * muda de conteúdo, por isso o cache é longo e imutável: os provedores de e-mail guardam a imagem e param de pedir.
 */
export async function GET(request: NextRequest, { params }: { params: Promise<{ nome: string }> }) {
  const nome = nomeDaImagem((await params).nome)
  if (!nome) return new NextResponse('Não encontrado', { status: 404 })
  try {
    const resultado = await get(`newsletter/edicoes/${nome}`, { access: 'private', ifNoneMatch: request.headers.get('if-none-match') ?? undefined })
    if (!resultado) return new NextResponse('Não encontrado', { status: 404 })
    const cabecalhos = { ETag: resultado.blob.etag, 'Cache-Control': 'public, max-age=31536000, immutable', 'X-Content-Type-Options': 'nosniff' }
    if (resultado.statusCode === 304) return new NextResponse(null, { status: 304, headers: cabecalhos })
    return new NextResponse(resultado.stream, { headers: { ...cabecalhos, 'Content-Type': resultado.blob.contentType, 'Content-Disposition': 'inline' } })
  } catch {
    return new NextResponse('Não encontrado', { status: 404 })
  }
}
