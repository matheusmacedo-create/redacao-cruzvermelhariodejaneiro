import { get } from '@vercel/blob'
import { NextRequest, NextResponse } from 'next/server'
import { requireWorkspace } from '@/lib/session'
import { createClient } from '@/lib/supabase/server'

export async function GET(request: NextRequest) {
  const context = await requireWorkspace()
  const pathname = request.nextUrl.searchParams.get('pathname')
  if (!pathname) return NextResponse.json({ error: 'Arquivo não informado.' }, { status: 400 })
  const supabase = await createClient()
  const isAvatar = pathname.startsWith('avatars/')
  if (isAvatar) {
    const { data } = await supabase.from('profiles').select('id').eq('avatar_path', pathname).limit(1).maybeSingle()
    if (!data) return new NextResponse('Não encontrado', { status: 404 })
  } else {
    const { data } = await supabase.from('files').select('id').eq('workspace_id', context.workspace.id).eq('storage_path', pathname).maybeSingle()
    if (!data) return new NextResponse('Não encontrado', { status: 404 })
  }
  const result = await get(pathname, { access: 'private', ifNoneMatch: request.headers.get('if-none-match') ?? undefined })
  if (!result) return new NextResponse('Não encontrado', { status: 404 })
  if (result.statusCode === 304) return new NextResponse(null, { status: 304, headers: { ETag: result.blob.etag, 'Cache-Control': 'private, no-cache' } })
  return new NextResponse(result.stream, { headers: { 'Content-Type': result.blob.contentType, ETag: result.blob.etag, 'Cache-Control': 'private, no-cache', 'Content-Disposition': 'inline' } })
}
