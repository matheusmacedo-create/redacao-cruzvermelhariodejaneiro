import { obterWorkspace } from '@/lib/session'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

export const dynamic = 'force-dynamic'

/** Abre o PDF de uma proposta: o RLS diz quem vê o pedido; aqui só se assina um link de um minuto. */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  if (!/^[0-9a-f-]{36}$/.test(id)) return new Response('Arquivo não encontrado.', { status: 404 })
  const context = await obterWorkspace({ escola: true })
  if (!context) return new Response('Faça login.', { status: 401 })
  const supabase = await createClient()
  const { data: p } = await supabase.from('compras_propostas').select('arquivo_caminho,arquivo_nome').eq('id', id).eq('workspace_id', context.workspace.id).maybeSingle()
  if (!p?.arquivo_caminho) return new Response('Arquivo não encontrado.', { status: 404 })
  const baixar = new URL(request.url).searchParams.get('baixar') === '1'
  const { data: assinado } = await createAdminClient().storage.from('compras-arquivos')
    .createSignedUrl(p.arquivo_caminho, 60, baixar ? { download: p.arquivo_nome ?? 'proposta' } : undefined)
  if (!assinado?.signedUrl) return new Response('Não foi possível abrir o arquivo.', { status: 502 })
  return new Response(null, { status: 302, headers: { Location: assinado.signedUrl, 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer' } })
}
