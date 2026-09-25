import { sessaoDoMembro } from '@/lib/membro/sessao'
import { urlDaEntrada } from '@/lib/membro/regras'
import { caminhoDaApostila } from '@/lib/membro/cursos'
import { createAdminClient } from '@/lib/supabase/admin'

export const dynamic = 'force-dynamic'

/*
 * A apostila abre numa aba nova. Se algo falhar, a aba mostra a lista de
 * apostilas com um recado (`?erro=indisponivel`), e não uma linha de texto
 * puro sem saída.
 */
const indisponivel = (request: Request) =>
  new Response(null, { status: 303, headers: { Location: new URL('/membro/apostilas?erro=indisponivel', request.url).toString(), 'Cache-Control': 'no-store' } })

/** Abre a apostila por um link assinado de 5 minutos. Só com sessão de voluntário. */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const m = await sessaoDoMembro()
  // Sem sessão, volta depois para a lista (e não para o PDF): no Android o PDF
  // baixa em vez de abrir, e a tela de entrada ficaria parada em "Entrando…".
  if (!m) return Response.redirect(new URL(urlDaEntrada('/membro/apostilas'), request.url), 303)
  const { id } = await params
  const a = await caminhoDaApostila(m, id)
  if (!a) return indisponivel(request)
  const { data } = await createAdminClient().storage.from('membro-materiais').createSignedUrl(a.caminho, 300)
  if (!data?.signedUrl) return indisponivel(request)
  return new Response(null, { status: 302, headers: { Location: data.signedUrl, 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer' } })
}
