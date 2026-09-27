import { sessaoDoMembro } from '@/lib/membro/sessao'
import { urlDaEntrada } from '@/lib/membro/regras'
import { diplomaPorCodigo, pdfDoDiploma } from '@/lib/cursos/diplomas'

export const dynamic = 'force-dynamic'

/** /membro/diplomas/ABCD-2345/pdf — o Diploma de Reconhecimento, só para o dono. */
export async function GET(request: Request, { params }: { params: Promise<{ codigo: string }> }) {
  const m = await sessaoDoMembro()
  if (!m) return Response.redirect(new URL(urlDaEntrada('/membro/certificados'), request.url), 303)
  const d = await diplomaPorCodigo((await params).codigo).catch(() => null)
  if (!d || d.revogado_em || d.participante_id !== m.participanteId) return new Response('Diploma não encontrado.', { status: 404 })
  return pdfDoDiploma(d)
}
