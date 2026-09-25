import { contextoDeCompras } from '@/lib/compras/servidor'
import { dadosDoRelatorio, ehMes } from '@/lib/compras/relatorio'
import { relatorioDeCompras } from '@/lib/compras/relatorio-pdf'
import { nivelNaEmpresa } from '@/lib/financeiro/acesso'
import { createAdminClient } from '@/lib/supabase/admin'

export const dynamic = 'force-dynamic'

/** O relatório público de compras do mês (PDF), para o portal de transparência. Quem vê o Financeiro da empresa. */
export async function GET(request: Request) {
  const url = new URL(request.url)
  const mes = url.searchParams.get('mes')
  const empresaId = url.searchParams.get('empresa') ?? ''
  if (!ehMes(mes)) return new Response('Mês inválido.', { status: 400 })
  const ctx = await contextoDeCompras()
  const empresa = ctx.empresas.find((e) => e.id === empresaId)
  if (!empresa || nivelNaEmpresa(ctx, empresa.id) < 1) return new Response('Sem acesso ao Financeiro desta empresa.', { status: 403 })
  const dados = await dadosDoRelatorio(createAdminClient(), ctx.context.workspace.id, empresa, mes, ctx.regras)
  const pdf = await relatorioDeCompras(dados)
  return new Response(Buffer.from(pdf), {
    headers: {
      'Content-Type': 'application/pdf', 'Content-Disposition': `inline; filename="compras-${mes}.pdf"`,
      'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff',
    },
  })
}
