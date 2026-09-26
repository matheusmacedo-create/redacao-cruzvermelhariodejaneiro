import Link from 'next/link'
import { notFound } from 'next/navigation'
import { History, Plus, Search } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { PageHeader } from '@/components/app/page-header'
import { hojeEmSaoPaulo } from '@/components/app/projetos/comum'
import { SecoesDoPatrimonio } from '@/components/app/patrimonio/secoes'
import { NovaEntrada, NovaSaida } from '@/components/app/patrimonio/estoque'
import { cadastrosDoPatrimonio, contextoDoPatrimonio, COLUNAS_DO_ITEM, lerItemDoBanco } from '@/lib/patrimonio/acesso'
import { quantidade, situacaoDaValidade, situacaoDoSaldo, type Lote } from '@/lib/patrimonio/estoque'

export const metadata = { title: 'Estoque de materiais' }
export const dynamic = 'force-dynamic'

const selectClass = 'rounded-lg border border-border bg-background px-3 py-2 text-sm'
const reais = (n: number) => n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
const dataBr = (d: string) => d.split('-').reverse().join('/')

/**
 * Materiais de consumo (curativos, EPI, higiene, alimentos, kits): quanto há
 * em cada lugar, o que está acabando (abaixo do mínimo), o que vence logo e
 * quanto vale o estoque (custo médio).
 */
