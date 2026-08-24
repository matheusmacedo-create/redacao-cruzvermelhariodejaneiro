// As variáveis NEXT_PUBLIC_* são substituídas pelo Next no momento do build.
// Por isso `process.env.NOME` precisa aparecer literalmente, sem destructuring
// e sem acesso dinâmico — senão o valor não é embutido no bundle.

const clean = (value: string | undefined) => {
  const trimmed = value?.trim()
  return trimmed ? trimmed : undefined
}

export type SupabaseEnv = { url?: string; key?: string; missing: string[] }

/** Credenciais públicas, usadas no browser, no proxy e nos server components. */
export function publicSupabaseEnv(): SupabaseEnv {
  const url = clean(process.env.NEXT_PUBLIC_SUPABASE_URL)
  const key =
    clean(process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY) ??
    clean(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY)

  const missing: string[] = []
  if (!url) missing.push('NEXT_PUBLIC_SUPABASE_URL')
  if (!key) missing.push('NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY')
  return { url, key, missing }
}

/** Credenciais de servidor. A service role ignora RLS e nunca vai ao browser. */
export function adminSupabaseEnv(): SupabaseEnv {
  // SUPABASE_URL e NEXT_PUBLIC_SUPABASE_URL são sempre o mesmo endereço, e
  // esquecer a versão sem prefixo é fácil; uma serve de reserva para a outra.
  const url = clean(process.env.SUPABASE_URL) ?? clean(process.env.NEXT_PUBLIC_SUPABASE_URL)
  const key = clean(process.env.SUPABASE_SERVICE_ROLE_KEY)

  const missing: string[] = []
  if (!url) missing.push('SUPABASE_URL')
  if (!key) missing.push('SUPABASE_SERVICE_ROLE_KEY')
  return { url, key, missing }
}

export class SupabaseConfigError extends Error {
  constructor(public readonly missing: string[]) {
    super(`Configuração do Supabase incompleta. Faltam: ${missing.join(', ')}.`)
    this.name = 'SupabaseConfigError'
  }
}
