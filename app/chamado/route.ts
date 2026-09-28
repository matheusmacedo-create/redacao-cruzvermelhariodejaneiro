import { NextResponse, type NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { ehSlugDaFila, formularioDaFila } from '@/lib/chamados/cartaz'

export const dynamic = 'force-dynamic'

/**
 * O endereço do QR do cartaz de chamados (/chamados/cartaz). Com sessão, abre
 * "Abrir chamado" já na fila; sem, passa pela entrada e volta para lá
 * (?voltar=, conferido em lib/chamados/cartaz.ts). Fila desconhecida vira o
 * formulário comum, onde a pessoa escolhe.
 */
export async function GET(request: NextRequest) {
  const fila = request.nextUrl.searchParams.get('fila')
  const destino = ehSlugDaFila(fila) ? formularioDaFila(fila) : '/chamados/novo'
  let logado = false
  try {
    const { data } = await (await createClient()).auth.getClaims()
    logado = Boolean(data?.claims?.sub)
  } catch { /* sem sessão legível: vai pela entrada */ }
  const url = new URL(logado ? destino : `/?voltar=${encodeURIComponent(destino)}`, request.url)
  return NextResponse.redirect(url, { status: 302, headers: { 'Cache-Control': 'no-store' } })
}
