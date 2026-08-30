import Link from 'next/link'
import { AlertTriangle, ArrowRight, CalendarDays, CheckCircle2, Clock3, FolderKanban, Plus, Send, TrendingUp } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { StatusBadge } from '@/components/ui/status-badge'
import { requireWorkspace } from '@/lib/session'
import { createClient } from '@/lib/supabase/server'
import { pautaStatus } from '@/lib/status-maps'

function dataHoje() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date())
}

export default async function DashboardPage() {
  const context = await requireWorkspace()
  const supabase = await createClient()
  const hoje = dataHoje()

  const [
    { data: pautas },
    { data: events },
    { data: approvals },
    { data: projects },
    { data: packages },
  ] = await Promise.all([
    supabase.from('pautas').select('id,title,status,priority,due_date,project_id').eq('workspace_id', context.workspace.id).order('updated_at', { ascending: false }),
    supabase.from('calendar_events').select('id,title,event_date,event_time,channel,pauta_id').eq('workspace_id', context.workspace.id).gte('event_date', hoje).order('event_date').order('event_time').limit(12),
    supabase.from('approvals').select('id').eq('workspace_id', context.workspace.id).eq('status', 'pending'),
    supabase.from('projects').select('id,name,status,pautas(id,status,due_date)').eq('workspace_id', context.workspace.id).eq('status', 'active').order('updated_at', { ascending: false }).limit(6),
    supabase.from('social_packages').select('id,titulo_interno,status,updated_at').eq('workspace_id', context.workspace.id).neq('status', 'arquivado').order('updated_at', { ascending: false }).limit(40),
  ])

  const packageIds = (packages ?? []).map((p) => p.id)
  const { data: destinations } = packageIds.length
    ? await supabase.from('package_destinations').select('package_id,canal,estado').in('package_id', packageIds)
    : { data: [] as { package_id: string; canal: string; estado: string }[] }

  const name = context.profile?.full_name?.split(' ')[0] || context.profile?.username || 'colaborador'
  const atrasadas = (pautas ?? []).filter((p) => p.due_date && p.due_date < hoje && !['approved', 'archived', 'done'].includes(p.status))
  const emProducao = (pautas ?? []).filter((p) => p.status === 'production')
  const eventosHoje = (events ?? []).filter((event) => event.event_date === hoje)
  const publicadas = (packages ?? []).filter((p) => p.status === 'publicado')
  const publicacoesComFalha = (packages ?? []).filter((p) => p.status === 'falhou' || p.status === 'parcial')

  const packageUpdated = new Map((packages ?? []).map((p) => [p.id, p.updated_at]))
  const canalUltima = new Map<string, string>()
  for (const destination of destinations ?? []) {
    if (destination.estado !== 'publicada') continue
    const updatedAt = packageUpdated.get(destination.package_id)
    if (!updatedAt) continue
    const atual = canalUltima.get(destination.canal)
    if (!atual || new Date(updatedAt) > new Date(atual)) canalUltima.set(destination.canal, updatedAt)
  }

  const canais = [
    ['instagram', 'Instagram'],
    ['facebook', 'Facebook'],
    ['site_web', 'Site'],
  ] as const

  return (
    <div className="space-y-7">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-sm font-medium text-primary">Central de Comunicação</p>
          <h1 className="mt-1 text-3xl font-bold tracking-tight">Boa tarde, {name}.</h1>
          <p className="mt-1 text-sm text-muted-foreground">O que precisa de atenção e o que está programado na operação.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" render={<Link href="/calendario" />}><CalendarDays className="size-4" />Ver calendário</Button>
          <Button render={<Link href="/registrar" />}><Plus className="size-4" />Criar</Button>
        </div>
      </div>

      <section>
        <div className="mb-3 flex items-center justify-between gap-3">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Precisa de atenção</h2>
          <Link href="/aprovacoes" className="text-xs font-medium text-primary hover:underline">Ver fila completa</Link>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <AttentionCard icon={CheckCircle2} value={approvals?.length ?? 0} title="Aguardando aprovação" description="Conteúdos esperando decisão" href="/aprovacoes" tone="primary" />
          <AttentionCard icon={AlertTriangle} value={atrasadas.length} title="Atrasados" description="Demandas que passaram do prazo" href="/pautas" tone={atrasadas.length ? 'danger' : 'neutral'} />
          <AttentionCard icon={Clock3} value={eventosHoje.length} title="Publicações hoje" description="Itens previstos no calendário" href="/calendario" tone="neutral" />
          <AttentionCard icon={Send} value={publicacoesComFalha.length} title="Publicação com atenção" description="Pacotes parciais ou com falha" href="/redes" tone={publicacoesComFalha.length ? 'danger' : 'neutral'} />
        </div>
      </section>

      <div className="grid gap-6 xl:grid-cols-[1.35fr_0.65fr]">
        <section>
          <div className="mb-3 flex items-center justify-between gap-3">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Próximas publicações</h2>
            <Link href="/calendario" className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline">Calendário <ArrowRight className="size-3" /></Link>
          </div>
          <Card className="divide-y divide-border overflow-hidden">
            {(events ?? []).slice(0, 7).map((event) => (
              <Link key={event.id} href="/calendario" className="flex items-center gap-4 px-5 py-4 transition-colors hover:bg-muted/50">
                <div className="w-14 shrink-0 text-center">
                  <p className="text-xs font-semibold uppercase text-muted-foreground">{new Intl.DateTimeFormat('pt-BR', { month: 'short', timeZone: 'America/Sao_Paulo' }).format(new Date(`${event.event_date}T12:00:00-03:00`))}</p>
                  <p className="text-xl font-bold tabular-nums">{event.event_date.slice(-2)}</p>
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium">{event.title}</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">{event.channel || 'Canal a definir'}{event.event_time ? ` · ${event.event_time.slice(0, 5)}` : ''}</p>
                </div>
              </Link>
            ))}
            {!events?.length && <p className="p-8 text-center text-sm text-muted-foreground">Nada programado. Use o calendário para manter a comunicação ativa.</p>}
          </Card>
        </section>

        <section>
          <div className="mb-3 flex items-center justify-between gap-3">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Saúde dos canais</h2>
            <Link href="/impacto" className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline">Impacto <TrendingUp className="size-3" /></Link>
          </div>
          <Card className="divide-y divide-border overflow-hidden">
            {canais.map(([key, label]) => {
              const ultima = canalUltima.get(key)
              return (
                <div key={key} className="px-5 py-4">
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2"><span className={`size-2 rounded-full ${ultima ? 'bg-success' : 'bg-muted-foreground/40'}`} /><p className="font-medium">{label}</p></div>
                    <span className="text-xs text-muted-foreground">{ultima ? new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short', timeZone: 'America/Sao_Paulo' }).format(new Date(ultima)) : 'Sem publicação registrada'}</span>
                  </div>
                  <p className="mt-1 pl-4 text-xs text-muted-foreground">Última atividade publicada registrada pelo Redação</p>
                </div>
              )
            })}
          </Card>
        </section>
      </div>

      <section>
        <div className="mb-3 flex items-center justify-between gap-3">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Projetos ativos</h2>
          <Link href="/projetos" className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline">Todos os projetos <ArrowRight className="size-3" /></Link>
        </div>
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {(projects ?? []).map((project: any) => {
            const projectPautas = project.pautas ?? []
            const projectLate = projectPautas.filter((p: any) => p.due_date && p.due_date < hoje && !['approved', 'archived', 'done'].includes(p.status)).length
            const projectProduction = projectPautas.filter((p: any) => p.status === 'production').length
            return (
              <Link key={project.id} href={`/projetos/${project.id}`}>
                <Card className="h-full p-5 transition-colors hover:bg-muted/40">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex min-w-0 items-center gap-3"><div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary"><FolderKanban className="size-4" /></div><div className="min-w-0"><p className="truncate font-semibold">{project.name}</p><p className="text-xs text-muted-foreground">Em andamento</p></div></div>
                    {projectLate > 0 && <span className="rounded-full bg-destructive/10 px-2 py-1 text-[11px] font-semibold text-destructive">{projectLate} atraso{projectLate > 1 ? 's' : ''}</span>}
                  </div>
                  <div className="mt-5 flex gap-5 text-sm"><div><p className="text-xl font-bold tabular-nums">{projectPautas.length}</p><p className="text-xs text-muted-foreground">Demandas</p></div><div><p className="text-xl font-bold tabular-nums">{projectProduction}</p><p className="text-xs text-muted-foreground">Em produção</p></div></div>
                </Card>
              </Link>
            )
          })}
          {!projects?.length && <Card className="p-8 text-center md:col-span-2 xl:col-span-3"><p className="font-medium">Nenhum projeto ativo.</p><p className="mt-1 text-sm text-muted-foreground">A rotina editorial continua funcionando normalmente mesmo sem projetos.</p></Card>}
        </div>
      </section>

      <div className="grid gap-3 sm:grid-cols-3">
        <MiniStat value={emProducao.length} label="Demandas em produção" />
        <MiniStat value={publicadas.length} label="Pacotes publicados" />
        <MiniStat value={packages?.length ?? 0} label="Pacotes na operação" />
      </div>
    </div>
  )
}

function AttentionCard({ icon: Icon, value, title, description, href, tone }: { icon: typeof AlertTriangle; value: number; title: string; description: string; href: string; tone: 'primary' | 'danger' | 'neutral' }) {
  return (
    <Link href={href}>
      <Card className="h-full p-5 transition-colors hover:bg-muted/40">
        <div className="flex items-start justify-between gap-3">
          <div className={`flex size-9 items-center justify-center rounded-lg ${tone === 'danger' ? 'bg-destructive/10 text-destructive' : tone === 'primary' ? 'bg-primary/10 text-primary' : 'bg-muted text-muted-foreground'}`}><Icon className="size-4" /></div>
          <span className="text-3xl font-bold tabular-nums">{value}</span>
        </div>
        <p className="mt-4 text-sm font-semibold">{title}</p>
        <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{description}</p>
      </Card>
    </Link>
  )
}

function MiniStat({ value, label }: { value: number; label: string }) {
  return <Card className="p-4"><p className="text-2xl font-bold tabular-nums">{value}</p><p className="mt-1 text-xs text-muted-foreground">{label}</p></Card>
}
