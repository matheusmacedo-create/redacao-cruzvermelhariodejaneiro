import 'server-only'
import { createAdminClient } from '@/lib/supabase/admin'
import { notificar } from '@/lib/notificacoes/servidor'

/**
 * Quem pediu a aprovação fica sabendo de cada voto — e, quando o último voto
 * fecha a rodada, de que o conteúdo está aprovado.
 */
export async function avisarQuemPediu(params: { approvalId: string; workspaceId: string; atorId: string; quem: string; decisao: 'approved' | 'changes_requested'; nota: string }) {
  const admin = createAdminClient()
  const { data: aprovacao } = await admin.from('approvals').select('requested_by, status, content_pieces(title)')
    .eq('id', params.approvalId).eq('workspace_id', params.workspaceId).maybeSingle()
  if (!aprovacao?.requested_by) return
  const peca = (Array.isArray(aprovacao.content_pieces) ? aprovacao.content_pieces[0] : aprovacao.content_pieces) as { title: string } | null
  const titulo = peca?.title || 'Conteúdo editorial'
  const ajustes = params.decisao === 'changes_requested'
  const fechou = aprovacao.status === 'approved'
  await notificar(admin, {
    workspaceId: params.workspaceId,
    para: [aprovacao.requested_by],
    atorId: params.atorId,
    categoria: 'aprovacoes',
    titulo: ajustes ? `${params.quem} pediu ajustes em "${titulo}"` : fechou ? `"${titulo}" foi aprovado` : `${params.quem} aprovou "${titulo}"`,
    mensagem: ajustes ? (params.nota || 'Veja o que precisa mudar.') : fechou ? `${params.quem} deu o último voto: está liberado.` : 'Ainda faltam votos de outras pessoas.',
    textoDoEmail: ajustes ? `${params.quem} pediu ajustes em "${titulo}":` : undefined,
    citacao: ajustes ? params.nota : null,
    link: `/aprovacoes/${params.approvalId}`,
    botao: 'Abrir a aprovação',
  })
}
