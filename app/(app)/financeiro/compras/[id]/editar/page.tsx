import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { ArrowLeft } from 'lucide-react'
import { PageHeader } from '@/components/app/page-header'
import { FormularioDoPedido } from '@/components/app/financeiro/compras/formulario'
import { contextoDeCompras, opcoesDoFormulario } from '@/lib/compras/servidor'
import { numeroDoPedido } from '@/lib/compras/regras'
import { nivelNaEmpresa } from '@/lib/financeiro/acesso'

export const dynamic = 'force-dynamic'

export default async function EditarPedidoPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound()
  const ctx = await contextoDeCompras()
  const [{ data: p }, { data: itens }] = await Promise.all([
    ctx.supabase.from('compras_pedidos').select('id,entidade_id,ano,numero,titulo,justificativa,setor_id,projeto_id,necessario_ate,local_entrega,categoria_id,fonte_id,estado,solicitante_id')
      .eq('id', id).eq('workspace_id', ctx.context.workspace.id).maybeSingle(),
    ctx.supabase.from('compras_itens').select('id,descricao,especificacao,quantidade,unidade,valor_estimado_unit').eq('pedido_id', id).order('ordem'),
  ])
  if (!p) notFound()
  const nivel = nivelNaEmpresa(ctx, p.entidade_id)
  // A mesma regra do banco (compras_salvar_pedido): quem pediu, até começar a cotação; o Financeiro, até mandar para aprovação.
  const pode = (p.estado === 'aberto' && (p.solicitante_id === ctx.context.user.id || nivel >= 2)) || (p.estado === 'em_cotacao' && nivel >= 2)
  if (!pode) redirect(`/financeiro/compras/${id}`)
  const classificar = nivel >= 2
  const o = await opcoesDoFormulario(ctx, p.entidade_id, classificar)
  return (
    <div className="mx-auto max-w-4xl">
      <Link href={`/financeiro/compras/${id}`} className="mb-3 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"><ArrowLeft className="size-4" />{numeroDoPedido(p.ano, p.numero)}</Link>
      <PageHeader title="Alterar pedido" description={p.estado === 'em_cotacao' ? 'Tirar um item apaga os preços dele nas propostas já registradas.' : 'Enquanto ninguém começou a cotar, dá para mudar tudo.'} />
      <FormularioDoPedido classificar={classificar} setores={o.setores} projetos={o.projetos} categorias={o.categorias} fontes={o.fontes}
        inicial={{ ...p, itens: (itens ?? []).map((i) => ({ ...i, quantidade: Number(i.quantidade), valor_estimado_unit: i.valor_estimado_unit === null ? null : Number(i.valor_estimado_unit) })) }} />
    </div>
  )
}
