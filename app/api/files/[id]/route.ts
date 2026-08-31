import { del } from '@vercel/blob'
import { NextResponse } from 'next/server'
import { obterWorkspace } from '@/lib/session'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

export async function DELETE(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const context = await obterWorkspace()
  if (!context) return NextResponse.json({ error: 'Sessão expirada. Entre de novo.' }, { status: 401 })
  const { id } = await params
  const supabase = await createClient()
  const { data: file } = await supabase.from('files').select('storage_path,uploaded_by').eq('id', id).eq('workspace_id', context.workspace.id).maybeSingle()
  if (!file) return NextResponse.json({ error: 'Arquivo não encontrado.' }, { status: 404 })
  if (file.uploaded_by !== context.user.id && !['admin', 'editor'].includes(context.role)) return NextResponse.json({ error: 'Sem permissão para excluir.' }, { status: 403 })
  if (file.storage_path) await del(file.storage_path)
  const admin = createAdminClient()
  const { error } = await admin.from('files').delete().eq('id', id).eq('workspace_id', context.workspace.id)
  if (error) return NextResponse.json({ error: 'Não foi possível excluir o arquivo.' }, { status: 500 })
  return NextResponse.json({ success: true })
}
