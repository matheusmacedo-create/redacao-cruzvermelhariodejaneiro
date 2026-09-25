import Link from 'next/link'
import { Plus, ShoppingCart } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { PageHeader } from '@/components/app/page-header'
import { SecoesDoFinanceiro } from '@/components/app/financeiro/secoes'
import { EstadoDoPedido } from '@/components/app/financeiro/compras/comum'
import { contextoDeCompras } from '@/lib/compras/servidor'
import { numeroDoPedido, type EstadoDoPedido as Estado } from '@/lib/compras/regras'
import { dataCurta, reais } from '@/lib/financeiro/regras'
import { tituloDaArea } from '@/lib/navegacao'
import { cn } from '@/lib/utils'

export const metadata = { title: tituloDaArea('/financeiro/compras') }
export const dynamic = 'force-dynamic'

type Aba = 'meus' | 'cotar' | 'aprovar' | 'todos'
const COLUNAS = 'id,entidade_id,ano,numero,titulo,estado,valor_estimado,valor_aprovado,necessario_ate,created_at,solicitante_id,setor_id,exige_diretoria,aprovado_fin_em,aprovado_dir_em'
type Linha = {
  id: string; entidade_id: string; ano: number; numero: number; titulo: string; estado: Estado; valor_estimado: number; valor_aprovado: number | null
  necessario_ate: string | null; created_at: string; solicitante_id: string | null; setor_id: string | null; exige_diretoria: boolean; aprovado_fin_em: string | null; aprovado_dir_em: string | null
}

/**
 * Pedidos de compra. Qualquer pessoa da Redação pede e acompanha os seus; quem
 * cota (Financeiro, nível "lançar") vê o que espera cotação; quem aprova
 * (nível "aprovar", e a Diretoria acima do limite) vê o que espera decisão.
 */
