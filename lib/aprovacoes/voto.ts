import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import { avisarQuemPediu } from './avisos'
import { conferenciaDaRodada, registroDaConferencia } from './setores'

/**
 * O voto numa rodada de aprovação, como quem está logado: a tela da aprovação
 * (app/actions/editorial.ts, decideApproval) e a confirmação no Palácio do voto
 * pedido pelo WhatsApp por quem usa a verificação em duas etapas
 * (app/confirmar/[token]) chamam esta mesma função. O cliente é o da sessão
 * de quem vota: o RLS e vote_on_approval conferem de novo quem pode votar.
 *
 * Lança Error com a mensagem para a tela; quem chama traduz (e revalida as telas).
 */

/** A conferência do setor que esta pessoa marca antes de aprovar (lib/aprovacoes/setores.ts), lida pela sessão dela. */
export async function conferenciaDoVoto(supabase: SupabaseClient, workspaceId: string, userId: string, contentId: string) {
  const [{ data: peca }, { data: vinculo }] = await Promise.all([
    supabase.from('content_pieces').select('pauta_id').eq('id', contentId).eq('workspace_id', workspaceId).maybeSingle(),
    supabase.from('workspace_members').select('coordination').eq('workspace_id', workspaceId).eq('user_id', userId).maybeSingle(),
  ])
  const { data: pauta } = peca?.pauta_id ? await supabase.from('pautas').select('coordination').eq('id', peca.pauta_id).maybeSingle() : { data: null }
  return conferenciaDaRodada(pauta?.coordination ?? null, vinculo?.coordination ?? null)
}

export async function votarNaRodada(p: {
  supabase: SupabaseClient
  workspaceId: string
  userId: string
  /** O nome de quem vota, para o aviso a quem pediu. */
  nome: string | null
  approvalId: string
  decisao: string
  nota: string
  /** Os itens da conferência marcados (aprovar exige todos). */
  conferidos: string[]
  /** Uma linha a mais no comentário do voto, no histórico (de onde veio o pedido). */
  rodape?: string | null
}): Promise<void> {
  const { supabase, workspaceId } = p
  if (!['approved', 'changes_requested'].includes(p.decisao)) throw new Error('Selecione uma decisão.')
  const decisao = p.decisao as 'approved' | 'changes_requested'
  if (decisao === 'changes_requested' && !p.nota) throw new Error('Explique quais ajustes são necessários.')
  const { data: approval } = await supabase.from('approvals').select('id,content_id,status').eq('id', p.approvalId).eq('workspace_id', workspaceId).single()
  if (!approval) throw new Error('Aprovação não encontrada.')
  // Rodada encerrada (inclusive a matéria arquivada) não recebe voto: o voto
  // devolveria ao conteúdo o estado "aprovado".
  if (approval.status !== 'pending') throw new Error('Esta rodada já foi encerrada.')
  // Aprovar exige a conferência do setor inteira marcada (lib/aprovacoes/setores.ts).
  // A tela já trava o botão; aqui é a autoridade. O que foi conferido vai junto do voto.
  let comentario = p.nota
  if (decisao === 'approved') {
    const blocos = await conferenciaDoVoto(supabase, workspaceId, p.userId, approval.content_id)
    const marcados = new Set(p.conferidos)
    const faltam = blocos.flatMap((b) => b.itens).filter((i) => !marcados.has(i))
    if (faltam.length) throw new Error(`Confira antes de aprovar: ${faltam.join('; ')}.`)
    comentario = [p.nota, registroDaConferencia(blocos)].filter(Boolean).join('\n\n')
  }
  if (p.rodape) comentario = [comentario, p.rodape].filter(Boolean).join('\n\n')
  const { error: voteError } = await supabase.rpc('vote_on_approval', { p_approval_id: p.approvalId, p_decision: decisao, p_comment: comentario || null })
  if (voteError) throw new Error(voteError.message)
  await supabase.from('activity_log').insert({ workspace_id: workspaceId, actor_id: p.userId, action: decisao, entity_type: 'approval', entity_id: p.approvalId, metadata: { note: comentario } })
  await avisarQuemPediu({ approvalId: p.approvalId, workspaceId, atorId: p.userId, quem: p.nome || 'Um colega', decisao, nota: p.nota })
}
