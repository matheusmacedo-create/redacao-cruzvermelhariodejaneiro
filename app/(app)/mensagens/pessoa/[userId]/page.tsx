import { notFound, redirect } from 'next/navigation'
import { contextoDoChat } from '@/lib/chat/servidor'

export const dynamic = 'force-dynamic'

/** Link antigo de conversa direta (e-mails e avisos já enviados): abre a direta no Chat. */
export default async function ConversaDiretaPage({ params }: { params: Promise<{ userId: string }> }) {
  const { userId } = await params
  if (!/^[0-9a-f-]{36}$/.test(userId)) notFound()
  const { context, supabase } = await contextoDoChat()
  if (userId === context.user.id) redirect('/chat')
  const { data, error } = await supabase.rpc('chat_abrir_direta', { p_workspace_id: context.workspace.id, p_pessoas: [userId] })
  if (error || !data) notFound()
  redirect(`/chat/${data as string}`)
}
