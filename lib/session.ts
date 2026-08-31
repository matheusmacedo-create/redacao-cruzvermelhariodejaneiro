import 'server-only'
import { cache } from 'react'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'

export type WorkspaceRole = 'admin' | 'editor' | 'colaborador'

export const getSessionContext = cache(async () => {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null
  const { data: profile } = await supabase.from('profiles').select('*').eq('id', user.id).single()
  const { data: memberships } = await supabase
    .from('workspace_members')
    .select('role, coordination, workspaces(id,name,slug,kind)')
    .eq('user_id', user.id)
  return { user, profile, memberships: memberships ?? [] }
})

export async function requireSession() {
  const context = await getSessionContext()
  if (!context) redirect('/')
  return context
}

const workspaceOf = (membership: any) =>
  Array.isArray(membership.workspaces) ? membership.workspaces[0] : membership.workspaces

/**
 * O espaço de quem está logado, ou null.
 *
 * Existe separado de requireWorkspace porque `redirect()` funciona lançando um
 * erro de controle: numa página isso leva ao login, mas numa rota de API vira
 * exceção não tratada e a resposta sai 500. Rota de API responde 401.
 */
export async function obterWorkspace() {
  const context = await getSessionContext()
  if (!context) return null
  // Espaço único: não há mais tela de seleção nem cookie. Prefere a Produção e
  // cai no primeiro vínculo, caso um outro espaço volte a existir um dia.
  const membership =
    context.memberships.find((item: any) => workspaceOf(item)?.kind === 'production') ??
    context.memberships[0]
  if (!membership) return null
  const workspace = workspaceOf(membership) as unknown as { id: string; name: string; slug: string; kind: 'demo' | 'production' }
  return { ...context, workspace, role: membership.role as WorkspaceRole }
}

export async function requireWorkspace() {
  const contexto = await obterWorkspace()
  if (!contexto) redirect('/')
  return contexto
}

export async function requireAdmin() {
  const context = await requireWorkspace()
  if (context.role !== 'admin') throw new Error('Acesso restrito a administradores.')
  return context
}
