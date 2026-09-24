import 'server-only'

import { requireWorkspace } from '@/lib/session'
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
