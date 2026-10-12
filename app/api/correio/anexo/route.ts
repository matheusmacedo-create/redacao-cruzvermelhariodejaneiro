import { NextResponse, type NextRequest } from 'next/server'
import { obterWorkspace } from '@/lib/session'
import { caixasVisiveis } from '@/lib/correio/caixa-de-entrada'
import { lerPedidoDeAnexo, respostaDoAnexo } from '@/lib/correio/anexo'

export const dynamic = 'force-dynamic'

/**
 * Um anexo de um e-mail da caixa do setor. Confere a sessão e se a pessoa vê
 * a caixa; o resto (a mensagem é da caixa, a parte é um anexo) fica em
 * lib/correio/anexo.ts, o mesmo do app de e-mail provisório.
 */
export async function GET(request: NextRequest) {
  const pedido = lerPedidoDeAnexo(request.nextUrl.searchParams)
  if (!pedido) return new NextResponse('Anexo não encontrado.', { status: 404 })
  const context = await obterWorkspace()
  if (!context) return new NextResponse('Sessão expirada.', { status: 401 })
  const caixa = (await caixasVisiveis(context)).find((c) => c.id === pedido.caixaId)
  if (!caixa) return new NextResponse('Anexo não encontrado.', { status: 404 })
  return respostaDoAnexo(context.workspace.id, caixa, pedido)
}
