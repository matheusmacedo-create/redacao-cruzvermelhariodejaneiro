import Link from 'next/link'
import { FileText, Plus, ShoppingCart } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { PageHeader } from '@/components/app/page-header'
import { SecoesDoFinanceiro } from '@/components/app/financeiro/secoes'
import { EstadoDoPedido } from '@/components/app/financeiro/compras/comum'
import { contextoDeCompras } from '@/lib/compras/servidor'
import { numeroDaOrdem, numeroDoPedido, type EstadoDoPedido as Estado } from '@/lib/compras/regras'
import { dataCurta, reais } from '@/lib/financeiro/regras'
import { resumoDosConvites, type Convite } from '@/lib/compras/convites'
import { tituloDaArea } from '@/lib/navegacao'
import { cn } from '@/lib/utils'

export const metadata = { title: tituloDaArea('/financeiro/compras') }
export const dynamic = 'force-dynamic'

type Aba = 'meus' | 'cotar' | 'aprovar' | 'andamento' | 'entrada' | 'todos'
const COLUNAS = 'id,entidade_id,ano,numero,titulo,estado,valor_estimado,valor_aprovado,necessario_ate,created_at,solicitante_id,setor_id,exige_diretoria,aprovado_fin_em,aprovado_dir_em,oc_ano,oc_numero,oc_enviada_em,lancamento_id'
const mesesAtras = (n: number) => {
  const hoje = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date())
  return Array.from({ length: n }, (_, i) => {
    const d = new Date(Date.UTC(Number(hoje.slice(0, 4)), Number(hoje.slice(5, 7)) - 1 - i, 15))
    return { valor: d.toISOString().slice(0, 7), rotulo: d.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric', timeZone: 'UTC' }) }
  })
}
type Linha = {
  id: string; entidade_id: string; ano: number; numero: number; titulo: string; estado: Estado; valor_estimado: number; valor_aprovado: number | null
  necessario_ate: string | null; created_at: string; solicitante_id: string | null; setor_id: string | null; exige_diretoria: boolean; aprovado_fin_em: string | null; aprovado_dir_em: string | null
  oc_ano: number | null; oc_numero: number | null; oc_enviada_em: string | null; lancamento_id: string | null
}

/** Depois da aprovação, o que falta fazer com a compra (null: nada — a conta já foi lançada). */
function proximoPasso(p: Linha): string | null {
  if (p.lancamento_id) return null
  if (p.estado === 'aprovado') return 'emitir a ordem de compra'
  if (p.estado === 'emitido' && !p.oc_enviada_em) return 'enviar a ordem ao fornecedor'
  if (p.estado === 'emitido' || p.estado === 'recebido_parcial') return 'aguardando a entrega'
  if (p.estado === 'recebido') return 'lançar a conta a pagar'
  return null
}

/**
 * Pedidos de compra. Qualquer pessoa da Redação pede e acompanha os seus; quem
 * cota (Financeiro, nível "lançar") vê o que espera cotação; quem aprova
 * (nível "aprovar", e a Diretoria acima do limite) vê o que espera decisão; e
 * "Em andamento" junta as compras aprovadas até a conta a pagar ser lançada;
 * quem opera o Patrimônio vê o que chegou e ainda espera entrada.
 */
