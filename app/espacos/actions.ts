'use server'

import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { requireSession } from '@/lib/session'

export async function selectWorkspace(formData: FormData) {
  const context = await requireSession()
  const workspaceId = String(formData.get('workspaceId') ?? '')
  const allowed = context.memberships.some((item: any) => {
    const workspace = Array.isArray(item.workspaces) ? item.workspaces[0] : item.workspaces
    return workspace?.id === workspaceId
  })
  if (!allowed) throw new Error('Espaço não autorizado.')
  const cookieStore = await cookies()
  cookieStore.set('cvrj_workspace', workspaceId, { httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production', path: '/', maxAge: 60 * 60 * 24 * 30 })
  redirect('/dashboard')
}
