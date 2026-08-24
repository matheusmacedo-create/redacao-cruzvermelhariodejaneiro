// As variáveis NEXT_PUBLIC_* são substituídas pelo Next no momento do build.
// Por isso `process.env.NOME` precisa aparecer literalmente, sem destructuring
// e sem acesso dinâmico — senão o valor não é embutido no bundle.

const clean = (value: string | undefined) => {
  const trimmed = value?.trim()
  return trimmed ? trimmed : undefined
}

const isPublicKey = (key: string) => key.startsWith('sb_publishable_')
const isSecretKey = (key: string) => key.startsWith('sb_secret_')

export type SupabaseEnv = {
  url?: string
  key?: string
  /** Nomes de variáveis ausentes ou vazias. */
  missing: string[]
  /** Nomes de variáveis preenchidas com o valor errado. */
  invalid: string[]
}

function publicKeyFromEnv() {
  return (
    clean(process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY) ??
    clean(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
  )
}

/** Credenciais públicas, usadas no browser, no proxy e nos server components. */
export function publicSupabaseEnv(): SupabaseEnv {
  const url = clean(process.env.NEXT_PUBLIC_SUPABASE_URL)
  const key = publicKeyFromEnv()

  const missing: string[] = []
  if (!url) missing.push('NEXT_PUBLIC_SUPABASE_URL')
  if (!key) missing.push('NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY')

  // Uma chave secreta aqui iria para o bundle do browser, entregando a todo
  // visitante uma credencial que ignora RLS.
  const invalid = key && isSecretKey(key) ? ['NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY'] : []

  return { url, key: invalid.length ? undefined : key, missing, invalid }
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

  // Uma chave pública neste lugar não gera erro nenhum: o PostgREST responde
  // 200 e o RLS filtra tudo, então o banco parece vazio. Foi assim que a tela
  // de configuração inicial reapareceu num sistema que já tinha administrador.
  const swapped = !!key && (isPublicKey(key) || key === publicKeyFromEnv())
  const invalid = swapped ? ['SUPABASE_SERVICE_ROLE_KEY'] : []

  return { url, key: swapped ? undefined : key, missing, invalid }
}

export class SupabaseConfigError extends Error {
  constructor(
    public readonly missing: string[],
    public readonly invalid: string[] = [],
  ) {
    const partes = [
      missing.length ? `faltam: ${missing.join(', ')}` : '',
      invalid.length ? `com valor incorreto: ${invalid.join(', ')}` : '',
    ].filter(Boolean)
    super(`Configuração do Supabase incompleta (${partes.join('; ')}).`)
    this.name = 'SupabaseConfigError'
  }
}
