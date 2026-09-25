import { obterWorkspace } from '@/lib/session'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { dadosDaOrdem } from '@/lib/compras/ordem'
import { ordemDeCompra } from '@/lib/compras/ordem-pdf'

export const dynamic = 'force-dynamic'

/** O PDF da ordem de compra. Vê quem vê o pedido (o RLS decide); o documento é montado na hora. */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  if (!/^[0-9a-f-]{36}$/.test(id)) return new Response('Ordem não encontrada.', { status: 404 })
  const context = await obterWorkspace({ escola: true })
  if (!context) return new Response('Faça login.', { status: 401 })
  const supabase = await createClient()
  const { data: visivel } = await supabase.from('compras_pedidos').select('id').eq('id', id).eq('workspace_id', context.workspace.id).maybeSingle()
  if (!visivel) return new Response('Ordem não encontrada.', { status: 404 })
  const ordem = await dadosDaOrdem(createAdminClient(), context.workspace.id, id)
  if (!ordem) return new Response('Esta compra ainda não tem ordem emitida.', { status: 404 })
  const pdf = await ordemDeCompra(ordem.dados)
  return new Response(Buffer.from(pdf), {
    headers: {
      'Content-Type': 'application/pdf', 'Content-Disposition': `inline; filename="${ordem.codigo}.pdf"`,
      'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff',
    },
  })
}
