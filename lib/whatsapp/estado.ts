import 'server-only'
import { createAdminClient } from '@/lib/supabase/admin'
import { ALERTA_A_CADA_HORAS, type EstadoDaConexao } from './regras'

type Admin = ReturnType<typeof createAdminClient>

/**
 * O estado da conexão do WhatsApp do Palácio, e o alerta à administração
 * quando ele cai ou volta.
 *
 * A Evolution roda num computador da filial: se ele desliga, perde a
 * internet ou o celular sai do "Dispositivos conectados", os avisos param em
 * silêncio. Quem descobre isso primeiro é o Palácio — pela Evolution
 * (connection.update no webhook), por um envio que falhou por rede ou pela
 * checagem diária (/api/whatsapp/rotina) — e é daqui que sai o aviso no sino
 * e no e-mail dos administradores. Nunca pelo WhatsApp: é justamente o que
 * caiu (categoria "sistema", fora do WhatsApp em lib/whatsapp/regras.ts).
 *
 * Nunca lança. Antes da migração da fila, a tabela não existe e nada acontece.
 */

const FORA: EstadoDaConexao[] = ['desconectado', 'sem_instancia', 'erro']

const TEXTO_DA_QUEDA: Record<string, string> = {
  desconectado: 'O número do Palácio saiu do WhatsApp (desconectado). Os avisos por WhatsApp estão parados até conectar de novo pelo QR code.',
  sem_instancia: 'A instância do WhatsApp não existe mais no servidor da Evolution. Os avisos por WhatsApp estão parados.',
  erro: 'O Palácio não consegue falar com o servidor da Evolution (computador desligado, sem internet ou túnel do ngrok parado). Os avisos por WhatsApp estão parados e ficam na fila até voltar.',
}

export async function registrarEstado(admin: Admin, workspaceId: string, estado: EstadoDaConexao): Promise<void> {
  try {
    const agora = new Date()
    const { data: atual, error } = await admin.from('whatsapp_estado').select('estado, desde, alertado_em').eq('workspace_id', workspaceId).maybeSingle()
    if (error) return
    if (atual?.estado === estado) {
      await admin.from('whatsapp_estado').update({ verificado_em: agora.toISOString() }).eq('workspace_id', workspaceId)
      return
    }
    const caiu = FORA.includes(estado) && (!atual || !FORA.includes(atual.estado as EstadoDaConexao))
    const voltou = estado === 'conectado' && Boolean(atual?.alertado_em)
    const ultimoAlerta = atual?.alertado_em ? new Date(atual.alertado_em as string).getTime() : 0
    const alertar = caiu && agora.getTime() - ultimoAlerta > ALERTA_A_CADA_HORAS * 3_600_000

    await admin.from('whatsapp_estado').upsert({
      workspace_id: workspaceId, estado, desde: agora.toISOString(), verificado_em: agora.toISOString(),
      alertado_em: alertar ? agora.toISOString() : voltou ? null : atual?.alertado_em ?? null,
    }, { onConflict: 'workspace_id' })

    if (alertar) await avisarAdministracao(admin, workspaceId, 'O WhatsApp do Palácio caiu', TEXTO_DA_QUEDA[estado] ?? TEXTO_DA_QUEDA.erro)
    if (voltou) await avisarAdministracao(admin, workspaceId, 'O WhatsApp do Palácio voltou', 'A conexão voltou. O que ficou na fila começa a sair agora.')
  } catch (causa) {
    console.error('[whatsapp] estado não registrado:', causa instanceof Error ? causa.message : causa)
  }
}

async function avisarAdministracao(admin: Admin, workspaceId: string, titulo: string, mensagem: string) {
  const { data: admins } = await admin.from('workspace_members').select('user_id').eq('workspace_id', workspaceId).eq('role', 'admin')
  if (!admins?.length) return
  // Import tardio: notificar() usa o WhatsApp, e o WhatsApp avisa por notificar().
  const { notificar } = await import('@/lib/notificacoes/servidor')
  await notificar(admin, {
    workspaceId, para: admins.map((a) => a.user_id as string), atorId: null, categoria: 'sistema',
    titulo, mensagem, link: '/configuracoes/whatsapp', botao: 'Ver a conexão do WhatsApp',
  })
}
