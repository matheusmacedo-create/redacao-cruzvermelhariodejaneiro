import { notFound } from 'next/navigation'
import { Card } from '@/components/ui/card'
import { PageHeader } from '@/components/app/page-header'
import { SecoesDaEscola } from '@/components/app/escola/secoes'
import { CartaoDaPeca, ConstrutorDeUtm, EditarCampanha, NovaPeca } from '@/components/app/escola/marketing'
import { contextoDoMarketing, imagensAssinadas } from '@/lib/escola/marketing-servidor'
import {
  COLUNAS_DA_CAMPANHA, COLUNAS_DA_PECA, OBJETIVOS, SITUACOES_DA_CAMPANHA, lerCampanhaDoBanco, lerPecaDoBanco, milhar, pct, reais, totaisDaCampanha, type ReceitaDaCampanha,
} from '@/lib/escola/marketing'

export const metadata = { title: 'Campanha · Marketing da escola' }
export const dynamic = 'force-dynamic'

const dia = (d: string | null) => (d ? new Date(`${d}T12:00:00`).toLocaleDateString('pt-BR') : null)

function Numero({ rotulo, valor, detalhe }: { rotulo: string; valor: string; detalhe?: string }) {
  return <div className="flex flex-col"><span className="text-xs text-muted-foreground">{rotulo}</span><span className="text-lg font-semibold tabular-nums">{valor}</span>{detalhe && <span className="text-xs text-muted-foreground">{detalhe}</span>}</div>
}

/** Uma campanha: as peças dela, o que custaram e trouxeram, os aprendizados e o link com UTM para cada canal. */
export default async function CampanhaPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound()
  const { context, supabase, nivel, nivelEscola } = await contextoDoMarketing()
  if (nivel < 2) notFound()
  const ws = context.workspace.id
  const [{ data: bruta }, { data: ps }, { data: rs }, { data: todas }, { data: contas }] = await Promise.all([
    supabase.from('escola_campanhas').select(COLUNAS_DA_CAMPANHA).eq('workspace_id', ws).eq('id', id).maybeSingle(),
    supabase.from('escola_pecas').select(COLUNAS_DA_PECA).eq('workspace_id', ws).eq('campanha_id', id).order('publicada_em', { ascending: false, nullsFirst: false }).limit(500),
    supabase.rpc('escola_receita_por_campanha', { p_workspace_id: ws }),
    supabase.from('escola_campanhas').select('id,nome').eq('workspace_id', ws).order('nome'),
    supabase.from('escola_contas').select('id,nome').eq('workspace_id', ws).order('nome'),
  ])
  if (!bruta) notFound()
  const c = lerCampanhaDoBanco(bruta)
  const pecas = (ps ?? []).map((p) => lerPecaDoBanco(p))
  const receitas = ((rs ?? []) as ReceitaDaCampanha[]).map((r) => ({ ...r, recebido: Number(r.recebido), pagamentos: Number(r.pagamentos) }))
  const t = totaisDaCampanha(c, pecas, receitas)
  const vendas = c.utm_campaign ? receitas.find((r) => r.campanha === c.utm_campaign) : undefined
  const imagens = await imagensAssinadas(pecas.map((p) => p.imagem_path))
  const campanhas = (todas ?? []) as { id: string; nome: string }[]
  const podeExcluir = (criador: string | null) => nivel >= 3 || criador === context.user.id
  const pagina = pecas.find((p) => p.tipo === 'pagina' && p.url)?.url ?? ''

  return (
    <div className="flex flex-col gap-6">
      <SecoesDaEscola atual="/escola/marketing" financeiro={nivelEscola >= 2} />
      <PageHeader
        title={c.nome}
        breadcrumbs={[{ label: 'Marketing da escola', href: '/escola/marketing' }, { label: c.nome }]}
        description={[OBJETIVOS[c.objetivo], c.curso, [dia(c.inicio), dia(c.fim)].filter(Boolean).join(' a ')].filter(Boolean).join(' · ')}
        actions={<span className={`rounded-full px-2.5 py-1 text-xs ${SITUACOES_DA_CAMPANHA[c.status].classe}`}>{SITUACOES_DA_CAMPANHA[c.status].rotulo}</span>}
      />
      <EditarCampanha c={c} contas={(contas ?? []) as { id: string; nome: string }[]} podeExcluir={podeExcluir(c.criado_por)} />

      <Card className="grid grid-cols-2 gap-4 p-4 sm:grid-cols-3 lg:grid-cols-6" id="numeros-da-campanha">
        <Numero rotulo="Investido" valor={reais(t.investimento)} detalhe={c.orcamento ? `${pct(t.usoDoOrcamento, 0)} de ${reais(c.orcamento)}` : undefined} />
        <Numero rotulo="Contatos" valor={milhar(t.leads)} detalhe={t.cpl !== null ? `${reais(t.cpl)} cada` : undefined} />
        <Numero rotulo="Matrículas" valor={milhar(t.matriculas)} detalhe={t.cpa !== null ? `${reais(t.cpa)} cada` : undefined} />
        <Numero rotulo="Contato → matrícula" valor={pct(t.conversao, 0)} />
        <Numero rotulo="Receita (Únicopag)" valor={t.receita === null ? '—' : reais(t.receita)} detalhe={t.receita === null ? 'Defina o utm_campaign' : `${vendas?.pagamentos ?? 0} pagamentos`} />
        <Numero rotulo="Retorno" valor={t.roas === null ? '—' : `${t.roas.toLocaleString('pt-BR', { maximumFractionDigits: 1 })}×`} detalhe="receita ÷ investido" />
      </Card>

      {(c.resumo || c.aprendizados) && (
        <div className="grid gap-3 lg:grid-cols-2">
          {c.resumo && <Card className="p-4"><h2 className="text-sm font-medium">Resumo</h2><p className="mt-1 whitespace-pre-line text-sm text-muted-foreground">{c.resumo}</p></Card>}
          {c.aprendizados && <Card className="border-primary/30 p-4" id="aprendizados"><h2 className="text-sm font-medium">Aprendizados</h2><p className="mt-1 whitespace-pre-line text-sm">{c.aprendizados}</p></Card>}
        </div>
      )}

      <section className="flex flex-col gap-3" id="pecas-da-campanha">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-base font-medium">Peças ({pecas.length})</h2>
          <NovaPeca campanhas={campanhas} campanhaId={c.id} />
        </div>
        {!pecas.length ? <Card className="p-8 text-center text-sm text-muted-foreground">Junte a página de venda, os anúncios e os posts desta campanha — com a imagem e os números de cada um.</Card> : (
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {pecas.map((p) => <CartaoDaPeca key={p.id} p={p} imagem={p.imagem_path ? imagens[p.imagem_path] ?? null : null} campanhas={campanhas} podeEditar podeExcluir={podeExcluir(p.criado_por)} />)}
          </div>
        )}
      </section>

      {c.utm_campaign && (
        <Card className="p-4">
          <h2 className="text-sm font-medium">Link com UTM</h2>
          <p className="mb-3 mt-1 text-sm text-muted-foreground">Use este link em cada anúncio e post desta campanha. A venda que vier por ele entra na receita acima (utm_campaign <code className="font-mono">{c.utm_campaign}</code>).</p>
          <ConstrutorDeUtm utm={c.utm_campaign} base={pagina} />
        </Card>
      )}
    </div>
  )
}
