import { randomBytes } from 'node:crypto'
import { NextResponse, type NextRequest } from 'next/server'
import { requirePermissao } from '@/lib/session'
import { clienteOAuth, urlDeAutorizacao } from '@/lib/google/gmail'
import { ESCOPOS_DO_DRIVE } from '@/lib/arquivos/regras'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * Começa a conexão do Google Drive dos Arquivos do setor (lib/google/drive.ts).
 * Mesmo cliente OAuth e mesma volta (/api/google/retorno) das outras duas
 * conexões; o "state" começa com "drive.", e na volta a autorização vai para
 * o cofre como google_drive. O cookie com o state impede que alguém faça um
 * admin logado aceitar, sem saber, a autorização de OUTRA conta Google.
 */
export async function GET(request: NextRequest) {
  let workspaceId: string
  try { workspaceId = (await requirePermissao('arquivos.configurar')).workspace.id } catch {
    return NextResponse.redirect(new URL('/arquivos?drive=restrito', request.nextUrl.origin))
  }
  try {
    const { clientId } = await clienteOAuth(workspaceId)
    const estado = `drive.${randomBytes(24).toString('hex')}`
    const res = NextResponse.redirect(urlDeAutorizacao(clientId, estado, ESCOPOS_DO_DRIVE))
    res.cookies.set('google_oauth_estado', estado, {
      httpOnly: true, secure: true, sameSite: 'lax', path: '/api/google', maxAge: 600,
    })
    return res
  } catch (causa) {
    const motivo = causa instanceof Error ? causa.message : 'Não foi possível começar a conexão.'
    return NextResponse.redirect(new URL(`/arquivos?drive=erro&motivo=${encodeURIComponent(motivo)}`, request.nextUrl.origin))
  }
}
