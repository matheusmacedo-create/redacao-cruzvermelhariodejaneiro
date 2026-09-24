import { notFound } from 'next/navigation'
import { Chat } from '@/components/app/chat/chat'
import { contextoDoChat, painelDoChat, pessoasDoChat } from '@/lib/chat/servidor'
import { COLUNAS_DA_MENSAGEM, POR_PAGINA, type MensagemDoChat } from '@/lib/chat/regras'
import { tituloDaArea } from '@/lib/navegacao'

export const metadata = { title: tituloDaArea('/chat') }
export const dynamic = 'force-dynamic'

/**
 * Uma conversa do chat: a lista da lateral, as últimas mensagens e quem
 * está nela. Abrir marca como lida. O resto (chegar, editar, apagar) vem ao
 * vivo pelo Realtime, no componente.
 */
export default async function ConversaPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound()
  const { context, supabase } = await contextoDoChat()
  const ws = context.workspace.id
  const conversas = await painelDoChat(supabase, ws)
  const atual = conversas.find((c) => c.id === id)
  if (!atual) notFound()
  const [{ data: ultimas }, { data: membros }, pessoas] = await Promise.all([
    supabase.from('chat_mensagens').select(COLUNAS_DA_MENSAGEM).eq('canal_id', id).order('created_at', { ascending: false }).limit(POR_PAGINA + 1),
    supabase.from('chat_membros').select('user_id').eq('canal_id', id),
    pessoasDoChat(ws, context.user.id, context.role === 'escola'),
  ])
  if (atual.membro && atual.nao_lidas > 0) {
    await supabase.rpc('chat_ler', { p_canal_id: id })
  }
  const lista = (ultimas ?? []) as MensagemDoChat[]
  const lidas = conversas.map((c) => (c.id === id ? { ...c, nao_lidas: 0, mencoes: 0 } : c))
  return (
    <Chat key={id} eu={context.user.id} ehAdmin={context.role === 'admin'} redacao={context.role !== 'escola'}
      conversas={lidas} atual={{ ...atual, nao_lidas: 0, mencoes: 0 }} mensagens={lista.slice(0, POR_PAGINA).reverse()} temMais={lista.length > POR_PAGINA}
      membros={(membros ?? []).map((m) => m.user_id as string)} pessoas={pessoas} />
  )
}
