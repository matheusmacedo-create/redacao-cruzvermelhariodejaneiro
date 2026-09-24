import { notFound } from 'next/navigation'
import { Card } from '@/components/ui/card'
import { PageHeader } from '@/components/app/page-header'
import { hojeEmSaoPaulo } from '@/components/app/projetos/comum'
import { SecoesDoPatrimonio } from '@/components/app/patrimonio/secoes'
import { FormularioDoBem } from '@/components/app/patrimonio/formulario'
import { cadastrosDoPatrimonio, contextoDoPatrimonio, COLUNAS_DO_BEM, lerBemDoBanco } from '@/lib/patrimonio/acesso'

export const metadata = { title: 'Editar bem' }
export const dynamic = 'force-dynamic'

export default async function EditarBem({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound()
  const { context, supabase, nivel } = await contextoDoPatrimonio()
  if (nivel < 2) notFound()
  const { data } = await supabase.from('pat_bens').select(COLUNAS_DO_BEM).eq('id', id).eq('workspace_id', context.workspace.id).maybeSingle()
  if (!data) notFound()
  const b = lerBemDoBanco(data)
  const c = await cadastrosDoPatrimonio()
  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6">
      <SecoesDoPatrimonio atual="/patrimonio" nivel={nivel} />
      <PageHeader title={`Editar ${b.plaqueta}`} description={b.nome} />
      <Card className="p-5 sm:p-6">
        {b.situacao === 'baixado' ? <p className="text-sm text-muted-foreground">Este bem foi baixado e não muda mais.</p> : <FormularioDoBem c={c} b={b} hoje={hojeEmSaoPaulo()} />}
      </Card>
    </div>
  )
}
