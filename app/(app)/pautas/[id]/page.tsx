import { notFound } from 'next/navigation'
import { getPauta, type Pauta, type PautaStatus, type Priority } from '@/lib/data'
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

  if (!isUuid) {
    const pauta = getPauta(id)
    if (!pauta) notFound()
    return <PautaRoom pauta={pauta} />
  }

  const context = await requireWorkspace()
  const supabase = await createClient()
  const { data } = await supabase
    .from('pautas')
    .select('id,title,description,status,priority,coordination,due_date,owner_id,tags')
    .eq('id', id)
    .eq('workspace_id', context.workspace.id)
    .maybeSingle()

  if (!data) notFound()

  const project = Array.isArray(data.tags) && data.tags[0] ? String(data.tags[0]) : 'Editorial'
  const pauta: Pauta = {
    id: data.id,
    title: data.title,
    type: project,
    project,
    projectId: project.toLowerCase().replaceAll(' ', '-'),
    coordenacao: data.coordination || 'Não informada',
    responsibleId: 'matheus',
    deadline: data.due_date
      ? new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: 'short' }).format(new Date(`${data.due_date}T12:00:00`)).toUpperCase()
      : 'Sem prazo',
    priority: priorityMap[data.priority] || (data.priority as Priority) || 'normal',
    status: statusMap[data.status] || (data.status as PautaStatus) || 'entrada',
    comments: 0,
    files: 0,
    summary: data.description || '',
  }

  return <PautaRoom pauta={pauta} />
}
