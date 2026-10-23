import { randomBytes } from 'node:crypto'
import { NextResponse, type NextRequest } from 'next/server'
import { requirePermissao } from '@/lib/session'
import { clienteOAuth, urlDeAutorizacao } from '@/lib/google/gmail'
import { ESCOPOS_ADMIN } from '@/lib/google/diretorio'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * Começa a conexão da conta de ADMINISTRADOR do Google Workspace, a que cria
 * usuários e põe em grupos (lib/google/diretorio.ts). Mesmo cliente OAuth e
 * mesma volta (/api/google/retorno) da conexão do Gmail; o que distingue é o
 * "state", que aqui começa com "admin.": na volta, a autorização vai para o
 * cofre como google_admin, e não como google_gmail. O cookie com o state é o
 * que impede alguém de fazer um admin logado aceitar, sem saber, a
 * autorização de OUTRA conta Google.
 */
export async function GET(request: NextRequest) {
  let workspaceId: string
  try { workspaceId = (await requirePermissao('integracoes.configurar')).workspace.id } catch {
    return NextResponse.redirect(new URL('/configuracoes/email?google_admin=restrito', request.nextUrl.origin))
  }
  try {
    const { clientId } = await clienteOAuth(workspaceId)
    const estado = `admin.${randomBytes(24).toString('hex')}`
    const res = NextResponse.redirect(urlDeAutorizacao(clientId, estado, ESCOPOS_ADMIN, { somenteEstes: true }))
    res.cookies.set('google_oauth_estado', estado, {
      httpOnly: true, secure: true, sameSite: 'lax', path: '/api/google', maxAge: 600,
    })
    return res
  } catch (causa) {
    const motivo = causa instanceof Error ? causa.message : 'Não foi possível começar a conexão.'
    return NextResponse.redirect(new URL(`/configuracoes/email?google_admin=erro&motivo=${encodeURIComponent(motivo)}`, request.nextUrl.origin))
  }
}
