import { notFound } from 'next/navigation'
import { Card } from '@/components/ui/card'
import { requireWorkspace } from '@/lib/session'
import { createClient } from '@/lib/supabase/server'
import { ReviewView } from './review-view'

export default async function ReviewPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const context = await requireWorkspace()
  const supabase = await createClient()
  const { data: approval, error } = await supabase.from('approvals').select('id,status,created_at,requested_by,content_id').eq('id', id).eq('workspace_id', context.workspace.id).maybeSingle()
  if (error) return <Card className="p-10 text-center"><h1 className="text-lg font-semibold">Não foi possível carregar esta aprovação</h1><p className="mt-2 text-sm text-muted-foreground">Atualize a página ou volte para Aprovações.</p></Card>
  if (!approval) notFound()

  const [{ data: rawContent }, { data: rawRequester }, { data: rawVoters }] = await Promise.all([
    supabase.from('content_pieces').select('id,title,subtitle,body,format,status,version,pauta_id').eq('id', approval.content_id).eq('workspace_id', context.workspace.id).maybeSingle(),
    supabase.from('profiles').select('id,full_name,initials,color,job_title,avatar_path').eq('id', approval.requested_by).maybeSingle(),
    supabase.from('approval_voters').select('user_id,decision,comment,decided_at').eq('approval_id', id),
  ])
  if (!rawContent) return <Card className="p-10 text-center"><h1 className="text-lg font-semibold">Conteúdo indisponível</h1><p className="mt-2 text-sm text-muted-foreground">Esta aprovação perdeu o vínculo com seu conteúdo. O histórico foi preservado.</p></Card>
  const voterIds = (rawVoters ?? []).map((voter) => voter.user_id)
  const [{ data: pauta }, { data: profiles }] = await Promise.all([
    rawContent.pauta_id ? supabase.from('pautas').select('title').eq('id', rawContent.pauta_id).maybeSingle() : Promise.resolve({ data: null }),
    voterIds.length ? supabase.from('profiles').select('id,full_name,initials,color,job_title,avatar_path').in('id', voterIds) : Promise.resolve({ data: [] }),
  ])
  const profileById = new Map((profiles ?? []).map((profile) => [profile.id, profile]))
  const voters = (rawVoters ?? []).map((voter) => { const profile = profileById.get(voter.user_id); return { userId: voter.user_id, decision: voter.decision, comment: voter.comment, decidedAt: voter.decided_at, name: profile?.full_name || 'Colaborador', initials: profile?.initials || '?', color: profile?.color, avatarPath: profile?.avatar_path ?? null, role: profile?.job_title || 'Equipe' } })
  const approvalView = { id: approval.id, status: approval.status, title: rawContent.title || 'Conteúdo editorial', type: rawContent.format || 'Conteúdo editorial', pauta: pauta?.title || 'Sem pauta vinculada', date: new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(approval.created_at)), voters, currentUserId: context.user.id, contentId: rawContent.id, isRequester: approval.requested_by === context.user.id }
  const content = { ...rawContent, version: `v${rawContent.version}` }
  const requester = rawRequester ? { name: rawRequester.full_name, initials: rawRequester.initials, color: rawRequester.color, avatarPath: rawRequester.avatar_path, role: rawRequester.job_title || '' } : undefined
  return <ReviewView approval={approvalView} content={content} requester={requester} />
}
