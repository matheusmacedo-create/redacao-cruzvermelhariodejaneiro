import { get } from '@vercel/blob'
import { NextResponse } from 'next/server'
import { requireWorkspace } from '@/lib/session'
import { createClient } from '@/lib/supabase/server'

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const context = await requireWorkspace()
  const { id } = await params
  const supabase = await createClient()
  const { data: file } = await supabase.from('files').select('name,storage_path').eq('id', id).eq('workspace_id', context.workspace.id).maybeSingle()
  if (!file?.storage_path) return new NextResponse('Não encontrado', { status: 404 })
  const result = await get(file.storage_path, { access: 'private' })
  if (!result || result.statusCode !== 200) return new NextResponse('Não encontrado', { status: 404 })
  const safeName = file.name.replace(/["\r\n]/g, '_')
  return new NextResponse(result.stream, { headers: { 'Content-Type': result.blob.contentType, 'Content-Disposition': `attachment; filename="${safeName}"`, 'Cache-Control': 'private, no-store' } })
}
