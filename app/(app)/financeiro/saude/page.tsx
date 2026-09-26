import { Suspense } from 'react'
import { IndicadoresDoBc } from '@/components/app/apis/indicadores-do-bc'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { AlertTriangle, CheckCircle2, OctagonAlert } from 'lucide-react'
import { Card } from '@/components/ui/card'
import { PageHeader } from '@/components/app/page-header'
import { SecoesDoFinanceiro } from '@/components/app/financeiro/secoes'
import { hojeEmSaoPaulo } from '@/components/app/projetos/comum'
import { GraficoDePrevisao } from '@/components/app/financeiro/previsao'
import { EditarOrcamento } from '@/components/app/financeiro/orcamento'
import { cadastrosDoFinanceiro, contextoDoFinanceiro, lerLinha } from '@/lib/financeiro/acesso'
import { saldosPorFonte } from '@/lib/financeiro/fechamento'
import { somarDias } from '@/lib/financeiro/avisos'
import { COLUNAS_DO_LANCAMENTO, dataCurta, mesDe, nomeDoMes, reais, saldos, somar, type Lancamento } from '@/lib/financeiro/regras'
import {
  alertas, despesaFixaMedia, fontesComDestino, mesesCompletos, orcamentoDoMes, origensDasReceitas, previsao, resultadoMedio,
} from '@/lib/financeiro/saude'

export const metadata = { title: 'Saúde do caixa' }
export const dynamic = 'force-dynamic'

function Numero({ valor, rotulo, detalhe, tom }: { valor: string; rotulo: string; detalhe?: string; tom?: 'ruim' | 'atencao' | 'bom' }) {
  return (
    <Card className={`p-4 ${tom === 'ruim' ? 'border-destructive/40' : tom === 'atencao' ? 'border-warning/60' : ''}`}>
      <p className={`text-2xl font-bold tabular-nums ${tom === 'ruim' ? 'text-destructive' : ''}`}>{valor}</p>
      <p className="text-xs font-medium">{rotulo}</p>
      {detalhe && <p className="mt-0.5 text-xs text-muted-foreground">{detalhe}</p>}
    </Card>
  )
}

/**
 * Saúde do caixa: estamos bem? Caixa livre separado do dinheiro com destino,
 * fôlego contra a reserva mínima, previsão de 90 dias, orçamento do mês,
 * fontes com destino perto de acabar e de onde vem o dinheiro.
 */
