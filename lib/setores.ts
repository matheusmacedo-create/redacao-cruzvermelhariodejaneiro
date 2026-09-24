import 'server-only'

import type { SupabaseClient } from '@supabase/supabase-js'
import { NOMES_DOS_SETORES } from './equipe'

/**
 * Os setores do espaço (cadastro em Pessoas → Setores). Antes eram uma lista
 * fixa em lib/equipe.ts; ela fica só como reserva, para um espaço que ainda
 * não tem setores no banco.
 */
export type SetorDoEspaco = { id: string; nome: string; descricao: string | null; responsavel_id: string | null; email: string | null; ordem: number; ativo: boolean }

export async function setoresDoEspaco(supabase: SupabaseClient, workspaceId: string): Promise<SetorDoEspaco[]> {
  const { data } = await supabase.from('setores').select('id,nome,descricao,responsavel_id,email,ordem,ativo').eq('workspace_id', workspaceId).order('ordem').order('nome')
  return (data ?? []) as SetorDoEspaco[]
}

/** Os nomes dos setores em uso (para escolher numa lista e para conferir o que chegou de um formulário). */
export async function nomesDosSetores(supabase: SupabaseClient, workspaceId: string): Promise<string[]> {
  const setores = await setoresDoEspaco(supabase, workspaceId)
  return setores.length ? setores.filter((s) => s.ativo).map((s) => s.nome) : [...NOMES_DOS_SETORES]
}
