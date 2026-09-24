import 'server-only'

import type { createClient } from '@/lib/supabase/server'
import type { Opcao } from '@/components/app/equipe/formulario'
import { nomesDosSetores } from '@/lib/setores'

type Cliente = Awaited<ReturnType<typeof createClient>>

/**
 * As listas da ficha: quem pode ser gestor (fichas não desligadas, menos a
 * própria), os logins do espaço ainda não ligados a outra ficha e os
 * setores do espaço (Pessoas → Setores).
 */
export async function opcoesDaFicha(supabase: Cliente, workspaceId: string, membroId: string | null) {
  const [{ data: fichas }, { data: membros }, setores] = await Promise.all([
    supabase.from('equipe_membros').select('id,nome,nome_social,situacao,user_id,cargo').eq('workspace_id', workspaceId).order('nome').limit(5000),
    supabase.from('workspace_members').select('user_id,profiles(full_name,active)').eq('workspace_id', workspaceId),
    nomesDosSetores(supabase, workspaceId),
  ])
  const gestores: Opcao[] = (fichas ?? []).filter((f) => f.id !== membroId && f.situacao !== 'desligado')
    .map((f) => ({ id: f.id as string, nome: `${f.nome_social || f.nome}${f.cargo ? ` — ${f.cargo}` : ''}` }))
  const ocupados = new Set((fichas ?? []).filter((f) => f.id !== membroId).map((f) => f.user_id).filter(Boolean))
  const logins: Opcao[] = (membros ?? []).map((m) => ({ id: m.user_id as string, p: (Array.isArray(m.profiles) ? m.profiles[0] : m.profiles) as { full_name?: string; active?: boolean } | null }))
    .filter((m) => !ocupados.has(m.id) && m.p?.active !== false)
    .map((m) => ({ id: m.id, nome: m.p?.full_name ?? 'Sem nome' }))
    .sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'))
  return { gestores, logins, setores }
}
