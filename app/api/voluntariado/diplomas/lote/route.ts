import { nivelDeParticipantesSemRedirecionar } from '@/lib/participantes/acesso'
import { diplomasPorCodigos, pdfDeVariosDiplomas } from '@/lib/cursos/diplomas'
import { lerCodigos } from '@/lib/participantes/diplomas'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

/**
 * /api/voluntariado/diplomas/lote?codigos=ABCD-2345,EFGH-6789 — os diplomas
 * escolhidos na área de Diplomas, num PDF só (até 60), para imprimir de uma
 * vez. Só os válidos da filial de quem pede; os cancelados ficam de fora.
 */
export async function GET(request: Request) {
  const equipe = await nivelDeParticipantesSemRedirecionar().catch(() => null)
  if (!equipe || equipe.nivel < 1) return new Response('Sem acesso.', { status: 403 })
  const codigos = lerCodigos(new URL(request.url).searchParams.get('codigos'))
  const lista = await diplomasPorCodigos(equipe.workspaceId, codigos).catch(() => null)
  if (!lista) return new Response('Diplomas indisponíveis agora. Tente de novo.', { status: 503 })
  if (!lista.length) return new Response('Nenhum diploma válido entre os escolhidos.', { status: 404 })
  return pdfDeVariosDiplomas(lista)
}
