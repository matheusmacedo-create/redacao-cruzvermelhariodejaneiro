import { obterWorkspace } from '@/lib/session'
import { createClient } from '@/lib/supabase/server'
import { marcarVisto } from '@/lib/notificacoes/servidor'

export const dynamic = 'force-dynamic'

/**
 * O sino pergunta aqui de tempos em tempos (só com a aba visível): quantas
 * não lidas e as mais recentes. Também conta como "a pessoa está online",
 * para não mandar e-mail do que ela está vendo.
 */
export async function GET() {
  const context = await obterWorkspace()
  if (!context) return Response.json({ erro: 'Sessão expirada.' }, { status: 401 })
  const supabase = await createClient()
  const [{ count }, { data: recentes }] = await Promise.all([
    supabase.from('notifications').select('id', { count: 'exact', head: true })
      .eq('workspace_id', context.workspace.id).eq('user_id', context.user.id).is('read_at', null),
    supabase.from('notifications').select('id,title,message,link,read_at,created_at')
      .eq('workspace_id', context.workspace.id).eq('user_id', context.user.id)
      .order('created_at', { ascending: false }).limit(10),
  ])
  await marcarVisto(context.user.id, (context.profile as { visto_em?: string | null } | null)?.visto_em)
  return Response.json({ naoLidas: count ?? 0, recentes: recentes ?? [] }, { headers: { 'Cache-Control': 'no-store' } })
}
