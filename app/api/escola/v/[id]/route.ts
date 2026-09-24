import { createAdminClient } from '@/lib/supabase/admin'
import { ehRobo } from '@/lib/escola/advertoriais'

export const dynamic = 'force-dynamic'

// GIF transparente de 1×1.
const GIF = Buffer.from('R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7', 'base64')

/**
 * Pixel de visita dos advertoriais da escola (a matéria no site carrega esta
 * imagem). Sem cookie e sem guardar nada da pessoa: só soma 1 na visita do
 * dia. Robôs e pré-carregamentos não contam. Responde a imagem sempre —
 * falha na contagem não pode quebrar a página.
 */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const prefetch = (request.headers.get('purpose') ?? request.headers.get('sec-purpose') ?? '').includes('prefetch')
  if (/^[0-9a-f-]{36}$/.test(id) && !prefetch && !ehRobo(request.headers.get('user-agent'))) {
    await Promise.resolve(createAdminClient().rpc('escola_adv_contar', { p_peca_id: id, p_tipo: 'visita' })).catch(() => undefined)
  }
  return new Response(GIF, { headers: { 'Content-Type': 'image/gif', 'Cache-Control': 'no-store, max-age=0', 'Access-Control-Allow-Origin': '*' } })
}
