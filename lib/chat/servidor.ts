import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import { requireWorkspace } from '@/lib/session'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import type { PessoaDoChat } from './regras'

/**
 * O chat é da Redação e da equipe da escola (que só vê os canais para que
 * foi chamada): o portão abre para as duas; o banco decide o resto.
 */
export async function contextoDoChat() {
  const context = await requireWorkspace({ escola: true })
  const supabase = await createClient()
  return { context, supabase }
}

export type ConversaNoPainel = {
  id: string
  tipo: 'canal' | 'direta'
  nome: string | null
  descricao: string
  privado: boolean
  geral: boolean
  setor_id: string | null
  arquivado: boolean
  membro: boolean
  avisar: 'tudo' | 'mencoes' | 'nada'
  nao_lidas: number
  mencoes: number
  ultima_mensagem_em: string | null
  pessoas: string[] | null
}

/** A lista da lateral. Na primeira vez do espaço, cria o #geral e os canais dos setores. */
export async function painelDoChat(supabase: SupabaseClient, workspaceId: string): Promise<ConversaNoPainel[]> {
  let { data } = await supabase.rpc('chat_painel', { p_workspace_id: workspaceId })
  if (!(data ?? []).some((c: ConversaNoPainel) => c.geral)) {
    await supabase.rpc('chat_preparar', { p_workspace_id: workspaceId })
    ;({ data } = await supabase.rpc('chat_painel', { p_workspace_id: workspaceId }))
  }
  return (data ?? []) as ConversaNoPainel[]
}

/**
 * Nomes e fotos de quem aparece no chat. A Redação vê a equipe toda; a
 * equipe da escola, só quem está nas conversas dela (o diretório da Redação
 * continua fechado para ela).
 */
export async function pessoasDoChat(workspaceId: string, userId: string, equipeDaEscola: boolean): Promise<PessoaDoChat[]> {
  const admin = createAdminClient()
  let ids: string[] | null = null
  if (equipeDaEscola) {
    const { data: meus } = await admin.from('chat_membros').select('canal_id').eq('workspace_id', workspaceId).eq('user_id', userId)
    const canais = (meus ?? []).map((m) => m.canal_id as string)
    const { data: juntos } = canais.length ? await admin.from('chat_membros').select('user_id').in('canal_id', canais) : { data: [] }
    ids = [...new Set([userId, ...(juntos ?? []).map((m) => m.user_id as string)])]
  }
  let q = admin.from('workspace_members').select('user_id, profiles(full_name, username, initials, color, avatar_path, active)').eq('workspace_id', workspaceId)
  if (ids) q = q.in('user_id', ids)
  const { data } = await q
  return (data ?? []).map((m) => {
    const p = (Array.isArray(m.profiles) ? m.profiles[0] : m.profiles) as { full_name?: string; username?: string; initials?: string; color?: string | null; avatar_path?: string | null; active?: boolean } | null
    const nome = p?.full_name || p?.username || 'Alguém'
    return {
      id: m.user_id as string, nome,
      iniciais: p?.initials || nome.split(/\s+/).slice(0, 2).map((x) => x[0]).join('').toUpperCase(),
      cor: p?.color ?? null, avatar: p?.avatar_path ?? null, ativo: p?.active !== false,
    }
  }).sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'))
}
