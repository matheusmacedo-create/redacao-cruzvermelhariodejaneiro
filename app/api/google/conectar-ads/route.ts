import { randomBytes } from 'node:crypto'
import { NextResponse, type NextRequest } from 'next/server'
import { requirePermissao } from '@/lib/session'
import { urlDeAutorizacao } from '@/lib/google/gmail'
import { clienteDoAds } from '@/lib/google/ads'
import { ESCOPOS_ADS } from '@/lib/google/ads-regras'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * Começa a conexão do Google Ads da filial (lib/google/ads.ts): a conta do Ad Grants onde rodam as campanhas que
 * levam ao site. Mesmo cliente OAuth e mesma volta (/api/google/retorno) das outras conexões Google; o que distingue
 * é o "state", que aqui começa com "ads.": na volta, a autorização vai para o cofre como google_ads. Escopos só os
 * do Ads (mais o e-mail, para saber qual conta autorizou), sem somar o que a mesma conta já autorizou no Gmail
 * (somenteEstes). O cookie com o state é o que impede alguém de fazer um admin logado aceitar, sem saber, a
 * autorização de OUTRA conta Google.
 */
export async function GET(request: NextRequest) {
  let workspaceId: string
  try { workspaceId = (await requirePermissao('integracoes.configurar')).workspace.id } catch {
    return NextResponse.redirect(new URL('/configuracoes/email?google_ads=restrito', request.nextUrl.origin))
  }
  try {
    // O cliente do Google Ads (o próprio, se houver): a volta troca o código com o mesmo cliente.
    const { clientId } = await clienteDoAds(workspaceId)
    const estado = `ads.${randomBytes(24).toString('hex')}`
    const res = NextResponse.redirect(urlDeAutorizacao(clientId, estado, ESCOPOS_ADS, { somenteEstes: true }))
    res.cookies.set('google_oauth_estado', estado, {
      httpOnly: true, secure: true, sameSite: 'lax', path: '/api/google', maxAge: 600,
    })
    return res
  } catch (causa) {
    const motivo = causa instanceof Error ? causa.message : 'Não foi possível começar a conexão.'
    return NextResponse.redirect(new URL(`/configuracoes/email?google_ads=erro&motivo=${encodeURIComponent(motivo)}`, request.nextUrl.origin))
  }
}
