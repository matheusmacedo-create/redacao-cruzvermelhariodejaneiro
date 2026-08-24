import { createBrowserClient } from '@supabase/ssr'
import { publicSupabaseEnv, SupabaseConfigError } from './env'

let client: ReturnType<typeof createBrowserClient> | undefined

export function createClient() {
  if (!client) {
    const { url, key, missing, invalid } = publicSupabaseEnv()
    if (missing.length || invalid.length) throw new SupabaseConfigError(missing, invalid)
    client = createBrowserClient(url!, key!)
  }
  return client
}
