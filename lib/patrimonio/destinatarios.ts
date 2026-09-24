import 'server-only'

import type { createAdminClient } from '@/lib/supabase/admin'

/** Quem recebe os avisos do Patrimônio e do Estoque: admins e quem opera (operar ou gestão). */
export async function quemOperaOPatrimonio(admin: ReturnType<typeof createAdminClient>, workspaceId: string): Promise<string[]> {
  const [{ data: admins }, { data: acessos }] = await Promise.all([
    admin.from('workspace_members').select('user_id').eq('workspace_id', workspaceId).eq('role', 'admin'),
    admin.from('pat_acesso').select('user_id').eq('workspace_id', workspaceId).in('nivel', ['operar', 'gestao']),
  ])
  return [...new Set([...(admins ?? []), ...(acessos ?? [])].map((x) => x.user_id as string))]
}
