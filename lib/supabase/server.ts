import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { publicSupabaseEnv, SupabaseConfigError } from './env'

export async function createClient() {
  // cookies() antes da checagem: é ele que marca a rota como dinâmica. Lançar
  // antes faria o Next tentar pré-renderizar as páginas e quebrar o build.
  const cookieStore = await cookies()
  const { url, key, missing, invalid } = publicSupabaseEnv()
  if (missing.length || invalid.length) throw new SupabaseConfigError(missing, invalid)
  return createServerClient(
    url!,
    key!,
    {
      cookies: {
        getAll: () => cookieStore.getAll(),
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options))
          } catch {
            // Server Components cannot write cookies; proxy refreshes them.
          }
        },
      },
      cookieOptions: { secure: process.env.NODE_ENV === 'production' },
    },
  )
}
