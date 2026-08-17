import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ArrowLeft, CalendarDays, CheckSquare, ClipboardList, FileEdit, Link2 } from 'lucide-react'
import { Card } from '@/components/ui/card'
import { Avatar, privateAvatarUrl } from '@/components/ui/avatar'
import { StatusBadge, ContentStatusBadge } from '@/components/ui/status-badge'
import { requireWorkspace } from '@/lib/session'
import { createClient } from '@/lib/supabase/server'
import { pautaStatus, contentStatus } from '@/lib/status-maps'
import { DeleteProjectButton } from './delete-project-button'

export default async function ProjectDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const context = await requireWorkspace()
  const supabase = await createClient()

  const { data: project } = await supabase
    .from('projects')
    .select('id,name,description,status,created_by,created_at,updated_at')
    .eq('id', id)
    .eq('workspace_id', context.workspace.id)
    .maybeSingle()
  if (!project) notFound()

  const { data: creator } = project.created_by
    ? await supabase.from('profiles').select('full_name,initials,color,avatar_path').eq('id', project.created_by).maybeSingle()
    : { data: null }

  const { data: pautas } = await supabase
    .from('pautas')
    .select('id,title,status,priority,due_date')
    .eq('workspace_id', context.workspace.id)
    .eq('project_id', id)
    .order('updated_at', { ascending: false })

  const pautaIds = (pautas ?? []).map((p) => p.id)

  const [{ data: contents }, { data: events }, { data: links }] = await Promise.all([
    pautaIds.length
      ? supabase.from('content_pieces').select('id,title,format,status,updated_at,pauta_id').eq('workspace_id', context.workspace.id).in('pauta_id', pautaIds).order('updated_at', { ascending: false })
      : Promise.resolve({ data: [] as any[] }),
    pautaIds.length
      ? supabase.from('calendar_events').select('id,title,event_date,event_time,type,pauta_id').eq('workspace_id', context.workspace.id).in('pauta_id', pautaIds).order('event_date', { ascending: false })
      : Promise.resolve({ data: [] as any[] }),
    pautaIds.length
      ? supabase.from('pauta_links').select('id,title,url,category,pauta_id').eq('workspace_id', context.workspace.id).in('pauta_id', pautaIds).order('created_at', { ascending: false })
      : Promise.resolve({ data: [] as any[] }),
  ])

  const pautaTitleById = new Map((pautas ?? []).map((p) => [p.id, p.title]))
  const pendingApprovals = (contents ?? []).filter((c) => c.status === 'review').length
  const canDelete = context.role === 'admin' || project.created_by === context.user.id

  return (
    <div>
      <nav className="mb-4 flex items-center gap-1 text-xs text-muted-foreground">
        <Link href="/projetos" className="flex items-center gap-1 hover:text-foreground"><ArrowLeft className="size-3.5" />Projetos</Link>
        <span>/</span>
        <span className="text-foreground">{project.name}</span>
      </nav>

      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-2xl font-bold tracking-tight text-balance">{project.name}</h1>
            <span className="rounded-md bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">{project.status === 'active' ? 'Ativo' : project.status}</span>
          </div>
          <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted-foreground">{project.description || 'Sem descrição.'}</p>
          <div className="mt-3 flex items-center gap-2 text-sm text-muted-foreground">
            {creator && <Avatar initials={creator.initials || '?'} color={creator.color} src={privateAvatarUrl(creator.avatar_path)} size="xs" />}
            <span>Criado por {creator?.full_name || 'alguém que já saiu do espaço'} em {new Intl.DateTimeFormat('pt-BR', { dateStyle: 'long' }).format(new Date(project.created_at))}</span>
          </div>
        </div>
        {canDelete && <DeleteProjectButton projectId={project.id} projectName={project.name} />}
      </div>

      <h2 className="mb-3 mt-6 text-sm font-semibold uppercase text-muted-foreground">Ferramentas vinculadas a este projeto</h2>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <ToolStat icon={ClipboardList} value={pautas?.length ?? 0} label="Pautas" />
        <ToolStat icon={FileEdit} value={contents?.length ?? 0} label="Matérias" />
        <ToolStat icon={CheckSquare} value={pendingApprovals} label="Aguardando aprovação" />
        <ToolStat icon={CalendarDays} value={events?.length ?? 0} label="Agendamentos" />
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <Section title={`Pautas (${pautas?.length ?? 0})`}>
          {pautas?.map((pauta) => (
            <Link key={pauta.id} href={`/pautas/${pauta.id}`} className="flex items-center justify-between gap-3 px-5 py-4 hover:bg-muted/50">
              <p className="min-w-0 truncate font-medium">{pauta.title}</p>
              <StatusBadge status={pautaStatus(pauta.status)} />
            </Link>
          ))}
          {!pautas?.length && <EmptyRow>Nenhuma pauta vinculada a este projeto ainda.</EmptyRow>}
        </Section>

        <Section title={`Matérias (${contents?.length ?? 0})`}>
          {contents?.map((content: any) => (
            <Link key={content.id} href={`/conteudos/${content.id}`} className="flex items-center justify-between gap-3 px-5 py-4 hover:bg-muted/50">
              <div className="min-w-0">
                <p className="truncate font-medium">{content.title || 'Sem título'}</p>
                <p className="truncate text-xs text-muted-foreground">{pautaTitleById.get(content.pauta_id) || 'Sem pauta'}</p>
              </div>
              <ContentStatusBadge status={contentStatus(content.status)} />
            </Link>
          ))}
          {!contents?.length && <EmptyRow>Nenhuma matéria criada neste projeto ainda.</EmptyRow>}
        </Section>

        <Section title={`Agendamentos (${events?.length ?? 0})`}>
          {events?.map((event: any) => (
            <Link key={event.id} href="/calendario" className="flex items-center justify-between gap-3 px-5 py-4 hover:bg-muted/50">
              <div className="min-w-0">
                <p className="truncate font-medium">{event.title}</p>
                <p className="truncate text-xs text-muted-foreground">{pautaTitleById.get(event.pauta_id) || 'Sem pauta'}</p>
              </div>
              <span className="shrink-0 text-sm text-muted-foreground">{new Intl.DateTimeFormat('pt-BR').format(new Date(`${event.event_date}T12:00:00`))}</span>
            </Link>
          ))}
          {!events?.length && <EmptyRow>Nenhum agendamento vinculado a este projeto ainda.</EmptyRow>}
        </Section>

        <Section title={`Links e arquivos (${links?.length ?? 0})`}>
          {links?.map((link: any) => (
            <a key={link.id} href={link.url} target="_blank" rel="noreferrer" className="flex items-center gap-3 px-5 py-4 hover:bg-muted/50">
              <Link2 className="size-4 shrink-0 text-muted-foreground" />
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium">{link.title}</p>
                <p className="truncate text-xs text-muted-foreground">{pautaTitleById.get(link.pauta_id) || 'Sem pauta'}</p>
              </div>
            </a>
          ))}
          {!links?.length && <EmptyRow>Nenhum link de arquivo anexado nas pautas deste projeto.</EmptyRow>}
        </Section>
      </div>
    </div>
  )
}

function ToolStat({ icon: Icon, value, label }: { icon: typeof ClipboardList; value: number; label: string }) {
  return (
    <Card className="p-4">
      <Icon className="size-4 text-muted-foreground" />
      <p className="mt-2 text-2xl font-bold tabular-nums">{value}</p>
      <p className="text-xs text-muted-foreground">{label}</p>
    </Card>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h2 className="mb-3 text-sm font-semibold uppercase text-muted-foreground">{title}</h2>
      <Card className="divide-y divide-border">{children}</Card>
    </section>
  )
}

function EmptyRow({ children }: { children: React.ReactNode }) {
  return <p className="p-8 text-center text-sm text-muted-foreground">{children}</p>
}
