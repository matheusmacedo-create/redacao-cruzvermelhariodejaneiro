'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { requireWorkspace } from '@/lib/session'
import { createAdminClient } from '@/lib/supabase/admin'

const text = (form: FormData, key: string) => String(form.get(key) ?? '').trim()

export async function resetWorkspaceData(formData: FormData) {
  const context = await requireWorkspace()
  if (context.role !== 'admin') throw new Error('Somente administradores podem reiniciar os dados do espaço.')

  const workspaceId = text(formData, 'workspaceId')
  if (workspaceId !== context.workspace.id) throw new Error('Espaço inválido.')

  const confirmName = text(formData, 'confirmName')
  if (confirmName !== context.workspace.name) throw new Error('O nome digitado não confere com o nome do espaço. Nada foi apagado.')

  const admin = createAdminClient()

  const { data: pautaRows } = await admin.from('pautas').select('id').eq('workspace_id', workspaceId)
  const pautaIds = (pautaRows ?? []).map((p) => p.id)
  const { data: contentRows } = await admin.from('content_pieces').select('id').eq('workspace_id', workspaceId)
  const contentIds = (contentRows ?? []).map((c) => c.id)

  if (pautaIds.length) await admin.from('pauta_participants').delete().in('pauta_id', pautaIds)
  if (contentIds.length) await admin.from('content_versions').delete().in('content_id', contentIds)

  const tablesInOrder = [
    'approval_voters',
    'content_comments',
    'messages',
    'notifications',
    'activity_log',
    'files',
    'inbox_items',
    'calendar_events',
    'pauta_links',
    'approvals',
    'content_pieces',
    'pautas',
    'projects',
  ]
  for (const table of tablesInOrder) {
    await admin.from(table).delete().eq('workspace_id', workspaceId)
  }

  revalidatePath('/', 'layout')
  redirect('/dashboard')
}
