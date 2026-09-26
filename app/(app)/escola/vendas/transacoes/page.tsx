import Link from 'next/link'
import { notFound } from 'next/navigation'
import { Download } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { PageHeader } from '@/components/app/page-header'
import { selectClass, inputClass } from '@/components/app/imprensa/campos'
import { SecoesDaEscola } from '@/components/app/escola/secoes'
import { contextoDaEscola, transacoesDesde } from '@/lib/escola/servidor'
import { filtrarTransacoes, lerFiltro, mesDe, mesPorExtenso, mesesAte, reaisDeCentavos, transacoesDoMes } from '@/lib/escola/painel'
import { METODOS, SITUACOES, contaComoRecebido, type Metodo, type Situacao } from '@/lib/escola/unicopag'

export const metadata = { title: 'Transações · Escola' }
export const dynamic = 'force-dynamic'

const LIMITE = 500
const dataHora = (iso: string | null) => (iso ? new Date(iso).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '—')

/** As transações do mês nas contas da escola, com filtros e a planilha para o contador. */
export default async function TransacoesDaEscolaPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const { context, supabase, nivel } = await contextoDaEscola()
  if (nivel < 2) notFound()
  const ws = context.workspace.id
  const hoje = mesDe(new Date().toISOString())
  const f = lerFiltro(await searchParams, hoje)
  const [{ data: contas }, ts] = await Promise.all([
    supabase.from('escola_contas').select('id,nome').eq('workspace_id', ws).order('nome'),
    transacoesDesde(supabase, ws, new Date(`${f.mes}-01T03:00:00Z`).toISOString()),
  ])
  const nomeDaConta = new Map((contas ?? []).map((c) => [c.id as string, c.nome as string]))
  const lista = filtrarTransacoes(transacoesDoMes(ts, f.mes), f)
  const recebido = lista.filter((t) => contaComoRecebido(t.situacao) && t.paga_em && mesDe(t.paga_em) === f.mes).reduce((s, t) => s + t.valor, 0)
  const busca = new URLSearchParams(Object.entries(f).filter(([, v]) => v) as [string, string][]).toString()

  return (
    <div className="flex flex-col gap-6">
      <SecoesDaEscola atual="/escola/vendas" />
      <PageHeader title="Transações" description="Cada cobrança das contas da escola na Únicopag: criada ou paga no mês escolhido. O CPF aparece mascarado; a ficha do aluno fica no sistema da escola."
        actions={<Button variant="outline" render={<a href={`/api/escola/transacoes?${busca}`} />} data-ajuda="escola-vendas.planilha"><Download className="size-4" />Planilha (CSV)</Button>} />
      <form className="flex flex-wrap items-end gap-2" id="filtros" data-ajuda="escola-vendas.filtros">
        <select name="mes" defaultValue={f.mes} className={selectClass} aria-label="Mês">{mesesAte(hoje, 24).reverse().map((m) => <option key={m} value={m}>{mesPorExtenso(m)}</option>)}</select>
        {(contas ?? []).length > 1 && <select name="conta" defaultValue={f.conta} className={selectClass} aria-label="Conta"><option value="">Todas as contas</option>{(contas ?? []).map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}</select>}
        <select name="situacao" defaultValue={f.situacao} className={selectClass} aria-label="Situação"><option value="">Todas as situações</option>{(Object.keys(SITUACOES) as Situacao[]).map((s) => <option key={s} value={s}>{SITUACOES[s].rotulo}</option>)}</select>
        <select name="metodo" defaultValue={f.metodo} className={selectClass} aria-label="Forma de pagamento"><option value="">Todas as formas</option>{(Object.keys(METODOS) as Metodo[]).map((m) => <option key={m} value={m}>{METODOS[m]}</option>)}</select>
        <input name="q" defaultValue={f.q} placeholder="Pagador, curso, código…" className={inputClass.replace('w-full', 'w-56')} aria-label="Buscar" />
        <Button type="submit" variant="outline">Filtrar</Button>
      </form>
      <p className="text-sm text-muted-foreground" id="total-transacoes" data-ajuda="escola-vendas.total">{lista.length} {lista.length === 1 ? 'transação' : 'transações'} · {reaisDeCentavos(recebido)} recebidos em {mesPorExtenso(f.mes)}{lista.length > LIMITE ? ` · mostrando as ${LIMITE} mais recentes (a planilha traz todas)` : ''}</p>
      {!lista.length ? <Card className="p-10 text-center text-sm text-muted-foreground">Nenhuma transação com estes filtros.</Card> : (
        <Card className="overflow-x-auto p-0" data-ajuda="escola-vendas.tabela">
          <table className="w-full min-w-[760px] text-sm" id="tabela-transacoes">
            <thead className="border-b border-border text-left text-xs text-muted-foreground">
              <tr><th className="px-3 py-2 font-medium">Criada</th><th className="px-3 py-2 font-medium">Pagador</th><th className="px-3 py-2 font-medium">Curso</th><th className="px-3 py-2 font-medium">Forma</th><th className="px-3 py-2 font-medium">Situação</th><th className="px-3 py-2 text-right font-medium">Valor</th><th className="px-3 py-2 font-medium">Paga</th></tr>
            </thead>
            <tbody className="divide-y divide-border">
              {lista.slice(0, LIMITE).map((t) => (
                <tr key={`${t.conta_id}:${t.hash}`} data-hash={t.hash}>
                  <td className="whitespace-nowrap px-3 py-2 tabular-nums">{dataHora(t.criada_em)}</td>
                  <td className="px-3 py-2"><span className="block">{t.cliente ?? '—'}</span>{t.documento && <span className="text-xs text-muted-foreground tabular-nums">{t.documento}</span>}</td>
                  <td className="px-3 py-2"><span className="block">{t.produto ?? '—'}</span>{(contas ?? []).length > 1 && <span className="text-xs text-muted-foreground">{nomeDaConta.get(t.conta_id)}</span>}</td>
                  <td className="whitespace-nowrap px-3 py-2">{METODOS[t.metodo]}{t.metodo === 'cartao' && t.parcelas && t.parcelas > 1 ? ` ${t.parcelas}x` : ''}</td>
                  <td className="px-3 py-2"><span className={`rounded-full px-2 py-0.5 text-xs ${SITUACOES[t.situacao].classe}`} title={`${SITUACOES[t.situacao].ajuda} (${t.status})`}>{SITUACOES[t.situacao].rotulo}</span></td>
                  <td className="whitespace-nowrap px-3 py-2 text-right tabular-nums">{reaisDeCentavos(t.valor)}</td>
                  <td className="whitespace-nowrap px-3 py-2 tabular-nums text-muted-foreground">{dataHora(t.paga_em)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
      <p className="text-xs text-muted-foreground">Os valores são os brutos da cobrança; as taxas da Únicopag aparecem no extrato de repasse. <Link href="/escola/vendas" className="text-primary hover:underline">Voltar às vendas</Link></p>
    </div>
  )
}
