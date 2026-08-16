import { notFound } from 'next/navigation'
import { requireWorkspace } from '@/lib/session'
import { createClient } from '@/lib/supabase/server'
import { ReviewView } from './review-view'

export default async function ReviewPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const context = await requireWorkspace()
  const supabase = await createClient()
  const { data } = await supabase
    .from('approvals')
    .select('id,created_at,requested_by,content_pieces(id,title,body,format,status,version,pautas(title)),approval_steps(label,status,step_order)')
    .eq('id', id)
    .eq('workspace_id', context.workspace.id)
    .maybeSingle()
  if (!data) notFound()
  const { data: rawRequester } = await supabase.from('profiles').select('id,full_name,initials,color,job_title').eq('id', data.requested_by).maybeSingle()
  const rawContent: any = Array.isArray(data.content_pieces) ? data.content_pieces[0] : data.content_pieces
  const rawPauta = Array.isArray(rawContent?.pautas) ? rawContent.pautas[0] : rawContent?.pautas
  const approval: any = {
    id: data.id,
    title: rawContent?.title || 'Conteúdo editorial',
    type: rawContent?.format || 'Conteúdo editorial',
    pauta: rawPauta?.title || 'Sem pauta vinculada',
    responsibleId: '', requesterId: data.requested_by,
    date: new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(data.created_at)),
    contentId: rawContent?.id,
    steps: [...(data.approval_steps ?? [])]
      .sort((a: any, b: any) => a.step_order - b.step_order)
      .map((step: any) => ({
        ...step,
        status: step.status === 'approved' || step.status === 'aprovado'
          ? 'aprovado'
          : step.status === 'changes_requested' || step.status === 'reprovado'
            ? 'reprovado'
            : 'pendente',
      })),
  }
  const content: any = rawContent ? { ...rawContent, status: rawContent.status === 'review' ? 'aprovacao' : rawContent.status, type: rawContent.format, pautaId: '', pautaTitle: approval.pauta, responsibleId: '', version: `v${rawContent.version}`, lastEdit: '' } : undefined
  const requester: any = rawRequester ? { id: rawRequester.id, name: rawRequester.full_name, role: rawRequester.job_title || '', coordenacao: '', category: 'Equipe', specialties: [], email: '', initials: rawRequester.initials, color: rawRequester.color } : undefined
  return <ReviewView approval={approval} content={content} requester={requester} />
}
