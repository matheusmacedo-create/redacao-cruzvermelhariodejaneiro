import Link from 'next/link'
import { Activity, ArrowRight, BarChart3, Eye, Gauge, Globe2, Heart, Share2, Users } from 'lucide-react'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { PageHeader } from '@/components/app/page-header'
import { AbasDaArea } from '@/components/app/abas-da-area'
import { requireWorkspace } from '@/lib/session'
import { createClient } from '@/lib/supabase/server'
import { adapter } from '@/lib/publicacao/canais'
import { tituloDaArea } from '@/lib/navegacao'
import { pode } from '@/lib/permissoes'
import { situacaoDoAnalytics } from '@/lib/analytics/servidor'
import { caminhoDaPagina, lerPeriodo } from '@/lib/analytics/relatorio'
import { ID_DA_PROPRIEDADE } from '@/lib/site/analytics'
import { SiteNoResultados } from '@/components/app/resultados/site'

export const metadata = { title: tituloDaArea('/impacto') }

export const dynamic = 'force-dynamic'

function inicio30Dias() {
  const date = new Date()
  date.setDate(date.getDate() - 30)
  return date.toISOString()
}

/** A data de hoje em São Paulo (AAAA-MM-DD): o período do Analytics termina ontem, no fuso da filial. */
function hojeEmSaoPaulo() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date())
}

