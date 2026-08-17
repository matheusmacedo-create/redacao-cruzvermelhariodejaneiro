import { notFound } from 'next/navigation'
import { requireWorkspace } from '@/lib/session'
import { createClient } from '@/lib/supabase/server'
import { ReviewView } from './review-view'

export default async function ReviewPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const context = await requireWorkspace()
  const supabase = await createClient()
  const { data } = await supabase.from('approvals').select('id,status,created_at,requested_by,content_pieces(id,title,subtitle,body,format,status,version,pautas(title)),approval_voters(user_id,decision,comment,decided_at,profiles(full_name,initials,color,job_title))').eq('id', id).eq('workspace_id', context.workspace.id).maybeSingle()
  if (!data) notFound()
  const { data: rawRequester } = await supabase.from('profiles').select('id,full_name,initials,color,job_title').eq('id', data.requested_by).maybeSingle()
  const rawContent: any = Array.isArray(data.content_pieces) ? data.content_pieces[0] : data.content_pieces
  const rawPauta = Array.isArray(rawContent?.pautas) ? rawContent.pautas[0] : rawContent?.pautas
  const voters = (data.approval_voters ?? []).map((voter: any) => { const profile = Array.isArray(voter.profiles) ? voter.profiles[0] : voter.profiles; return { userId: voter.user_id, decision: voter.decision, comment: voter.comment, decidedAt: voter.decided_at, name: profile?.full_name || 'Colaborador', initials: profile?.initials || '?', color: profile?.color, role: profile?.job_title || 'Equipe' } })
  const approval = { id: data.id, status: data.status, title: rawContent?.title || 'Conteúdo editorial', type: rawContent?.format || 'Conteúdo editorial', pauta: rawPauta?.title || 'Sem pauta vinculada', date: new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(data.created_at)), voters, currentUserId: context.user.id }
  const content = rawContent ? { ...rawContent, version: `v${rawContent.version}` } : undefined
  const requester = rawRequester ? { name: rawRequester.full_name, initials: rawRequester.initials, color: rawRequester.color, role: rawRequester.job_title || '' } : undefined
  return <ReviewView approval={approval} content={content} requester={requester} />
}
