import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ArrowUpRight, ChevronLeft, Lightbulb, Megaphone, QrCode, TriangleAlert } from 'lucide-react'
import { Card } from '@/components/ui/card'
import { PageHeader } from '@/components/app/page-header'
import { SecoesDaEscola } from '@/components/app/escola/secoes'
import { SubmenuDoMarketing } from '@/components/app/escola/submenu-marketing'
import { FormularioDoCurso } from '@/components/app/escola/cursos'
import { contextoDoMarketing } from '@/lib/escola/marketing-servidor'
import { dadosDosCursos } from '@/lib/escola/cursos-servidor'
import { conversao, sinalDoCurso } from '@/lib/escola/cursos'
import { CANAIS, OBJETIVOS, SITUACOES_DA_CAMPANHA, SITUACOES_DA_PECA, TIPOS_DE_PECA, milhar, pct, reais, type TipoDePeca } from '@/lib/escola/marketing'

export const metadata = { title: 'Curso · Marketing · Escola' }
export const dynamic = 'force-dynamic'

const dia = (d: string | null) => (d ? new Date(`${d.slice(0, 10)}T12:00:00`).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' }) : null)
const ORDEM_DOS_TIPOS: TipoDePeca[] = ['pagina', 'advertorial', 'anuncio', 'post', 'video', 'email', 'whatsapp', 'impresso', 'outro']

/**
 * Um curso da escola: os alunos (Únicopag), a página do curso e tudo o que o
 * marketing já criou para ele — campanhas e, por elas, páginas, anúncios,
 * advertoriais e posts —, agrupado por tipo.
 */
export default async function CursoDaEscola({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound()
  const { context, supabase, nivel, nivelEscola } = await contextoDoMarketing()
  if (nivel < 2) notFound()
  const d = await dadosDosCursos(supabase, context.workspace.id)
  const c = d.cursos.find((x) => x.id === id)
  if (!c) notFound()
  const n = d.numerosDe(c.id)
  const campanhas = d.campanhasDe(c.id)
  const pecas = d.pecasDe(c.id)
  const investido = pecas.reduce((s, p) => s + (p.investimento ?? 0), 0)
  const sinal = sinalDoCurso(n, { campanhasNoAr: campanhas.filter((x) => x.status === 'no_ar').length, pecas: pecas.length }, c.ativo)
  const nomeDaCampanha = new Map(campanhas.map((x) => [x.id, x.nome]))
  const porTipo = ORDEM_DOS_TIPOS.map((t) => ({ tipo: t, itens: pecas.filter((p) => p.tipo === t) })).filter((g) => g.itens.length)

  return (
    <div className="flex flex-col gap-6">
      <SecoesDaEscola atual="/escola/marketing" financeiro={nivelEscola >= 2} />
      <SubmenuDoMarketing atual="/escola/marketing/cursos" />
      <Link href="/escola/marketing/cursos" className="-mb-3 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"><ChevronLeft className="size-4" />Cursos</Link>
      <PageHeader
        title={c.nome}
        description={c.descricao ?? (c.ativo ? 'Curso ativo.' : 'Curso inativo (fora de oferta).')}
        actions={<div className="flex flex-wrap gap-2">
          {c.pagina_url && <a href={c.pagina_url} target="_blank" rel="noopener" className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-border px-3 text-sm font-medium hover:bg-muted" data-pagina-do-curso>Página do curso<ArrowUpRight className="size-3.5" /></a>}
          {c.ativo && <Link href={`/escola/cartaz?curso=${c.id}`} className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-border px-3 text-sm font-medium hover:bg-muted" data-ajuda="escola-curso.cartaz"><QrCode className="size-3.5" />Cartaz com QR</Link>}
          <FormularioDoCurso curso={c} />
        </div>}
      />

      {sinal && (
        <p className={`flex items-start gap-2 rounded-lg border px-4 py-3 text-sm ${sinal.tom === 'atencao' ? 'border-warning/50 bg-warning/10' : sinal.tom === 'ok' ? 'border-success/30 bg-success/5' : 'border-primary/40 bg-primary/5'}`}>
          {sinal.tom === 'atencao' ? <TriangleAlert className="mt-0.5 size-4 shrink-0" /> : <Lightbulb className="mt-0.5 size-4 shrink-0" />}{sinal.texto}
        </p>
      )}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5" data-ajuda="escola-curso.numeros">
        {[
          [milhar(n.alunos), 'alunos'],
          [milhar(n.alunos30), 'novos em 30 dias'],
          [milhar(n.interessados), 'tentaram e não pagaram'],
          [pct(conversao(n), 0), 'conversão'],
          [reais(n.receita), 'recebido'],
        ].map(([v, r]) => <Card key={r} className="p-4"><p className="text-2xl font-bold tabular-nums">{v}</p><p className="text-xs text-muted-foreground">{r}</p></Card>)}
      </div>

      <section className="flex flex-col gap-3" data-ajuda="escola-curso.campanhas">
        <h2 className="text-base font-medium">Campanhas deste curso ({campanhas.length})</h2>
        {!campanhas.length ? (
          <Card className="flex flex-col items-center gap-2 p-8 text-center text-sm">
            <Megaphone className="size-7 text-muted-foreground" />
            <p className="text-muted-foreground">Nenhuma campanha com este curso. Em <Link href="/escola/marketing" className="font-medium text-primary hover:underline">Campanhas</Link>, crie uma e escolha “{c.nome}” no campo “Curso”.</p>
          </Card>
        ) : (
          <Card className="divide-y divide-border p-0">
            {campanhas.map((x) => (
              <Link key={x.id} href={`/escola/marketing/${x.id}`} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 hover:bg-muted/40">
                <span className="min-w-0">
                  <span className="font-medium">{x.nome}</span>
                  <span className="block text-xs text-muted-foreground">{[OBJETIVOS[x.objetivo], [dia(x.inicio), dia(x.fim)].filter(Boolean).join(' – ')].filter(Boolean).join(' · ')}</span>
                </span>
                <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${SITUACOES_DA_CAMPANHA[x.status].classe}`}>{SITUACOES_DA_CAMPANHA[x.status].rotulo}</span>
              </Link>
            ))}
          </Card>
        )}
      </section>

      <section className="flex flex-col gap-3" data-ajuda="escola-curso.pecas">
        <h2 className="text-base font-medium">O que foi criado para o curso ({pecas.length}){investido > 0 && <span className="ml-2 text-sm font-normal text-muted-foreground">· {reais(investido)} investidos{n.alunos > 0 ? ` · ${reais(investido / n.alunos)} por aluno` : ''}</span>}</h2>
        {!porTipo.length && <Card className="p-6 text-center text-sm text-muted-foreground">Nenhuma página, anúncio ou post ligado a este curso ainda. As peças entram aqui pela campanha delas.</Card>}
        {porTipo.map((g) => (
          <Card key={g.tipo} className="overflow-hidden p-0">
            <h3 className="border-b border-border bg-muted/40 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{TIPOS_DE_PECA[g.tipo]} ({g.itens.length})</h3>
            <ul className="divide-y divide-border">
              {g.itens.map((p) => (
                <li key={p.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5 text-sm">
                  <span className="min-w-0">
                    {p.url ? <a href={p.url} target="_blank" rel="noopener" className="font-medium hover:text-primary hover:underline">{p.titulo}</a> : <span className="font-medium">{p.titulo}</span>}
                    {p.vencedora && <span className="ml-2 rounded-full bg-success/15 px-1.5 py-0.5 text-[11px] font-semibold text-success">vencedora</span>}
                    <span className="block text-xs text-muted-foreground">{[CANAIS[p.canal], p.campanha_id ? nomeDaCampanha.get(p.campanha_id) : null, dia(p.publicada_em)].filter(Boolean).join(' · ')}</span>
                  </span>
                  <span className="flex items-center gap-3 text-xs tabular-nums text-muted-foreground">
                    {p.investimento ? <span>{reais(p.investimento)}</span> : null}
                    {p.matriculas ? <span>{milhar(p.matriculas)} matrículas</span> : null}
                    <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${SITUACOES_DA_PECA[p.status].classe}`}>{SITUACOES_DA_PECA[p.status].rotulo}</span>
                  </span>
                </li>
              ))}
            </ul>
          </Card>
        ))}
      </section>

      <section className="text-sm" data-ajuda="escola-curso.produtos">
        <h2 className="mb-2 text-base font-medium">Produtos da Únicopag que contam aqui</h2>
        {n.produtos.length
          ? <ul className="flex flex-wrap gap-1.5">{n.produtos.map((p) => <li key={p} className="rounded-full border border-border px-2.5 py-1 text-xs">{p}</li>)}</ul>
          : <p className="text-muted-foreground">Nenhuma venda com este nome ainda. Confira se o nome do curso é o mesmo do produto na Únicopag.</p>}
      </section>
    </div>
  )
}
