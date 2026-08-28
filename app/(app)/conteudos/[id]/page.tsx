import { notFound } from 'next/navigation'
import { requireWorkspace } from '@/lib/session'
import { createClient } from '@/lib/supabase/server'
import { getContent, getPauta, getPerson } from '@/lib/data'
import { contentStatus } from '@/lib/status-maps'
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
        workspaceId={context.workspace.id}
      />
    )
  }

  let query = supabase
    .from('content_pieces')
    .select('id,title,subtitle,body,format,status,version,updated_at,responsible_id,pauta_id,slug,site_url,site_published_at,pautas(id,title,coordination,owner_id)')
    .eq('workspace_id', context.workspace.id)

  query = isUuid ? query.eq('id', id) : query.order('updated_at', { ascending: false }).limit(1)
  const { data: rows, error } = await query
  const row: any = Array.isArray(rows) ? rows[0] : rows
  if (error || !row) notFound()

  const rawPauta: any = Array.isArray(row.pautas) ? row.pautas[0] : row.pautas
  const { data: profile } = row.responsible_id
    ? await supabase.from('profiles').select('id,full_name,initials,color,job_title,avatar_path').eq('id', row.responsible_id).maybeSingle()
    : { data: context.profile }

  const content: any = {
    id: row.id,
    pautaId: rawPauta?.id,
    pautaTitle: rawPauta?.title || 'Sem pauta vinculada',
    title: row.title,
    subtitle: row.subtitle || '',
    body: row.body,
    type: row.format,
    status: contentStatus(row.status),
    version: `v${row.version}`,
    lastEdit: new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(row.updated_at)),
    slug: row.slug ?? null,
    siteUrl: row.site_url ?? null,
    sitePublishedAt: row.site_published_at
      ? new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(row.site_published_at))
      : null,
  }
  const { data: commentRows } = await supabase
    .from('content_comments')
    .select('id,body,created_at,profiles!content_comments_author_id_fkey(id,full_name,initials,color,avatar_path)')
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
        avatarPath: author?.avatar_path ?? null,
      },
    }
  })

  const pauta: any = rawPauta ? { id: rawPauta.id, project: rawPauta.coordination || 'Editorial' } : undefined
  const responsible: any = profile ? {
    id: profile.id,
    name: profile.full_name,
    initials: profile.initials,
    color: profile.color,
    avatarPath: profile.avatar_path,
    role: profile.job_title,
  } : undefined

  const { data: pubRows } = await supabase
    .from('social_publications')
    .select('id,networks,body,status,error,results,scheduled_for,created_at,format')
    .eq('workspace_id', context.workspace.id)
    .eq('content_id', row.id)
    .order('created_at', { ascending: false })
    .limit(10)

  const quando = new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' })
  const publicacoes = (pubRows ?? []).map((pub: any) => ({
    id: pub.id,
    redes: pub.networks ?? [],
    corpo: pub.body,
    status: pub.status,
    erro: pub.error,
    formato: pub.format,
    resultados: Array.isArray(pub.results) ? pub.results : [],
    criadaEm: quando.format(new Date(pub.created_at)),
    agendadaPara: pub.scheduled_for ? quando.format(new Date(pub.scheduled_for)) : null,
  }))

  // Quem pode ser convidado a revisar: qualquer membro ativo do espaço, menos
  // quem está olhando a tela.
  const { data: memberRows } = await supabase
    .from('workspace_members')
    .select('user_id,profiles(id,full_name,initials,color,active)')
    .eq('workspace_id', context.workspace.id)

  const pessoas = (memberRows ?? [])
    .map((m: any) => (Array.isArray(m.profiles) ? m.profiles[0] : m.profiles))
    .filter((p: any) => p && p.active !== false && p.id !== context.user.id)
    .map((p: any) => ({ id: p.id, nome: p.full_name, iniciais: p.initials || '?', cor: p.color }))

  const canSubmit = context.role === 'admin' || row.responsible_id === context.user.id || rawPauta?.owner_id === context.user.id
  return (
    <ContentEditor
      content={content}
      pauta={pauta}
      responsible={responsible}
      comments={comments}
      canSubmit={canSubmit}
      publicacoes={publicacoes}
      workspaceId={context.workspace.id}
      pessoas={pessoas}
      siteBaseUrl={process.env.SITE_PUBLIC_BASE_URL ?? null}
    />
  )
}
