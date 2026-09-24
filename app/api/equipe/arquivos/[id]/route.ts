import { contextoDaEquipe } from '@/lib/rh/acesso'
import { createAdminClient } from '@/lib/supabase/admin'

export const dynamic = 'force-dynamic'

/**
 * Abre um arquivo da ficha: o banco confere o nível e registra a abertura;
 * aqui só se assina um link de um minuto para o Storage. `?baixar=1` baixa
 * em vez de abrir no navegador.
 */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  if (!/^[0-9a-f-]{36}$/.test(id)) return new Response('Arquivo não encontrado.', { status: 404 })
  const { supabase } = await contextoDaEquipe()
  const { data, error } = await supabase.rpc('abrir_arquivo_equipe', { p_id: id })
  const linha = (Array.isArray(data) ? data[0] : data) as { caminho: string; nome_original: string } | undefined
  if (error || !linha) return new Response('Arquivo não encontrado.', { status: 404 })
  const baixar = new URL(request.url).searchParams.get('baixar') === '1'
  const { data: assinado } = await createAdminClient().storage.from('equipe-arquivos')
    .createSignedUrl(linha.caminho, 60, baixar ? { download: linha.nome_original } : undefined)
  if (!assinado?.signedUrl) return new Response('Não foi possível abrir o arquivo.', { status: 502 })
  return new Response(null, { status: 302, headers: { Location: assinado.signedUrl, 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer' } })
}
