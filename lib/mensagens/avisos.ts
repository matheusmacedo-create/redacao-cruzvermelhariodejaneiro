import 'server-only'
import { createAdminClient } from '@/lib/supabase/admin'
import { notificar } from '@/lib/notificacoes/servidor'

/**
 * O aviso de uma mensagem direta (Mensagens): sai da tela e da resposta pelo WhatsApp. `origem: 'whatsapp'`: a
 * mensagem foi pedida ao assistente do WhatsApp do Palácio (lib/mensagens/enviar.ts) — o título e o e-mail dizem,
 * para quem recebe saber que não foi digitada na tela.
 */
export async function avisarMensagemDireta(admin: ReturnType<typeof createAdminClient>, p: {
  workspaceId: string; autorId: string; nome: string; para: string; corpo: string; origem?: 'whatsapp'
}) {
  const peloWhatsapp = p.origem === 'whatsapp'
  await notificar(admin, {
    workspaceId: p.workspaceId,
    para: [p.para],
    atorId: p.autorId,
    categoria: 'mensagens',
    titulo: peloWhatsapp ? `Mensagem de ${p.nome} · pelo WhatsApp do Palácio` : `Mensagem de ${p.nome}`,
    mensagem: p.corpo,
    textoDoEmail: peloWhatsapp
      ? `${p.nome} mandou uma mensagem para você no Palácio Virtual (enviada pelo WhatsApp do Palácio):`
      : `${p.nome} mandou uma mensagem para você no Palácio Virtual:`,
    citacao: p.corpo,
    link: `/mensagens/pessoa/${p.autorId}`,
    botao: 'Responder',
  })
}
