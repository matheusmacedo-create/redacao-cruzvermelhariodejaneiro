import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import { createAdminClient } from '@/lib/supabase/admin'
import { urlBase } from '@/lib/newsletter/contexto'
import type { ResultadoDaAcao } from '@/lib/whatsapp/regras'
import { avisarMensagemDireta } from './avisos'

type Admin = ReturnType<typeof createAdminClient>

/**
 * Por onde a mensagem direta sai:
 *  - `whatsapp`: em nome de quem escreveu no WhatsApp do Palácio, pela função do banco (whatsapp_mensagem_direta,
 *    sessão simulada aal1), que confere as regras da tela — pessoa ativa, fora da escola, com a verificação em dia;
 *    destinatário ativo do espaço e diferente dela; até 2.000 caracteres; a mesma mensagem em 10 s é a mesma;
 *  - `sessao`: pela sessão de quem está logado (o RLS de messages e o nível da sessão valem) — a tela de Mensagens
 *    (sendDirectMessage, em app/actions/editorial.ts) e o plano do assistente confirmado no Palácio
 *    (app/confirmar/[token]). O aviso a quem recebe sai pelo serviço (`admin`), como sempre.
 */
export type CanalDaMensagem = { via: 'whatsapp'; admin: Admin } | { via: 'sessao'; supabase: SupabaseClient; admin: Admin }

/** A função do banco não existe: a migração do assistente ainda não foi aplicada. */
const semFuncao = (error: { code?: string } | null) => error?.code === 'PGRST202' || error?.code === '42883'

/**
 * Manda uma mensagem direta (Mensagens) e avisa quem recebe só se ela é nova — com a marca de que veio pelo
 * WhatsApp do Palácio quando `origem` diz. Nunca lança: devolve ResultadoDaAcao (o plano do assistente decide por `ok`;
 * a tela lança com o `texto`).
 */
export async function enviarMensagemDireta(canal: CanalDaMensagem, p: {
  workspaceId: string; autor: { id: string; nome: string | null }; paraId: string; corpo: string; origem?: 'whatsapp'
}): Promise<ResultadoDaAcao> {
  const abrir = `${urlBase()}/mensagens/pessoa/${p.paraId}`
  try {
    const gravada = canal.via === 'sessao' ? await pelaSessao(canal.supabase, p) : await peloWhatsapp(canal.admin, p)
    if ('erro' in gravada) return gravada.erro
    if (gravada.nova) {
      await avisarMensagemDireta(canal.admin, { workspaceId: p.workspaceId, autorId: p.autor.id, nome: p.autor.nome || 'Um colega', para: p.paraId, corpo: p.corpo, origem: p.origem })
    }
    return { ok: true, codigo: 'feito', texto: `Mensagem enviada. ${abrir}`, link: abrir }
  } catch (causa) {
    console.error('[mensagens] mensagem direta não enviada:', causa instanceof Error ? causa.message : causa)
    return { ok: false, codigo: 'erro', texto: 'Não foi possível enviar a mensagem.' }
  }
}

type Gravada = { nova: boolean } | { erro: Extract<ResultadoDaAcao, { ok: false }> }

/** Pela função do banco, em nome de quem escreveu no WhatsApp. */
async function peloWhatsapp(admin: Admin, p: { workspaceId: string; autor: { id: string }; paraId: string; corpo: string }): Promise<Gravada> {
  const { data, error } = await admin.rpc('whatsapp_mensagem_direta', { p_user_id: p.autor.id, p_workspace_id: p.workspaceId, p_para: p.paraId, p_corpo: p.corpo })
  if (semFuncao(error)) return { erro: { ok: false, codigo: 'indisponivel', texto: 'A mensagem pelo WhatsApp ainda não está ligada; mande pelo Palácio.' } }
  if (error) {
    const conhecido = (error.code === 'P0001' || error.code === '42501') && error.message
    return { erro: { ok: false, codigo: error.code === '42501' ? 'sem_permissao' : 'erro', texto: conhecido ? error.message : 'Não foi possível enviar a mensagem.' } }
  }
  return { nova: (data as { nova?: unknown } | null)?.nova === true }
}

/**
 * Pela sessão, com as regras da tela: o destinatário é do espaço e não é a própria pessoa; até 2.000 caracteres; a
 * mesma mensagem em 10 s é a mesma (não repete nem avisa de novo). A mensagem vem primeiro: é ela que fica.
 */
async function pelaSessao(supabase: SupabaseClient, p: { workspaceId: string; autor: { id: string }; paraId: string; corpo: string }): Promise<Gravada> {
  if (!p.paraId || p.corpo.length < 1 || p.corpo.length > 2000) return { erro: { ok: false, codigo: 'erro', texto: 'Escreva uma mensagem com até 2.000 caracteres.' } }
  if (p.paraId === p.autor.id) return { erro: { ok: false, codigo: 'erro', texto: 'Selecione outra pessoa do espaço.' } }
  const { data: membro } = await supabase.from('workspace_members').select('user_id').eq('workspace_id', p.workspaceId).eq('user_id', p.paraId).maybeSingle()
  if (!membro) return { erro: { ok: false, codigo: 'sem_permissao', texto: 'A pessoa selecionada não pertence a este espaço.' } }
  const { data: igual } = await supabase.from('messages').select('id').is('pauta_id', null).eq('author_id', p.autor.id).eq('recipient_id', p.paraId)
    .eq('body', p.corpo).gte('created_at', new Date(Date.now() - 10_000).toISOString()).limit(1).maybeSingle()
  if (igual) return { nova: false }
  const { error } = await supabase.from('messages').insert({ workspace_id: p.workspaceId, pauta_id: null, author_id: p.autor.id, recipient_id: p.paraId, body: p.corpo })
  if (error) return { erro: { ok: false, codigo: error.code === '42501' ? 'sem_permissao' : 'erro', texto: 'Não foi possível enviar a mensagem.' } }
  return { nova: true }
}
