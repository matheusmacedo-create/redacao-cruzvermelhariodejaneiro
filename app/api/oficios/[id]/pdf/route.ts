import { requireWorkspace } from '@/lib/session'
import { createClient } from '@/lib/supabase/server'
import { pdfAtual, type OficioParaPdf } from '@/lib/oficios/arquivo'
import { lerCanonico, nomeDoArquivo } from '@/lib/oficios/documento'

export const dynamic = 'force-dynamic'
export const maxDuration = 30

const CAMPOS = 'id,workspace_id,estado,modo_assinatura,conteudo_canonico,hash_documento,codigo_verificacao,emitido_em,pdf_original_sha256,pdf_atual_path,pdf_atual_sha256,pdf_versao'

/** O PDF da vez do ofício: o original ou a última versão assinada. Só para quem é do espaço. */
export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  if (!/^[0-9a-f-]{36}$/.test(id)) return new Response('Não encontrado.', { status: 404 })
  const context = await requireWorkspace()
  const supabase = await createClient()
  const { data: o } = await supabase.from('oficios').select(CAMPOS).eq('id', id).eq('workspace_id', context.workspace.id).maybeSingle()
  if (!o || o.estado === 'rascunho') return new Response('Não encontrado.', { status: 404 })
  try {
    const { bytes, versao } = await pdfAtual(o as OficioParaPdf)
    const numero = lerCanonico(o.conteudo_canonico)?.numero ?? null
    return new Response(new Uint8Array(bytes), {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${nomeDoArquivo(numero, versao ? `-assinado-${versao}.pdf` : '.pdf')}"`,
        'Cache-Control': 'no-store',
      },
    })
  } catch (causa) {
    return new Response(causa instanceof Error ? causa.message : 'Não foi possível gerar o PDF.', { status: 500 })
  }
}
