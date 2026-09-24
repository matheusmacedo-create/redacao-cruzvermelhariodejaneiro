import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { chaveDoAdvertorial, ehRobo, montarDestino } from '@/lib/escola/advertoriais'

export const dynamic = 'force-dynamic'

/** Sem destino (peça apagada, banco fora do ar): a home do site, nunca uma página de erro. */
const reserva = () => {
  try { return new URL(process.env.SITE_PUBLIC_BASE_URL ?? '').origin + '/' } catch { return 'https://cruzvermelhariodejaneiro.org/' }
}

/**
 * O botão de matrícula dos advertoriais: conta o clique e segue para a
 * página de matrícula cadastrada no advertorial, com as UTMs do anúncio que
 * trouxe a pessoa e utm_content = o advertorial. O destino vem sempre do
 * banco — o endereço da requisição só contribui com as UTMs (sem redirecionar
 * para qualquer lugar que alguém digitar).
 */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  if (!/^[0-9a-f-]{36}$/.test(id)) return NextResponse.redirect(reserva(), 302)
  const robo = ehRobo(request.headers.get('user-agent'))
  let info: { destino?: string | null; slug?: string | null; utm_campaign?: string | null } | null = null
  try {
    // Robô também precisa do destino, mas não conta como clique.
    const admin = createAdminClient()
    if (robo) {
      const { data } = await admin.from('escola_pecas').select('destino_url,content_pieces(slug),escola_campanhas(utm_campaign)').eq('id', id).eq('tipo', 'advertorial').maybeSingle()
      const um = <T,>(x: T | T[] | null | undefined) => (Array.isArray(x) ? x[0] : x) ?? null
      if (data) info = { destino: data.destino_url as string | null, slug: um(data.content_pieces as unknown as { slug: string | null } | null)?.slug ?? null, utm_campaign: um(data.escola_campanhas as unknown as { utm_campaign: string | null } | null)?.utm_campaign ?? null }
    } else {
      const { data } = await admin.rpc('escola_adv_contar', { p_peca_id: id, p_tipo: 'clique' })
      info = data as typeof info
    }
  } catch {
    info = null
  }
  const destino = info?.destino ? montarDestino(info.destino, new URL(request.url).searchParams, { chave: chaveDoAdvertorial(info.slug ?? null, id), utmCampaign: info.utm_campaign ?? null }) : null
  return NextResponse.redirect(destino ?? reserva(), { status: 302, headers: { 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer-when-downgrade' } })
}