export default async function ComprasPage({ searchParams }: { searchParams: Promise<{ aba?: string }> }) {
  const sp = await searchParams
  const { context, supabase, nivel, empresa, empresas, pede, diretoria, patrimonio, regras } = await contextoDeCompras()
  const ws = context.workspace.id
  const eu = context.user.id
  const ent = empresa?.id ?? '00000000-0000-0000-0000-000000000000'

  const [{ data: meus }, { data: daEmpresa }, { data: emAprovacao }, { data: paraEntrada }] = await Promise.all([
    supabase.from('compras_pedidos').select(COLUNAS).eq('workspace_id', ws).eq('solicitante_id', eu).order('created_at', { ascending: false }).limit(200),
    nivel >= 1
      ? supabase.from('compras_pedidos').select(COLUNAS).eq('workspace_id', ws).eq('entidade_id', ent).order('created_at', { ascending: false }).limit(300)
      : Promise.resolve({ data: [] as Linha[] }),
    // A Diretoria pode não ter nível no Financeiro: o RLS mostra a ela o que passa por ela.
    nivel >= 3 || diretoria
      ? supabase.from('compras_pedidos').select(COLUNAS).eq('workspace_id', ws).eq('estado', 'em_aprovacao').order('enviado_aprovacao_em').limit(200)
      : Promise.resolve({ data: [] as Linha[] }),
    // O Patrimônio enxerga as compras com ordem emitida, de todas as empresas (o estoque é um só).
    patrimonio
      ? supabase.from('compras_pedidos').select(COLUNAS).eq('workspace_id', ws).in('estado', ['recebido_parcial', 'recebido']).is('entrada_concluida_em', null).order('updated_at').limit(200)
      : Promise.resolve({ data: [] as Linha[] }),
  ])
  const ler = (l: Linha[] | null) => (l ?? []).map((x) => ({ ...x, valor_estimado: Number(x.valor_estimado), valor_aprovado: x.valor_aprovado === null ? null : Number(x.valor_aprovado) })) as Linha[]
  const listas: Record<Aba, Linha[]> = {
    meus: ler(meus as Linha[]),
    cotar: nivel >= 2 ? ler(daEmpresa as Linha[]).filter((p) => p.estado === 'aberto' || p.estado === 'em_cotacao') : [],
    // Para aprovar: o que ainda espera a MINHA parte (o Financeiro, ou a Diretoria).
    aprovar: ler(emAprovacao as Linha[]).filter((p) => (nivel >= 3 && !p.aprovado_fin_em) || (diretoria && p.exige_diretoria && !p.aprovado_dir_em)).filter((p) => p.solicitante_id !== eu),
    andamento: nivel >= 2 ? ler(daEmpresa as Linha[]).filter((p) => proximoPasso(p) !== null) : [],
    entrada: ler(paraEntrada as Linha[]),
    todos: ler(daEmpresa as Linha[]),
  }
  const abas: { id: Aba; rotulo: string; mostra: boolean }[] = [
    { id: 'aprovar', rotulo: 'Para aprovar', mostra: nivel >= 3 || diretoria },
    { id: 'cotar', rotulo: 'Para cotar', mostra: nivel >= 2 },
    { id: 'andamento', rotulo: 'Em andamento', mostra: nivel >= 2 },
    { id: 'entrada', rotulo: 'Dar entrada', mostra: patrimonio },
    { id: 'meus', rotulo: 'Meus pedidos', mostra: true },
    { id: 'todos', rotulo: 'Todos', mostra: nivel >= 1 },
  ]
  const visiveis = abas.filter((a) => a.mostra)
  const pedida = visiveis.find((a) => a.id === sp.aba)?.id
  const aba: Aba = pedida ?? (listas.aprovar.length ? 'aprovar' : listas.cotar.length ? 'cotar' : listas.andamento.length ? 'andamento' : listas.entrada.length ? 'entrada' : 'meus')
  const lista = listas[aba]

  const pessoas = [...new Set(lista.map((p) => p.solicitante_id).filter(Boolean))] as string[]
  const setoresIds = [...new Set(lista.map((p) => p.setor_id).filter(Boolean))] as string[]
  const [{ data: perfis }, { data: setores }] = await Promise.all([
    pessoas.length ? supabase.from('profiles').select('id,full_name').in('id', pessoas) : Promise.resolve({ data: [] as { id: string; full_name: string }[] }),
    setoresIds.length ? supabase.from('setores').select('id,nome').in('id', setoresIds) : Promise.resolve({ data: [] as { id: string; nome: string }[] }),
  ])
  const nomeDe = new Map((perfis ?? []).map((p) => [p.id, p.full_name as string]))

  // Em cotação: quantas propostas chegaram e como estão os convites (a pergunta "onde estão as cotações?").
  const emCotacao = lista.filter((p) => p.estado === 'aberto' || p.estado === 'em_cotacao').map((p) => p.id)
  const [{ data: propostasDaLista }, { data: convitesDaLista }, { data: prazos }] = emCotacao.length && nivel >= 1
    ? await Promise.all([
        supabase.from('compras_propostas').select('pedido_id').in('pedido_id', emCotacao).limit(5000),
        supabase.from('compras_convites').select('pedido_id,enviado_em,envio_erro,visto_em,respondido_em,recusado_em,motivo_recusa,cancelado_em,lembrete_em').in('pedido_id', emCotacao).limit(5000),
        supabase.from('compras_pedidos').select('id,cotacao_prazo').in('id', emCotacao),
      ])
    : [{ data: [] as { pedido_id: string }[] }, { data: [] as (Convite & { pedido_id: string })[] }, { data: [] as { id: string; cotacao_prazo: string | null }[] }]
  const propostasDe = new Map<string, number>()
  for (const x of propostasDaLista ?? []) propostasDe.set(x.pedido_id as string, (propostasDe.get(x.pedido_id as string) ?? 0) + 1)
  const convitesDe = new Map<string, Convite[]>()
  for (const x of (convitesDaLista ?? []) as (Convite & { pedido_id: string })[]) convitesDe.set(x.pedido_id, [...(convitesDe.get(x.pedido_id) ?? []), x])
  const prazoDe = new Map((prazos ?? []).map((x) => [x.id as string, x.cotacao_prazo as string | null]))
  const hoje = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date())
  const situacaoDaCotacao = (id: string): { texto: string; alerta: boolean } | null => {
    if (!emCotacao.includes(id) || nivel < 1) return null
    const n = propostasDe.get(id) ?? 0
    const convites = convitesDe.get(id) ?? []
    const prazo = prazoDe.get(id) ?? null
    if (!convites.length) return { texto: n ? `${n} ${n === 1 ? 'proposta registrada' : 'propostas registradas'} · nenhum fornecedor convidado pelo link` : 'Nenhuma proposta ainda: abra e use “Pedir propostas”', alerta: n === 0 }
    const r = resumoDosConvites(convites)
    const noPrazo = prazo ? (hoje > prazo ? ` · prazo acabou em ${dataCurta(prazo)}` : ` · prazo ${dataCurta(prazo)}`) : ''
    return { texto: `${r.texto}${n > r.propostas ? ` · ${n} propostas no mapa` : ''}${noPrazo}`, alerta: Boolean(prazo && hoje > prazo) }
  }
  const setorDe = new Map((setores ?? []).map((s) => [s.id, s.nome as string]))

  return (
    <div className="flex flex-col gap-5">
      {nivel >= 1 ? (
        <>
          <PageHeader title="Financeiro" description="Compras: do pedido do setor à aprovação, com as propostas dos fornecedores e o mapa comparativo." />
          <SecoesDoFinanceiro atual="/financeiro/compras" empresas={empresas} empresa={empresa} />
        </>
      ) : (
        <PageHeader title="Pedidos de compra" description="Peça o que o seu setor precisa. O Financeiro cota com os fornecedores, e você acompanha cada passo até a aprovação." />
      )}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <nav data-ajuda="compras.abas" className="flex flex-wrap gap-2" aria-label="Pedidos">
          {visiveis.map((a) => (
            <Link key={a.id} href={`/financeiro/compras?aba=${a.id}`} aria-current={aba === a.id ? 'page' : undefined}
              className={cn('rounded-lg border px-3 py-2 text-sm font-medium', aba === a.id ? 'border-primary bg-primary text-primary-foreground' : 'border-border bg-card text-muted-foreground hover:text-foreground')}>
              {a.rotulo}{a.id !== 'todos' && listas[a.id].length > 0 && <span className="ml-1.5 tabular-nums opacity-80">{listas[a.id].length}</span>}
            </Link>
          ))}
        </nav>
        {pede && <Button data-ajuda="compras.novo" render={<Link href="/financeiro/compras/novo" />}><Plus className="size-4" />Novo pedido</Button>}
      </div>

      {lista.length === 0 ? (
        <Card className="flex flex-col items-center gap-2 p-10 text-center">
          <ShoppingCart className="size-8 text-muted-foreground" />
          <p className="font-medium">{aba === 'meus' ? 'Você ainda não pediu nenhuma compra.' : aba === 'aprovar' ? 'Nada esperando a sua aprovação.' : aba === 'cotar' ? 'Nenhum pedido esperando cotação.' : aba === 'andamento' ? 'Nenhuma compra aprovada esperando ordem, entrega ou conta a pagar.' : aba === 'entrada' ? 'Nada chegou esperando entrada no estoque ou patrimônio.' : 'Nenhum pedido ainda.'}</p>
          <p className="max-w-md text-sm text-muted-foreground">
            Até {reais(regras.limite_simples)} basta uma proposta; acima disso, {regras.cotacoes_minimas} propostas; acima de {reais(regras.limite_diretoria)}, também a aprovação da Diretoria.
          </p>
        </Card>
      ) : (
        <ul data-ajuda="compras.lista" className="flex flex-col gap-2" data-pedidos>
          {lista.map((p) => (
            <li key={p.id}>
              <Link href={`/financeiro/compras/${p.id}`} className="flex flex-wrap items-center gap-x-4 gap-y-1 rounded-xl border border-border bg-card p-4 hover:border-primary/40">
                <div className="min-w-0 flex-1">
                  <p className="flex flex-wrap items-center gap-2">
                    <span className="font-mono text-xs text-muted-foreground">{numeroDoPedido(p.ano, p.numero)}</span>
                    {p.oc_numero !== null && p.oc_ano !== null && <span className="font-mono text-xs text-muted-foreground">· {numeroDaOrdem(p.oc_ano, p.oc_numero)}</span>}
                    <span className="truncate font-medium">{p.titulo}</span>
                  </p>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {nomeDe.get(p.solicitante_id ?? '') ?? 'Alguém'}{p.setor_id && setorDe.get(p.setor_id) ? ` · ${setorDe.get(p.setor_id)}` : ''} · pedido em {dataCurta(p.created_at.slice(0, 10))}
                    {p.necessario_ate && ` · precisa até ${dataCurta(p.necessario_ate)}`}
                  </p>
                  {(() => {
                    const c = situacaoDaCotacao(p.id)
                    return c && <p className={cn('mt-0.5 text-xs font-medium', c.alerta ? 'text-warning-foreground' : 'text-muted-foreground')} data-situacao-cotacao>{c.texto}</p>
                  })()}
                  {aba === 'andamento' && <p className="mt-0.5 text-xs font-medium text-warning-foreground">Próximo passo: {proximoPasso(p)}</p>}
                  {aba === 'entrada' && <p className="mt-0.5 text-xs font-medium text-warning-foreground">Chegou: dê a entrada no estoque ou no patrimônio</p>}
                </div>
                <span className="text-sm font-medium tabular-nums" title={p.valor_aprovado === null && !p.valor_estimado ? 'Sem valor estimado: o valor sai das propostas' : undefined}>{p.valor_aprovado !== null ? reais(p.valor_aprovado) : p.valor_estimado ? `~ ${reais(p.valor_estimado)}` : <span className="text-xs font-normal text-muted-foreground">sem estimativa</span>}</span>
                <EstadoDoPedido estado={p.estado} />
              </Link>
            </li>
          ))}
        </ul>
      )}

      {nivel >= 1 && empresa && (
        <Card data-ajuda="compras.relatorio" className="flex flex-col gap-3 p-5 sm:flex-row sm:items-end sm:justify-between" data-relatorio>
          <div className="min-w-0">
            <p className="flex items-center gap-2 font-medium"><FileText className="size-4" />Relatório de compras para a transparência</p>
            <p className="mt-1 text-sm text-muted-foreground">
              As compras aprovadas no mês, com todas as propostas recebidas e a justificativa quando houve. Fornecedor pessoa física sai sem identificação.
              Para publicar, envie o PDF em Transparência → Documentos.
            </p>
          </div>
          <form action="/api/compras/relatorio" target="_blank" className="flex shrink-0 gap-2">
            <input type="hidden" name="empresa" value={empresa.id} />
            <select name="mes" className="rounded-lg border border-border bg-background px-3 py-2 text-sm" aria-label="Mês do relatório">
              {mesesAtras(12).map((m) => <option key={m.valor} value={m.valor}>{m.rotulo}</option>)}
            </select>
            <Button type="submit" variant="outline"><FileText className="size-4" />Gerar PDF</Button>
          </form>
        </Card>
      )}
    </div>
  )
}
