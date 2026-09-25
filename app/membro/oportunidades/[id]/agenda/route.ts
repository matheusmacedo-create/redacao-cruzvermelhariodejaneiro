import { sessaoDoMembro } from '@/lib/membro/sessao'
import { urlDaEntrada } from '@/lib/membro/regras'
import { oportunidadeDoMembro } from '@/lib/membro/oportunidades'
import { ics } from '@/lib/oportunidades/regras'
import { urlBase } from '@/lib/newsletter/contexto'

export const dynamic = 'force-dynamic'

/** O evento em .ics, para o voluntário pôr na agenda do celular. */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const m = await sessaoDoMembro()
  // Sem sessão, volta depois para o cartão da oportunidade, e não para o
  // .ics: o arquivo baixaria e a tela de entrada ficaria parada em "Entrando…".
  if (!m) return Response.redirect(new URL(urlDaEntrada(/^[0-9a-f-]{36}$/.test(id) ? `/membro/oportunidades#o-${id}` : '/membro/oportunidades'), request.url), 303)
  const o = await oportunidadeDoMembro(m, id)
  if (!o || o.cancelada_em) return new Response('Oportunidade não encontrada.', { status: 404 })
  return new Response(ics(o, `${urlBase()}/membro/oportunidades`), {
    headers: { 'Content-Type': 'text/calendar; charset=utf-8', 'Content-Disposition': 'attachment; filename="cruz-vermelha-rj.ics"', 'Cache-Control': 'private, no-store' },
  })
}
