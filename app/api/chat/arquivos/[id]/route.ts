import { contextoDoChat } from '@/lib/chat/servidor'
import { abreNaTela } from '@/lib/chat/regras'
import { createAdminClient } from '@/lib/supabase/admin'

export const dynamic = 'force-dynamic'

/**
 * Abre um arquivo do chat: o banco confere quem pode (quem vê a conversa, ou
 * o administrador se a mensagem foi apagada); aqui só se assina o link.
 * Imagem, áudio, vídeo e PDF abrem na tela; o resto é sempre baixado.
 */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  if (!/^[0-9a-f-]{36}$/.test(id)) return new Response('Arquivo não encontrado.', { status: 404 })
  const { supabase } = await contextoDoChat()
  const { data, error } = await supabase.rpc('chat_abrir_anexo', { p_id: id })
  const linha = (Array.isArray(data) ? data[0] : data) as { caminho: string; nome: string; mime: string } | undefined
  if (error || !linha) return new Response('Arquivo não encontrado.', { status: 404 })
  const baixar = new URL(request.url).searchParams.get('baixar') === '1' || !abreNaTela(linha.mime)
  // Uma hora: o áudio e o vídeo pedem pedaços do arquivo enquanto tocam.
  const { data: assinado } = await createAdminClient().storage.from('chat-arquivos')
    .createSignedUrl(linha.caminho, 3600, baixar ? { download: linha.nome } : undefined)
  if (!assinado?.signedUrl) return new Response('Não foi possível abrir o arquivo.', { status: 502 })
  return new Response(null, { status: 302, headers: { Location: assinado.signedUrl, 'Cache-Control': 'private, max-age=600', 'Referrer-Policy': 'no-referrer' } })
}
