import { contextoDoFinanceiro } from '@/lib/financeiro/acesso'
import { createAdminClient } from '@/lib/supabase/admin'

export const dynamic = 'force-dynamic'

/** Abre um comprovante: o banco confere o nível; aqui só se assina um link de um minuto. */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  if (!/^[0-9a-f-]{36}$/.test(id)) return new Response('Arquivo não encontrado.', { status: 404 })
  const { supabase } = await contextoDoFinanceiro()
  const { data, error } = await supabase.rpc('abrir_anexo_financeiro', { p_id: id })
  const linha = (Array.isArray(data) ? data[0] : data) as { caminho: string; nome_original: string } | undefined
  if (error || !linha) return new Response('Arquivo não encontrado.', { status: 404 })
  const baixar = new URL(request.url).searchParams.get('baixar') === '1'
  const { data: assinado } = await createAdminClient().storage.from('financeiro-anexos')
    .createSignedUrl(linha.caminho, 60, baixar ? { download: linha.nome_original } : undefined)
  if (!assinado?.signedUrl) return new Response('Não foi possível abrir o arquivo.', { status: 502 })
  return new Response(null, { status: 302, headers: { Location: assinado.signedUrl, 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer' } })
}
