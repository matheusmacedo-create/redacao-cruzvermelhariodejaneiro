import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'
import { publicSupabaseEnv, SupabaseConfigError } from '@/lib/supabase/env'

export async function proxy(request: NextRequest) {
  const { url, key, missing, invalid } = publicSupabaseEnv()

  // O proxy roda em toda requisição. Se ele lançar por falta de variável, o
  // site inteiro devolve 500 sem dizer o motivo — inclusive a página que
  // explicaria o problema. Sem credenciais, segue sem renovar a sessão.
  if (missing.length || invalid.length) {
    console.error('[proxy] Supabase não configurado.', new SupabaseConfigError(missing, invalid).message)
    return NextResponse.next({ request })
  }

  let response = NextResponse.next({ request })
  const supabase = createServerClient(url!, key!, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
        response = NextResponse.next({ request })
        cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options))
      },
    },
  })

  try {
    await supabase.auth.getUser()
  } catch (cause) {
    // Supabase fora do ar não pode derrubar o site inteiro: as páginas já
    // tratam a ausência de sessão redirecionando para o login.
    console.error('[proxy] falha ao renovar a sessão:', cause instanceof Error ? cause.message : cause)
  }

  return response
}

export const config = { matcher: ['/((?!_next/static|_next/image|favicon.ico|images/).*)'] }
