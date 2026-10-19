import { randomBytes } from 'node:crypto'
import { NextResponse, type NextRequest } from 'next/server'
import { requirePermissao } from '@/lib/session'
import { clienteOAuth, urlDeAutorizacao } from '@/lib/google/gmail'
import { ESCOPOS_DRIVE } from '@/lib/google/drive'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * Começa a conexão do Google Drive da filial (lib/google/drive.ts): a cópia dos envios do WhatsApp e os documentos
 * guardados por lá. Mesmo cliente OAuth e mesma volta (/api/google/retorno) das outras conexões Google; o que
 * distingue é o "state", que aqui começa com "drive.": na volta, a autorização vai para o cofre como google_drive.
 * Escopo único, drive.file, sem somar o que a mesma conta já autorizou no Gmail (somenteEstes). O cookie com o state
 * é o que impede alguém de fazer um admin logado aceitar, sem saber, a autorização de OUTRA conta Google.
 */
export async function GET(request: NextRequest) {
  let workspaceId: string
  try { workspaceId = (await requirePermissao('integracoes.configurar')).workspace.id } catch {
    return NextResponse.redirect(new URL('/configuracoes/email?google_drive=restrito', request.nextUrl.origin))
  }
  try {
    const { clientId } = await clienteOAuth(workspaceId)
    const estado = `drive.${randomBytes(24).toString('hex')}`
    const res = NextResponse.redirect(urlDeAutorizacao(clientId, estado, ESCOPOS_DRIVE, { somenteEstes: true }))
    res.cookies.set('google_oauth_estado', estado, {
      httpOnly: true, secure: true, sameSite: 'lax', path: '/api/google', maxAge: 600,
    })
    return res
  } catch (causa) {
    const motivo = causa instanceof Error ? causa.message : 'Não foi possível começar a conexão.'
    return NextResponse.redirect(new URL(`/configuracoes/email?google_drive=erro&motivo=${encodeURIComponent(motivo)}`, request.nextUrl.origin))
  }
}
