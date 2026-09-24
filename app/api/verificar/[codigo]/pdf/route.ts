import { createAdminClient } from '@/lib/supabase/admin'
import { pdfAtual, type OficioParaPdf } from '@/lib/oficios/arquivo'
import { lerCanonico, nomeDoArquivo } from '@/lib/oficios/documento'

export const dynamic = 'force-dynamic'
export const maxDuration = 30

/**
 * O PDF do ofício pelo código público — o arquivo com as assinaturas do
 * gov.br, para conferir no validador oficial do ITI (validar.iti.gov.br).
 */
export async function GET(_: Request, { params }: { params: Promise<{ codigo: string }> }) {
  const { codigo } = await params
  if (!/^[0-9a-f]{32}$/.test(codigo)) return new Response('Não encontrado.', { status: 404 })
  const { data: o } = await createAdminClient().from('oficios')
    .select('id,workspace_id,estado,modo_assinatura,conteudo_canonico,hash_documento,codigo_verificacao,emitido_em,pdf_original_sha256,pdf_atual_path,pdf_atual_sha256,pdf_versao')
    .eq('codigo_verificacao', codigo).neq('estado', 'rascunho').maybeSingle()
  if (!o) return new Response('Não encontrado.', { status: 404 })
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
  } catch {
    return new Response('Não foi possível entregar o PDF.', { status: 500 })
  }
}
