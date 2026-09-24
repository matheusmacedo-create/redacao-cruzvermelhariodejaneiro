import { notFound } from 'next/navigation'
import { Card } from '@/components/ui/card'
import { PageHeader } from '@/components/app/page-header'
import { SecoesDoPatrimonio } from '@/components/app/patrimonio/secoes'
import { FormularioDoItem, type ItemParaMovimento } from '@/components/app/patrimonio/estoque'
import { cadastrosDoPatrimonio, contextoDoPatrimonio, COLUNAS_DO_ITEM, lerItemDoBanco } from '@/lib/patrimonio/acesso'

export const metadata = { title: 'Editar material' }
export const dynamic = 'force-dynamic'

export default async function EditarMaterial({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound()
  const { context, supabase, nivel } = await contextoDoPatrimonio()
  if (nivel < 2) notFound()
  const ws = context.workspace.id
  const [{ data: bruto }, { data: itens }, { data: composicao }] = await Promise.all([
    supabase.from('est_itens').select(COLUNAS_DO_ITEM).eq('id', id).eq('workspace_id', ws).maybeSingle(),
    supabase.from('est_itens').select('id,codigo,nome,unidade,controla_validade,eh_kit').eq('workspace_id', ws).eq('ativo', true).order('nome').limit(5000),
    supabase.from('est_composicao').select('componente_id,quantidade').eq('kit_id', id),
  ])
  if (!bruto) notFound()
  const i = lerItemDoBanco(bruto)
  const c = await cadastrosDoPatrimonio()
  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6">
      <SecoesDoPatrimonio atual="/patrimonio/estoque" nivel={nivel} />
      <PageHeader title={`Editar ${i.codigo}`} description={i.nome} />
      <Card className="p-5 sm:p-6">
        <FormularioDoItem i={i} categorias={c.estCategorias.filter((k) => k.ativa || k.id === i.categoria_id)} itens={(itens ?? []) as ItemParaMovimento[]}
          componentes={(composicao ?? []).map((x) => ({ item_id: x.componente_id as string, quantidade: Number(x.quantidade) }))} podeArquivar={nivel >= 3} />
      </Card>
    </div>
  )
}
