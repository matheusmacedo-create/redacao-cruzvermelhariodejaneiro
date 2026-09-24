import { randomBytes } from 'node:crypto'
import { NextResponse, type NextRequest } from 'next/server'
import { requirePermissao } from '@/lib/session'
import { clienteOAuth, urlDeAutorizacao } from '@/lib/google/gmail'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * Começa a conexão da conta do Google. Só administrador.
 *
 * O "state" vai num cookie httpOnly e volta pelo Google: na volta, se não
 * bater, a conexão é recusada. É o que impede alguém de fazer um admin
 * logado aceitar, sem saber, a autorização de OUTRA conta Google.
 */
export async function GET(request: NextRequest) {
  let workspaceId: string
  try { workspaceId = (await requirePermissao('integracoes.configurar')).workspace.id } catch {
    return NextResponse.redirect(new URL('/configuracoes?google=restrito', request.nextUrl.origin))
  }
  try {
    const { clientId } = await clienteOAuth(workspaceId)
    const estado = randomBytes(24).toString('hex')
    const res = NextResponse.redirect(urlDeAutorizacao(clientId, estado))
    res.cookies.set('google_oauth_estado', estado, {
      httpOnly: true, secure: true, sameSite: 'lax', path: '/api/google', maxAge: 600,
    })
    return res
  } catch (causa) {
    const motivo = causa instanceof Error ? causa.message : 'Não foi possível começar a conexão.'
    return NextResponse.redirect(new URL(`/configuracoes?google=erro&motivo=${encodeURIComponent(motivo)}`, request.nextUrl.origin))
  }
}
