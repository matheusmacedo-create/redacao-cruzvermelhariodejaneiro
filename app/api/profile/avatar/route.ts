import { del, put } from '@vercel/blob'
import { NextResponse } from 'next/server'
import { obterWorkspace } from '@/lib/session'
import { createClient } from '@/lib/supabase/server'
import { AVATAR_FILE_LIMIT, AVATAR_MIME_TYPES, safeExtension } from '@/lib/storage'

export async function POST(request: Request) {
  const context = await obterWorkspace()
  if (!context) return NextResponse.json({ error: 'Sessão expirada. Entre de novo.' }, { status: 401 })
  const formData = await request.formData()
  const file = formData.get('file')
  if (!(file instanceof File)) return NextResponse.json({ error: 'Selecione uma imagem.' }, { status: 400 })
  if (!file.size || file.size > AVATAR_FILE_LIMIT) return NextResponse.json({ error: 'A foto deve ter no máximo 2 MB.' }, { status: 400 })
  if (!AVATAR_MIME_TYPES.has(file.type)) return NextResponse.json({ error: 'Use uma imagem JPEG, PNG ou WebP.' }, { status: 400 })
  const supabase = await createClient()
  const { data: current } = await supabase.from('profiles').select('avatar_path').eq('id', context.user.id).single()
  const pathname = `avatars/${context.user.id}/${crypto.randomUUID()}${safeExtension(file.name)}`
  const blob = await put(pathname, file, { access: 'private', addRandomSuffix: false, contentType: file.type })
  const { error } = await supabase.from('profiles').update({ avatar_path: blob.pathname, updated_at: new Date().toISOString() }).eq('id', context.user.id)
  if (error) { await del(blob.pathname); return NextResponse.json({ error: 'Não foi possível atualizar sua foto.' }, { status: 500 }) }
  if (current?.avatar_path) await del(current.avatar_path)
  return NextResponse.json({ path: blob.pathname })
}

export async function DELETE() {
  const context = await obterWorkspace()
  if (!context) return NextResponse.json({ error: 'Sessão expirada. Entre de novo.' }, { status: 401 })
  const supabase = await createClient()
  const { data: current } = await supabase.from('profiles').select('avatar_path').eq('id', context.user.id).single()
  const { error } = await supabase.from('profiles').update({ avatar_path: null, updated_at: new Date().toISOString() }).eq('id', context.user.id)
  if (error) return NextResponse.json({ error: 'Não foi possível remover sua foto.' }, { status: 500 })
  if (current?.avatar_path) await del(current.avatar_path)
  return NextResponse.json({ success: true })
}
