import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { ImageResponse } from 'next/og'
import { obterWorkspace } from '@/lib/session'
import { avaliaEnvios } from '@/lib/envios/servidor'
import { linkEQrDoEnvio } from '@/lib/envios/cartaz-servidor'
import { FORMATOS, lerOpcoes, nomeDoArquivo } from '@/lib/envios/cartaz'
import { Cartaz } from '@/components/envios/cartaz'

export const dynamic = 'force-dynamic'

const PASTA = join(process.cwd(), 'lib', 'pdf', 'fontes')
const fonte = (arquivo: string) => readFile(join(PASTA, arquivo)).then((b) => b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer)

/**
 * /api/envios/cartaz?formato=story&modelo=destaque… — o cartaz em PNG, para
 * baixar e mandar no grupo ou postar. Mesmo desenho da página /envios/cartaz
 * (components/envios/cartaz.tsx) e mesma regra de acesso (quem avalia os
 * envios). O A4 sai em 2× (1588 × 2246 px), para imprimir nítido.
 * As fontes e a logo entram no pacote da Vercel por outputFileTracingIncludes.
 */
export async function GET(req: Request) {
  const context = await obterWorkspace()
  if (!context) return new Response('Sessão expirada. Entre de novo.', { status: 401 })
  if (!(await avaliaEnvios(context.user.id, context.workspace.id))) return new Response('Sem acesso.', { status: 403 })

  const opcoes = lerOpcoes(new URL(req.url).searchParams)
  const escala = opcoes.formato === 'a4' ? 2 : 1
  const f = FORMATOS[opcoes.formato]
  const [{ qr, endereco }, logo, texto, negrito, titulo] = await Promise.all([
    linkEQrDoEnvio(),
    readFile(join(process.cwd(), 'public', 'images', 'logo-cvrj.png')),
    fonte('LibreFranklin_400Regular.ttf'),
    fonte('LibreFranklin_700Bold.ttf'),
    fonte('BarlowCondensed_700Bold.ttf'),
  ])

  return new ImageResponse(
    <Cartaz {...opcoes} qr={qr} logo={`data:image/png;base64,${logo.toString('base64')}`} endereco={endereco} escala={escala} fontes={{ texto: 'Libre Franklin', titulo: 'Barlow Condensed' }} />,
    {
      width: f.largura * escala,
      height: f.altura * escala,
      fonts: [
        { name: 'Libre Franklin', data: texto, weight: 400, style: 'normal' },
        { name: 'Libre Franklin', data: negrito, weight: 700, style: 'normal' },
        { name: 'Barlow Condensed', data: titulo, weight: 700, style: 'normal' },
      ],
      headers: { 'Content-Disposition': `attachment; filename="${nomeDoArquivo(opcoes)}"`, 'Cache-Control': 'private, no-store' },
    },
  )
}
