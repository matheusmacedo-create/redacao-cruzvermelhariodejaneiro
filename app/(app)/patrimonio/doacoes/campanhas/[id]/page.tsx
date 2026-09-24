import Link from 'next/link'
import { notFound } from 'next/navigation'
import { HandHeart, PackageOpen } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { PageHeader } from '@/components/app/page-header'
import { SecoesDoPatrimonio } from '@/components/app/patrimonio/secoes'
import { NovaCampanha, type Campanha } from '@/components/app/patrimonio/doacoes'
import { cadastrosDoPatrimonio, contextoDoPatrimonio } from '@/lib/patrimonio/acesso'
import { quantidade } from '@/lib/patrimonio/estoque'

export const metadata = { title: 'Campanha de doação' }
export const dynamic = 'force-dynamic'

const reais = (n: number) => n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
const dataBr = (d: string | null) => (d ? d.split('-').reverse().join('/') : null)

/**
 * Prestação de contas da campanha: quanto chegou, de quem, o que foi
 * entregue, a quem e para quantas pessoas — item a item.
 */
export default async function CampanhaPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound()
  const { context, supabase, nivel } = await contextoDoPatrimonio()
  if (nivel < 1) notFound()
  const ws = context.workspace.id
  const { data: k } = await supabase.from('doa_campanhas').select('id,nome,descricao,inicio,fim,projeto_id,ativa').eq('id', id).eq('workspace_id', ws).maybeSingle()
  if (!k) notFound()
  const c = await cadastrosDoPatrimonio()
  const [{ data: recebidas }, { data: entregas }] = await Promise.all([
    supabase.from('doa_recebimentos').select('id,codigo,data,doador_nome,valor_total,doa_recebimento_itens(tipo,item_id,descricao,quantidade,unidade,valor_total)').eq('campanha_id', id).order('data'),
    supabase.from('doa_entregas').select('id,codigo,data,beneficiario_nome,pessoas,bairro,municipio,valor_total,doa_entrega_itens(item_id,descricao,quantidade,unidade)').eq('campanha_id', id).order('data'),
  ])
  type Linha = { descricao: string; unidade: string; recebido: number; entregue: number; valor: number }
  const porItem = new Map<string, Linha>()
  const pegar = (chave: string, descricao: string, unidade: string) => porItem.get(chave) ?? porItem.set(chave, { descricao, unidade, recebido: 0, entregue: 0, valor: 0 }).get(chave)!
  let bens = 0
  for (const r of recebidas ?? []) for (const i of (r.doa_recebimento_itens ?? []) as { tipo: string; item_id: string | null; descricao: string; quantidade: number; unidade: string; valor_total: number }[]) {
    if (i.tipo === 'bem') { bens++; continue }
    const l = pegar(i.item_id!, i.descricao, i.unidade)
    l.recebido += Number(i.quantidade); l.valor += Number(i.valor_total)
  }
  for (const e of entregas ?? []) for (const i of (e.doa_entrega_itens ?? []) as { item_id: string; descricao: string; quantidade: number; unidade: string }[]) {
    pegar(i.item_id, i.descricao, i.unidade).entregue += Number(i.quantidade)
  }
  const recebido = (recebidas ?? []).reduce((s, r) => s + Number(r.valor_total), 0)
  const entregue = (entregas ?? []).reduce((s, e) => s + Number(e.valor_total), 0)
  const pessoas = (entregas ?? []).reduce((s, e) => s + Number(e.pessoas ?? 0), 0)
  const doadores = new Set((recebidas ?? []).map((r) => r.doador_nome as string))
  const periodo = [dataBr(k.inicio as string | null), dataBr(k.fim as string | null)].filter(Boolean).join(' a ')

  return (
    <div className="flex flex-col gap-6">
      <SecoesDoPatrimonio atual="/patrimonio/doacoes" nivel={nivel} />
      <PageHeader
        title={k.nome as string}
        description={[periodo, k.ativa ? 'recebendo doações' : 'encerrada', k.descricao as string | null].filter(Boolean).join(' · ')}
        actions={nivel >= 2 ? <div className="flex flex-wrap items-start gap-2">
          {k.ativa && <Button render={<Link href={`/patrimonio/doacoes/receber?campanha=${k.id}`} />}><HandHeart className="size-4" />Receber</Button>}
          <Button variant="outline" render={<Link href={`/patrimonio/doacoes/entregar?campanha=${k.id}`} />}><PackageOpen className="size-4" />Entregar</Button>
        </div> : undefined}
      />
      {nivel >= 3 && <div><NovaCampanha c={k as Campanha} projetos={c.projetos.map((p) => ({ id: p.id, nome: p.name }))} /></div>}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4" id="resumo-campanha">
        {[
          { v: reais(recebido), r: `recebido de ${doadores.size} ${doadores.size === 1 ? 'doador' : 'doadores'} (${(recebidas ?? []).length} recibos)` },
          { v: reais(entregue), r: `entregue em ${(entregas ?? []).length} ${(entregas ?? []).length === 1 ? 'entrega' : 'entregas'}` },
          { v: String(pessoas), r: 'pessoas atendidas' },
          { v: String(bens), r: 'bens duráveis recebidos (patrimônio)' },
        ].map((x) => <Card key={x.r} className="p-4"><p className="text-xl font-bold tabular-nums">{x.v}</p><p className="text-xs text-muted-foreground">{x.r}</p></Card>)}
      </div>

      <Card className="overflow-hidden p-0">
        <h2 className="px-5 pt-5 font-semibold">Item a item</h2>
        {!porItem.size ? <p className="px-5 pb-5 pt-2 text-sm text-muted-foreground">Nada recebido ou entregue ainda.</p> : (
          <div className="overflow-x-auto">
            <table className="mt-3 w-full min-w-[36rem] border-collapse text-sm" id="itens-da-campanha">
              <thead><tr className="border-y border-border bg-muted/40 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                <th className="px-5 py-2">Material</th><th className="px-3 py-2 text-right">Recebido</th><th className="px-3 py-2 text-right">Entregue</th><th className="px-5 py-2 text-right">Valor recebido</th>
              </tr></thead>
              <tbody>
                {[...porItem.values()].sort((a, b) => a.descricao.localeCompare(b.descricao, 'pt-BR')).map((l) => (
                  <tr key={l.descricao} className="border-b border-border last:border-0">
                    <td className="px-5 py-2.5">{l.descricao}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums">{l.recebido ? quantidade(l.recebido, l.unidade) : '—'}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums">{l.entregue ? quantidade(l.entregue, l.unidade) : '—'}</td>
                    <td className="px-5 py-2.5 text-right tabular-nums">{l.valor ? reais(l.valor) : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p className="px-5 py-3 text-xs text-muted-foreground">Entregue pode passar do recebido: a entrega da campanha pode usar material que já estava no estoque.</p>
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card className="p-5">
          <h2 className="mb-3 font-semibold">Recibos</h2>
          <ul className="flex flex-col gap-2 text-sm">
            {(recebidas ?? []).map((r) => <li key={r.id as string} className="flex justify-between gap-3"><span><Link href={`/patrimonio/doacoes/recebidas/${r.id}`} className="font-mono text-xs text-primary hover:underline">{r.codigo as string}</Link> {r.doador_nome as string}</span><span className="tabular-nums">{reais(Number(r.valor_total))}</span></li>)}
            {!(recebidas ?? []).length && <li className="text-muted-foreground">Nenhum.</li>}
          </ul>
        </Card>
        <Card className="p-5">
          <h2 className="mb-3 font-semibold">Entregas</h2>
          <ul className="flex flex-col gap-2 text-sm">
            {(entregas ?? []).map((e) => <li key={e.id as string} className="flex justify-between gap-3"><span><Link href={`/patrimonio/doacoes/entregas/${e.id}`} className="font-mono text-xs text-primary hover:underline">{e.codigo as string}</Link> {e.beneficiario_nome as string}{e.bairro ? ` (${e.bairro})` : ''}</span><span className="tabular-nums">{(e.pessoas as number | null) ?? '—'} pessoas</span></li>)}
            {!(entregas ?? []).length && <li className="text-muted-foreground">Nenhuma.</li>}
          </ul>
        </Card>
      </div>
    </div>
  )
}
