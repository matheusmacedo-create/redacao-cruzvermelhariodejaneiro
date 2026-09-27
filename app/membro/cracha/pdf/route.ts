import { sessaoDoMembro } from '@/lib/membro/sessao'
import { urlDaEntrada } from '@/lib/membro/regras'
import { crachaDoMembro, bytesDaFoto } from '@/lib/cracha/servidor'
import { gerarPdfDoCracha } from '@/lib/cracha/pdf'
import { logoOficial } from '@/lib/pdf/logo'

export const dynamic = 'force-dynamic'

/** /membro/cracha/pdf — o crachá do voluntário da sessão, para imprimir. */
export async function GET(request: Request) {
  const m = await sessaoDoMembro()
  // Sem sessão, volta depois para o perfil (e não para o PDF), como nos certificados.
  if (!m) return Response.redirect(new URL(urlDaEntrada('/membro/perfil'), request.url), 303)
  const c = await crachaDoMembro(m)
  if (!c) return new Response('Crachá indisponível na visualização geral.', { status: 404 })
  const pdf = await gerarPdfDoCracha({ ...c, foto: await bytesDaFoto(c.fotoCaminho), logo: await logoOficial() })
  return new Response(Buffer.from(pdf), { headers: { 'Content-Type': 'application/pdf', 'Content-Disposition': 'inline; filename="cracha-funcional.pdf"', 'Cache-Control': 'private, no-store' } })
}
