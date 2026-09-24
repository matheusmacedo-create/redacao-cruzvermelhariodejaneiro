import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ChevronLeft } from 'lucide-react'
import { Card } from '@/components/ui/card'
import { PageHeader } from '@/components/app/page-header'
import { hojeEmSaoPaulo } from '@/components/app/projetos/comum'
import { FormularioDeLancamento } from '@/components/app/financeiro/formulario'
import { cadastrosDoFinanceiro, contextoDoFinanceiro, lerLinha, nivelNaEmpresa } from '@/lib/financeiro/acesso'
import { COLUNAS_DO_LANCAMENTO, TIPOS, type Lancamento } from '@/lib/financeiro/regras'

export const metadata = { title: 'Editar lançamento' }
export const dynamic = 'force-dynamic'

export default async function EditarLancamento({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound()
  const ctx = await contextoDoFinanceiro()
  const { context, supabase } = ctx
  const { data } = await supabase.from('fin_lancamentos').select(COLUNAS_DO_LANCAMENTO).eq('id', id).eq('workspace_id', context.workspace.id).maybeSingle()
  if (!data) notFound()
  const l = lerLinha(data) as Lancamento
  if (nivelNaEmpresa(ctx, l.entidade_id) < 2) notFound()
  const cadastros = await cadastrosDoFinanceiro(l.entidade_id)
  const fechado = Boolean(l.pago_em && cadastros.config.fechado_ate && l.pago_em <= cadastros.config.fechado_ate)
  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6">
      <Link href={`/financeiro/${id}`} className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"><ChevronLeft className="size-4" />{l.descricao}</Link>
      <PageHeader title={`Editar ${TIPOS[l.tipo].rotulo.toLowerCase()}`} description={l.pago_em ? 'Já está paga: a data e o valor pagos mudam por "Desfazer pagamento".' : undefined} />
      <Card className="p-5 sm:p-6">
        {fechado
          ? <p className="text-sm text-muted-foreground">Este lançamento foi pago num mês já fechado e não muda mais.</p>
          : <FormularioDeLancamento cadastros={cadastros} hoje={hojeEmSaoPaulo()} l={l} emGrupo={Boolean(l.grupo_id)} />}
      </Card>
    </div>
  )
}
