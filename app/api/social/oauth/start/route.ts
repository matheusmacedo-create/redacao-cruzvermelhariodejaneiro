import { randomBytes } from 'node:crypto'
import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/session'
import { META_SCOPES, metaEnv } from '@/lib/meta/config'

/**
 * Passo 1 do "Conectar Facebook/Instagram".
 *
 * Só admin inicia a conexão — quem conecta o canal passa a poder publicar em
 * nome da Cruz Vermelha.
 *
 * O `state` é um valor aleatório guardado em cookie httpOnly e conferido no
 * callback: é o que impede alguém de forjar a volta do OAuth (CSRF).
 */

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET() {
  const context = await requireAdmin()

  const state = randomBytes(32).toString('base64url')
  const cookieStore = await cookies()
  cookieStore.set('cvrj_oauth_state', state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 600, // 10 minutos: tempo de sobra para concluir o login
  })
  // Amarra a conexão ao espaço em que o admin está.
  cookieStore.set('cvrj_oauth_workspace', context.workspace.id, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 600,
  })

  const url = new URL('https://www.facebook.com/v21.0/dialog/oauth')
  url.searchParams.set('client_id', metaEnv.appId)
  url.searchParams.set('redirect_uri', metaEnv.redirectUri)
  url.searchParams.set('state', state)
  url.searchParams.set('scope', META_SCOPES)
  url.searchParams.set('response_type', 'code')

  return NextResponse.redirect(url.toString())
}
