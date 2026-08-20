import { put, del } from '@vercel/blob'
import { NextResponse } from 'next/server'
import { requireWorkspace } from '@/lib/session'
import { createClient } from '@/lib/supabase/server'
import { LIBRARY_FILE_LIMIT, LIBRARY_MIME_TYPES, WORKSPACE_STORAGE_LIMIT, fileKind, formatarLimite, safeExtension } from '@/lib/storage'

export async function POST(request: Request) {
  const context = await requireWorkspace()
  const formData = await request.formData()
  const file = formData.get('file')
  if (!(file instanceof File)) return NextResponse.json({ error: 'Selecione um arquivo.' }, { status: 400 })
  if (!file.size || file.size > LIBRARY_FILE_LIMIT) return NextResponse.json({ error: `O arquivo deve ter no máximo ${formatarLimite(LIBRARY_FILE_LIMIT)}.` }, { status: 400 })
  if (!LIBRARY_MIME_TYPES.has(file.type)) return NextResponse.json({ error: 'Este tipo de arquivo não é permitido.' }, { status: 400 })

  const supabase = await createClient()
  const { data: usageRows, error: usageError } = await supabase.from('files').select('size_bytes').eq('workspace_id', context.workspace.id).neq('status', 'deleted')
  if (usageError) return NextResponse.json({ error: 'Não foi possível verificar o espaço disponível.' }, { status: 500 })
  const used = (usageRows ?? []).reduce((total, row) => total + Number(row.size_bytes ?? 0), 0)
  if (used + file.size > WORKSPACE_STORAGE_LIMIT) return NextResponse.json({ error: `O espaço de ${formatarLimite(WORKSPACE_STORAGE_LIMIT)} deste ambiente foi atingido.` }, { status: 413 })

  const pathname = `workspaces/${context.workspace.id}/library/${crypto.randomUUID()}${safeExtension(file.name)}`
  const blob = await put(pathname, file, { access: 'private', addRandomSuffix: false, contentType: file.type })
  const tags = String(formData.get('tags') ?? '').split(',').map((tag) => tag.trim()).filter(Boolean).slice(0, 10)
  const { data, error } = await supabase.from('files').insert({ workspace_id: context.workspace.id, name: file.name, original_name: file.name, file_type: fileKind(file.type), content_type: file.type, storage_path: blob.pathname, size_bytes: file.size, status: 'available', authorization_status: 'pending', tags, uploaded_by: context.user.id }).select('id').single()
  if (error || !data) {
    await del(blob.pathname)
    return NextResponse.json({ error: error?.message || 'Não foi possível salvar o arquivo.' }, { status: 500 })
  }
  return NextResponse.json({ id: data.id, storagePath: blob.pathname })
}
