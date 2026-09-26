import Link from 'next/link'
import { notFound } from 'next/navigation'
import { Newspaper } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { PageHeader } from '@/components/app/page-header'
import { selectClass } from '@/components/app/imprensa/campos'
import { SecoesDaEscola } from '@/components/app/escola/secoes'
import { CartaoDoAdvertorial, NovoAdvertorial } from '@/components/app/escola/advertoriais'
import { ehEquipeDaEscola } from '@/lib/permissoes'
import { contextoDoMarketing } from '@/lib/escola/marketing-servidor'
import { COLUNAS_DA_PECA, lerPecaDoBanco, milhar, pct, reais } from '@/lib/escola/marketing'
import { ORDENS, linhasDosAdvertoriais, ordenar, type Advertorial, type OrdemDosAdvertoriais } from '@/lib/escola/advertoriais'

export const metadata = { title: 'Advertoriais · Marketing da escola' }
export const dynamic = 'force-dynamic'

function Indicador({ rotulo, valor, detalhe }: { rotulo: string; valor: string; detalhe?: string }) {
  return (
    <Card className="flex flex-col gap-1 p-4">
      <span className="text-sm text-muted-foreground">{rotulo}</span>
      <span className="text-2xl font-semibold tabular-nums">{valor}</span>
      {detalhe && <span className="text-xs text-muted-foreground">{detalhe}</span>}
    </Card>
  )
}

/**
 * O banco de advertoriais: cada matéria-anúncio publicada como notícia no
 * site, com o funil dela — visitas (pixel da página), cliques no botão de
 * matrícula, investimento dos anúncios que apontam para ela e as matrículas
 * que a Únicopag registrou com o utm_content dela.
 */
