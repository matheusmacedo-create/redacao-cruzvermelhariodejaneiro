import { NextResponse, type NextRequest } from 'next/server'
import { obterContextoDoEmail } from '@/lib/email-provisorio/sessao'
import { lerPedidoDeAnexo, respostaDoAnexo } from '@/lib/correio/anexo'

export const dynamic = 'force-dynamic'

/** Um anexo no app de e-mail provisório: a sessão e a caixa daqui; o resto em lib/correio/anexo.ts. */
export async function GET(request: NextRequest) {
  const pedido = lerPedidoDeAnexo(request.nextUrl.searchParams)
  if (!pedido) return new NextResponse('Anexo não encontrado.', { status: 404 })
  const ctx = await obterContextoDoEmail()
  if (!ctx) return new NextResponse('Sessão expirada.', { status: 401 })
  const caixa = ctx.caixas.find((c) => c.id === pedido.caixaId)
  if (!caixa) return new NextResponse('Anexo não encontrado.', { status: 404 })
  return respostaDoAnexo(ctx.workspaceId, caixa, pedido)
}
