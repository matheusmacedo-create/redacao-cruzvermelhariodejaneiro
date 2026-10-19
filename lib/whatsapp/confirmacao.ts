import 'server-only'
import { createAdminClient } from '@/lib/supabase/admin'
import { auditarConta, avisarTrocaDeWhatsapp } from '@/lib/contas/servidor'
import { CODIGO_TENTATIVAS, mascararNumero, type SentidoDoCodigo } from './regras'
import { consentimentoGuardado } from './voluntarios-regras'
import { semColuna } from './servidor'

type Admin = ReturnType<typeof createAdminClient>

/**
 * A confirmação do número, a mesma nos dois caminhos (regras.ts, "confirmação do número"): a tela
 * chama ao conferir o código digitado (volta; app/actions/whatsapp.ts e membro-whatsapp.ts) e o
 * bot, ao conferir o código que a pessoa mandou ao Palácio (ida; lib/whatsapp/bot.ts). As mesmas
 * gravações, a mesma auditoria, o mesmo aviso de troca de número e a mesma regra de "um número, uma
 * conta" (índice único: 23505).
 *
 * Os códigos ficam onde sempre ficaram: whatsapp_codigos (equipe, uma linha por código) e
 * participantes_whatsapp (voluntário, o código em andamento na própria linha). Nenhuma coluna diz
 * o sentido: quem distingue é o hash (o sentido entra nele), conferido no lugar certo.
 */

/** O código amarrado ao voluntário (o prefixo separa do código de quem é da equipe). */
export const donoDoVoluntario = (participanteId: string) => `voluntario:${participanteId}`

export type Confirmacao = { ok: true } | { ok: false; motivo: 'usado' | 'outra_conta' | 'falhou' }

/**
 * Consome o código de forma atômica (dois cliques ou duas entregas não confirmam duas vezes) e guarda o número de quem é da equipe.
 * Se havia outro número confirmado, o e-mail da pessoa e o número antigo ficam sabendo da troca (avisarTrocaDeWhatsapp).
 *
 * `nome`: o nome de perfil do WhatsApp que veio com o código de ida (MensagemRecebida.nome). A confirmação grava o
 * nome visto (nome_no_whatsapp; null pelo caminho de digitar, que não traz nome: o assistente grava no primeiro uso)
 * e zera a suspensão do assistente por troca de nome (lib/whatsapp/assistente/uso.ts): confirmar exige o login no
 * Palácio e o número na mão. Antes da migração do assistente, grava sem essas colunas.
 */
export async function confirmarNumeroDaEquipe(admin: Admin, p: {
  codigoId: string; userId: string; numero: string; workspaceId: string; sentido: SentidoDoCodigo; nome?: string | null
}): Promise<Confirmacao> {
  const agora = new Date().toISOString()
  const { data: consumido } = await admin.from('whatsapp_codigos').update({ usado_em: agora })
    .eq('id', p.codigoId).is('usado_em', null).gt('expira_em', agora).select('id').maybeSingle()
  if (!consumido) return { ok: false, motivo: 'usado' }

  const { data: antes } = await admin.from('whatsapp_contas').select('numero').eq('user_id', p.userId).maybeSingle()
  const anterior = (antes?.numero as string | undefined) ?? null
  const linha = { user_id: p.userId, numero: p.numero, confirmado_em: agora, pausado_em: null, atualizado_em: agora }
  const doAssistente = { nome_no_whatsapp: p.nome?.trim().slice(0, 80) || null, assistente_suspenso_em: null }
  let { error } = await admin.from('whatsapp_contas').upsert({ ...linha, ...doAssistente }, { onConflict: 'user_id' })
  if (semColuna(error)) ({ error } = await admin.from('whatsapp_contas').upsert(linha, { onConflict: 'user_id' }))
  if (error?.code === '23505') return { ok: false, motivo: 'outra_conta' }
  if (error) return { ok: false, motivo: 'falhou' }

  const trocou = Boolean(anterior && anterior !== p.numero)
  await auditarConta(admin, {
    userId: p.userId, atorId: p.userId, acao: 'whatsapp_confirmado', workspaceId: p.workspaceId,
    detalhes: {
      numero: mascararNumero(p.numero), caminho: p.sentido === 'ida' ? 'codigo_mandado_ao_palacio' : 'codigo_digitado',
      ...(trocou ? { anterior: mascararNumero(anterior) } : {}),
    },
  })
  if (trocou) await avisarTrocaDeWhatsapp(admin, p.userId, { anterior, novo: p.numero })
  return { ok: true }
}

