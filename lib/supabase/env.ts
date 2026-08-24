// As variáveis NEXT_PUBLIC_* são substituídas pelo Next no momento do build.
// Por isso `process.env.NOME` precisa aparecer literalmente, sem destructuring
// e sem acesso dinâmico — senão o valor não é embutido no bundle.

const clean = (value: string | undefined) => {
  const trimmed = value?.trim()
  return trimmed ? trimmed : undefined
}

/**
 * Papel declarado por uma chave legada (JWT). As chaves novas
 * (sb_publishable_ / sb_secret_) são opacas e não carregam essa informação.
 */
function jwtRole(key: string): string | undefined {
  const payload = key.split('.')[1]
  if (!payload || !key.startsWith('eyJ')) return undefined
  try {
    const json = atob(payload.replace(/-/g, '+').replace(/_/g, '/'))
    const role = (JSON.parse(json) as { role?: unknown }).role
    return typeof role === 'string' ? role : undefined
  } catch {
    return undefined
  }
}

export type InvalidKey = { name: string; reason: string }

export type SupabaseEnv = {
  url?: string
  key?: string
  /** Nomes de variáveis ausentes ou vazias. */
  missing: string[]
  /** Variáveis preenchidas com o valor errado, e o motivo. */
  invalid: InvalidKey[]
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
  const name = 'NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY'
  const invalid: InvalidKey[] = []
  if (key?.startsWith('sb_secret_')) {
    invalid.push({ name, reason: 'o valor começa com sb_secret_, que é uma chave secreta' })
  } else if (key && jwtRole(key) === 'service_role') {
    invalid.push({ name, reason: 'o valor é um JWT com papel service_role' })
  }

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

  // Uma chave pública aqui não gera erro nenhum: o PostgREST responde 200 e o
  // RLS filtra tudo, então o banco parece vazio. O motivo vai para a tela
  // porque distingue valor errado de deployment antigo, que é a dúvida real
  // de quem acabou de trocar a variável.
  const name = 'SUPABASE_SERVICE_ROLE_KEY'
  const invalid: InvalidKey[] = []
  if (key?.startsWith('sb_publishable_')) {
    invalid.push({ name, reason: 'o valor começa com sb_publishable_, que é a chave pública' })
  } else if (key && key === publicKeyFromEnv()) {
    invalid.push({ name, reason: 'o valor é idêntico ao da chave pública configurada' })
  } else if (key && jwtRole(key) === 'anon') {
    invalid.push({ name, reason: 'o valor é um JWT com papel anon, não service_role' })
  }

  return { url, key: invalid.length ? undefined : key, missing, invalid }
}

export class SupabaseConfigError extends Error {
  constructor(
    public readonly missing: string[],
    public readonly invalid: InvalidKey[] = [],
  ) {
    const partes = [
      missing.length ? `faltam: ${missing.join(', ')}` : '',
      invalid.length ? `incorretas: ${invalid.map((i) => `${i.name} (${i.reason})`).join('; ')}` : '',
    ].filter(Boolean)
    super(`Configuração do Supabase incompleta (${partes.join('; ')}).`)
    this.name = 'SupabaseConfigError'
  }
}