export default async function ComprasPage({ searchParams }: { searchParams: Promise<{ aba?: string }> }) {
  const sp = await searchParams
  const { context, supabase, nivel, empresa, empresas, pede, diretoria, regras } = await contextoDeCompras()
  const ws = context.workspace.id
  const eu = context.user.id
  const ent = empresa?.id ?? '00000000-0000-0000-0000-000000000000'

  const [{ data: meus }, { data: daEmpresa }, { data: emAprovacao }] = await Promise.all([
    supabase.from('compras_pedidos').select(COLUNAS).eq('workspace_id', ws).eq('solicitante_id', eu).order('created_at', { ascending: false }).limit(200),
    nivel >= 1
      ? supabase.from('compras_pedidos').select(COLUNAS).eq('workspace_id', ws).eq('entidade_id', ent).order('created_at', { ascending: false }).limit(300)
      : Promise.resolve({ data: [] as Linha[] }),
    // A Diretoria pode não ter nível no Financeiro: o RLS mostra a ela o que passa por ela.
    nivel >= 3 || diretoria
      ? supabase.from('compras_pedidos').select(COLUNAS).eq('workspace_id', ws).eq('estado', 'em_aprovacao').order('enviado_aprovacao_em').limit(200)
      : Promise.resolve({ data: [] as Linha[] }),
  ])
  const ler = (l: Linha[] | null) => (l ?? []).map((x) => ({ ...x, valor_estimado: Number(x.valor_estimado), valor_aprovado: x.valor_aprovado === null ? null : Number(x.valor_aprovado) })) as Linha[]
  const listas: Record<Aba, Linha[]> = {
    meus: ler(meus as Linha[]),
    cotar: nivel >= 2 ? ler(daEmpresa as Linha[]).filter((p) => p.estado === 'aberto' || p.estado === 'em_cotacao') : [],
    // Para aprovar: o que ainda espera a MINHA parte (o Financeiro, ou a Diretoria).
    aprovar: ler(emAprovacao as Linha[]).filter((p) => (nivel >= 3 && !p.aprovado_fin_em) || (diretoria && p.exige_diretoria && !p.aprovado_dir_em)).filter((p) => p.solicitante_id !== eu),
    todos: ler(daEmpresa as Linha[]),
  }
  const abas: { id: Aba; rotulo: string; mostra: boolean }[] = [
    { id: 'aprovar', rotulo: 'Para aprovar', mostra: nivel >= 3 || diretoria },
    { id: 'cotar', rotulo: 'Para cotar', mostra: nivel >= 2 },
    { id: 'meus', rotulo: 'Meus pedidos', mostra: true },
    { id: 'todos', rotulo: 'Todos', mostra: nivel >= 1 },
  ]
  const visiveis = abas.filter((a) => a.mostra)
  const pedida = visiveis.find((a) => a.id === sp.aba)?.id
  const aba: Aba = pedida ?? (listas.aprovar.length ? 'aprovar' : listas.cotar.length ? 'cotar' : 'meus')
  const lista = listas[aba]

  const pessoas = [...new Set(lista.map((p) => p.solicitante_id).filter(Boolean))] as string[]
  const setoresIds = [...new Set(lista.map((p) => p.setor_id).filter(Boolean))] as string[]
  const [{ data: perfis }, { data: setores }] = await Promise.all([
    pessoas.length ? supabase.from('profiles').select('id,full_name').in('id', pessoas) : Promise.resolve({ data: [] as { id: string; full_name: string }[] }),
    setoresIds.length ? supabase.from('setores').select('id,nome').in('id', setoresIds) : Promise.resolve({ data: [] as { id: string; nome: string }[] }),
  ])
  const nomeDe = new Map((perfis ?? []).map((p) => [p.id, p.full_name as string]))
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
        <nav className="flex flex-wrap gap-2" aria-label="Pedidos">
          {visiveis.map((a) => (
            <Link key={a.id} href={`/financeiro/compras?aba=${a.id}`} aria-current={aba === a.id ? 'page' : undefined}
              className={cn('rounded-lg border px-3 py-2 text-sm font-medium', aba === a.id ? 'border-primary bg-primary text-primary-foreground' : 'border-border bg-card text-muted-foreground hover:text-foreground')}>
              {a.rotulo}{a.id !== 'todos' && listas[a.id].length > 0 && <span className="ml-1.5 tabular-nums opacity-80">{listas[a.id].length}</span>}
            </Link>
          ))}
        </nav>
        {pede && <Button render={<Link href="/financeiro/compras/novo" />}><Plus className="size-4" />Novo pedido</Button>}
      </div>

      {lista.length === 0 ? (
        <Card className="flex flex-col items-center gap-2 p-10 text-center">
          <ShoppingCart className="size-8 text-muted-foreground" />
          <p className="font-medium">{aba === 'meus' ? 'Você ainda não pediu nenhuma compra.' : aba === 'aprovar' ? 'Nada esperando a sua aprovação.' : aba === 'cotar' ? 'Nenhum pedido esperando cotação.' : 'Nenhum pedido ainda.'}</p>
          <p className="max-w-md text-sm text-muted-foreground">
            Até {reais(regras.limite_simples)} basta uma proposta; acima disso, {regras.cotacoes_minimas} propostas; acima de {reais(regras.limite_diretoria)}, também a aprovação da Diretoria.
          </p>
        </Card>
      ) : (
        <ul className="flex flex-col gap-2" data-pedidos>
          {lista.map((p) => (
            <li key={p.id}>
              <Link href={`/financeiro/compras/${p.id}`} className="flex flex-wrap items-center gap-x-4 gap-y-1 rounded-xl border border-border bg-card p-4 hover:border-primary/40">
                <div className="min-w-0 flex-1">
                  <p className="flex flex-wrap items-center gap-2">
                    <span className="font-mono text-xs text-muted-foreground">{numeroDoPedido(p.ano, p.numero)}</span>
                    <span className="truncate font-medium">{p.titulo}</span>
                  </p>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {nomeDe.get(p.solicitante_id ?? '') ?? 'Alguém'}{p.setor_id && setorDe.get(p.setor_id) ? ` · ${setorDe.get(p.setor_id)}` : ''} · pedido em {dataCurta(p.created_at.slice(0, 10))}
                    {p.necessario_ate && ` · precisa até ${dataCurta(p.necessario_ate)}`}
                  </p>
                </div>
                <span className="text-sm font-medium tabular-nums">{p.valor_aprovado !== null ? reais(p.valor_aprovado) : p.valor_estimado ? `~ ${reais(p.valor_estimado)}` : '—'}</span>
                <EstadoDoPedido estado={p.estado} />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
