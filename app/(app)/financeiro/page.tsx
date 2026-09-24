import Link from 'next/link'
import { ChevronLeft, ChevronRight, Lock, Plus, Search } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { PageHeader } from '@/components/app/page-header'
import { SecoesDoFinanceiro } from '@/components/app/financeiro/secoes'
import { hojeEmSaoPaulo } from '@/components/app/projetos/comum'
import { cadastrosDoFinanceiro, contextoDoFinanceiro, lerLinha } from '@/lib/financeiro/acesso'
import {
  COLUNAS_DO_LANCAMENTO, SITUACOES, dataCurta, ehMes, mesAnterior, mesDe, mesSeguinte, nomeDoMes, primeiroDia, reais, saldos, situacao, somar, ultimoDia,
  type Lancamento,
} from '@/lib/financeiro/regras'
import { tituloDaArea } from '@/lib/navegacao'

export const metadata = { title: tituloDaArea('/financeiro') }
export const dynamic = 'force-dynamic'

const selectClass = 'rounded-lg border border-border bg-background px-3 py-2 text-sm'
type Aba = 'pagar' | 'receber' | 'mes' | 'aprovacao'

/**
 * O Financeiro no dia a dia: o que vence, o que entra, o movimento do mês e
 * o que espera aprovação. Os números do topo são do mês escolhido; o que já
 * está atrasado aparece sempre, de qualquer mês.
 */
