import { createBrowserClient } from '@supabase/ssr'
import { publicSupabaseEnv, SupabaseConfigError } from './env'

let client: ReturnType<typeof createBrowserClient> | undefined

export function createClient() {
  if (!client) {
    const { url, key, missing } = publicSupabaseEnv()
    if (missing.length) throw new SupabaseConfigError(missing)
    client = createBrowserClient(url!, key!)
  }
  return client
}
