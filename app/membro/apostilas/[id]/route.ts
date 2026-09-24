import { sessaoDoMembro } from '@/lib/membro/sessao'
import { caminhoDaApostila } from '@/lib/membro/cursos'
import { createAdminClient } from '@/lib/supabase/admin'

export const dynamic = 'force-dynamic'

/** Abre a apostila por um link assinado de 5 minutos. Só com sessão de voluntário. */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const m = await sessaoDoMembro()
  if (!m) return Response.redirect(new URL('/membro/entrar', request.url), 303)
  const { id } = await params
  const a = await caminhoDaApostila(m, id)
  if (!a) return new Response('Apostila não encontrada.', { status: 404 })
  const { data } = await createAdminClient().storage.from('membro-materiais').createSignedUrl(a.caminho, 300)
  if (!data?.signedUrl) return new Response('Não foi possível abrir a apostila.', { status: 502 })
  return new Response(null, { status: 302, headers: { Location: data.signedUrl, 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer' } })
}
