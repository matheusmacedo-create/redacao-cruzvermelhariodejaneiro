import 'server-only'
import { createClient } from '@supabase/supabase-js'
import { adminSupabaseEnv, SupabaseConfigError } from './env'

export function createAdminClient() {
  const { url, key, missing, invalid } = adminSupabaseEnv()
  if (missing.length || invalid.length) throw new SupabaseConfigError(missing, invalid)
  return createClient(url!, key!, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
}
