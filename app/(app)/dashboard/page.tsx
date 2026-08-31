import Link from 'next/link'
import { AlertTriangle, ArrowRight, CalendarDays, CheckCircle2, Clock3, FolderKanban, Plus, Send, TrendingUp } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { StatusBadge } from '@/components/ui/status-badge'
import { requireWorkspace } from '@/lib/session'
import { createClient } from '@/lib/supabase/server'
import { pautaStatus } from '@/lib/status-maps'
import { adapter } from '@/lib/publicacao/canais'
import { STATUS_EM_ABERTO } from '@/lib/editorial/status'

function dataHoje() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date())
}

/** A saudação tem de bater com o relógio de quem lê — em Brasília, não em UTC. */
function saudacao() {
  const hora = Number(new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo', hour: '2-digit', hour12: false }).format(new Date()))
  if (hora < 12) return 'Bom dia'
  if (hora < 18) return 'Boa tarde'
  return 'Boa noite'
}

export default async function DashboardPage() {
  const context = await requireWorkspace()
  const supabase = await createClient()
  const hoje = dataHoje()

  // Os cartões de atenção são números, não listas: contar no banco evita
  // trazer a operação inteira para a memória só para chamar .filter() nela —
  // e um teto de linhas aqui esconderia justamente o atraso mais antigo.
  const [
    { count: atrasadas },
    { count: emProducao },
    { data: events },
    { count: aguardandoAprovacao },
    { data: projects },
    { count: pacotesPublicados },
    { count: pacotesComFalha },
    { count: pacotesNaOperacao },
  ] = await Promise.all([
    supabase.from('pautas').select('id', { count: 'exact', head: true })
      .eq('workspace_id', context.workspace.id)
      .lt('due_date', hoje)
      .in('status', STATUS_EM_ABERTO),
    supabase.from('pautas').select('id', { count: 'exact', head: true })
      .eq('workspace_id', context.workspace.id).eq('status', 'production'),
    supabase.from('calendar_events').select('id,title,event_date,event_time,channel,pauta_id').eq('workspace_id', context.workspace.id).gte('event_date', hoje).order('event_date').order('event_time').limit(12),
    supabase.from('approvals').select('id', { count: 'exact', head: true }).eq('workspace_id', context.workspace.id).eq('status', 'pending'),
    supabase.from('projects').select('id,name,status,pautas(id,status,due_date)').eq('workspace_id', context.workspace.id).eq('status', 'active').order('updated_at', { ascending: false }).limit(6),
    supabase.from('social_packages').select('id', { count: 'exact', head: true })
      .eq('workspace_id', context.workspace.id).eq('status', 'publicado'),
    supabase.from('social_packages').select('id', { count: 'exact', head: true })
      .eq('workspace_id', context.workspace.id).in('status', ['falhou', 'parcial']),
    supabase.from('social_packages').select('id', { count: 'exact', head: true })
      .eq('workspace_id', context.workspace.id).neq('status', 'arquivado'),
  ])

  // A saúde do canal é sobre quando ele recebeu conteúdo pela última vez. Isso
  // é uma pergunta ao destino publicado, não ao pacote: updated_at do pacote
  // se move a cada edição e faria um canal parado há meses parecer ativo hoje.
  const { data: ultimasPublicacoes } = await supabase
    .from('package_destinations')
    .select('canal,publicado_em')
    .eq('workspace_id', context.workspace.id)
    .eq('estado', 'publicada')
    .not('publicado_em', 'is', null)
    .order('publicado_em', { ascending: false })
    .limit(200)

  const name = context.profile?.full_name?.split(' ')[0] || context.profile?.username || 'colaborador'
  const eventosHoje = (events ?? []).filter((event) => event.event_date === hoje)

  // Já vem em ordem decrescente: a primeira linha de cada canal é a mais nova.
  const canalUltima = new Map<string, string>()
  for (const linha of ultimasPublicacoes ?? []) {
    if (!canalUltima.has(linha.canal)) canalUltima.set(linha.canal, linha.publicado_em as string)
  }

  // O site sempre aparece — é o canal da casa, e um site parado é notícia.
  // Os outros entram por uso: canal que a redação nunca usou não vira cobrança
  // na tela, e canal novo aparece sozinho, sem ninguém editar esta lista.
  const canais: [string, string][] = [
    ['site_web', adapter('site_web')?.nome ?? 'Site'],
    ...[...canalUltima.keys()]
      .filter((id) => id !== 'site_web')
      .map((id): [string, string] => [id, adapter(id)?.nome ?? id]),
  ]

  return (
    <div className="space-y-7">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-sm font-medium text-primary">Central de Comunicação</p>
          <h1 className="mt-1 text-3xl font-bold tracking-tight">{saudacao()}, {name}.</h1>
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
          <AttentionCard icon={CheckCircle2} value={aguardandoAprovacao ?? 0} title="Aguardando aprovação" description="Conteúdos esperando decisão" href="/aprovacoes" tone="primary" />
          <AttentionCard icon={AlertTriangle} value={atrasadas ?? 0} title="Atrasados" description="Demandas que passaram do prazo" href="/pautas" tone={atrasadas ? 'danger' : 'neutral'} />
          <AttentionCard icon={Clock3} value={eventosHoje.length} title="Publicações hoje" description="Itens previstos no calendário" href="/calendario" tone="neutral" />
          <AttentionCard icon={Send} value={pacotesComFalha ?? 0} title="Publicação com atenção" description="Pacotes parciais ou com falha" href="/redes" tone={pacotesComFalha ? 'danger' : 'neutral'} />
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
                  <p className="mt-1 pl-4 text-xs text-muted-foreground">Data da última publicação neste canal</p>
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
            const projectLate = projectPautas.filter((p: any) => p.due_date && p.due_date < hoje && STATUS_EM_ABERTO.includes(p.status)).length
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
        <MiniStat value={emProducao ?? 0} label="Demandas em produção" />
        <MiniStat value={pacotesPublicados ?? 0} label="Pacotes publicados" />
        <MiniStat value={pacotesNaOperacao ?? 0} label="Pacotes na operação" />
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
