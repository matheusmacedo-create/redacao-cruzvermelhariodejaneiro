import 'server-only'

import { del, put } from '@vercel/blob'
import { createAdminClient } from '@/lib/supabase/admin'
import { notificar } from '@/lib/notificacoes/servidor'
import { entregar } from '@/lib/whatsapp/fila'
import { numeroCanonico } from '@/lib/whatsapp/regras'
import {
  RESPOSTAS, avisoParaPortaria, caminhoDaFotoDoVisitante, ehTokenDaEntrada, linkDaVisita, mensagemParaVisitante, type RespostaDaVisita,
} from './regras'

type Admin = ReturnType<typeof createAdminClient>

/** O espaço da filial e o segredo do QR: o autocadastro só vale com o segredo do cartaz em vigor. */
export async function espacoDaEntrada(token: unknown, admin: Admin = createAdminClient()): Promise<string | null> {
  if (!ehTokenDaEntrada(token)) return null
  const { data: ws } = await admin.from('workspaces').select('id').eq('kind', 'production').order('created_at').limit(1).maybeSingle()
  if (!ws) return null
  const { data: c } = await admin.from('portaria_config').select('token').eq('workspace_id', ws.id).maybeSingle()
  return c?.token === token ? (ws.id as string) : null
}

/** Quem pode ser visitado: as pessoas ativas do Palácio (a equipe da Escola também recebe visita). */
export async function pessoasParaVisitar(workspaceId: string, admin: Admin = createAdminClient()): Promise<{ id: string; nome: string; setor: string | null }[]> {
  const { data } = await admin.from('workspace_members').select('user_id,coordination,profiles(full_name,active)').eq('workspace_id', workspaceId)
  return ((data ?? []) as unknown as { user_id: string; coordination: string | null; profiles: { full_name: string | null; active: boolean | null } | null }[])
    .filter((m) => m.profiles && m.profiles.active !== false && m.profiles.full_name?.trim())
    .map((m) => ({ id: m.user_id, nome: m.profiles!.full_name!.trim(), setor: m.coordination }))
    .sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'))
}

/**
 * Avisa quem é visitado (sino, e-mail e WhatsApp, conforme a preferência) e
 * pede a resposta: pode subir, aguarde na recepção ou não pode agora. O link
 * é o da visita: no WhatsApp, responder a mensagem chega aqui de volta
 * (lib/whatsapp/acoes.ts). Sai na hora, mesmo à noite e com o Palácio aberto:
 * a pessoa está na portaria. Nunca lança.
 */
export async function avisarVisitado(v: { workspaceId: string; visitaId: string; visitadoId: string | null; nome: string; empresa: string | null; motivo: string | null }, atorId: string | null) {
  if (!v.visitadoId) return
  await notificar(createAdminClient(), {
    // Quem chegou é o visitante, não quem registrou: o aviso sai mesmo quando a pessoa da
    // portaria registra uma visita para si (notificar não avisa o autor, e isso a calaria).
    workspaceId: v.workspaceId, para: [v.visitadoId], atorId: atorId === v.visitadoId ? null : atorId, categoria: 'portaria', importante: true,
    titulo: `${v.nome} chegou para falar com você`,
    mensagem: [v.empresa ? `De ${v.empresa}.` : '', v.motivo ? (/[.!?…]$/.test(v.motivo) ? v.motivo : `${v.motivo}.`) : '', 'Diga à portaria se pode subir, se aguarda na recepção ou se não pode receber agora.']
      .filter(Boolean).join(' ').slice(0, 400),
    link: linkDaVisita(v.visitaId), botao: 'Responder à portaria',
  })
}

/**
 * Depois de uma resposta (pelo Palácio ou pelo WhatsApp): avisa a portaria
 * (quem registrou ou confirmou a entrada) e, se o visitante autorizou na
 * entrada, manda a resposta para o WhatsApp dele. Nunca lança; devolve se o
 * visitante recebeu.
 */