export default async function EstoquePage({ searchParams }: { searchParams: Promise<{ q?: string; categoria?: string; local?: string; filtro?: string }> }) {
  const sp = await searchParams
  const { context, supabase, nivel } = await contextoDoPatrimonio()
  if (nivel < 1) notFound()
  const ws = context.workspace.id
  const hoje = hojeEmSaoPaulo()
  const c = await cadastrosDoPatrimonio()
  const [{ data: brutos }, { data: saldos }] = await Promise.all([
    supabase.from('est_itens').select(COLUNAS_DO_ITEM).eq('workspace_id', ws).order('nome').limit(5000),
    supabase.from('est_saldos').select('id,item_id,local_id,lote,validade,quantidade').eq('workspace_id', ws).gt('quantidade', 0).limit(20000),
  ])
  const itens = (brutos ?? []).map(lerItemDoBanco)
  const lotes = (saldos ?? []).map((l) => ({ ...l, quantidade: Number(l.quantidade) })) as (Lote & { item_id: string })[]
  const lotesDe = new Map<string, typeof lotes>()
  for (const l of lotes) lotesDe.set(l.item_id, [...(lotesDe.get(l.item_id) ?? []), l])
  const categoria = new Map(c.estCategorias.map((k) => [k.id, k.nome]))
  const local = new Map(c.locais.map((l) => [l.id, l.nome]))

  const ativos = itens.filter((i) => i.ativo)
  const validadeDe = (id: string, aviso: number) => {
    const ls = (lotesDe.get(id) ?? []).filter((l) => l.validade).sort((a, b) => a.validade!.localeCompare(b.validade!))
    const vencido = ls.filter((l) => situacaoDaValidade(l.validade, hoje, aviso) === 'vencido').reduce((s, l) => s + l.quantidade, 0)
    const proxima = ls.find((l) => situacaoDaValidade(l.validade, hoje, aviso) !== 'vencido')
    return { vencido, proxima: proxima?.validade ?? null, vencendo: proxima ? situacaoDaValidade(proxima.validade, hoje, aviso) === 'vencendo' : false }
  }
  const info = new Map(ativos.map((i) => [i.id, { ...validadeDe(i.id, i.aviso_validade_dias), saldo: situacaoDoSaldo(i.saldo, i.estoque_minimo) }]))
  const abaixo = ativos.filter((i) => i.estoque_minimo > 0 && info.get(i.id)!.saldo !== 'ok')
  const vencendo = ativos.filter((i) => info.get(i.id)!.vencendo)
  const vencidos = ativos.filter((i) => info.get(i.id)!.vencido > 0)
  const valor = ativos.reduce((s, i) => s + i.valor_estoque, 0)

  const termo = (sp.q ?? '').trim().toLowerCase()
  const qtdNoLocal = (id: string) => (lotesDe.get(id) ?? []).filter((l) => l.local_id === sp.local).reduce((s, l) => s + l.quantidade, 0)
  const lista = (sp.filtro === 'arquivados' ? itens.filter((i) => !i.ativo) : ativos)
    .filter((i) => !sp.categoria || i.categoria_id === sp.categoria)
    .filter((i) => !sp.local || qtdNoLocal(i.id) > 0)
    .filter((i) => sp.filtro !== 'minimo' || abaixo.includes(i))
    .filter((i) => sp.filtro !== 'vencendo' || vencendo.includes(i))
    .filter((i) => sp.filtro !== 'vencidos' || vencidos.includes(i))
    .filter((i) => sp.filtro !== 'kits' || i.eh_kit)
    .filter((i) => !termo || `${i.codigo} ${i.nome} ${i.descricao ?? ''}`.toLowerCase().includes(termo))

  const opcoes = ativos.map((i) => ({ id: i.id, codigo: i.codigo, nome: i.nome, unidade: i.unidade, controla_validade: i.controla_validade, eh_kit: i.eh_kit }))
  const locaisAtivos = c.locais.filter((l) => l.ativo).map((l) => ({ id: l.id, nome: l.nome }))
  const projetos = c.projetos.map((p) => ({ id: p.id, nome: p.name }))

  return (
    <div className="flex flex-col gap-6">
      <SecoesDoPatrimonio atual="/patrimonio/estoque" nivel={nivel} />
      <PageHeader
        title="Estoque de materiais"
        description="Curativos, EPI, higiene, alimentos e kits: quanto há em cada lugar, o que está acabando e o que vence logo."
        actions={<div className="flex flex-wrap items-start gap-2" data-ajuda="patrimonio.estoque-acoes">
          {nivel >= 2 && <NovaEntrada itens={opcoes} locais={locaisAtivos} fontes={c.fontes.map((f) => ({ id: f.id, nome: f.nome }))} projetos={projetos} hoje={hoje} />}
          {nivel >= 2 && <NovaSaida itens={opcoes} locais={locaisAtivos} projetos={projetos} lotes={lotes} hoje={hoje} />}
          <Button variant="outline" render={<Link href="/patrimonio/estoque/movimentos" />}><History className="size-4" />Movimentos</Button>
          {nivel >= 2 && <Button variant="outline" render={<Link href="/patrimonio/estoque/novo" />}><Plus className="size-4" />Novo material</Button>}
        </div>}
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4" id="resumo-estoque" data-ajuda="patrimonio.estoque-resumo">
        {[
          { v: String(ativos.length), r: 'materiais cadastrados' },
          { v: reais(valor), r: 'valor em estoque (custo médio)' },
          { v: String(abaixo.length), r: 'abaixo do mínimo ou zerados', alerta: abaixo.length > 0, href: '/patrimonio/estoque?filtro=minimo' },
          { v: String(vencendo.length + vencidos.length), r: `${vencendo.length} vencendo · ${vencidos.length} com lote vencido`, alerta: vencendo.length + vencidos.length > 0, href: vencidos.length ? '/patrimonio/estoque?filtro=vencidos' : '/patrimonio/estoque?filtro=vencendo' },
        ].map((k, i) => {
          const conteudo = <><p className={`text-xl font-bold tabular-nums ${k.alerta ? 'text-warning-foreground' : ''}`}>{k.v}</p><p className="text-xs text-muted-foreground">{k.r}</p></>
          return k.href && k.alerta
            ? <Link key={i} href={k.href} className="rounded-xl border border-warning/60 bg-card p-4 hover:bg-muted/40">{conteudo}</Link>
            : <Card key={i} className="p-4">{conteudo}</Card>
        })}
      </div>

      <form className="flex flex-wrap items-center gap-2" role="search" data-ajuda="patrimonio.estoque-filtros">
        <div className="relative min-w-52 flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <input name="q" defaultValue={sp.q ?? ''} placeholder="Código ou nome" aria-label="Buscar" className="w-full rounded-lg border border-border bg-background py-2 pl-9 pr-3 text-sm" />
        </div>
        <select name="categoria" defaultValue={sp.categoria ?? ''} aria-label="Categoria" className={selectClass}><option value="">Todas as categorias</option>{c.estCategorias.map((k) => <option key={k.id} value={k.id}>{k.nome}</option>)}</select>
        <select name="local" defaultValue={sp.local ?? ''} aria-label="Local" className={selectClass}><option value="">Todos os locais</option>{c.locais.map((l) => <option key={l.id} value={l.id}>{l.nome}</option>)}</select>
        <select name="filtro" defaultValue={sp.filtro ?? ''} aria-label="Mostrar" className={selectClass}>
          <option value="">Todos</option><option value="minimo">Abaixo do mínimo</option><option value="vencendo">Vencendo</option><option value="vencidos">Com lote vencido</option>
          <option value="kits">Só kits</option><option value="arquivados">Arquivados</option>
        </select>
        <Button type="submit" variant="outline">Filtrar</Button>
      </form>

      <Card className="overflow-hidden p-0" data-ajuda="patrimonio.estoque-lista">
        {!lista.length ? (
          <p className="p-10 text-center text-sm text-muted-foreground">{itens.length ? 'Nenhum material neste filtro.' : 'Nenhum material cadastrado. Comece pelo que mais sai: luvas, gaze, soro, água, kits de higiene.'}</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[48rem] border-collapse text-sm" id="materiais">
              <thead><tr className="border-b border-border bg-muted/40 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                <th className="px-3 py-2.5">Código</th><th className="px-3 py-2.5">Material</th><th className="px-3 py-2.5 text-right">{sp.local ? `Em ${local.get(sp.local) ?? 'local'}` : 'Saldo'}</th>
                <th className="px-3 py-2.5">Próxima validade</th><th className="px-3 py-2.5 text-right">Valor</th>
              </tr></thead>
              <tbody>
                {lista.map((i) => {
                  const x = info.get(i.id)
                  const onde = [...new Set((lotesDe.get(i.id) ?? []).map((l) => l.local_id))]
                  return (
                    <tr key={i.id} className="border-b border-border last:border-0 hover:bg-muted/30" data-material={i.codigo}>
                      <td className="whitespace-nowrap px-3 py-3 font-mono text-xs">{i.codigo}</td>
                      <td className="max-w-80 px-3 py-3">
                        <Link href={`/patrimonio/estoque/${i.id}`} className="block truncate font-medium hover:text-primary hover:underline">{i.nome}</Link>
                        <span className="block truncate text-xs text-muted-foreground">{[categoria.get(i.categoria_id), i.eh_kit ? 'kit' : null, onde.length ? onde.map((l) => local.get(l)).join(', ') : null].filter(Boolean).join(' · ')}</span>
                      </td>
                      <td className="whitespace-nowrap px-3 py-3 text-right tabular-nums">
                        <span className={x?.saldo === 'zerado' && i.estoque_minimo > 0 ? 'font-semibold text-destructive' : x?.saldo === 'abaixo' ? 'font-semibold text-warning-foreground' : ''}>{quantidade(sp.local ? qtdNoLocal(i.id) : i.saldo, i.unidade)}</span>
                        {i.estoque_minimo > 0 && <span className="block text-[11px] text-muted-foreground">mín. {quantidade(i.estoque_minimo)}</span>}
                      </td>
                      <td className="whitespace-nowrap px-3 py-3 text-xs">
                        {x?.proxima ? <span className={x.vencendo ? 'font-medium text-warning-foreground' : ''}>{dataBr(x.proxima)}</span> : <span className="text-muted-foreground">—</span>}
                        {!!x?.vencido && <span className="block font-medium text-destructive">{quantidade(x.vencido, i.unidade)} vencidos</span>}
                      </td>
                      <td className="whitespace-nowrap px-3 py-3 text-right tabular-nums">{reais(i.valor_estoque)}</td>
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
