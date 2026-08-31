import { head, del } from '@vercel/blob'
import { NextResponse } from 'next/server'
import { obterWorkspace } from '@/lib/session'
import { createClient } from '@/lib/supabase/server'
import { LIBRARY_FILE_LIMIT, LIBRARY_MIME_TYPES, WORKSPACE_STORAGE_LIMIT, fileKind } from '@/lib/storage'

export const runtime = 'nodejs'

const AUTORIZACOES = new Set(['pending', 'authorized', 'internal'])

/**
 * Registra na Biblioteca um arquivo que o navegador acabou de enviar direto ao
 * Blob.
 *
 * Tudo que importa é conferido contra o armazenamento, não contra o que o
 * navegador diz: o caminho tem que pertencer a este espaço, o arquivo tem que
 * existir de verdade, e o tamanho e o tipo vêm do próprio Blob. Um cliente
 * mentindo sobre qualquer um desses campos não consegue nada além de um erro.
 */
export async function POST(request: Request) {
  const context = await obterWorkspace()
  if (!context) return NextResponse.json({ error: 'Sessão expirada. Entre de novo.' }, { status: 401 })
  const corpo = await request.json().catch(() => null)
  const pathname = typeof corpo?.pathname === 'string' ? corpo.pathname : ''
  const nome = typeof corpo?.name === 'string' ? corpo.name.slice(0, 200) : ''
  const bruto = String(corpo?.authorization ?? 'pending')
  const authorization = AUTORIZACOES.has(bruto) ? bruto : 'pending'

  const prefixo = `workspaces/${context.workspace.id}/library/`
  if (!pathname.startsWith(prefixo) || pathname.includes('..')) {
    return NextResponse.json({ error: 'Caminho inválido.' }, { status: 400 })
  }

  const blob = await head(pathname).catch(() => null)
  if (!blob) return NextResponse.json({ error: 'Arquivo não encontrado no armazenamento.' }, { status: 404 })

  if (!LIBRARY_MIME_TYPES.has(blob.contentType)) {
    await del(pathname)
    return NextResponse.json({ error: 'Este tipo de arquivo não é permitido.' }, { status: 400 })
  }
  if (blob.size > LIBRARY_FILE_LIMIT) {
    await del(pathname)
    return NextResponse.json({ error: 'O arquivo excede o tamanho máximo.' }, { status: 413 })
  }

  const supabase = await createClient()

  // O mesmo caminho já registrado significa reenvio da mesma chamada — devolver
  // o que existe é melhor que criar linha duplicada apontando para um blob só.
  const { data: jaExiste } = await supabase
    .from('files').select('id').eq('workspace_id', context.workspace.id)
    .eq('storage_path', pathname).maybeSingle()
  if (jaExiste) return NextResponse.json({ id: jaExiste.id, storagePath: pathname })

  const { data: linhas, error: erroUso } = await supabase
    .from('files').select('size_bytes')
    .eq('workspace_id', context.workspace.id).neq('status', 'deleted')
  if (erroUso) return NextResponse.json({ error: 'Não foi possível verificar o espaço.' }, { status: 500 })

  const usado = (linhas ?? []).reduce((t, r) => t + Number(r.size_bytes ?? 0), 0)
  if (usado + blob.size > WORKSPACE_STORAGE_LIMIT) {
    await del(pathname)
    return NextResponse.json({ error: 'O espaço de armazenamento foi atingido.' }, { status: 413 })
  }

  const tags = Array.isArray(corpo?.tags)
    ? corpo.tags.map((t: unknown) => String(t).trim()).filter(Boolean).slice(0, 10)
    : []

  const { data, error } = await supabase.from('files').insert({
    workspace_id: context.workspace.id,
    name: nome || pathname.split('/').pop() || 'arquivo',
    original_name: nome || null,
    file_type: fileKind(blob.contentType),
    content_type: blob.contentType,
    storage_path: pathname,
    size_bytes: blob.size,
    status: 'available',
    authorization_status: authorization,
    tags,
    uploaded_by: context.user.id,
  }).select('id').single()

  if (error || !data) {
    // Blob sem linha no banco é arquivo invisível ocupando espaço para sempre.
    await del(pathname)
    return NextResponse.json({ error: error?.message || 'Não foi possível registrar o arquivo.' }, { status: 500 })
  }

  return NextResponse.json({ id: data.id, storagePath: pathname })
}
