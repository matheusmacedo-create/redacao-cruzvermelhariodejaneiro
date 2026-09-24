import 'server-only'

import { obterWorkspace, requireWorkspace } from '@/lib/session'
import { createClient } from '@/lib/supabase/server'
import { nivelDoNome, type Nivel } from './regras'

/**
 * O nível de quem está logado no cadastro de participantes: admin tem tudo;
 * os demais, o que um admin concedeu. O banco aplica a mesma regra
 * (private.nivel_participantes); aqui é para a tela e as actions saberem.
 */
export async function contextoDeParticipantes() {
  const context = await requireWorkspace()
  const supabase = await createClient()
  let nivel: Nivel = 0
  if (context.role === 'admin') nivel = 3
  else {
    const { data } = await supabase.from('participantes_acesso').select('nivel').eq('workspace_id', context.workspace.id).eq('user_id', context.user.id).maybeSingle()
    nivel = nivelDoNome(data?.nivel)
  }
  return { context, supabase, nivel }
}

/**
 * O mesmo nível, sem redirecionar: para as rotas da Área do Voluntário, que
 * só querem saber se quem está com a sessão da equipe pode visualizá-la.
 * Null quando não há sessão válida da equipe (inclusive senha provisória ou
 * verificação em duas etapas pendente).
 */
export async function nivelDeParticipantesSemRedirecionar(): Promise<{ workspaceId: string; userId: string; nome: string; nivel: Nivel } | null> {
  const context = await obterWorkspace()
  if (!context || context.profile?.trocar_senha) return null
  const supabase = await createClient()
  let nivel: Nivel = 0
  if (context.role === 'admin') nivel = 3
  else {
    const { data } = await supabase.from('participantes_acesso').select('nivel').eq('workspace_id', context.workspace.id).eq('user_id', context.user.id).maybeSingle()
    nivel = nivelDoNome(data?.nivel)
  }
  return { workspaceId: context.workspace.id, userId: context.user.id, nome: (context.profile?.full_name as string | undefined) ?? 'Equipe', nivel }
}
