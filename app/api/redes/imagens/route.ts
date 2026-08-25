import { NextResponse } from 'next/server'
import { requireWorkspace } from '@/lib/session'
import { createClient } from '@/lib/supabase/server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * As fotos e vídeos da Biblioteca, para o publicador oferecer escolha em vez de
 * exigir que alguém cole uma URL.
 *
 * Não devolve URL pública porque não existe: os arquivos são privados e passam
 * por /api/private-blob, que confere a sessão a cada pedido. O caminho de
 * armazenamento só serve para montar esse endereço autenticado.
 */
export async function GET() {
  try { await requireWorkspace() } catch { return NextResponse.json({ error: 'Acesso negado.' }, { status: 403 }) }

  const context = await requireWorkspace()
  const supabase = await createClient()

  const { data, error } = await supabase
    .from('files')
    .select('id,name,file_type,content_type,size_bytes,storage_path,created_at')
    .eq('workspace_id', context.workspace.id)
    .neq('status', 'deleted')
    .in('file_type', ['foto', 'video'])
    .order('created_at', { ascending: false })
    .limit(60)

  if (error) return NextResponse.json({ error: 'Não foi possível listar os arquivos.' }, { status: 500 })

  const arquivos = (data ?? [])
    .filter((f) => f.storage_path)
    .map((f) => ({
      id: f.id,
      nome: f.name,
      tipo: f.file_type as 'foto' | 'video',
      contentType: f.content_type as string,
      tamanho: Number(f.size_bytes ?? 0),
      previa: `/api/private-blob?pathname=${encodeURIComponent(f.storage_path as string)}`,
    }))

  return NextResponse.json({ arquivos })
}
