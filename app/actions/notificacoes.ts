'use server'

import { revalidatePath } from 'next/cache'
import { requireWorkspace } from '@/lib/session'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { mensagemDoErro } from '@/lib/erro-de-acao'
import { CATEGORIAS, ehModo, type Categoria, type Modo } from '@/lib/notificacoes/regras'

type Resultado = { erro?: string }

/**
 * Marca avisos como lidos. Pelo cliente da sessão: a política do banco só
 * deixa mexer nos próprios avisos, e só na coluna read_at.
 */
export async function marcarComoLidas(ids: string[]): Promise<Resultado> {
  try {
    const lista = [...new Set(ids.filter((id) => /^[0-9a-f-]{36}$/i.test(id)))].slice(0, 200)
    if (!lista.length) return {}
    const context = await requireWorkspace()
    const supabase = await createClient()
    const { error } = await supabase.from('notifications').update({ read_at: new Date().toISOString() })
      .in('id', lista).eq('user_id', context.user.id).is('read_at', null)
    if (error) throw new Error('Não foi possível marcar como lida.')
    return {}
  } catch (causa) {
    return { erro: mensagemDoErro(causa, 'Não foi possível marcar como lida.') }
  }
}

/** Marca como lidos os avisos que apontam para a página que a pessoa abriu. */
export async function marcarLidasDoLink(link: string): Promise<Resultado> {
  try {
    if (!link.startsWith('/') || link.length > 500) return {}
    const context = await requireWorkspace()
    const supabase = await createClient()
    await supabase.from('notifications').update({ read_at: new Date().toISOString() })
      .eq('user_id', context.user.id).eq('workspace_id', context.workspace.id).eq('link', link).is('read_at', null)
    return {}
  } catch (causa) {
    return { erro: mensagemDoErro(causa, 'Não foi possível marcar como lida.') }
  }
}

export async function marcarTodasComoLidas(): Promise<Resultado> {
  try {
    const context = await requireWorkspace()
    const supabase = await createClient()
    const { error } = await supabase.from('notifications').update({ read_at: new Date().toISOString() })
      .eq('user_id', context.user.id).eq('workspace_id', context.workspace.id).is('read_at', null)
    if (error) throw new Error('Não foi possível marcar todas como lidas.')
    revalidatePath('/notificacoes')
    return {}
  } catch (causa) {
    return { erro: mensagemDoErro(causa, 'Não foi possível marcar todas como lidas.') }
  }
}

/** Grava, por assunto, como a pessoa quer receber os avisos por e-mail. */
export async function salvarPreferenciasDeNotificacao(modos: Record<string, string>): Promise<Resultado> {
  try {
    const context = await requireWorkspace()
    const limpos = Object.fromEntries(CATEGORIAS.map((c) => [c, ehModo(modos?.[c]) ? modos[c] : 'imediato'])) as Record<Categoria, Modo>
    const { error } = await createAdminClient().from('notificacao_preferencias')
      .upsert({ user_id: context.user.id, modos: limpos, atualizado_em: new Date().toISOString() }, { onConflict: 'user_id' })
    if (error) throw new Error('Não foi possível salvar as preferências.')
    revalidatePath('/perfil')
    return {}
  } catch (causa) {
    return { erro: mensagemDoErro(causa, 'Não foi possível salvar as preferências.') }
  }
}