export default async function FinanceiroPage({ searchParams }: {
  searchParams: Promise<{ aba?: string; mes?: string; conta?: string; categoria?: string; fonte?: string; projeto?: string; q?: string }>
}) {
  const sp = await searchParams
  const { context, supabase, nivel } = await contextoDoFinanceiro()

  if (nivel < 1) {
    return (
      <div>
        <PageHeader title="Financeiro" description="Despesas, receitas, contas a pagar e o caixa da filial." />
        <Card className="flex items-start gap-3 p-6">
          <Lock className="mt-0.5 size-5 text-muted-foreground" />
          <div>
            <p className="font-medium">Você ainda não tem acesso ao Financeiro.</p>
            <p className="mt-1 text-sm text-muted-foreground">Ele é liberado pessoa a pessoa, por um administrador, em Financeiro → Cadastros → Quem acessa.</p>
          </div>
        </Card>
      </div>
    )
  }

  const ws = context.workspace.id
  const hoje = hojeEmSaoPaulo()
  const mes = ehMes(sp.mes) ? sp.mes : mesDe(hoje)
  const inicio = primeiroDia(mes)
  const fim = ultimoDia(mes)
  const c = await cadastrosDoFinanceiro()
  const ent = c.empresa?.id ?? ''

  const [{ data: abertosBrutos }, { data: doMesBrutos }, { data: pagosBrutos }] = await Promise.all([
    // Em aberto até o fim do mês escolhido (atrasados de meses antes entram).
    supabase.from('fin_lancamentos').select(COLUNAS_DO_LANCAMENTO).eq('workspace_id', ws).eq('entidade_id', ent).is('pago_em', null).lte('vencimento', fim).order('vencimento').limit(3000),
    // Tudo o que vence ou foi pago no mês.
    supabase.from('fin_lancamentos').select(COLUNAS_DO_LANCAMENTO).eq('workspace_id', ws).eq('entidade_id', ent).or(`and(vencimento.gte.${inicio},vencimento.lte.${fim}),and(pago_em.gte.${inicio},pago_em.lte.${fim})`).order('vencimento').limit(3000),
    supabase.from('fin_lancamentos').select('tipo,conta_id,conta_destino_id,valor,valor_pago,pago_em').eq('workspace_id', ws).eq('entidade_id', ent).not('pago_em', 'is', null).lte('pago_em', hoje).limit(50000),
  ])
  const abertos = (abertosBrutos ?? []).map(lerLinha) as Lancamento[]
  const doMes = (doMesBrutos ?? []).map(lerLinha) as Lancamento[]
  const saldoPorConta = saldos(c.contas.filter((x) => x.ativa), (pagosBrutos ?? []).map(lerLinha) as Lancamento[], hoje)
  const saldoTotal = somar([...saldoPorConta.values()])

  const aPagar = abertos.filter((l) => l.tipo === 'despesa' && l.aprovacao !== 'recusada')
  const aReceber = abertos.filter((l) => l.tipo === 'receita')
  const atrasadas = aPagar.filter((l) => l.vencimento < hoje)
  const pendentes = aPagar.filter((l) => l.aprovacao === 'pendente')
  const entrou = somar(doMes.filter((l) => l.tipo === 'receita' && l.pago_em && l.pago_em >= inicio && l.pago_em <= fim).map((l) => l.valor_pago ?? l.valor))
  const saiu = somar(doMes.filter((l) => l.tipo === 'despesa' && l.pago_em && l.pago_em >= inicio && l.pago_em <= fim).map((l) => l.valor_pago ?? l.valor))

  const aba: Aba = sp.aba === 'receber' || sp.aba === 'mes' || (sp.aba === 'aprovacao' && pendentes.length) ? sp.aba as Aba : 'pagar'
  const base = aba === 'pagar' ? aPagar : aba === 'receber' ? aReceber : aba === 'aprovacao' ? pendentes : doMes
  const termo = (sp.q ?? '').trim().toLowerCase()
  const nomeDe = {
    conta: new Map(c.contas.map((x) => [x.id, x.nome])), categoria: new Map(c.categorias.map((x) => [x.id, x.nome])),
    fonte: new Map(c.fontes.map((x) => [x.id, x])), favorecido: new Map(c.favorecidos.map((x) => [x.id, x.nome])),
  }
  const lista = base
    .filter((l) => !sp.conta || l.conta_id === sp.conta || l.conta_destino_id === sp.conta)
    .filter((l) => !sp.categoria || l.categoria_id === sp.categoria)
    .filter((l) => !sp.fonte || l.fonte_id === sp.fonte)
    .filter((l) => !sp.projeto || l.projeto_id === sp.projeto)
    .filter((l) => !termo || [l.descricao, l.documento, l.favorecido_id && nomeDe.favorecido.get(l.favorecido_id)].filter(Boolean).join(' ').toLowerCase().includes(termo))
  const totalDaLista = somar(lista.map((l) => (l.tipo === 'despesa' ? -1 : l.tipo === 'receita' ? 1 : 0) * (l.valor_pago ?? l.valor)))

  const qs = (mudar: Record<string, string | undefined>) => {
    const p = new URLSearchParams(Object.entries({ aba: sp.aba, mes: sp.mes, conta: sp.conta, categoria: sp.categoria, fonte: sp.fonte, projeto: sp.projeto, q: sp.q, ...mudar })
      .filter((e): e is [string, string] => Boolean(e[1])))
    const s = p.toString()
    return `/financeiro${s ? `?${s}` : ''}`
  }
  const abas: { id: Aba; rotulo: string }[] = [
    { id: 'pagar', rotulo: `A pagar (${aPagar.length})` },
    { id: 'receber', rotulo: `A receber (${aReceber.length})` },
    { id: 'mes', rotulo: `Movimento de ${nomeDoMes(mes, true)}` },
    ...(pendentes.length ? [{ id: 'aprovacao' as Aba, rotulo: `Esperando aprovação (${pendentes.length})` }] : []),
  ]
  const noMes = (l: Lancamento) => l.vencimento >= inicio && l.vencimento <= fim

  return (
    <div className="flex flex-col gap-6">
      <SecoesDoFinanceiro atual="/financeiro" empresas={c.empresas} empresa={c.empresa} />
      <PageHeader
        title="Financeiro"
        description="Despesas, receitas e contas a pagar da filial, com a fonte de cada recurso e os comprovantes."
        actions={<div className="flex flex-wrap items-start gap-2">
          {nivel >= 2 && <Button variant="outline" render={<Link href="/financeiro/novo?tipo=receita" />}><Plus className="size-4" />Receita</Button>}
          {nivel >= 2 && <Button render={<Link href="/financeiro/novo" />}><Plus className="size-4" />Despesa</Button>}
        </div>}
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5" id="resumo">
        {[
          { valor: reais(saldoTotal), rotulo: `saldo hoje em ${c.contas.filter((x) => x.ativa).length} ${c.contas.filter((x) => x.ativa).length === 1 ? 'conta' : 'contas'}`, alerta: saldoTotal < 0 },
          { valor: reais(somar(aPagar.filter(noMes).map((l) => l.valor))), rotulo: `a pagar em ${nomeDoMes(mes)}` },
          { valor: reais(somar(atrasadas.map((l) => l.valor))), rotulo: `${atrasadas.length} ${atrasadas.length === 1 ? 'conta atrasada' : 'contas atrasadas'}`, alerta: atrasadas.length > 0 },
          { valor: reais(somar(aReceber.filter(noMes).map((l) => l.valor))), rotulo: `a receber em ${nomeDoMes(mes)}` },
          { valor: reais(entrou - saiu), rotulo: `resultado de ${nomeDoMes(mes, true)} (entrou ${reais(entrou)}, saiu ${reais(saiu)})`, alerta: entrou - saiu < 0 },
        ].map((k, i) => (
          <Card key={i} className={`p-4 ${k.alerta ? 'border-destructive/40' : ''}`}>
            <p className={`text-xl font-bold tabular-nums ${k.alerta ? 'text-destructive' : ''}`}>{k.valor}</p>
            <p className="text-xs text-muted-foreground">{k.rotulo}</p>
          </Card>
        ))}
      </div>

      {!c.contas.length && (
        <Card className="p-5 text-sm">
          <p className="font-medium">Para começar, cadastre as contas da filial</p>
          <p className="mt-1 text-muted-foreground">A conta do banco (com o saldo do extrato de hoje) e o caixa em dinheiro. Se houver conta exclusiva de convênio, cadastre a fonte dele antes.</p>
          <Button className="mt-3" size="sm" render={<Link href="/financeiro/cadastros?aba=contas" />}>Cadastrar contas</Button>
        </Card>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <nav className="flex flex-wrap gap-1 border-b border-border" aria-label="Abas">
          {abas.map((a) => (
            <Link key={a.id} href={qs({ aba: a.id === 'pagar' ? undefined : a.id })} aria-current={aba === a.id ? 'page' : undefined}
              className={`-mb-px border-b-2 px-3 py-2 text-sm ${aba === a.id ? 'border-primary font-medium text-foreground' : 'border-transparent text-muted-foreground hover:text-foreground'}`}>{a.rotulo}</Link>
          ))}
        </nav>
        <div className="flex items-center gap-1 text-sm" aria-label="Mês">
          <Button variant="ghost" size="icon" aria-label="Mês anterior" render={<Link href={qs({ mes: mesAnterior(mes) })} />}><ChevronLeft className="size-4" /></Button>
          <span className="min-w-36 text-center font-medium capitalize">{nomeDoMes(mes)}</span>
          <Button variant="ghost" size="icon" aria-label="Próximo mês" render={<Link href={qs({ mes: mesSeguinte(mes) })} />}><ChevronRight className="size-4" /></Button>
        </div>
      </div>

      <form className="flex flex-wrap items-center gap-2" role="search">
        {sp.aba && <input type="hidden" name="aba" value={sp.aba} />}
        {sp.mes && <input type="hidden" name="mes" value={sp.mes} />}
        <div className="relative min-w-52 flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <input name="q" defaultValue={sp.q ?? ''} placeholder="Descrição, favorecido ou nº do documento" aria-label="Buscar" className="w-full rounded-lg border border-border bg-background py-2 pl-9 pr-3 text-sm" />
        </div>
        <select name="conta" defaultValue={sp.conta ?? ''} aria-label="Conta" className={selectClass}><option value="">Todas as contas</option>{c.contas.map((x) => <option key={x.id} value={x.id}>{x.nome}</option>)}</select>
        <select name="categoria" defaultValue={sp.categoria ?? ''} aria-label="Categoria" className={selectClass}><option value="">Todas as categorias</option>{c.categorias.map((x) => <option key={x.id} value={x.id}>{x.nome}</option>)}</select>
        <select name="fonte" defaultValue={sp.fonte ?? ''} aria-label="Fonte" className={selectClass}><option value="">Todas as fontes</option>{c.fontes.map((x) => <option key={x.id} value={x.id}>{x.nome}</option>)}</select>
        {c.projetos.length > 0 && <select name="projeto" defaultValue={sp.projeto ?? ''} aria-label="Projeto" className={selectClass}><option value="">Todos os projetos</option>{c.projetos.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</select>}
        <Button type="submit" variant="outline">Filtrar</Button>
      </form>

      <Card className="overflow-hidden p-0">
        {!lista.length ? (
          <p className="p-10 text-center text-sm text-muted-foreground">
            {aba === 'pagar' ? 'Nenhuma conta a pagar até o fim deste mês.' : aba === 'receber' ? 'Nada a receber até o fim deste mês.' : 'Nenhum lançamento neste filtro.'}
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[48rem] border-collapse text-sm" id="lancamentos">
              <thead><tr className="border-b border-border bg-muted/40 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                <th className="px-4 py-2.5">{aba === 'mes' ? 'Data' : 'Vence'}</th><th className="px-3 py-2.5">Descrição</th><th className="px-3 py-2.5">Conta e fonte</th>
                <th className="px-3 py-2.5 text-right">Valor</th><th className="px-4 py-2.5">Situação</th>
              </tr></thead>
              <tbody>
                {lista.map((l) => {
                  const s = situacao(l, hoje)
                  const fonte = nomeDe.fonte.get(l.fonte_id)
                  return (
                    <tr key={l.id} className="border-b border-border last:border-0 hover:bg-muted/30" data-lancamento={l.id}>
                      <td className="whitespace-nowrap px-4 py-3 tabular-nums">{dataCurta(aba === 'mes' && l.pago_em ? l.pago_em : l.vencimento)}</td>
                      <td className="max-w-80 px-3 py-3">
                        <Link href={`/financeiro/${l.id}`} className="block truncate font-medium hover:text-primary hover:underline">{l.descricao}</Link>
                        <span className="block truncate text-xs text-muted-foreground">
                          {[l.favorecido_id && nomeDe.favorecido.get(l.favorecido_id), l.categoria_id ? nomeDe.categoria.get(l.categoria_id) : 'Transferência'].filter(Boolean).join(' · ')}
                        </span>
                      </td>
                      <td className="px-3 py-3 text-xs">
                        <span className="block">{nomeDe.conta.get(l.conta_id)}{l.conta_destino_id ? ` → ${nomeDe.conta.get(l.conta_destino_id)}` : ''}</span>
                        <span className={fonte?.restrita ? 'text-warning-foreground' : 'text-muted-foreground'}>{fonte?.nome}</span>
                      </td>
                      <td className={`whitespace-nowrap px-3 py-3 text-right font-semibold tabular-nums ${l.tipo === 'receita' ? 'text-success' : l.tipo === 'despesa' ? '' : 'text-muted-foreground'}`}>
                        {l.tipo === 'despesa' ? '−' : l.tipo === 'receita' ? '+' : ''}{reais(l.valor_pago ?? l.valor)}
                      </td>
                      <td className="px-4 py-3"><span className={`whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-semibold ${SITUACOES[s].classe}`}>{SITUACOES[s].rotulo}</span></td>
                    </tr>
                  )
                })}
              </tbody>
              <tfoot><tr className="border-t border-border bg-muted/30 text-sm">
                <td className="px-4 py-2.5 text-xs text-muted-foreground" colSpan={3}>{lista.length} {lista.length === 1 ? 'lançamento' : 'lançamentos'}</td>
                <td className="px-3 py-2.5 text-right font-semibold tabular-nums">{reais(totalDaLista)}</td><td />
              </tr></tfoot>
            </table>
          </div>
        )}
      </Card>
    </div>
  )
}
