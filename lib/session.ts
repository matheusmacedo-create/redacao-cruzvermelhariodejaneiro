import 'server-only'
import { cache } from 'react'
import { cookies } from 'next/headers'
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

export async function requireWorkspace() {
  const context = await requireSession()
  const cookieStore = await cookies()
  const workspaceId = cookieStore.get('cvrj_workspace')?.value
  const membership = context.memberships.find((item: any) => {
    const workspace = Array.isArray(item.workspaces) ? item.workspaces[0] : item.workspaces
    return workspace?.id === workspaceId
  })
  if (!membership) redirect('/espacos')
  const workspace = (Array.isArray(membership.workspaces) ? membership.workspaces[0] : membership.workspaces) as unknown as { id: string; name: string; slug: string; kind: 'demo' | 'production' }
  return { ...context, workspace, role: membership.role as WorkspaceRole }
}

export async function requireAdmin() {
  const context = await requireWorkspace()
  if (context.role !== 'admin') throw new Error('Acesso restrito a administradores.')
  return context
}
