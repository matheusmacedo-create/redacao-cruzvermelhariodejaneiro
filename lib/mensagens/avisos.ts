import 'server-only'
import { createAdminClient } from '@/lib/supabase/admin'
import { notificar } from '@/lib/notificacoes/servidor'

/** O aviso de uma mensagem direta (Mensagens): sai da tela e da resposta pelo WhatsApp. */
export async function avisarMensagemDireta(admin: ReturnType<typeof createAdminClient>, p: { workspaceId: string; autorId: string; nome: string; para: string; corpo: string }) {
  await notificar(admin, {
    workspaceId: p.workspaceId,
    para: [p.para],
    atorId: p.autorId,
    categoria: 'mensagens',
    titulo: `Mensagem de ${p.nome}`,
    mensagem: p.corpo,
    textoDoEmail: `${p.nome} mandou uma mensagem para você no Palácio Virtual:`,
    citacao: p.corpo,
    link: `/mensagens/pessoa/${p.autorId}`,
    botao: 'Responder',
  })
}