export async function aposResposta(visitaId: string, quemRespondeu: string): Promise<{ visitanteAvisado: boolean }> {
  try {
    const admin = createAdminClient()
    const { data: v } = await admin.from('portaria_visitas')
      .select('id, workspace_id, nome, telefone, visitado_id, visitado_texto, resposta, resposta_recado, avisar_visitante, registrado_por, confirmado_por')
      .eq('id', visitaId).maybeSingle()
    if (!v || !v.resposta) return { visitanteAvisado: false }
    const resposta = v.resposta as RespostaDaVisita
    const [{ data: visitado }, { data: autor }, { data: vinculo }] = await Promise.all([
      v.visitado_id ? admin.from('profiles').select('full_name').eq('id', v.visitado_id).maybeSingle() : Promise.resolve({ data: null }),
      admin.from('profiles').select('full_name').eq('id', quemRespondeu).maybeSingle(),
      v.visitado_id ? admin.from('workspace_members').select('coordination').eq('workspace_id', v.workspace_id).eq('user_id', v.visitado_id).maybeSingle() : Promise.resolve({ data: null }),
    ])
    const nomeDoVisitado = (visitado?.full_name as string | null)?.trim() || (v.visitado_texto as string | null) || 'Quem você veio visitar'

    // O visitante, no WhatsApp que autorizou: a mesma entrega da fila (volume e falhas), fora do silêncio da noite.
    let visitanteAvisado = false
    const numero = v.avisar_visitante ? numeroCanonico(v.telefone as string | null) : null
    if (numero) {
      const entrega = await entregar(admin, v.workspace_id as string, {
        numero, tipo: 'aviso', categoria: 'portaria', userId: null, link: null,
        texto: mensagemParaVisitante({
          visitante: v.nome as string, quem: nomeDoVisitado, setor: (vinculo?.coordination as string | null) ?? null, resposta,
        }),
      })
      visitanteAvisado = entrega.situacao !== 'falhou'
    }

    // A portaria: quem registrou (ou confirmou o cadastro do QR). Quem respondeu não é avisado do que fez.
    const aviso = avisoParaPortaria({
      visitante: v.nome as string, quemRespondeu: (autor?.full_name as string | null)?.trim() || 'Quem é visitado', resposta,
      recado: v.resposta_recado as string | null, visitanteAvisado,
    })
    await notificar(admin, {
      workspaceId: v.workspace_id as string, para: [v.registrado_por as string | null, v.confirmado_por as string | null], atorId: quemRespondeu,
      categoria: 'portaria', importante: true, titulo: aviso.titulo, mensagem: aviso.mensagem, link: '/portaria', botao: 'Abrir a Portaria',
    })
    return { visitanteAvisado }
  } catch (causa) {
    console.error('[portaria] aviso da resposta não saiu:', causa instanceof Error ? causa.message : causa)
    return { visitanteAvisado: false }
  }
}

/**
 * A visita que espera esta pessoa agora: a de hoje (últimas 2 h), ainda
 * dentro, sem resposta ou com "aguarde". Só quando é uma: com duas, a
 * resposta sem citar a mensagem seria um chute.
 */
export async function visitaEsperandoResposta(admin: Admin, workspaceId: string, userId: string): Promise<{ id: string; nome: string } | null> {
  const { data, error } = await admin.from('portaria_visitas').select('id, nome, resposta').eq('workspace_id', workspaceId).eq('visitado_id', userId)
    .is('saida_em', null).is('descartada_em', null).gte('entrada_em', new Date(Date.now() - 2 * 3_600_000).toISOString()).limit(5)
  if (error) return null
  const abertas = (data ?? []).filter((v) => !v.resposta || v.resposta === 'aguardar')
  return abertas.length === 1 ? { id: abertas[0].id as string, nome: abertas[0].nome as string } : null
}

export const rotuloDaResposta = (r: RespostaDaVisita) => RESPOSTAS[r].rotulo

/** Grava a foto no Blob privado e devolve o caminho; quem chama registra no banco. */
export async function guardarFotoDoVisitante(workspaceId: string, visitaId: string, bytes: Uint8Array): Promise<string> {
  const blob = await put(caminhoDaFotoDoVisitante(workspaceId, visitaId, crypto.randomUUID()), Buffer.from(bytes), { access: 'private', addRandomSuffix: false, contentType: 'image/jpeg' })
  return blob.pathname
}

/** Apagar o arquivo é melhor esforço: o banco já não aponta para ele. */
export async function apagarFotoDoVisitante(caminho: string | null | undefined) {
  if (!caminho || !caminho.startsWith('portaria/')) return
  try {
    await del(caminho)
  } catch (causa) {
    console.error('[portaria] não foi possível apagar a foto do Blob:', causa instanceof Error ? causa.message : causa)
  }
}
