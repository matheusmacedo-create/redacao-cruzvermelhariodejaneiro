import { get } from '@vercel/blob'
import { NextRequest, NextResponse } from 'next/server'
import { obterWorkspace } from '@/lib/session'
import { ehEquipeDaEscola } from '@/lib/permissoes'
import { createClient } from '@/lib/supabase/server'

export async function GET(request: NextRequest) {
  // A equipe da Escola vê fotos de perfil (a própria, no /perfil); arquivo da Redação, não.
  const context = await obterWorkspace({ escola: true })
  if (!context) return NextResponse.json({ error: 'Sessão expirada. Entre de novo.' }, { status: 401 })
  const pathname = request.nextUrl.searchParams.get('pathname')
  if (!pathname) return NextResponse.json({ error: 'Arquivo não informado.' }, { status: 400 })
  const supabase = await createClient()
  const isAvatar = pathname.startsWith('avatars/')
  if (!isAvatar && ehEquipeDaEscola(context.role)) return NextResponse.json({ error: 'Sessão expirada. Entre de novo.' }, { status: 401 })
  if (isAvatar) {
    const { data } = await supabase.from('profiles').select('id').eq('avatar_path', pathname).limit(1).maybeSingle()
    if (!data) return new NextResponse('Não encontrado', { status: 404 })
  } else {
    const { data } = await supabase.from('files').select('id').eq('workspace_id', context.workspace.id).eq('storage_path', pathname).maybeSingle()
    if (!data) return new NextResponse('Não encontrado', { status: 404 })
  }
  const result = await get(pathname, { access: 'private', ifNoneMatch: request.headers.get('if-none-match') ?? undefined })
  if (!result) return new NextResponse('Não encontrado', { status: 404 })
  // Cache só no navegador de quem pediu (private). Sem ele, cada avatar de cada
  // lista (e o do topo, em toda página) voltava ao servidor a cada tela.
  // O avatar tem nome novo a cada troca de foto (avatars/<id>/<uuid>): o mesmo
  // endereço é sempre a mesma imagem. O arquivo da Biblioteca também tem nome
  // único, mas pode ser otimizado no lugar (arquivos.ts): uma hora basta.
  const cache = isAvatar ? 'private, max-age=604800, immutable' : 'private, max-age=3600'
  if (result.statusCode === 304) return new NextResponse(null, { status: 304, headers: { ETag: result.blob.etag, 'Cache-Control': cache } })
  return new NextResponse(result.stream, { headers: { 'Content-Type': result.blob.contentType, ETag: result.blob.etag, 'Cache-Control': cache, 'Content-Disposition': 'inline' } })
}
