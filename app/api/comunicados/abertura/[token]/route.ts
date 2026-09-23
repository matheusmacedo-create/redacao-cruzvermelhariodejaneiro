import { createAdminClient } from '@/lib/supabase/admin'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * O pixel de abertura das campanhas do banco de contatos.
 *
 * Responde SEMPRE a mesma imagem de 1×1, com token válido ou não, com banco
 * de pé ou não: quem abre o e-mail não pode ver imagem quebrada por causa de
 * uma falha nossa, e a resposta não pode servir para alguém descobrir quais
 * tokens existem.
 *
 * Abertura é estimativa — ver a nota 4 da migração de campanhas.
 */

const GIF = Buffer.from('R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7', 'base64')
const TOKEN = /^[0-9a-f]{32}$/

export async function GET(_: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const limpo = token.replace(/\.gif$/, '')

  if (TOKEN.test(limpo)) {
    try {
      const { error } = await createAdminClient().rpc('registrar_abertura_de_campanha', { p_token: limpo })
      if (error) console.error('[comunicados] abertura não registrada:', error.message)
    } catch (causa) {
      console.error('[comunicados] abertura não registrada:', causa instanceof Error ? causa.message : causa)
    }
  }

  return new Response(GIF, {
    headers: {
      'Content-Type': 'image/gif',
      'Content-Length': String(GIF.length),
      // Sem cache em lugar nenhum: cada carregamento precisa chegar aqui.
      'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0',
    },
  })
}