export default async function AdvertoriaisPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const { context, supabase, nivel, nivelEscola } = await contextoDoMarketing()
  // O texto é escrito no editor da Redação: a equipe da escola acompanha e anota, a Comunicação escreve.
  const podeEscrever = !ehEquipeDaEscola(context.role)
  if (nivel < 2) notFound()
  const ws = context.workspace.id
  const f = await searchParams
  const ordem = (f.ordem && f.ordem in ORDENS ? f.ordem : 'recentes') as OrdemDosAdvertoriais
  const campanhaFiltro = f.campanha && /^[0-9a-f-]{36}$/.test(f.campanha) ? f.campanha : ''
  const [{ data: materias }, { data: ps }, { data: metricas }, { data: anuncios }, { data: receitas }, { data: cs }] = await Promise.all([
    supabase.rpc('escola_advertoriais', { p_workspace_id: ws }),
    supabase.from('escola_pecas').select(COLUNAS_DA_PECA).eq('workspace_id', ws).eq('tipo', 'advertorial').limit(2000),
    supabase.from('escola_adv_metricas').select('peca_id,dia,visitas,cliques').eq('workspace_id', ws).limit(50000),
    supabase.from('escola_pecas').select('url,investimento,leads,referencia').eq('workspace_id', ws).in('tipo', ['anuncio', 'video', 'post']).not('url', 'is', null).limit(10000),
    supabase.rpc('escola_receita_por_conteudo', { p_workspace_id: ws }),
    supabase.from('escola_campanhas').select('id,nome,utm_campaign,status').eq('workspace_id', ws).order('inicio', { ascending: false, nullsFirst: false }),
  ])
  const pecas = new Map((ps ?? []).map((p) => { const x = lerPecaDoBanco(p); return [x.id, x] }))
  const advs: Advertorial[] = ((materias ?? []) as { peca_id: string; titulo: string; subtitulo: string | null; slug: string | null; site_url: string | null; capa: string | null; publicada_em: string | null; status_materia: string | null }[])
    .filter((m) => pecas.has(m.peca_id))
    .map((m) => ({ peca: pecas.get(m.peca_id)!, titulo: m.titulo, subtitulo: m.subtitulo, slug: m.slug, site_url: m.site_url, capa: m.capa, publicada_em: m.publicada_em, status_materia: m.status_materia }))
  const hoje = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date())
  const todas = linhasDosAdvertoriais(
    advs,
    (metricas ?? []).map((m) => ({ peca_id: m.peca_id as string, dia: m.dia as string, visitas: Number(m.visitas), cliques: Number(m.cliques) })),
    (anuncios ?? []).map((a) => ({ url: a.url as string, investimento: a.investimento === null ? null : Number(a.investimento), leads: a.leads as number | null, referencia: Boolean(a.referencia) })),
    ((receitas ?? []) as { conteudo: string; recebido: number; pagamentos: number }[]).map((r) => ({ conteudo: r.conteudo, recebido: Number(r.recebido), pagamentos: Number(r.pagamentos) })),
    hoje,
  )
  const linhas = ordenar(todas.filter((l) => !campanhaFiltro || l.peca.campanha_id === campanhaFiltro), ordem)
  const campanhas = (cs ?? []).map((c) => ({ id: c.id as string, nome: c.nome as string, utm: c.utm_campaign as string | null }))
  const publicados = todas.filter((l) => l.site_url).length
  const visitas = todas.reduce((s, l) => s + l.visitas, 0), cliques = todas.reduce((s, l) => s + l.cliques, 0)
  const matriculas = todas.reduce((s, l) => s + l.matriculas, 0), investido = todas.reduce((s, l) => s + l.investimento, 0)
  const destinoSugerido = [...pecas.values()].map((p) => p.destino_url).find(Boolean) ?? ''

  return (
    <div className="flex flex-col gap-6">
      <SecoesDaEscola atual="/escola/marketing/advertoriais" financeiro={nivelEscola >= 2} />
      <PageHeader title="Advertoriais" breadcrumbs={[{ label: 'Marketing da escola', href: '/escola/marketing' }, { label: 'Advertoriais' }]}
        description="Matérias publicadas como notícia no site para levar quem vem do anúncio até a matrícula. Cada uma com o funil dela: visitas, cliques no botão, matrículas e o que custou."
        actions={podeEscrever ? <NovoAdvertorial campanhas={campanhas} destinoSugerido={destinoSugerido} /> : undefined} />

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4" id="indicadores-adv" data-ajuda="escola-advertoriais.indicadores">
        <Indicador rotulo="Advertoriais" valor={milhar(todas.length)} detalhe={`${publicados} no site`} />
        <Indicador rotulo="Visitas" valor={milhar(visitas)} detalhe={`${milhar(cliques)} cliques no botão (${pct(visitas ? cliques / visitas : null, 1)})`} />
        <Indicador rotulo="Matrículas" valor={milhar(matriculas)} detalhe={cliques ? `${pct(matriculas / cliques, 1)} de quem clicou` : 'pelo utm_content na Únicopag'} />
        <Indicador rotulo="Investido nos anúncios" valor={reais(investido)} detalhe={matriculas && investido ? `${reais(investido / matriculas)} por matrícula` : 'dos anúncios que apontam para as páginas'} />
      </div>

      <form className="flex flex-wrap items-center gap-2" id="filtros-adv" data-ajuda="escola-advertoriais.filtros">
        <select name="ordem" defaultValue={ordem} className={selectClass} aria-label="Ordem">{Object.entries(ORDENS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
        {campanhas.length > 0 && <select name="campanha" defaultValue={campanhaFiltro} className={selectClass} aria-label="Campanha"><option value="">Todas as campanhas</option>{campanhas.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}</select>}
        <Button type="submit" variant="outline">Aplicar</Button>
      </form>

      {!linhas.length ? (
        <Card className="flex flex-col items-center gap-2 p-10 text-center">
          <Newspaper className="size-8 text-muted-foreground" />
          <p className="font-medium">{todas.length ? 'Nenhum advertorial nesta campanha' : 'Nenhum advertorial ainda'}</p>
          <p className="max-w-md text-sm text-muted-foreground">Crie o primeiro: ele nasce no editor de matérias com a estrutura pronta e o botão de matrícula rastreado. Publicado como notícia, ele passa a contar visitas, cliques e matrículas sozinho.</p>
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3" id="banco-adv" data-ajuda="escola-advertoriais.banco">
          {linhas.map((l) => <CartaoDoAdvertorial key={l.peca.id} l={l} campanhas={campanhas} podeEscrever={podeEscrever} />)}
        </div>
      )}

      <Card className="p-4 text-sm text-muted-foreground" data-ajuda="escola-advertoriais.como-contam">
        <p className="font-medium text-foreground">Como os números chegam</p>
        <ul className="mt-1 list-disc space-y-1 pl-5">
          <li><b>Visitas</b>: a página publicada conta cada leitura (sem cookie, robôs não contam).</li>
          <li><b>Cliques no botão</b>: a linha do texto que é só o link de matrícula vira botão e conta o clique; as UTMs do anúncio seguem junto até a inscrição.</li>
          <li><b>Investido</b>: dos anúncios do Meta cujo link aponta para a página (use o “Link para o anúncio” de cada cartão).</li>
          <li><b>Matrículas e receita</b>: vendas da Únicopag com o utm_content do advertorial.</li>
        </ul>
        <p className="mt-2"><Link href="/escola/marketing" className="text-primary hover:underline">Voltar ao marketing</Link></p>
      </Card>
    </div>
  )
}
