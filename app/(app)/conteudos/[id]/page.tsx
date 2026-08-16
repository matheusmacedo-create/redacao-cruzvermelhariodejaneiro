import { notFound } from 'next/navigation'
import { requireWorkspace } from '@/lib/session'
import { createClient } from '@/lib/supabase/server'
import { getContent, getPauta, getPerson } from '@/lib/data'
import { ContentEditor } from './content-editor'

export default async function ContentPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const context = await requireWorkspace()
  const supabase = await createClient()
  const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)

  if (!isUuid) {
    const legacyContent = getContent(id)
    if (!legacyContent) notFound()
    return (
      <ContentEditor
        content={legacyContent}
        pauta={getPauta(legacyContent.pautaId)}
        responsible={getPerson(legacyContent.responsibleId)}
      />
    )
  }

  let query = supabase
    .from('content_pieces')
    .select('id,title,body,format,status,version,updated_at,responsible_id,pauta_id,pautas(id,title,coordination)')
    .eq('workspace_id', context.workspace.id)

  query = isUuid ? query.eq('id', id) : query.order('updated_at', { ascending: false }).limit(1)
  const { data: rows, error } = await query
  const row: any = Array.isArray(rows) ? rows[0] : rows
  if (error || !row) notFound()

  const rawPauta: any = Array.isArray(row.pautas) ? row.pautas[0] : row.pautas
  const { data: profile } = row.responsible_id
    ? await supabase.from('profiles').select('id,full_name,initials,color,job_title').eq('id', row.responsible_id).maybeSingle()
    : { data: context.profile }

  const content: any = {
    id: row.id,
    pautaId: rawPauta?.id,
    pautaTitle: rawPauta?.title || 'Sem pauta vinculada',
    title: row.title,
    subtitle: '',
    body: row.body,
    type: row.format,
    status: row.status === 'review' ? 'aprovacao' : row.status === 'draft' ? 'rascunho' : 'producao',
    version: `v${row.version}`,
    lastEdit: new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(row.updated_at)),
  }
  const { data: commentRows } = await supabase
    .from('content_comments')
    .select('id,body,created_at,profiles!content_comments_author_id_fkey(id,full_name,initials,color)')
    .eq('content_id', row.id)
    .eq('workspace_id', context.workspace.id)
    .order('created_at', { ascending: true })

  const comments = (commentRows ?? []).map((comment: any) => {
    const author = Array.isArray(comment.profiles) ? comment.profiles[0] : comment.profiles
    return {
      id: comment.id,
      text: comment.body,
      time: new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(comment.created_at)),
      author: {
        name: author?.full_name || 'Colaborador',
        initials: author?.initials || '?',
        color: author?.color,
      },
    }
  })

  const pauta: any = rawPauta ? { id: rawPauta.id, project: rawPauta.coordination || 'Editorial' } : undefined
  const responsible: any = profile ? {
    id: profile.id,
    name: profile.full_name,
    initials: profile.initials,
    color: profile.color,
    role: profile.job_title,
  } : undefined

  return <ContentEditor content={content} pauta={pauta} responsible={responsible} comments={comments} />
}
