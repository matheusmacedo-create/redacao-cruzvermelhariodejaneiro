import 'server-only'

import { createAdminClient } from '@/lib/supabase/admin'
import { avisoAtivo, ordenarAvisos } from '@/lib/canal/regras'
import type { Membro } from './sessao'

/**
 * Conversas e avisos vistos pelo voluntário. Só as conversas dele; da equipe,
 * só o primeiro nome de quem respondeu.
 */

export type ConversaDoMembro = { id: string; assunto: string; categoria: string; situacao: string; atualizada_em: string; lida_pelo_membro_em: string | null; lida_pela_equipe_em: string | null }
export type MensagemDaConversa = { id: string; autor: 'membro' | 'equipe'; nome: string | null; texto: string; created_at: string }

const COLUNAS = 'id,assunto,categoria,situacao,atualizada_em,lida_pelo_membro_em,lida_pela_equipe_em'

export async function conversasDoMembro(m: Membro): Promise<ConversaDoMembro[]> {
  const { data } = await createAdminClient().from('membro_conversas').select(COLUNAS).eq('participante_id', m.participanteId).order('atualizada_em', { ascending: false }).limit(200)
  return (data ?? []) as ConversaDoMembro[]
}

export async function naoLidasDoMembro(m: Membro): Promise<number> {
  const { count } = await createAdminClient().from('membro_conversas').select('id', { count: 'exact', head: true })
    .eq('participante_id', m.participanteId).eq('situacao', 'respondida').is('lida_pelo_membro_em', null)
  return count ?? 0
}

export async function conversaDoMembro(m: Membro, id: string): Promise<{ conversa: ConversaDoMembro; mensagens: MensagemDaConversa[] } | null> {
  if (!/^[0-9a-f-]{36}$/.test(id)) return null
  const admin = createAdminClient()
  const { data: c } = await admin.from('membro_conversas').select(COLUNAS).eq('id', id).eq('participante_id', m.participanteId).maybeSingle()
  if (!c) return null
  const { data: msgs } = await admin.from('membro_mensagens').select('id,autor,texto,created_at,profiles:autor_user_id(full_name)').eq('conversa_id', id).order('created_at')
  return {
    conversa: c as ConversaDoMembro,
    mensagens: (msgs ?? []).map((x) => {
      const p = (Array.isArray(x.profiles) ? x.profiles[0] : x.profiles) as { full_name?: string } | null
      return { id: x.id as string, autor: x.autor as 'membro' | 'equipe', texto: x.texto as string, created_at: x.created_at as string, nome: p?.full_name ? p.full_name.trim().split(/\s+/)[0] : null }
    }),
  }
}

export type AvisoDoMembro = { id: string; titulo: string; texto: string; fixado: boolean; created_at: string; visto: boolean }

export async function avisosDoMembro(m: Membro, hoje: string): Promise<AvisoDoMembro[]> {
  const admin = createAdminClient()
  const [{ data: avisos }, { data: vistos }] = await Promise.all([
    admin.from('membro_avisos').select('id,titulo,texto,fixado,created_at,expira_em').eq('workspace_id', m.workspaceId).order('created_at', { ascending: false }).limit(100),
    admin.from('membro_avisos_vistos').select('aviso_id').eq('participante_id', m.participanteId),
  ])
  const ja = new Set((vistos ?? []).map((v) => v.aviso_id as string))
  return ordenarAvisos((avisos ?? []).filter((a) => avisoAtivo(a as { expira_em: string | null }, hoje)).map((a) => ({
    id: a.id as string, titulo: a.titulo as string, texto: a.texto as string, fixado: a.fixado as boolean, created_at: a.created_at as string, visto: ja.has(a.id as string),
  })))
}
