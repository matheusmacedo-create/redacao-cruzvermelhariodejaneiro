import { notFound } from 'next/navigation'
import { type Pauta, type PautaStatus, type Priority } from '@/lib/data'
import { requireWorkspace } from '@/lib/session'
import { createClient } from '@/lib/supabase/server'
import { PautaRoom } from './pauta-room'

const statusMap: Record<string, PautaStatus> = {
  incoming: 'entrada',
  collection: 'coleta',
  production: 'producao',
  review: 'revisao',
  approval: 'aprovacao',
  approved: 'pronto',
  archived: 'arquivado',
}

const priorityMap: Record<string, Priority> = {
  low: 'baixa',
  medium: 'normal',
  high: 'alta',
  critical: 'critica',
}

export default async function PautaPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)

  if (!isUuid) notFound()

  const context = await requireWorkspace()
  const supabase = await createClient()
  const { data } = await supabase
    .from('pautas')
    .select('id,title,description,status,priority,coordination,due_date,owner_id,tags')
    .eq('id', id)
    .eq('workspace_id', context.workspace.id)
    .maybeSingle()

  if (!data) notFound()

  const [{ data: participantRows }, { data: memberRows }, { data: messageRows }, { data: linkRows }, { data: contentRows }, { data: activityRows }] = await Promise.all([
    supabase.from('pauta_participants').select('user_id').eq('pauta_id', data.id),
    supabase.from('workspace_members').select('user_id,coordination').eq('workspace_id', context.workspace.id),
    supabase.from('messages').select('id,author_id,body,created_at').eq('pauta_id', data.id).eq('workspace_id', context.workspace.id).order('created_at', { ascending: true }),
    supabase.from('file_links').select('file_id,files(id,name,file_type,storage_path,created_at)').eq('pauta_id', data.id).eq('workspace_id', context.workspace.id),
    supabase.from('content_pieces').select('id,title,format,status,version,updated_at').eq('pauta_id', data.id).eq('workspace_id', context.workspace.id).order('created_at'),
    supabase.from('activity_log').select('id,actor_id,action,metadata,created_at').eq('entity_type', 'pauta').eq('entity_id', data.id).eq('workspace_id', context.workspace.id).order('created_at', { ascending: false }),
  ])
  const memberIds = (memberRows ?? []).map((member) => member.user_id)
  const { data: profileRows } = memberIds.length
    ? await supabase.from('profiles').select('id,full_name,initials,color').in('id', memberIds).eq('active', true)
    : { data: [] }
  const coordinationById = new Map((memberRows ?? []).map((member) => [member.user_id, member.coordination]))
  const profileById = new Map((profileRows ?? []).map((profile) => [profile.id, profile]))
  const messages = (messageRows ?? []).map((message) => {
    const author = profileById.get(message.author_id)
    return {
      id: message.id,
      text: message.body,
      time: new Intl.DateTimeFormat('pt-BR', { hour: '2-digit', minute: '2-digit' }).format(new Date(message.created_at)),
      author: {
        name: author?.full_name || 'Colaborador',
        initials: author?.initials || '?',
        color: author?.color || 'var(--muted)',
        coordination: coordinationById.get(message.author_id) || 'Sem coordenação',
      },
    }
  })
  const participantIds = new Set((participantRows ?? []).map((participant) => participant.user_id))
  const people = (profileRows ?? []).map((profile) => ({
    id: profile.id,
    name: profile.full_name,
    initials: profile.initials,
    color: profile.color,
    coordination: coordinationById.get(profile.id) || 'Sem coordenação',
  }))
  const participants = [...participantIds]
    .map((participantId) => people.find((person) => person.id === participantId))
    .filter((person): person is NonNullable<typeof person> => Boolean(person))

  const project = Array.isArray(data.tags) && data.tags[0] ? String(data.tags[0]) : 'Sem projeto'
  const driveLinks = (linkRows ?? []).flatMap((row: any) => {
    const file = Array.isArray(row.files) ? row.files[0] : row.files
    return file?.storage_path ? [{ id: file.id, name: file.name, fileType: file.file_type, url: file.storage_path, createdAt: file.created_at }] : []
  })
  const realContents = (contentRows ?? []).map((content) => ({ id: content.id, title: content.title, format: content.format, status: content.status, version: content.version, updatedAt: content.updated_at }))
  const history = (activityRows ?? []).map((event) => {
    const actor = profileById.get(event.actor_id)
    return { id: event.id, action: event.action, time: new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(event.created_at)), actor: actor?.full_name || 'Sistema', initials: actor?.initials || '?', color: actor?.color || 'var(--muted)' }
  })
  const ownerProfile = profileById.get(data.owner_id)
  const responsible = ownerProfile ? { id: ownerProfile.id, name: ownerProfile.full_name, initials: ownerProfile.initials, color: ownerProfile.color, coordination: coordinationById.get(ownerProfile.id) || 'Sem coordenação' } : undefined
  const pauta: Pauta = {
    id: data.id,
    title: data.title,
    type: project,
    project,
    projectId: project.toLowerCase().replaceAll(' ', '-'),
    coordenacao: data.coordination || 'Não informada',
    responsibleId: data.owner_id || '',
    deadline: data.due_date
      ? new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: 'short' }).format(new Date(`${data.due_date}T12:00:00`)).toUpperCase()
      : 'Sem prazo',
    priority: priorityMap[data.priority] || (data.priority as Priority) || 'normal',
    status: statusMap[data.status] || (data.status as PautaStatus) || 'entrada',
    comments: 0,
    files: driveLinks.length,
    summary: data.description || '',
  }

  return <PautaRoom pauta={pauta} participants={participants} availablePeople={people} messages={messages} responsible={responsible} driveLinks={driveLinks} contentItems={realContents} history={history} />
}
