import { notFound } from 'next/navigation'
import { Card } from '@/components/ui/card'
import { PageHeader } from '@/components/app/page-header'
import { SecoesDoPatrimonio } from '@/components/app/patrimonio/secoes'
import { FormularioDoItem, type ItemParaMovimento } from '@/components/app/patrimonio/estoque'
import { cadastrosDoPatrimonio, contextoDoPatrimonio } from '@/lib/patrimonio/acesso'

export const metadata = { title: 'Novo material' }
export const dynamic = 'force-dynamic'

export default async function NovoMaterial() {
  const { context, supabase, nivel } = await contextoDoPatrimonio()
  if (nivel < 2) notFound()
  const c = await cadastrosDoPatrimonio()
  const { data: itens } = await supabase.from('est_itens').select('id,codigo,nome,unidade,controla_validade,eh_kit').eq('workspace_id', context.workspace.id).eq('ativo', true).order('nome').limit(5000)
  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6">
      <SecoesDoPatrimonio atual="/patrimonio/estoque" nivel={nivel} />
      <PageHeader title="Novo material" description="Um material de consumo ou um kit. O código (MAT-00001…) é gerado ao salvar; a quantidade entra depois, pela Entrada." />
      <Card className="p-5 sm:p-6">
        <FormularioDoItem categorias={c.estCategorias.filter((k) => k.ativa)} itens={(itens ?? []) as ItemParaMovimento[]} />
      </Card>
    </div>
  )
}
