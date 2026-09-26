import Link from 'next/link'
import { notFound } from 'next/navigation'
import { Images, Megaphone, Newspaper } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { PageHeader } from '@/components/app/page-header'
import { SecoesDaEscola } from '@/components/app/escola/secoes'
import { NovaCampanha } from '@/components/app/escola/marketing'
import { StatusDoMeta, type ContaMeta } from '@/components/app/escola/meta'
import { contextoDoMarketing } from '@/lib/escola/marketing-servidor'
import { mesPorExtenso } from '@/lib/escola/painel'
import {
  CANAIS, COLUNAS_DA_CAMPANHA, COLUNAS_DA_PECA, OBJETIVOS, SITUACOES_DA_CAMPANHA, TIPOS_DE_PECA, lerCampanhaDoBanco, lerPecaDoBanco, linhaDoTempo, milhar, pct, reais, totaisDaCampanha,
  type ReceitaDaCampanha,
} from '@/lib/escola/marketing'

export const metadata = { title: 'Marketing · Escola' }
export const dynamic = 'force-dynamic'

const dia = (d: string | null) => (d ? new Date(`${d}T12:00:00`).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' }) : null)

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
 * O marketing da escola num lugar só: as campanhas com o que custaram e o
 * que trouxeram (a receita vem da Únicopag pelo utm_campaign) e a linha do
 * tempo de tudo o que já foi feito — campanhas e peças, do mais novo ao
 * mais antigo, para ninguém começar do zero.
 */
export default async function MarketingDaEscolaPage() {
  const { context, supabase, nivel, nivelEscola } = await contextoDoMarketing()
  if (nivel < 2) notFound()
  const ws = context.workspace.id
  const [{ data: cs }, { data: ps }, { data: rs }, { data: contas }, { data: metaContas }, { data: chaveMeta }] = await Promise.all([
    supabase.from('escola_campanhas').select(COLUNAS_DA_CAMPANHA).eq('workspace_id', ws).order('inicio', { ascending: false, nullsFirst: false }).limit(2000),
    supabase.from('escola_pecas').select(COLUNAS_DA_PECA).eq('workspace_id', ws).eq('referencia', false).order('publicada_em', { ascending: false, nullsFirst: false }).limit(5000),
    supabase.rpc('escola_receita_por_campanha', { p_workspace_id: ws }),
    supabase.from('escola_contas').select('id,nome').eq('workspace_id', ws).order('nome'),
    supabase.from('escola_meta_contas').select('id,act_id,nome,filtro,ativa,sincronizada_em,sincronizacao_erro').eq('workspace_id', ws).order('created_at'),
    supabase.from('integracoes_chaves').select('servico').eq('workspace_id', ws).eq('servico', 'meta_ads').maybeSingle(),
  ])
  const temToken = Boolean(chaveMeta) || Boolean(process.env.META_ADS_TOKEN?.trim())
  const campanhas = (cs ?? []).map((c) => lerCampanhaDoBanco(c))
  const pecas = (ps ?? []).map((p) => lerPecaDoBanco(p))
  const receitas = ((rs ?? []) as ReceitaDaCampanha[]).map((r) => ({ ...r, recebido: Number(r.recebido), pagamentos: Number(r.pagamentos) }))
  const totais = new Map(campanhas.map((c) => [c.id, totaisDaCampanha(c, pecas.filter((p) => p.campanha_id === c.id), receitas)]))
  const geral = totaisDaCampanha({ orcamento: null, utm_campaign: null }, pecas, [])
  const receitaTotal = [...totais.values()].reduce((s, t) => s + (t.receita ?? 0), 0)
  const noAr = campanhas.filter((c) => c.status === 'no_ar').length
  const linha = linhaDoTempo(campanhas, pecas)
  const nomeDaCampanha = new Map(campanhas.map((c) => [c.id, c.nome]))

  return (
    <div className="flex flex-col gap-6">
      <SecoesDaEscola atual="/escola/marketing" financeiro={nivelEscola >= 2} />
      <PageHeader
        title="Marketing da escola"
        description="Tudo o que já foi feito para vender os cursos: campanhas, páginas, anúncios e posts, com o que custaram e o que trouxeram. Os anúncios vêm sozinhos do Meta, e a receita, da Únicopag pelo utm_campaign."
        actions={<div className="flex flex-wrap items-start gap-2">
          <Button variant="outline" render={<Link href="/escola/marketing/advertoriais" />}><Newspaper className="size-4" />Advertoriais</Button>
          <Button variant="outline" render={<Link href="/escola/marketing/biblioteca" />} data-ajuda="escola-marketing.biblioteca"><Images className="size-4" />Biblioteca de peças</Button>
          <NovaCampanha contas={(contas ?? []) as { id: string; nome: string }[]} />
        </div>}
      />

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4" id="indicadores-marketing" data-ajuda="escola-marketing.indicadores">
        <Indicador rotulo="Campanhas" valor={milhar(campanhas.length)} detalhe={`${noAr} no ar agora`} />
        <Indicador rotulo="Peças criadas" valor={milhar(pecas.length)} detalhe={`${pecas.filter((p) => p.vencedora).length} vencedoras`} />
        <Indicador rotulo="Investido em anúncios" valor={reais(geral.investimento)} detalhe={`${milhar(geral.matriculas)} matrículas · ${reais(geral.cpa)} por matrícula`} />
        <Indicador rotulo="Receita das campanhas" valor={reais(receitaTotal)} detalhe={geral.investimento > 0 ? `Retorno de ${(receitaTotal / geral.investimento).toLocaleString('pt-BR', { maximumFractionDigits: 1 })}× o investido` : 'Pelas vendas com utm_campaign na Únicopag'} />
      </div>

      <StatusDoMeta contas={(metaContas ?? []) as ContaMeta[]} temToken={temToken} />

      <section className="flex flex-col gap-3" id="campanhas" data-ajuda="escola-marketing.campanhas">
        <h2 className="text-base font-medium">Campanhas</h2>
        {!campanhas.length ? (
          <Card className="flex flex-col items-center gap-2 p-10 text-center">
            <Megaphone className="size-8 text-muted-foreground" />
            <p className="font-medium">Nenhuma campanha ainda</p>
            <p className="max-w-md text-sm text-muted-foreground">Comece pela campanha da próxima turma: dê um nome, um utm_campaign e junte a ela a página de venda e os anúncios.</p>
          </Card>
        ) : (
          <Card className="overflow-x-auto p-0">
            <table className="w-full min-w-[720px] text-sm">
              <thead className="border-b border-border text-left text-xs text-muted-foreground">
                <tr><th className="px-3 py-2 font-medium">Campanha</th><th className="px-3 py-2 font-medium">Período</th><th className="px-3 py-2 text-right font-medium">Peças</th><th className="px-3 py-2 text-right font-medium">Investido</th><th className="px-3 py-2 text-right font-medium">Matrículas</th><th className="px-3 py-2 text-right font-medium">Receita</th><th className="px-3 py-2 text-right font-medium">Retorno</th></tr>
              </thead>
              <tbody className="divide-y divide-border">
                {campanhas.map((c) => {
                  const t = totais.get(c.id)!
                  return (
                    <tr key={c.id} data-campanha={c.nome}>
                      <td className="px-3 py-2">
                        <Link href={`/escola/marketing/${c.id}`} className="font-medium hover:text-primary hover:underline">{c.nome}</Link>
                        <span className="block text-xs text-muted-foreground"><span className={`mr-1 rounded-full px-1.5 py-0.5 ${SITUACOES_DA_CAMPANHA[c.status].classe}`}>{SITUACOES_DA_CAMPANHA[c.status].rotulo}</span>{[OBJETIVOS[c.objetivo], c.curso].filter(Boolean).join(' · ')}</span>
                      </td>
                      <td className="whitespace-nowrap px-3 py-2 text-muted-foreground">{[dia(c.inicio), dia(c.fim)].filter(Boolean).join(' – ') || '—'}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{t.pecas}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{reais(t.investimento)}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{milhar(t.matriculas)}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{t.receita === null ? <span className="text-xs text-muted-foreground" title="Sem utm_campaign">sem UTM</span> : reais(t.receita)}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{t.roas === null ? '—' : `${t.roas.toLocaleString('pt-BR', { maximumFractionDigits: 1 })}×`}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </Card>
        )}
      </section>

      <section className="flex flex-col gap-3" id="linha-do-tempo" data-ajuda="escola-marketing.linha-do-tempo">
        <h2 className="text-base font-medium">Linha do tempo</h2>
        {!linha.length ? <p className="text-sm text-muted-foreground">O que for criado aparece aqui, mês a mês.</p> : (
          <ol className="flex flex-col gap-5">
            {linha.map((g) => (
              <li key={g.mes} data-mes={g.mes}>
                <h3 className="mb-2 text-sm font-medium text-muted-foreground">{mesPorExtenso(g.mes).replace(/^./, (l) => l.toUpperCase())}</h3>
                <ul className="flex flex-col gap-1.5 border-l border-border pl-4">
                  {g.itens.map((i) => i.tipo === 'campanha' ? (
                    <li key={`c${i.campanha.id}`} className="relative text-sm">
                      <span className="absolute -left-[21px] top-1.5 size-2.5 rounded-full bg-primary" aria-hidden />
                      <Link href={`/escola/marketing/${i.campanha.id}`} className="font-medium hover:text-primary hover:underline">Campanha: {i.campanha.nome}</Link>
                      <span className="text-muted-foreground"> · {SITUACOES_DA_CAMPANHA[i.campanha.status].rotulo.toLowerCase()}{i.campanha.inicio ? ` desde ${dia(i.campanha.inicio)}` : ''}</span>
                    </li>
                  ) : (
                    <li key={`p${i.peca.id}`} className="relative text-sm">
                      <span className="absolute -left-[20px] top-2 size-2 rounded-full bg-muted-foreground/50" aria-hidden />
                      <span>{TIPOS_DE_PECA[i.peca.tipo]} no {CANAIS[i.peca.canal]}: </span>
                      <Link href={i.peca.campanha_id ? `/escola/marketing/${i.peca.campanha_id}` : '/escola/marketing/biblioteca'} className="hover:text-primary hover:underline">{i.peca.titulo}</Link>
                      <span className="text-muted-foreground">{i.peca.campanha_id ? ` · ${nomeDaCampanha.get(i.peca.campanha_id)}` : ''}{i.peca.matriculas ? ` · ${i.peca.matriculas} matrículas` : ''}{i.peca.leads && i.peca.matriculas ? ` (${pct(i.peca.matriculas / i.peca.leads, 0)} dos contatos)` : ''}{i.peca.vencedora ? ' · vencedora' : ''}</span>
                    </li>
                  ))}
                </ul>
              </li>
            ))}
          </ol>
        )}
      </section>
    </div>
  )
}
