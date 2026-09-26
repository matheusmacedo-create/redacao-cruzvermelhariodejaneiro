'use server'

import { revalidatePath } from 'next/cache'
import { requireWorkspace } from '@/lib/session'
import { createClient } from '@/lib/supabase/server'
import { mensagemDoErro } from '@/lib/erro-de-acao'
import { lerArrumacao, paraGuardar } from '@/lib/inicio/blocos'

/**
 * O Início modular: guardar a arrumação de quem está logado (quais blocos
 * aparecem e em que ordem) ou voltar à padrão. Cada um só mexe na própria
 * — o RLS de inicio_preferencias confere de novo.
 */

type Resultado = { erro?: string }

export async function salvarInicio(blocos: unknown): Promise<Resultado> {
  try {
    const context = await requireWorkspace()
    // lerArrumacao limpa o que veio da tela: só blocos que existem, sem repetição, todos presentes.
    const arrumacao = paraGuardar(lerArrumacao(blocos))
    const supabase = await createClient()
    const { error } = await supabase.from('inicio_preferencias').upsert(
      { user_id: context.user.id, workspace_id: context.workspace.id, blocos: arrumacao, updated_at: new Date().toISOString() },
      { onConflict: 'user_id,workspace_id' },
    )
    if (error) throw new Error(error.code === '42P01' || error.code === 'PGRST205' ? 'O banco ainda não tem o Início personalizado (migração 20260928140000).' : 'Não foi possível guardar o seu Início.')
    revalidatePath('/dashboard')
    return {}
  } catch (causa) {
    return { erro: mensagemDoErro(causa, 'Não foi possível guardar o seu Início.') }
  }
}

export async function restaurarInicio(): Promise<Resultado> {
  try {
    const context = await requireWorkspace()
    const supabase = await createClient()
    const { error } = await supabase.from('inicio_preferencias').delete().eq('user_id', context.user.id).eq('workspace_id', context.workspace.id)
    if (error && error.code !== '42P01' && error.code !== 'PGRST205') throw new Error('Não foi possível voltar ao Início padrão.')
    revalidatePath('/dashboard')
    return {}
  } catch (causa) {
    return { erro: mensagemDoErro(causa, 'Não foi possível voltar ao Início padrão.') }
  }
}
