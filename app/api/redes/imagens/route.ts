import { NextResponse } from 'next/server'
import { obterWorkspace } from '@/lib/session'
import { createClient } from '@/lib/supabase/server'
import { ETIQUETA_DE_IA } from '@/lib/ia/etiqueta'

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
  const context = await obterWorkspace()
  if (!context) return NextResponse.json({ error: 'Sessão expirada. Entre de novo.' }, { status: 401 })
  const supabase = await createClient()

  const { data, error } = await supabase
    .from('files')
    .select('id,name,file_type,content_type,size_bytes,storage_path,created_at,tags')
    .eq('workspace_id', context.workspace.id)
    .neq('status', 'deleted')
    // Só o que tem autorização de uso de imagem. Um arquivo pendente ou
    // marcado como interno não pode nem aparecer como opção.
    .eq('authorization_status', 'authorized')
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
      // A etiqueta acompanha o arquivo para sempre: é ela que faz a tela
      // avisar, e o conector declarar à rede, que a imagem é sintética.
      geradaPorIa: (f.tags ?? []).includes(ETIQUETA_DE_IA),
    }))

  return NextResponse.json({ arquivos })
}
