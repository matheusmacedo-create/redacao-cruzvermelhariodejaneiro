import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * O link rastreado das campanhas: registra o clique e leva ao destino.
 *
 * O destino vem do banco (o link da campanha), nunca da URL: aceitar o
 * endereço por parâmetro transformaria esta rota num redirecionador aberto,
 * com o domínio da Cruz Vermelha servindo de fachada para qualquer site.
 * Token desconhecido ou falha do banco levam ao site institucional — quem
 * clicou nunca fica numa página de erro.
 */

const TOKEN = /^[0-9a-f]{32}$/
const SITE = 'https://cruzvermelhariodejaneiro.org/'

export async function GET(_: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  let destino = SITE
  if (TOKEN.test(token)) {
    try {
      const { data, error } = await createAdminClient().rpc('registrar_clique_de_campanha', { p_token: token })
      if (error) console.error('[comunicados] clique não registrado:', error.message)
      if (typeof data === 'string' && /^https?:\/\//.test(data)) destino = data
    } catch (causa) {
      console.error('[comunicados] clique não registrado:', causa instanceof Error ? causa.message : causa)
    }
  }
  return NextResponse.redirect(destino, { status: 302, headers: { 'Cache-Control': 'no-store' } })
}
