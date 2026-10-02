import { contextoDeParticipantes } from '@/lib/participantes/acesso'
import { createAdminClient } from '@/lib/supabase/admin'
import { BUCKET_DE_VOLUNTARIOS } from '@/lib/participantes/verificacao/arquivos'

export const dynamic = 'force-dynamic'

/**
 * Abre um documento da verificação do voluntário: o banco confere o nível
 * (3 para identidade e antecedentes) e registra a abertura; aqui só se
 * assina um link de um minuto para o Storage. `?baixar=1` baixa em vez de
 * abrir no navegador.
 */
export async function GET(request: Request, { params }: { params: Promise<{ id: string; arquivoId: string }> }) {
  const { id, arquivoId } = await params
  if (!/^[0-9a-f-]{36}$/.test(id) || !/^[0-9a-f-]{36}$/.test(arquivoId)) return new Response('Arquivo não encontrado.', { status: 404 })
  const { context, supabase } = await contextoDeParticipantes()
  const { data, error } = await supabase.rpc('abrir_arquivo_participante', { p_id: arquivoId })
  const linha = (Array.isArray(data) ? data[0] : data) as { caminho: string; nome_original: string } | undefined
  if (error || !linha || !linha.caminho.startsWith(`${context.workspace.id}/${id}/`)) return new Response('Arquivo não encontrado.', { status: 404 })
  const baixar = new URL(request.url).searchParams.get('baixar') === '1'
  const { data: assinado } = await createAdminClient().storage.from(BUCKET_DE_VOLUNTARIOS)
    .createSignedUrl(linha.caminho, 60, baixar ? { download: linha.nome_original } : undefined)
  if (!assinado?.signedUrl) return new Response('Não foi possível abrir o arquivo.', { status: 502 })
  return new Response(null, { status: 302, headers: { Location: assinado.signedUrl, 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer' } })
}
