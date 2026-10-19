import 'server-only'
import { createAdminClient } from '@/lib/supabase/admin'
import { urlBase } from '@/lib/newsletter/contexto'
import type { ResultadoDaAcao } from '@/lib/whatsapp/regras'
import { avisarMensagemDireta } from './avisos'

type Admin = ReturnType<typeof createAdminClient>

/**
 * Por onde a mensagem direta sai. `whatsapp`: em nome de quem escreveu no WhatsApp do Palácio, pela função do banco
 * (whatsapp_mensagem_direta, sessão simulada aal1), que confere as regras da tela — pessoa ativa, fora da escola,
 * com a verificação em dia; destinatário ativo do espaço e diferente dela; até 2.000 caracteres; a mesma mensagem
 * em 10 s é a mesma. [onda 2] `sessao`: pela sessão da página de confirmar no Palácio.
 */
export type CanalDaMensagem = { via: 'whatsapp'; admin: Admin }

/** A função do banco não existe: a migração do assistente ainda não foi aplicada. */
const semFuncao = (error: { code?: string } | null) => error?.code === 'PGRST202' || error?.code === '42883'

/**
 * Manda uma mensagem direta (Mensagens) e avisa quem recebe só se ela é nova — com a marca de que veio pelo
 * WhatsApp do Palácio quando `origem` diz. Nunca lança: devolve ResultadoDaAcao (o plano do assistente decide por `ok`).
 */
export async function enviarMensagemDireta(canal: CanalDaMensagem, p: {
  workspaceId: string; autor: { id: string; nome: string | null }; paraId: string; corpo: string; origem?: 'whatsapp'
}): Promise<ResultadoDaAcao> {
  const abrir = `${urlBase()}/mensagens/pessoa/${p.paraId}`
  try {
    const { data, error } = await canal.admin.rpc('whatsapp_mensagem_direta', { p_user_id: p.autor.id, p_workspace_id: p.workspaceId, p_para: p.paraId, p_corpo: p.corpo })
    if (semFuncao(error)) return { ok: false, codigo: 'indisponivel', texto: 'A mensagem pelo WhatsApp ainda não está ligada; mande pelo Palácio.' }
    if (error) {
      const conhecido = (error.code === 'P0001' || error.code === '42501') && error.message
      return { ok: false, codigo: error.code === '42501' ? 'sem_permissao' : 'erro', texto: conhecido ? error.message : 'Não foi possível enviar a mensagem.' }
    }
    if ((data as { nova?: unknown } | null)?.nova === true) {
      await avisarMensagemDireta(canal.admin, { workspaceId: p.workspaceId, autorId: p.autor.id, nome: p.autor.nome || 'Um colega', para: p.paraId, corpo: p.corpo, origem: p.origem })
    }
    return { ok: true, codigo: 'feito', texto: `Mensagem enviada. ${abrir}`, link: abrir }
  } catch (causa) {
    console.error('[mensagens] mensagem direta não enviada:', causa instanceof Error ? causa.message : causa)
    return { ok: false, codigo: 'erro', texto: 'Não foi possível enviar a mensagem.' }
  }
}
