import 'server-only'
import { createClient } from '@supabase/supabase-js'
import { adminSupabaseEnv, SupabaseConfigError } from './env'

export function createAdminClient() {
  const { url, key, missing } = adminSupabaseEnv()
  if (missing.length) throw new SupabaseConfigError(missing)
  return createClient(url!, key!, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
}
