import 'server-only'
import { createAdminClient } from '@/lib/supabase/admin'
import { notificar } from '@/lib/notificacoes/servidor'
import { textoDoAviso, type MensagemDoChat } from './regras'

/**
 * O aviso de uma mensagem nova do chat. Sai da action do chat e do bot do
 * WhatsApp (resposta citando o aviso), então as regras de quem é avisado são
 * uma só:
 *  - conversa direta: todo mundo dela, a cada mensagem;
 *  - canal: quem foi mencionado (ou todos, com @canal) e quem escolheu
 *    "toda mensagem" naquele canal. O resto entra no resumo diário;
 *  - resposta em fio: quem escreveu a principal, quem já respondeu e quem
 *    foi mencionado (numa direta, todo mundo dela).
 */
export async function avisarSobreMensagem(workspaceId: string, canalId: string, autorId: string, m: MensagemDoChat) {
  const admin = createAdminClient()
  const [{ data: canal }, { data: membros }, { data: autor }] = await Promise.all([
    admin.from('chat_canais').select('tipo, nome').eq('id', canalId).single(),
    admin.from('chat_membros').select('user_id, avisar').eq('canal_id', canalId),
    admin.from('profiles').select('full_name, username').eq('id', autorId).single(),
  ])
  if (!canal) return
  const quem = autor?.full_name || autor?.username || 'Alguém'
  const outros = (membros ?? []).filter((x) => x.user_id !== autorId && x.avisar !== 'nada')
  const base = { workspaceId, atorId: autorId, categoria: 'chat' as const, link: `/chat/${canalId}`, citacao: textoDoAviso(m, 400), botao: 'Abrir a conversa', mensagem: textoDoAviso(m) }
  if (m.resposta_de) {
    const { data: pai } = await admin.from('chat_mensagens').select('autor_id, respondentes').eq('id', m.resposta_de).single()
    const noFio = new Set<string>([pai?.autor_id as string, ...((pai?.respondentes as string[]) ?? []), ...m.mencoes].filter(Boolean))
    const para = outros.filter((x) => canal.tipo === 'direta' || m.menciona_todos || noFio.has(x.user_id as string)).map((x) => x.user_id as string)
    if (para.length) {
      await notificar(admin, {
        ...base, link: `/chat/${canalId}?fio=${m.resposta_de}`, botao: 'Abrir o fio', para,
        titulo: canal.tipo === 'canal' ? `${quem} respondeu no fio em #${canal.nome}` : `${quem} respondeu no fio da conversa`,
      })
    }
    return
  }
  if (canal.tipo === 'direta') {
    const grupo = (membros ?? []).length > 2
    await notificar(admin, { ...base, para: outros.map((x) => x.user_id as string), titulo: grupo ? `${quem} escreveu na conversa em grupo` : `Mensagem de ${quem}` })
    return
  }
  const chamados = new Set(outros.filter((x) => m.menciona_todos || m.mencoes.includes(x.user_id as string)).map((x) => x.user_id as string))
  if (chamados.size) await notificar(admin, { ...base, para: [...chamados], titulo: `${quem} mencionou ${m.menciona_todos ? 'o canal' : 'você'} em #${canal.nome}` })
  const todas = outros.filter((x) => x.avisar === 'tudo' && !chamados.has(x.user_id as string)).map((x) => x.user_id as string)
  if (todas.length) await notificar(admin, { ...base, para: todas, titulo: `Nova mensagem de ${quem} em #${canal.nome}` })
}
