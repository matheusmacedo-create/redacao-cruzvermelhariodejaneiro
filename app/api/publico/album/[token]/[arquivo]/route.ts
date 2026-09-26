import { createAdminClient } from '@/lib/supabase/admin'
import { chavesDoArquivo, ehTokenDoAlbum, linkDoArquivo } from '@/lib/envios/eventos'

export const dynamic = 'force-dynamic'

/**
 * Uma foto ou vídeo do álbum do evento: confere o token e que o arquivo é do
 * evento (e não foi escondido), e manda para um link assinado do R2 de 10
 * minutos. `?tipo=mini` (a miniatura, quando o celular mandou), `ver` ou
 * `baixar` (com o nome original).
 */
export async function GET(request: Request, { params }: { params: Promise<{ token: string; arquivo: string }> }) {
  const { token, arquivo } = await params
  if (!ehTokenDoAlbum(token)) return new Response('Não encontrado', { status: 404 })
  const tipo = new URL(request.url).searchParams.get('tipo')
  const admin = createAdminClient()
  const { data: evento } = await admin.from('envio_eventos').select('id').eq('album_token', token).maybeSingle()
  if (!evento) return new Response('Não encontrado', { status: 404 })
  const a = await chavesDoArquivo(admin, evento.id as string, arquivo)
  if (!a) return new Response('Não encontrado', { status: 404 })
  const url = linkDoArquivo(a, tipo === 'mini' ? 'mini' : tipo === 'baixar' ? 'baixar' : 'ver')
  if (!url) return new Response('Armazenamento indisponível', { status: 503 })
  // O navegador pode reaproveitar o redirecionamento por uns minutos (o link assinado vale 10).
  return new Response(null, { status: 302, headers: { Location: url, 'Cache-Control': 'private, max-age=300', 'Referrer-Policy': 'no-referrer', 'X-Robots-Tag': 'noindex' } })
}
