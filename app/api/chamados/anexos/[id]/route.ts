import { get } from '@vercel/blob'
import { NextResponse } from 'next/server'
import { obterWorkspace } from '@/lib/session'
import { createClient } from '@/lib/supabase/server'

export const runtime = 'nodejs'

/**
 * Entrega um anexo de chamado. A consulta vai pelo cliente da PRÓPRIA
 * pessoa: é o RLS (chamado_anexos_select) que decide se ela vê — quem abriu
 * vê os anexos públicos, a equipe vê também os das notas internas.
 */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const context = await obterWorkspace()
  if (!context) return NextResponse.json({ error: 'Sessão expirada. Entre de novo.' }, { status: 401 })
  const { id } = await params
  if (!/^[0-9a-f-]{36}$/i.test(id)) return new NextResponse('Não encontrado', { status: 404 })
  const supabase = await createClient()
  const { data: anexo } = await supabase.from('chamado_anexos').select('storage_path, nome, content_type').eq('id', id).maybeSingle()
  if (!anexo) return new NextResponse('Não encontrado', { status: 404 })
  const resultado = await get(anexo.storage_path, { access: 'private', ifNoneMatch: request.headers.get('if-none-match') ?? undefined })
  if (!resultado) return new NextResponse('Não encontrado', { status: 404 })
  if (resultado.statusCode === 304) return new NextResponse(null, { status: 304, headers: { ETag: resultado.blob.etag, 'Cache-Control': 'private, no-cache' } })
  // Imagem e PDF abrem no navegador; o resto baixa. Nome codificado (RFC 5987)
  // para acento não quebrar o cabeçalho.
  const abre = anexo.content_type.startsWith('image/') || anexo.content_type === 'application/pdf' || anexo.content_type.startsWith('video/')
  const nome = encodeURIComponent(anexo.nome)
  return new NextResponse(resultado.stream, {
    headers: {
      'Content-Type': anexo.content_type,
      ETag: resultado.blob.etag,
      'Cache-Control': 'private, no-cache',
      'Content-Disposition': `${abre ? 'inline' : 'attachment'}; filename*=UTF-8''${nome}`,
      'X-Content-Type-Options': 'nosniff',
    },
  })
}
