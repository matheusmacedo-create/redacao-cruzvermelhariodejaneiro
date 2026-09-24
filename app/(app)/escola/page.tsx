import { notFound } from 'next/navigation'
import { PainelDaEscola } from '@/components/app/escola/painel'
import { COLUNAS_DA_CONTA, contextoDaEscola, lerConta, transacoesDesde } from '@/lib/escola/servidor'
import { ehMes, mesDe, mesesAte, somarMeses } from '@/lib/escola/painel'

export const metadata = { title: 'Escola' }
export const dynamic = 'force-dynamic'
export const maxDuration = 60

/** O painel da Escola (components/app/escola/painel.tsx) com os dados do mês. */
export default async function EscolaPage({ searchParams }: { searchParams: Promise<{ mes?: string }> }) {
  const { context, supabase, nivel } = await contextoDaEscola()
  if (nivel < 2) notFound()
  const ws = context.workspace.id
  const hoje = mesDe(new Date().toISOString())
  const pedido = (await searchParams).mes
  const mes = ehMes(pedido) && pedido <= hoje ? pedido : hoje
  const meses = mesesAte(mes, 12)
  const desde = new Date(`${somarMeses(meses[0], -1)}-01T03:00:00Z`).toISOString()
  const [{ data: contas }, ts] = await Promise.all([
    supabase.from('escola_contas').select(COLUNAS_DA_CONTA).eq('workspace_id', ws).order('ativa', { ascending: false }).order('nome'),
    transacoesDesde(supabase, ws, desde),
  ])
  return <PainelDaEscola contas={(contas ?? []).map((c) => lerConta(c))} ts={ts} mes={mes} meses={meses} hoje={hoje} nivel={nivel} />
}
