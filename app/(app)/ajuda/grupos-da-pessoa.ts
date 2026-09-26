import 'server-only'
import { gruposDaEquipeDaEscola, gruposVisiveis, type Grupo } from '@/lib/navegacao'
import { ehEquipeDaEscola, pode } from '@/lib/permissoes'
import type { requireWorkspace } from '@/lib/session'
import { createClient } from '@/lib/supabase/server'

/**
 * As áreas que esta pessoa pode abrir, agrupadas — a mesma regra do menu
 * (layout do (app)). A Central lista só essas, e a ajuda de uma área fechada
 * para ela não abre, nem pelo endereço.
 */
export async function gruposDaPessoa(context: Awaited<ReturnType<typeof requireWorkspace>>): Promise<Grupo[]> {
  if (!ehEquipeDaEscola(context.role)) return gruposVisiveis((p) => pode(context.role, p))
  // O Financeiro da escola aparece se os livros dela foram liberados (o RLS decide), como no menu.
  const supabase = await createClient()
  const { count } = await supabase.from('fin_entidades').select('id', { count: 'exact', head: true }).eq('workspace_id', context.workspace.id).eq('tipo', 'escola')
  return gruposDaEquipeDaEscola(Boolean(count))
}