export default async function ImpactoPage({ searchParams }: { searchParams: Promise<{ periodo?: string | string[] }> }) {
  const context = await requireWorkspace()
  const supabase = await createClient()
  const desde = inicio30Dias()
  const { periodo } = await searchParams
  const dias = lerPeriodo(Array.isArray(periodo) ? periodo[0] : periodo)

  // O recorte é por QUANDO SAIU, não por quando alguém editou. Filtrar por
  // updated_at contava neste mês uma matéria publicada em maio e reaberta
  // ontem — e um painel de impacto que erra o período não serve para decidir.
  const [{ data: destinations }, { data: projects }] = await Promise.all([
    supabase
      .from('package_destinations')
      .select('package_id,canal,estado,publicado_em')
      .eq('workspace_id', context.workspace.id)
      .eq('estado', 'publicada')
      .gte('publicado_em', desde)
      .order('publicado_em', { ascending: false })
      .limit(500),
    supabase
      .from('projects')
      .select('id,name,status,pautas(id,status)')
      .eq('workspace_id', context.workspace.id)
      .eq('status', 'active')
      .order('updated_at', { ascending: false })
      .limit(8),
  ])
  const site = await situacaoDoAnalytics(context.workspace.id, dias, hojeEmSaoPaulo())

  // As matérias que o Palácio publicou no site: a página mais vista leva à pauta de origem.
  const materias: Record<string, { pautaId: string }> = {}
  if (site.estado === 'ok' && site.dados.paginas.length) {
    const { data: pecas } = await supabase
      .from('content_pieces')
      .select('site_url,pauta_id')
      .eq('workspace_id', context.workspace.id)
      .not('site_url', 'is', null)
      .not('pauta_id', 'is', null)
      .limit(2000)
    const vistas = new Set(site.dados.paginas.map((p) => caminhoDaPagina(p.caminho)))
    for (const peca of pecas ?? []) {
      const caminho = caminhoDaPagina(String(peca.site_url))
      if (caminho && vistas.has(caminho)) materias[caminho] = { pautaId: String(peca.pauta_id) }
    }
  }

  const canaisPublicados = new Map<string, number>()
  for (const destination of destinations ?? []) {
    canaisPublicados.set(destination.canal, (canaisPublicados.get(destination.canal) ?? 0) + 1)
  }

  const publicados = new Set((destinations ?? []).map((d) => d.package_id))
  const totalDestinos = Array.from(canaisPublicados.values()).reduce((sum, value) => sum + value, 0)
  // O nome do canal vem do adapter: canal novo aparece com o nome certo sem
  // ninguém lembrar de mexer nesta tela.
  const canalNome = (id: string) => adapter(id)?.nome ?? id
  const canaisOrdenados = Array.from(canaisPublicados.entries()).sort((a, b) => b[1] - a[1])

  return (
    <div>
      <PageHeader
        title="Resultados"
        description="O que aconteceu depois da publicação. O Início mostra o que precisa ser feito; aqui fica o efeito do que já saiu."
        actions={<Button variant="outline" render={<Link href="/redes" />}>Ver publicações<ArrowRight className="size-4" /></Button>}
      />
      <AbasDaArea atual="/impacto" papel={context.role} />

      <div data-ajuda="resultados.aviso" className="mb-6 rounded-xl border border-border bg-muted/35 p-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <div className="flex items-center gap-2"><Gauge className="size-4 text-primary" /><p className="text-sm font-semibold">De onde vêm os números</p></div>
            <p className="mt-1 max-w-3xl text-sm leading-relaxed text-muted-foreground">A atividade e os canais vêm do que o Palácio Virtual registrou nos últimos 30 dias. “O site” vem do Google Analytics, no período que você escolher. Alcance e engajamento das redes sociais aparecem aqui quando essas fontes forem conectadas — sem números estimados ou inventados.</p>
          </div>
          <div className="shrink-0 rounded-lg bg-background px-4 py-3 text-xs text-muted-foreground shadow-sm ring-1 ring-border">Atividade: últimos 30 dias</div>
        </div>
      </div>

      <section data-ajuda="resultados.atividade">
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted-foreground">Atividade registrada</h2>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <MetricCard icon={BarChart3} value={publicados.size} label="Pacotes publicados" helper="Conteúdos concluídos no período" />
          <MetricCard icon={Activity} value={totalDestinos} label="Publicações por canal" helper="Destinos efetivamente publicados" />
          <MetricCard icon={Globe2} value={canaisPublicados.size} label="Canais ativos" helper="Canais com publicação registrada" />
          <MetricCard icon={Users} value={projects?.length ?? 0} label="Projetos ativos" helper="Projetos competindo pela agenda editorial" />
        </div>
      </section>

      <SiteNoResultados
        situacao={site.estado === 'erro' && !pode(context.role, 'integracoes.configurar') ? { ...site, email: null } : site}
        dias={dias}
        materias={materias}
        ehAdmin={pode(context.role, 'integracoes.configurar')}
        propriedade={ID_DA_PROPRIEDADE}
      />

      <div className="mt-7 grid grid-cols-1 gap-6 xl:grid-cols-[0.8fr_1.2fr]">
        <section data-ajuda="resultados.canais">
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted-foreground">Distribuição por canal</h2>
          <Card className="divide-y divide-border overflow-hidden">
            {canaisOrdenados.map(([canal, quantidade]) => (
              <div key={canal} className="px-5 py-4">
                <div className="flex items-center justify-between gap-4">
                  <div className="flex items-center gap-3"><div className="flex size-9 items-center justify-center rounded-lg bg-muted">{canal === 'site_web' ? <Globe2 className="size-4" /> : <Share2 className="size-4" />}</div><div><p className="font-medium">{canalNome(canal)}</p><p className="text-xs text-muted-foreground">Últimos 30 dias</p></div></div>
                  <p className="text-2xl font-bold tabular-nums">{quantidade}</p>
                </div>
              </div>
            ))}
            {!canaisOrdenados.length && <p className="p-8 text-center text-sm text-muted-foreground">Ainda não há publicações concluídas no período.</p>}
          </Card>
        </section>

        <section data-ajuda="resultados.proximas">
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted-foreground">Próximas métricas</h2>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <FutureMetric icon={Eye} title="Alcance e visualizações" description="Quantas contas foram alcançadas e quantas visualizações o conteúdo recebeu." />
            <FutureMetric icon={Users} title="Crescimento" description="Seguidores atuais, ganhos no período e evolução histórica por canal." />
            <FutureMetric icon={Heart} title="Engajamento" description="Curtidas, comentários, compartilhamentos, salvamentos e taxa de interação." />
            <FutureMetric icon={Globe2} title="Busca no Google" description="Buscas que trouxeram gente ao site, cliques e posição (Search Console)." />
          </div>
        </section>
      </div>

      <section data-ajuda="resultados.projetos" className="mt-7">
        <div className="mb-3 flex items-center justify-between gap-3">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Projetos em andamento</h2>
          <Link href="/projetos" className="text-xs font-medium text-primary hover:underline">Abrir projetos</Link>
        </div>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
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
