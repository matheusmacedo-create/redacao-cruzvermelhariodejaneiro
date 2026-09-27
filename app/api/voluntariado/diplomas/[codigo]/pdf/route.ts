import { nivelDeParticipantesSemRedirecionar } from '@/lib/participantes/acesso'
import { diplomaPorCodigo, pdfDoDiploma } from '@/lib/cursos/diplomas'

export const dynamic = 'force-dynamic'

/** O PDF de um diploma para a equipe do Voluntariado (para imprimir e entregar na cerimônia). */
export async function GET(_request: Request, { params }: { params: Promise<{ codigo: string }> }) {
  const equipe = await nivelDeParticipantesSemRedirecionar().catch(() => null)
  if (!equipe || equipe.nivel < 1) return new Response('Sem acesso.', { status: 403 })
  const d = await diplomaPorCodigo((await params).codigo).catch(() => null)
  if (!d || d.workspace_id !== equipe.workspaceId) return new Response('Diploma não encontrado.', { status: 404 })
  return pdfDoDiploma(d)
}