export default async function SaudePage() {
  const { context, supabase, nivel } = await contextoDoFinanceiro()
  if (nivel < 1) notFound()
  const ws = context.workspace.id
  const hoje = hojeEmSaoPaulo()
  const mes = mesDe(hoje)
  const ano = Number(hoje.slice(0, 4))
  const c = await cadastrosDoFinanceiro()
  const ent = c.empresa?.id ?? ''
  const [{ data: pagosBrutos }, { data: abertosBrutos }, { data: doMesBrutos }, { data: orcamentos }] = await Promise.all([
    supabase.from('fin_lancamentos').select(COLUNAS_DO_LANCAMENTO).eq('workspace_id', ws).eq('entidade_id', ent).not('pago_em', 'is', null).lte('pago_em', hoje).limit(50000),
    supabase.from('fin_lancamentos').select(COLUNAS_DO_LANCAMENTO).eq('workspace_id', ws).eq('entidade_id', ent).is('pago_em', null).neq('aprovacao', 'recusada').lte('vencimento', somarDias(hoje, 90)).limit(10000),
    supabase.from('fin_lancamentos').select(COLUNAS_DO_LANCAMENTO).eq('workspace_id', ws).eq('entidade_id', ent).eq('competencia', `${mes}-01`).limit(10000),
    supabase.from('fin_orcamentos').select('categoria_id,valor_mensal').eq('workspace_id', ws).eq('entidade_id', ent).eq('ano', ano),
  ])
  const pagos = (pagosBrutos ?? []).map(lerLinha) as Lancamento[]
  const abertos = (abertosBrutos ?? []).map(lerLinha) as Lancamento[]
  const doMes = (doMesBrutos ?? []).map(lerLinha) as Lancamento[]

  const livres = new Set(c.fontes.filter((f) => !f.restrita).map((f) => f.id))
  const livreId = c.fontes.find((f) => !f.restrita)?.id ?? ''
  const porFonte = saldosPorFonte(c.contas, pagos, hoje, livreId)
  const livreHoje = somar([...porFonte].filter(([id]) => livres.has(id)).map(([, v]) => v))
  const comDestino = somar([...porFonte].filter(([id]) => !livres.has(id)).map(([, v]) => v))
  const totalHoje = somar([...saldos(c.contas, pagos, hoje).values()])
  const meses = mesesCompletos(hoje)
  const fixas = new Set(c.categorias.filter((k) => k.fixa).map((k) => k.id))
  const fixaMedia = despesaFixaMedia(pagos, meses, fixas, livres)
  const folego = fixaMedia > 0 ? Math.round((livreHoje / fixaMedia) * 10) / 10 : null
  const reserva = c.config.reserva_minima_meses
  const media = resultadoMedio(pagos, meses, livres)
  const pontos = previsao({ hoje, dias: 90, livreHoje, totalHoje, abertos, livres })
  const menor = pontos.reduce((m, p) => (p.livre < m.livre ? p : m), pontos[0])
  const orc = orcamentoDoMes(mes, (orcamentos ?? []).map((o) => ({ categoria_id: o.categoria_id as string, valor_mensal: Number(o.valor_mensal) })),
    c.categorias, doMes)
  const fontes = fontesComDestino(c.fontes, porFonte, pagos, hoje)
  const origens = origensDasReceitas(pagos, hoje, { favorecido: new Map(c.favorecidos.map((f) => [f.id, f.nome])), categoria: new Map(c.categorias.map((k) => [k.id, k.nome])) })
  const atrasadas = abertos.filter((l) => l.tipo === 'despesa' && l.vencimento < hoje && l.aprovacao !== 'pendente')
  const aReceberAtrasado = abertos.filter((l) => l.tipo === 'receita' && l.vencimento < hoje)
  const lista = alertas({
    hoje, folego, reserva, pontos, orcamento: orc, fontes, livreHoje, origens,
    aPagarAtrasado: { n: atrasadas.length, valor: somar(atrasadas.map((l) => l.valor)) },
    aReceberAtrasado: { n: aReceberAtrasado.length, valor: somar(aReceberAtrasado.map((l) => l.valor)) },
  })
  const tomDoFolego = folego === null ? undefined : folego < reserva / 2 ? 'ruim' : folego < reserva ? 'atencao' : 'bom'
  const semHistorico = !pagos.length

  return (
    <div className="flex flex-col gap-6">
      <SecoesDoFinanceiro atual="/financeiro/saude" empresas={c.empresas} empresa={c.empresa} />
      <PageHeader title="Saúde do caixa" description="Estamos bem? O dinheiro livre separado do que tem destino, quanto tempo ele aguenta e o que vem pela frente." />

      {semHistorico ? (
        <Card className="p-6 text-sm text-muted-foreground">Os números aparecem assim que houver contas cadastradas e lançamentos pagos. Comece em <Link href="/financeiro/cadastros" className="font-medium text-primary hover:underline">Cadastros</Link>.</Card>
      ) : (
        <>
          <Card className="p-5" id="alertas" data-ajuda="financeiro.saude-alertas">
            {lista.length ? (
              <ul className="flex flex-col gap-2">
                {lista.map((a, i) => (
                  <li key={i} className="flex items-start gap-2 text-sm" data-nivel={a.nivel}>
                    {a.nivel === 'critico' ? <OctagonAlert className="mt-0.5 size-4 shrink-0 text-destructive" aria-label="Crítico" /> : <AlertTriangle className="mt-0.5 size-4 shrink-0 text-warning-foreground" aria-label="Atenção" />}
                    <span>{a.texto}{a.link && <> <Link href={a.link} className="text-primary hover:underline">Ver</Link></>}</span>
                  </li>
                ))}
              </ul>
            ) : <p className="flex items-center gap-2 text-sm"><CheckCircle2 className="size-4 text-success" />Nenhum alerta: caixa livre positivo, fôlego acima da reserva e nada atrasado.</p>}
          </Card>

          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4" id="indicadores" data-ajuda="financeiro.saude-indicadores">
            <Numero valor={reais(livreHoje)} rotulo="Caixa livre hoje" detalhe="Pode pagar qualquer despesa da filial." tom={livreHoje < 0 ? 'ruim' : undefined} />
            <Numero valor={reais(comDestino)} rotulo="Com destino" detalhe="De convênios e doações carimbadas: só para o que foram feitos." />
            <Numero valor={folego === null ? '—' : `${folego.toLocaleString('pt-BR')} ${folego === 1 ? 'mês' : 'meses'}`} rotulo="Fôlego"
              detalhe={folego === null ? 'Marque as categorias de despesa fixa em Cadastros para calcular.' : `Despesa fixa média ${reais(fixaMedia)}/mês · reserva mínima ${reserva.toLocaleString('pt-BR')} ${reserva === 1 ? 'mês' : 'meses'}`} tom={tomDoFolego} />
            <Numero valor={reais(media)} rotulo="Resultado médio do livre" detalhe={`Por mês, em ${meses.map((m) => nomeDoMes(m, true)).join(', ')}`} tom={media < 0 ? 'atencao' : undefined} />
          </div>

          <Card className="p-5" data-ajuda="financeiro.saude-previsao">
            <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
              <h2 className="font-semibold">Saldo livre previsto — próximos 90 dias</h2>
              <p className="text-xs text-muted-foreground">Menor valor: <span className={`font-medium tabular-nums ${menor.livre < 0 ? 'text-destructive' : 'text-foreground'}`}>{reais(menor.livre)}</span> em {dataCurta(menor.data)}</p>
            </div>
            <GraficoDePrevisao pontos={pontos.map((p) => ({ data: p.data, livre: p.livre }))} reserva={fixaMedia > 0 ? Math.round(fixaMedia * reserva * 100) / 100 : null} />
            <p className="mt-2 text-xs text-muted-foreground">Com as contas a pagar e a receber já lançadas (o que está atrasado entra hoje). Despesa ainda não lançada não aparece: lance as contas do mês que vem para a previsão ficar certa.</p>
          </Card>

          <div className="grid gap-6 xl:grid-cols-2">
            <Card className="p-5" id="orcamento" data-ajuda="financeiro.saude-orcamento">
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <h2 className="font-semibold">Orçamento de {nomeDoMes(mes)}</h2>
                {nivel >= 4 && <EditarOrcamento ano={ano} categorias={c.categorias.filter((k) => k.tipo === 'despesa' && k.ativa).map((k) => ({ id: k.id, nome: k.nome, grupo: k.grupo }))}
                  atuais={Object.fromEntries((orcamentos ?? []).map((o) => [o.categoria_id as string, Number(o.valor_mensal)]))} />}
              </div>
              {orc.length ? (
                <ul className="flex flex-col gap-3">
                  {orc.map((o) => (
                    <li key={o.categoria_id} className="text-sm">
                      <div className="mb-1 flex items-baseline justify-between gap-2">
                        <span>{o.nome}</span>
                        <span className="tabular-nums text-muted-foreground"><span className="font-medium text-foreground">{reais(o.realizado)}</span> de {reais(o.orcado)} · <span className={o.pct > 100 ? 'font-semibold text-destructive' : ''}>{o.pct}%</span></span>
                      </div>
                      <div className="h-2 overflow-hidden rounded-full bg-muted" role="img" aria-label={`${o.nome}: ${o.pct}% do orçado`}>
                        <div className={`h-full rounded-full ${o.pct > 100 ? 'bg-destructive' : 'bg-[var(--chart-4)]'}`} style={{ width: `${Math.min(100, o.pct)}%` }} />
                      </div>
                    </li>
                  ))}
                </ul>
              ) : <p className="text-sm text-muted-foreground">{nivel >= 4 ? 'Defina quanto se espera gastar por mês em cada categoria.' : 'A gestão ainda não definiu o orçamento.'}</p>}
            </Card>

            <Card className="p-5" id="fontes-com-destino">
              <h2 className="mb-3 font-semibold">Recursos com destino</h2>
              {fontes.length ? (
                <ul className="flex flex-col gap-3 text-sm">
                  {fontes.map((f) => (
                    <li key={f.id} className="flex flex-col gap-0.5">
                      <span className="flex items-baseline justify-between gap-2"><span className="font-medium">{f.nome}</span><span className={`tabular-nums font-semibold ${f.saldo < 0 ? 'text-destructive' : ''}`}>{reais(f.saldo)}</span></span>
                      <span className="text-xs text-muted-foreground">
                        {[f.financiador, `recebido ${reais(f.recebido)}${f.previsto !== null ? ` de ${reais(f.previsto)}` : ''}`,
                          f.fim ? (f.diasParaAcabar! < 0 ? `vigência acabou em ${dataCurta(f.fim)}` : `vigência até ${dataCurta(f.fim)} (${f.diasParaAcabar} dias)`) : null].filter(Boolean).join(' · ')}
                      </span>
                    </li>
                  ))}
                </ul>
              ) : <p className="text-sm text-muted-foreground">Nenhum convênio ou doação carimbada cadastrado. Cadastre em Cadastros → Fontes de recurso.</p>}
            </Card>
          </div>

          <Card className="p-5" id="origens">
            <h2 className="mb-1 font-semibold">De onde veio o dinheiro — últimos 12 meses</h2>
            <p className="mb-3 text-xs text-muted-foreground">Depender de uma origem só é risco: se ela para, a filial para junto.</p>
            {origens.length ? (
              <ul className="flex flex-col gap-2">
                {origens.slice(0, 8).map((o) => (
                  <li key={o.nome} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1 text-sm">
                    <span className="truncate">{o.nome}</span>
                    <span className="tabular-nums text-muted-foreground">{reais(o.valor)} · {o.pct.toLocaleString('pt-BR')}%</span>
                    <div className="col-span-2 h-1.5 overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full bg-[var(--chart-4)]" style={{ width: `${o.pct}%` }} /></div>
                  </li>
                ))}
              </ul>
            ) : <p className="text-sm text-muted-foreground">Nenhuma receita recebida nos últimos 12 meses.</p>}
          </Card>
        </>
      )}
      <Suspense fallback={null}><IndicadoresDoBc /></Suspense>
    </div>
  )
}
