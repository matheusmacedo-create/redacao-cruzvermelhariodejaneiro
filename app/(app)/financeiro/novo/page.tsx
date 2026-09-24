import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ChevronLeft } from 'lucide-react'
import { Card } from '@/components/ui/card'
import { PageHeader } from '@/components/app/page-header'
import { hojeEmSaoPaulo } from '@/components/app/projetos/comum'
import { FormularioDeLancamento } from '@/components/app/financeiro/formulario'
import { cadastrosDoFinanceiro, contextoDoFinanceiro } from '@/lib/financeiro/acesso'
import { ehTipo } from '@/lib/financeiro/regras'

export const metadata = { title: 'Novo lançamento' }
export const dynamic = 'force-dynamic'

export default async function NovoLancamento({ searchParams }: { searchParams: Promise<{ tipo?: string }> }) {
  const { tipo } = await searchParams
  const { nivel } = await contextoDoFinanceiro()
  if (nivel < 2) notFound()
  const cadastros = await cadastrosDoFinanceiro()
  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6">
      <Link href="/financeiro" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"><ChevronLeft className="size-4" />Financeiro</Link>
      <PageHeader title={`Novo lançamento${cadastros.empresa && !cadastros.empresa.principal ? ` · ${cadastros.empresa.nome}` : ''}`} description="Uma despesa, uma receita ou uma transferência entre contas. Parcelas e contas mensais são criadas de uma vez." />
      <Card className="p-5 sm:p-6"><FormularioDeLancamento cadastros={cadastros} hoje={hojeEmSaoPaulo()} tipoInicial={ehTipo(tipo) ? tipo : 'despesa'} /></Card>
    </div>
  )
}
