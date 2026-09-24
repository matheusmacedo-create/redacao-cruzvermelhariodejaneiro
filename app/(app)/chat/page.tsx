import { redirect } from 'next/navigation'
import { contextoDoChat, painelDoChat } from '@/lib/chat/servidor'

export const dynamic = 'force-dynamic'

/** /chat abre a última conversa com novidade (ou o #geral). */
export default async function ChatPage() {
  const { context, supabase } = await contextoDoChat()
  const conversas = await painelDoChat(supabase, context.workspace.id)
  const minhas = conversas.filter((c) => c.membro)
  const destino = minhas.find((c) => c.nao_lidas > 0 && (c.tipo === 'direta' || c.mencoes > 0)) ?? minhas.find((c) => c.geral) ?? minhas[0] ?? conversas[0]
  if (!destino) return <p className="text-sm text-muted-foreground">Você ainda não está em nenhuma conversa. Peça para alguém da Redação chamar você para um canal.</p>
  redirect(`/chat/${destino.id}`)
}
