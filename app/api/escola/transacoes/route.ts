import { contextoDaEscola, transacoesDesde } from '@/lib/escola/servidor'
import { filtrarTransacoes, lerFiltro, mesDe, transacoesDoMes } from '@/lib/escola/painel'
import { csv } from '@/lib/financeiro/fechamento'
import { METODOS, SITUACOES } from '@/lib/escola/unicopag'

export const dynamic = 'force-dynamic'

const dataHora = (iso: string | null) => (iso ? new Date(iso).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' }) : '')

/** A planilha das transações do mês (com os filtros da tela), para o contador conferir com o repasse. */
export async function GET(request: Request) {
  const { context, supabase, nivel } = await contextoDaEscola()
  if (nivel < 2) return new Response('Sem acesso.', { status: 403 })
  const ws = context.workspace.id
  const f = lerFiltro(Object.fromEntries(new URL(request.url).searchParams), mesDe(new Date().toISOString()))
  const [{ data: contas }, ts] = await Promise.all([
    supabase.from('escola_contas').select('id,nome').eq('workspace_id', ws),
    transacoesDesde(supabase, ws, new Date(`${f.mes}-01T03:00:00Z`).toISOString()),
  ])
  const nome = new Map((contas ?? []).map((c) => [c.id as string, c.nome as string]))
  const lista = filtrarTransacoes(transacoesDoMes(ts, f.mes), f)
  const corpo = csv(
    ['Conta', 'Código', 'Criada em', 'Paga em', 'Situação', 'Status Únicopag', 'Forma', 'Parcelas', 'Valor (R$)', 'Curso', 'Pagador', 'CPF (mascarado)', 'Origem'],
    lista.map((t) => [nome.get(t.conta_id) ?? '', t.hash, dataHora(t.criada_em), dataHora(t.paga_em), SITUACOES[t.situacao].rotulo, t.status, METODOS[t.metodo], t.parcelas ? String(t.parcelas) : '', t.valor / 100, t.produto, t.cliente, t.documento, t.origem]),
  )
  return new Response(corpo, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="escola-transacoes-${f.mes}.csv"`,
      'Cache-Control': 'no-store',
    },
  })
}
