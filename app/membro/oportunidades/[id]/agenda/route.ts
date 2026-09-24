import { sessaoDoMembro } from '@/lib/membro/sessao'
import { oportunidadeDoMembro } from '@/lib/membro/oportunidades'
import { ics } from '@/lib/oportunidades/regras'
import { urlBase } from '@/lib/newsletter/contexto'

export const dynamic = 'force-dynamic'

/** O evento em .ics, para o voluntário pôr na agenda do celular. */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const m = await sessaoDoMembro()
  if (!m) return Response.redirect(new URL('/membro/entrar', request.url), 303)
  const o = await oportunidadeDoMembro(m, (await params).id)
  if (!o || o.cancelada_em) return new Response('Oportunidade não encontrada.', { status: 404 })
  return new Response(ics(o, `${urlBase()}/membro/oportunidades`), {
    headers: { 'Content-Type': 'text/calendar; charset=utf-8', 'Content-Disposition': 'attachment; filename="cruz-vermelha-rj.ics"', 'Cache-Control': 'private, no-store' },
  })
}
