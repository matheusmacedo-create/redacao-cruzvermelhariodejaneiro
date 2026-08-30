import Link from 'next/link'
import { Activity, ArrowRight, BarChart3, Eye, Gauge, Globe2, Heart, Instagram, MousePointerClick, Users } from 'lucide-react'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { PageHeader } from '@/components/app/page-header'
import { requireWorkspace } from '@/lib/session'
import { createClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

function inicio30Dias() {
  const date = new Date()
  date.setDate(date.getDate() - 30)
  return date.toISOString()
}

export default async function ImpactoPage() {
  const context = await requireWorkspace()
  const supabase = await createClient()
  const desde = inicio30Dias()

  const [{ data: packages }, { data: projects }] = await Promise.all([
    supabase
      .from('social_packages')
      .select('id,titulo_interno,status,updated_at')
      .eq('workspace_id', context.workspace.id)
      .gte('updated_at', desde)
      .order('updated_at', { ascending: false })
      .limit(100),
    supabase
      .from('projects')
      .select('id,name,status,pautas(id,status)')
      .eq('workspace_id', context.workspace.id)
      .eq('status', 'active')
      .order('updated_at', { ascending: false })
      .limit(8),
  ])

  const ids = (packages ?? []).map((p) => p.id)
  const { data: destinations } = ids.length
    ? await supabase.from('package_destinations').select('package_id,canal,estado').in('package_id', ids)
    : { data: [] as { package_id: string; canal: string; estado: string }[] }

  const publicados = (packages ?? []).filter((p) => p.status === 'publicado')
  const canaisPublicados = new Map<string, number>()
  for (const destination of destinations ?? []) {
    if (destination.estado !== 'publicada') continue
    canaisPublicados.set(destination.canal, (canaisPublicados.get(destination.canal) ?? 0) + 1)
  }

  const totalDestinos = Array.from(canaisPublicados.values()).reduce((sum, value) => sum + value, 0)
  const canalNome: Record<string, string> = { instagram: 'Instagram', facebook: 'Facebook', site_web: 'Site', linkedin: 'LinkedIn', x: 'X', threads: 'Threads', bluesky: 'Bluesky', pinterest: 'Pinterest', google_business: 'Google Business' }
  const canaisOrdenados = Array.from(canaisPublicados.entries()).sort((a, b) => b[1] - a[1])

  return (
    <div>
      <PageHeader
        title="Impacto"
        description="Resultados da comunicação. A operação mostra o que precisa ser feito; aqui mostramos o que aconteceu depois da publicação."
        actions={<Button variant="outline" render={<Link href="/redes" />}>Ver publicações<ArrowRight className="size-4" /></Button>}
      />

      <div className="mb-6 rounded-xl border border-border bg-muted/35 p-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <div className="flex items-center gap-2"><Gauge className="size-4 text-primary" /><p className="text-sm font-semibold">Analytics em implantação</p></div>
            <p className="mt-1 max-w-3xl text-sm leading-relaxed text-muted-foreground">Esta primeira versão usa somente dados que o Redação já registra com segurança. Alcance, visualizações, seguidores, engajamento e dados do site aparecerão aqui quando as fontes analíticas forem conectadas — sem números estimados ou inventados.</p>
          </div>
          <div className="shrink-0 rounded-lg bg-background px-4 py-3 text-xs text-muted-foreground shadow-sm ring-1 ring-border">Período atual: últimos 30 dias</div>
        </div>
      </div>

      <section>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted-foreground">Atividade registrada</h2>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <MetricCard icon={BarChart3} value={publicados.length} label="Pacotes publicados" helper="Conteúdos concluídos no período" />
          <MetricCard icon={Activity} value={totalDestinos} label="Publicações por canal" helper="Destinos efetivamente publicados" />
          <MetricCard icon={Globe2} value={canaisPublicados.size} label="Canais ativos" helper="Canais com publicação registrada" />
          <MetricCard icon={Users} value={projects?.length ?? 0} label="Projetos ativos" helper="Projetos competindo pela agenda editorial" />
        </div>
      </section>

      <div className="mt-7 grid gap-6 xl:grid-cols-[0.8fr_1.2fr]">
        <section>
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted-foreground">Distribuição por canal</h2>
          <Card className="divide-y divide-border overflow-hidden">
            {canaisOrdenados.map(([canal, quantidade]) => (
              <div key={canal} className="px-5 py-4">
                <div className="flex items-center justify-between gap-4">
                  <div className="flex items-center gap-3"><div className="flex size-9 items-center justify-center rounded-lg bg-muted">{canal === 'instagram' ? <Instagram className="size-4" /> : <Globe2 className="size-4" />}</div><div><p className="font-medium">{canalNome[canal] ?? canal}</p><p className="text-xs text-muted-foreground">Últimos 30 dias</p></div></div>
                  <p className="text-2xl font-bold tabular-nums">{quantidade}</p>
                </div>
              </div>
            ))}
            {!canaisOrdenados.length && <p className="p-8 text-center text-sm text-muted-foreground">Ainda não há publicações concluídas no período.</p>}
          </Card>
        </section>

        <section>
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted-foreground">Próximas métricas</h2>
          <div className="grid gap-3 sm:grid-cols-2">
            <FutureMetric icon={Eye} title="Alcance e visualizações" description="Quantas contas foram alcançadas e quantas visualizações o conteúdo recebeu." />
            <FutureMetric icon={Users} title="Crescimento" description="Seguidores atuais, ganhos no período e evolução histórica por canal." />
            <FutureMetric icon={Heart} title="Engajamento" description="Curtidas, comentários, compartilhamentos, salvamentos e taxa de interação." />
            <FutureMetric icon={MousePointerClick} title="Site e Google" description="Usuários, páginas vistas, buscas, cliques, CTR e matérias com melhor desempenho." />
          </div>
        </section>
      </div>

      <section className="mt-7">
        <div className="mb-3 flex items-center justify-between gap-3">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Projetos em andamento</h2>
          <Link href="/projetos" className="text-xs font-medium text-primary hover:underline">Abrir projetos</Link>
        </div>
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {(projects ?? []).map((project: any) => {
            const pautas = project.pautas ?? []
            const concluidas = pautas.filter((p: any) => ['approved', 'done'].includes(p.status)).length
            return (
              <Link key={project.id} href={`/projetos/${project.id}`}>
                <Card className="h-full p-5 transition-colors hover:bg-muted/40">
                  <p className="font-semibold">{project.name}</p>
                  <div className="mt-4 flex gap-6"><div><p className="text-2xl font-bold tabular-nums">{pautas.length}</p><p className="text-xs text-muted-foreground">Demandas</p></div><div><p className="text-2xl font-bold tabular-nums">{concluidas}</p><p className="text-xs text-muted-foreground">Concluídas</p></div></div>
                  <p className="mt-4 text-xs text-muted-foreground">Quando analytics estiver conectado, alcance e engajamento deste projeto serão agregados aqui.</p>
                </Card>
              </Link>
            )
          })}
          {!projects?.length && <Card className="p-8 text-center md:col-span-2 xl:col-span-3"><p className="text-sm text-muted-foreground">Nenhum projeto ativo neste momento.</p></Card>}
        </div>
      </section>
    </div>
  )
}

function MetricCard({ icon: Icon, value, label, helper }: { icon: typeof BarChart3; value: number; label: string; helper: string }) {
  return <Card className="p-5"><div className="flex size-9 items-center justify-center rounded-lg bg-primary/10 text-primary"><Icon className="size-4" /></div><p className="mt-4 text-3xl font-bold tabular-nums">{value}</p><p className="mt-1 text-sm font-semibold">{label}</p><p className="mt-1 text-xs text-muted-foreground">{helper}</p></Card>
}

function FutureMetric({ icon: Icon, title, description }: { icon: typeof Eye; title: string; description: string }) {
  return <Card className="p-5"><div className="flex items-start gap-3"><div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground"><Icon className="size-4" /></div><div><p className="text-sm font-semibold">{title}</p><p className="mt-1 text-xs leading-relaxed text-muted-foreground">{description}</p></div></div></Card>
}
