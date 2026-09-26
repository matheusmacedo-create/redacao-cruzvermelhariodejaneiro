import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import { Card } from '@/components/ui/card'
import { PageHeader } from '@/components/app/page-header'
import { FormularioDoPedido } from '@/components/app/financeiro/compras/formulario'
import { contextoDeCompras, opcoesDoFormulario } from '@/lib/compras/servidor'
import { reais } from '@/lib/financeiro/regras'
import { tituloDaArea } from '@/lib/navegacao'

export const metadata = { title: `Novo pedido — ${tituloDaArea('/financeiro/compras')}` }
export const dynamic = 'force-dynamic'

export default async function NovoPedidoPage() {
  const ctx = await contextoDeCompras()
  const voltar = <Link href="/financeiro/compras" className="mb-3 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"><ArrowLeft className="size-4" />Pedidos de compra</Link>
  if (!ctx.pede) {
    return <div>{voltar}<Card className="p-6 text-sm">Pedidos de compra são abertos pela equipe do Palácio Virtual.</Card></div>
  }
  const classificar = ctx.nivel >= 2
  const o = await opcoesDoFormulario(ctx, null, classificar)
  return (
    <div className="mx-auto max-w-4xl">
      {voltar}
      <PageHeader title="Novo pedido de compra"
        description={`O Financeiro cota com os fornecedores e manda para aprovação. Até ${reais(ctx.regras.limite_simples)} basta uma proposta; acima, ${ctx.regras.cotacoes_minimas}; acima de ${reais(ctx.regras.limite_diretoria)}, também a Diretoria aprova.`} />
      <FormularioDoPedido setores={o.setores} projetos={o.projetos} setorPadrao={o.setorPadrao} classificar={classificar} categorias={o.categorias} fontes={o.fontes}
        empresa={classificar && ctx.empresa ? { id: ctx.empresa.id, nome: ctx.empresa.nome, varias: ctx.empresas.length > 1 } : null} />
    </div>
  )
}
