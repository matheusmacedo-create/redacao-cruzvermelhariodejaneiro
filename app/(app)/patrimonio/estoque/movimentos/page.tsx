import Link from 'next/link'
import { notFound } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { PageHeader } from '@/components/app/page-header'
import { hojeEmSaoPaulo } from '@/components/app/projetos/comum'
import { SecoesDoPatrimonio } from '@/components/app/patrimonio/secoes'
import { cadastrosDoPatrimonio, contextoDoPatrimonio } from '@/lib/patrimonio/acesso'
import { nomeDoMes, primeiroDia, ultimoDia } from '@/lib/financeiro/regras'
import { CAUSAS_DE_PERDA, FINALIDADES, ORIGENS_DE_ENTRADA, TIPOS_DE_MOVIMENTO, quantidade, type CausaDePerda, type Finalidade, type OrigemDeEntrada, type TipoDeMovimento } from '@/lib/patrimonio/estoque'

export const metadata = { title: 'Movimentos do estoque' }
export const dynamic = 'force-dynamic'

const selectClass = 'rounded-lg border border-border bg-background px-3 py-2 text-sm'
const reais = (n: number) => n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
const dataBr = (d: string) => d.split('-').reverse().join('/')

/** Tudo o que entrou e saiu num mês: para prestar contas (o que foi distribuído, para onde) e conferir com o fechamento. */
export default async function MovimentosPage({ searchParams }: { searchParams: Promise<{ mes?: string; tipo?: string; local?: string }> }) {
  const sp = await searchParams
  const { context, supabase, nivel } = await contextoDoPatrimonio()
  if (nivel < 1) notFound()
  const ws = context.workspace.id
  const mes = /^\d{4}-(0[1-9]|1[0-2])$/.test(sp.mes ?? '') ? sp.mes! : hojeEmSaoPaulo().slice(0, 7)
  const tipo = sp.tipo && Object.hasOwn(TIPOS_DE_MOVIMENTO, sp.tipo) ? sp.tipo : ''
  const c = await cadastrosDoPatrimonio()
  let consulta = supabase.from('est_movimentos').select('id,data,tipo,quantidade,valor,local_id,origem,finalidade,causa,detalhe,documento,item_id,est_itens(codigo,nome,unidade)')
    .eq('workspace_id', ws).gte('data', primeiroDia(mes)).lte('data', ultimoDia(mes)).order('data', { ascending: false }).order('created_at', { ascending: false }).limit(5000)
  if (tipo) consulta = consulta.eq('tipo', tipo)
  if (sp.local && /^[0-9a-f-]{36}$/.test(sp.local)) consulta = consulta.eq('local_id', sp.local)
  const { data: movimentos } = await consulta
  const local = new Map(c.locais.map((l) => [l.id, l.nome]))
  const lista = (movimentos ?? []).map((m) => ({ ...m, quantidade: Number(m.quantidade), valor: Number(m.valor), item: (Array.isArray(m.est_itens) ? m.est_itens[0] : m.est_itens) as { codigo: string; nome: string; unidade: string } | null }))
  // Transferências e montagens aparecem aos pares (sai de um, entra no outro): nos totais, só o que sai de verdade.
  const soma = (f: (m: (typeof lista)[number]) => boolean) => Math.round(lista.filter(f).reduce((s, m) => s + m.valor * 100, 0)) / 100
  const totais = [
    { r: 'Entradas por compra', v: soma((m) => m.tipo === 'entrada' && m.origem === 'compra') },
    { r: 'Doações recebidas (valor de mercado)', v: soma((m) => m.tipo === 'entrada' && m.origem === 'doacao') },
    { r: 'Saídas para uso', v: -soma((m) => m.tipo === 'saida') },
    { r: 'Perdas', v: -soma((m) => m.tipo === 'perda') },
  ]
  const [a, m] = mes.split('-').map(Number)
  const mesVizinho = (d: number) => { const x = new Date(Date.UTC(a, m - 1 + d, 1)); return `${x.getUTCFullYear()}-${String(x.getUTCMonth() + 1).padStart(2, '0')}` }
  const link = (novoMes: string) => `/patrimonio/estoque/movimentos?mes=${novoMes}${tipo ? `&tipo=${tipo}` : ''}${sp.local ? `&local=${sp.local}` : ''}`

  return (
    <div className="flex flex-col gap-6">
      <SecoesDoPatrimonio atual="/patrimonio/estoque" nivel={nivel} />
      <PageHeader title="Movimentos do estoque" description={`${nomeDoMes(mes)}: o que entrou, saiu, foi transferido, contado ou perdido. O valor segue o custo médio; o mesmo resumo vai no fechamento do Financeiro.`} />

      <div className="flex flex-wrap items-center gap-2" data-ajuda="patrimonio.movimentos-filtros">
        <Button variant="outline" size="sm" render={<Link href={link(mesVizinho(-1))} />}>← {nomeDoMes(mesVizinho(-1))}</Button>
        <Button variant="outline" size="sm" render={<Link href={link(mesVizinho(1))} />}>{nomeDoMes(mesVizinho(1))} →</Button>
        <form className="ml-auto flex flex-wrap items-center gap-2">
          <input type="hidden" name="mes" value={mes} />
          <select name="tipo" defaultValue={tipo} aria-label="Tipo" className={selectClass}><option value="">Todos os tipos</option>{Object.entries(TIPOS_DE_MOVIMENTO).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
          <select name="local" defaultValue={sp.local ?? ''} aria-label="Local" className={selectClass}><option value="">Todos os locais</option>{c.locais.map((l) => <option key={l.id} value={l.id}>{l.nome}</option>)}</select>
          <Button type="submit" variant="outline" size="sm">Filtrar</Button>
        </form>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4" id="totais-do-mes" data-ajuda="patrimonio.movimentos-totais">
        {totais.map((t) => <Card key={t.r} className="p-4"><p className="text-xl font-bold tabular-nums">{reais(t.v)}</p><p className="text-xs text-muted-foreground">{t.r}</p></Card>)}
      </div>

      <Card className="overflow-hidden p-0">
        {!lista.length ? <p className="p-10 text-center text-sm text-muted-foreground">Nenhum movimento neste mês{tipo || sp.local ? ' com este filtro' : ''}.</p> : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[52rem] border-collapse text-sm" id="lista-de-movimentos">
              <thead><tr className="border-b border-border bg-muted/40 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                <th className="px-3 py-2.5">Data</th><th className="px-3 py-2.5">Material</th><th className="px-3 py-2.5">Movimento</th><th className="px-3 py-2.5 text-right">Quantidade</th>
                <th className="px-3 py-2.5">Local</th><th className="px-3 py-2.5">Detalhe</th><th className="px-3 py-2.5 text-right">Valor</th>
              </tr></thead>
              <tbody>
                {lista.map((x) => {
                  const motivo = x.origem ? ORIGENS_DE_ENTRADA[x.origem as OrigemDeEntrada]?.split(' (')[0] : x.finalidade ? FINALIDADES[x.finalidade as Finalidade]?.split(' (')[0] : x.causa && x.causa !== 'contagem' ? CAUSAS_DE_PERDA[x.causa as CausaDePerda] : null
                  return (
                    <tr key={x.id as string} className="border-b border-border align-top last:border-0">
                      <td className="whitespace-nowrap px-3 py-2.5 text-xs">{dataBr(x.data as string)}</td>
                      <td className="max-w-64 px-3 py-2.5"><Link href={`/patrimonio/estoque/${x.item_id}`} className="block truncate hover:text-primary hover:underline">{x.item?.nome}</Link><span className="font-mono text-[11px] text-muted-foreground">{x.item?.codigo}</span></td>
                      <td className="px-3 py-2.5 text-xs"><span className="font-medium">{TIPOS_DE_MOVIMENTO[x.tipo as TipoDeMovimento]}</span>{motivo && <span className="block text-muted-foreground">{motivo}</span>}</td>
                      <td className={`whitespace-nowrap px-3 py-2.5 text-right tabular-nums ${x.quantidade > 0 ? 'text-success' : ''}`}>{x.quantidade > 0 ? '+' : '−'}{quantidade(Math.abs(x.quantidade), x.item?.unidade)}</td>
                      <td className="px-3 py-2.5 text-xs">{local.get(x.local_id as string) ?? '—'}</td>
                      <td className="max-w-64 px-3 py-2.5 text-xs">{x.detalhe as string}{x.documento && <span className="block text-muted-foreground">Doc. {x.documento as string}</span>}</td>
                      <td className="whitespace-nowrap px-3 py-2.5 text-right text-xs tabular-nums">{reais(x.valor)}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  )
}
