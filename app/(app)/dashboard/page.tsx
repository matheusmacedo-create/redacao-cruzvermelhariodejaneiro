import Link from 'next/link'
import { Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { StatusBadge } from '@/components/ui/status-badge'
import { Avatar, privateAvatarUrl } from '@/components/ui/avatar'
import { requireWorkspace } from '@/lib/session'
import { createClient } from '@/lib/supabase/server'
import { ACTIVITY_ACTION_LABEL, pautaStatus } from '@/lib/status-maps'

export default async function DashboardPage() {
  const context = await requireWorkspace()
  const supabase = await createClient()
  const isAdmin = context.role === 'admin'

  const [{ data: pautas }, { data: events }, { data: inbox }, { data: approvals }, { data: projectPautas }, { data: recentLogs }] = await Promise.all([
    supabase.from('pautas').select('id,title,status,priority,due_date').eq('workspace_id', context.workspace.id).order('updated_at', { ascending: false }),
    supabase.from('calendar_events').select('id,title,event_date,event_time').eq('workspace_id', context.workspace.id).gte('event_date', new Date().toISOString().slice(0, 10)).order('event_date').limit(5),
    supabase.from('inbox_items').select('id').eq('workspace_id', context.workspace.id).eq('status', 'new'),
    supabase.from('approvals').select('id').eq('workspace_id', context.workspace.id).eq('status', 'pending'),
    isAdmin
      ? supabase.from('pautas').select('id,project_id,projects(id,name)').eq('workspace_id', context.workspace.id).not('project_id', 'is', null)
      : Promise.resolve({ data: [] as any[] }),
    isAdmin
      ? supabase.from('activity_log').select('id,actor_id,action,created_at,entity_id,profiles(full_name,initials,color,avatar_path)').eq('workspace_id', context.workspace.id).eq('entity_type', 'pauta').order('created_at', { ascending: false }).limit(80)
      : Promise.resolve({ data: [] as any[] }),
  ])

  const name = context.profile?.full_name?.split(' ')[0] || context.profile?.username || 'colaborador'
  const stats = [
    ['Pautas abertas', pautas?.filter((p) => !['approved', 'archived', 'done'].includes(p.status)).length ?? 0],
    ['Em produção', pautas?.filter((p) => p.status === 'production').length ?? 0],
    ['Aguardando aprovação', approvals?.length ?? 0],
    ['Caixa de entrada', inbox?.length ?? 0],
  ] as const

  const pautaProjectMap = new Map<string, { id: string; name: string }>()
  for (const row of projectPautas ?? []) {
    const project = Array.isArray(row.projects) ? row.projects[0] : row.projects
    if (project) pautaProjectMap.set(row.id, { id: project.id, name: project.name })
  }

  const seenProjects = new Set<string>()
  const projectActivity: Array<{ projectId: string; projectName: string; actorName: string; initials: string; color?: string; avatarPath?: string | null; actionLabel: string; time: string }> = []
  for (const log of recentLogs ?? []) {
    const project = pautaProjectMap.get(log.entity_id)
    if (!project || seenProjects.has(project.id)) continue
    seenProjects.add(project.id)
    const actor = Array.isArray(log.profiles) ? log.profiles[0] : log.profiles
    projectActivity.push({
      projectId: project.id,
      projectName: project.name,
      actorName: actor?.full_name || 'Alguém da equipe',
      initials: actor?.initials || '?',
      color: actor?.color,
      avatarPath: actor?.avatar_path,
      actionLabel: ACTIVITY_ACTION_LABEL[log.action] || log.action,
      time: new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(log.created_at)),
    })
    if (projectActivity.length >= 5) break
  }

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Olá, {name}.</h1>
          <p className="mt-1 text-sm text-muted-foreground">Visão geral do espaço {context.workspace.name}.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" render={<Link href="/registrar" />}>Registrar atividade</Button>
          <Button render={<Link href="/registrar" />}><Plus className="size-4" />Nova pauta</Button>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {stats.map(([label, value]) => (
          <Card key={label} className="p-5">
            <p className="text-3xl font-bold tabular-nums">{value}</p>
            <p className="mt-1 text-sm text-muted-foreground">{label}</p>
          </Card>
        ))}
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <section>
          <h2 className="mb-3 text-sm font-semibold uppercase text-muted-foreground">Próximos agendamentos</h2>
          <Card className="divide-y divide-border">
            {events?.map((event) => (
              <Link key={event.id} href="/calendario" className="flex items-center justify-between gap-3 px-5 py-4 hover:bg-muted/50">
                <span className="min-w-0 truncate font-medium">{event.title}</span>
                <span className="shrink-0 text-sm text-muted-foreground">{new Intl.DateTimeFormat('pt-BR').format(new Date(`${event.event_date}T12:00:00`))}</span>
              </Link>
            ))}
            {!events?.length && <p className="p-8 text-center text-sm text-muted-foreground">Nenhum agendamento neste espaço.</p>}
          </Card>
        </section>

        <section>
          <h2 className="mb-3 text-sm font-semibold uppercase text-muted-foreground">Pautas recentes</h2>
          <Card className="divide-y divide-border">
            {pautas?.slice(0, 5).map((pauta) => (
              <Link key={pauta.id} href={`/pautas/${pauta.id}`} className="flex items-center justify-between gap-3 px-5 py-4 hover:bg-muted/50">
                <p className="min-w-0 truncate font-medium">{pauta.title}</p>
                <StatusBadge status={pautaStatus(pauta.status)} />
              </Link>
            ))}
            {!pautas?.length && <p className="p-8 text-center text-sm text-muted-foreground">Produção ainda está vazia. Crie a primeira pauta.</p>}
          </Card>
        </section>
      </div>

      {isAdmin && (
        <section className="mt-6">
          <h2 className="mb-3 text-sm font-semibold uppercase text-muted-foreground">Projetos recentes</h2>
          <Card className="divide-y divide-border">
            {projectActivity.map((item) => (
              <Link key={item.projectId} href={`/projetos/${item.projectId}`} className="flex items-center justify-between gap-3 px-5 py-4 hover:bg-muted/50">
                <div className="flex min-w-0 items-center gap-3">
                  <Avatar initials={item.initials} color={item.color} src={privateAvatarUrl(item.avatarPath)} size="sm" />
                  <div className="min-w-0">
                    <p className="truncate font-medium">{item.projectName}</p>
                    <p className="truncate text-xs text-muted-foreground">{item.actorName} {item.actionLabel} uma pauta</p>
                  </div>
                </div>
                <span className="shrink-0 text-xs text-muted-foreground">{item.time}</span>
              </Link>
            ))}
            {!projectActivity.length && <p className="p-8 text-center text-sm text-muted-foreground">Nenhuma movimentação em projetos ainda.</p>}
          </Card>
        </section>
      )}
    </div>
  )
}
