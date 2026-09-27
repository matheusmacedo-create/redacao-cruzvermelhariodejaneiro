import { obterWorkspace } from '@/lib/session'
import { crachaDaConta, bytesDaFoto } from '@/lib/cracha/servidor'
import { gerarPdfDoCracha } from '@/lib/cracha/pdf'
import { logoOficial } from '@/lib/pdf/logo'

export const dynamic = 'force-dynamic'

/** /api/cracha/pdf — o crachá de quem está no Palácio Virtual, para imprimir. Sempre o da própria sessão. */
export async function GET() {
  const context = await obterWorkspace({ escola: true })
  if (!context) return new Response('Sessão expirada. Entre de novo.', { status: 401 })
  const c = await crachaDaConta(context.user.id, context.workspace.id)
  const pdf = await gerarPdfDoCracha({ ...c, foto: await bytesDaFoto(c.fotoCaminho), logo: await logoOficial() })
  return new Response(Buffer.from(pdf), { headers: { 'Content-Type': 'application/pdf', 'Content-Disposition': 'inline; filename="cracha-funcional.pdf"', 'Cache-Control': 'private, no-store' } })
}