/**
 * Consome o código e guarda o número do voluntário com a autorização, de uma vez. A autorização
 * foi marcada na tela para o código existir (sem ela, nem o de ida nem o de volta são gerados).
 */
export async function confirmarNumeroDoVoluntario(admin: Admin, p: { participanteId: string; numero: string; codigoHash: string }): Promise<Confirmacao> {
  const agora = new Date().toISOString()
  const { data: confirmado, error } = await admin.from('participantes_whatsapp').update({
    numero: p.numero, confirmado_em: agora, consentimento_em: agora, consentimento_texto: consentimentoGuardado(), pausado_em: null,
    numero_pendente: null, codigo_hash: null, codigo_expira_em: null, codigo_tentativas: 0, atualizado_em: agora,
  }).eq('participante_id', p.participanteId).eq('codigo_hash', p.codigoHash).gt('codigo_expira_em', agora).select('participante_id').maybeSingle()
  if (error?.code === '23505') return { ok: false, motivo: 'outra_conta' }
  if (error) return { ok: false, motivo: 'falhou' }
  if (!confirmado) return { ok: false, motivo: 'usado' }
  return { ok: true }
}

// ------------------------------------------------------------------ pelo bot

export type CodigoPendente =
  | { quem: 'equipe'; id: string; userId: string; hash: string; tentativas: number }
  | { quem: 'voluntario'; participanteId: string; hash: string; tentativas: number }

/**
 * Os códigos em aberto (não usados, não vencidos, com tentativas) para este número. Pode haver
 * mais de um: duas contas digitaram o mesmo número. Nunca lança; sem as tabelas, nenhum.
 */
export async function codigosPendentesDoNumero(admin: Admin, workspaceId: string, numero: string): Promise<CodigoPendente[]> {
  try {
    const agora = new Date().toISOString()
    const [{ data: daEquipe }, { data: deVoluntarios }] = await Promise.all([
      admin.from('whatsapp_codigos').select('id, user_id, codigo_hash, tentativas').eq('numero', numero).is('usado_em', null)
        .gt('expira_em', agora).lt('tentativas', CODIGO_TENTATIVAS).order('criado_em', { ascending: false }).limit(5),
      admin.from('participantes_whatsapp').select('participante_id, codigo_hash, codigo_tentativas').eq('workspace_id', workspaceId).eq('numero_pendente', numero)
        .not('codigo_hash', 'is', null).gt('codigo_expira_em', agora).lt('codigo_tentativas', CODIGO_TENTATIVAS).limit(5),
    ])
    return [
      ...(daEquipe ?? []).map((c): CodigoPendente => ({ quem: 'equipe', id: c.id as string, userId: c.user_id as string, hash: c.codigo_hash as string, tentativas: Number(c.tentativas ?? 0) })),
      ...(deVoluntarios ?? []).map((c): CodigoPendente => ({ quem: 'voluntario', participanteId: c.participante_id as string, hash: c.codigo_hash as string, tentativas: Number(c.codigo_tentativas ?? 0) })),
    ]
  } catch (causa) {
    console.error('[whatsapp] códigos pendentes não lidos:', causa instanceof Error ? causa.message : causa)
    return []
  }
}

/**
 * Código errado mandado ao bot: conta uma tentativa em cada código em aberto do número (cada um é
 * alvo de quem tenta adivinhar). Devolve quantas tentativas ainda restam no que mais tem.
 */
export async function contarTentativaErrada(admin: Admin, pendentes: CodigoPendente[]): Promise<number> {
  await Promise.all(pendentes.map((p) => p.quem === 'equipe'
    ? admin.from('whatsapp_codigos').update({ tentativas: p.tentativas + 1 }).eq('id', p.id).eq('tentativas', p.tentativas)
    : admin.from('participantes_whatsapp').update({ codigo_tentativas: p.tentativas + 1 }).eq('participante_id', p.participanteId)
      .eq('codigo_hash', p.hash).eq('codigo_tentativas', p.tentativas)))
  return Math.max(0, ...pendentes.map((p) => CODIGO_TENTATIVAS - p.tentativas - 1))
}
