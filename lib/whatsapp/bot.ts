import 'server-only'
import { createAdminClient } from '@/lib/supabase/admin'
import { urlBase } from '@/lib/newsletter/contexto'
import { ORIGEM_DO_SITE } from '@/lib/site/sitemap'
import { registrar, type ConfigDoWhatsapp } from './servidor'
import { entregar } from './fila'
import {
  APRESENTACAO_A_CADA_HORAS, AVISOS_NA_RESPOSTA, JANELA_DAS_RESPOSTAS_MIN, RESPOSTAS_POR_JANELA, TEXTO_PAUSADO, TEXTO_VOLTOU,
  interpretarComando, textoDaApresentacao, textoDasLidas, textoDoMenu, textoDosAvisos, type MensagemRecebida,
} from './regras'

type Admin = ReturnType<typeof createAdminClient>

/**
 * O bot do WhatsApp: responde a quem escreve para o número do Palácio.
 *
 * Quem é da equipe e confirmou o número (whatsapp_contas) vê os avisos sem
 * abrir, marca como lidos e pausa ou retoma os avisos por aqui. Quem não é
 * recebe uma apresentação (no máximo uma por dia) com o caminho dos canais
 * oficiais: este número não é atendimento ao público.
 *
 * Nunca lança, e nunca responde duas vezes à mesma mensagem (o registro tem
 * trava por id; a Evolution reentrega quando demora). Um robô do outro lado
 * também não vira conversa infinita: há um teto de respostas por número.
 */
export async function atenderMensagem(admin: Admin, workspaceId: string, config: ConfigDoWhatsapp, m: MensagemRecebida): Promise<void> {
  try {
    // Grupo, mensagem do próprio número e endereço sem número: nem registra.
    if (m.ignorar || !m.numero) return
    const numero = m.numero

    const { data: conta } = await admin.from('whatsapp_contas').select('user_id, pausado_em').eq('numero', numero).maybeSingle()
    const pessoa = conta ? await pessoaDoEspaco(admin, workspaceId, conta.user_id as string) : null
    const pausado = Boolean(conta?.pausado_em)
    const comando = pessoa ? interpretarComando(m.texto, { pausado }) : 'apresentacao'

    const nova = await registrar(admin, {
      workspaceId, direcao: 'entrada', tipo: 'bot', situacao: 'recebida', numero, userId: pessoa?.id ?? null, mensagemId: m.id, comando,
    })
    if (!nova) return

    const desde = new Date(Date.now() - JANELA_DAS_RESPOSTAS_MIN * 60_000).toISOString()
    const { count: respostas } = await admin.from('whatsapp_mensagens').select('id', { count: 'exact', head: true })
      .eq('workspace_id', workspaceId).eq('direcao', 'saida').eq('tipo', 'bot').eq('numero', numero).gte('criado_em', desde)
    if ((respostas ?? 0) >= RESPOSTAS_POR_JANELA) return

    const responder = (texto: string) => entregar(admin, workspaceId, { numero, texto, tipo: 'bot', userId: pessoa?.id ?? null }, { config })
    const base = urlBase()

    if (!pessoa) {
      const umDia = new Date(Date.now() - APRESENTACAO_A_CADA_HORAS * 3_600_000).toISOString()
      const { count } = await admin.from('whatsapp_mensagens').select('id', { count: 'exact', head: true })
        .eq('workspace_id', workspaceId).eq('direcao', 'saida').eq('tipo', 'bot').eq('numero', numero).gte('criado_em', umDia)
      if ((count ?? 0) > 0) return
      await responder(textoDaApresentacao({ urlBase: base, site: ORIGEM_DO_SITE }))
      return
    }

    if (comando === 'avisos') {
      const [{ data: avisos }, { count: total }] = await Promise.all([
        admin.from('notifications').select('title, message, link').eq('user_id', pessoa.id).eq('workspace_id', workspaceId).is('read_at', null)
          .order('created_at', { ascending: false }).limit(AVISOS_NA_RESPOSTA),
        admin.from('notifications').select('id', { count: 'exact', head: true }).eq('user_id', pessoa.id).eq('workspace_id', workspaceId).is('read_at', null),
      ])
      await responder(textoDosAvisos({
        avisos: (avisos ?? []).map((a) => ({ titulo: a.title as string, mensagem: (a.message as string) ?? '', link: (a.link as string | null) ?? null })),
        total: total ?? 0, urlBase: base,
      }))
      return
    }

    if (comando === 'lidas') {
      const { data: lidas } = await admin.from('notifications').update({ read_at: new Date().toISOString() })
        .eq('user_id', pessoa.id).eq('workspace_id', workspaceId).is('read_at', null).select('id')
      await responder(textoDasLidas(lidas?.length ?? 0))
      return
    }

    if (comando === 'parar' || comando === 'voltar') {
      const { error } = await admin.from('whatsapp_contas')
        .update({ pausado_em: comando === 'parar' ? new Date().toISOString() : null, atualizado_em: new Date().toISOString() })
        .eq('user_id', pessoa.id)
      await responder(error ? 'Não consegui mudar agora. Tente de novo daqui a pouco ou mude em Meu perfil.' : comando === 'parar' ? TEXTO_PAUSADO : TEXTO_VOLTOU)
      return
    }

    const menu = textoDoMenu({ nome: pessoa.nome, pausado, urlBase: base })
    await responder(comando === 'desconhecido' ? `_Não entendi. Este número responde só às opções abaixo; mensagens soltas não chegam a ninguém._\n\n${menu}` : menu)
  } catch (causa) {
    console.error('[whatsapp] bot não respondeu:', causa instanceof Error ? causa.message : causa)
  }
}

/** A pessoa ativa, membro deste espaço; null para o resto (conta desativada vira "número desconhecido"). */
async function pessoaDoEspaco(admin: Admin, workspaceId: string, userId: string): Promise<{ id: string; nome: string | null } | null> {
  const { data } = await admin.from('workspace_members').select('user_id, profiles(full_name, active)').eq('workspace_id', workspaceId).eq('user_id', userId).maybeSingle()
  const perfil = (Array.isArray(data?.profiles) ? data?.profiles[0] : data?.profiles) as { full_name?: string | null; active?: boolean } | null | undefined
  if (!data || !perfil || perfil.active === false) return null
  return { id: userId, nome: perfil.full_name ?? null }
}
