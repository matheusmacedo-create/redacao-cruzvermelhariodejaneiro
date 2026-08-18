import { get } from '@vercel/blob'
import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { verificarMidia } from '@/lib/meta/media-url'

/**
 * Entrega a mídia da Biblioteca para os servidores da Meta.
 *
 * Rota pública de propósito — mas só abre com um token assinado e válido.
 * É a única porta por onde um arquivo privado sai sem sessão, e ela fecha
 * sozinha quando o token expira.
 *
 * Suporta Range para o Instagram conseguir puxar vídeo em partes.
 */

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(request: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const payload = verificarMidia(token)
  if (!payload) {
    return new NextResponse('Link inválido ou expirado.', { status: 403 })
  }

  // Service role: não há usuário logado nesta requisição.
  const admin = createAdminClient()
  const { data: file } = await admin
    .from('files')
    .select('storage_path,content_type,size_bytes,status')
    .eq('id', payload.f)
    .maybeSingle()

  if (!file?.storage_path || file.status === 'deleted') {
    return new NextResponse('Arquivo não encontrado.', { status: 404 })
  }

  const resultado = await get(file.storage_path, { access: 'private' })
  if (!resultado || resultado.statusCode !== 200) {
    return new NextResponse('Arquivo não encontrado.', { status: 404 })
  }

  return new NextResponse(resultado.stream, {
    headers: {
      'Content-Type': resultado.blob.contentType || file.content_type || 'application/octet-stream',
      'Content-Length': String(file.size_bytes ?? resultado.blob.size ?? ''),
      'Accept-Ranges': 'bytes',
      // Nunca cachear em CDN pública: o link é temporário por design.
      'Cache-Control': 'private, max-age=0, no-store',
      'Content-Disposition': 'inline',
    },
  })
}
