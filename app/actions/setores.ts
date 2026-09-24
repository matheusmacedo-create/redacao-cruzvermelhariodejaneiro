'use server'

import { revalidatePath } from 'next/cache'
import { mensagemDoErro } from '@/lib/erro-de-acao'
import { requireWorkspace } from '@/lib/session'
import { createClient } from '@/lib/supabase/server'

/**
 * Setores do espaço (Pessoas → Setores). O banco (setor_salvar) confere que
 * é admin e, ao renomear, leva o nome novo a contas, fichas, voluntários e
 * pautas.
 */
export async function salvarSetor(id: string | null, _anterior: { erro?: string; ok?: number }, formData: FormData): Promise<{ erro?: string; ok?: number }> {
  try {
    const context = await requireWorkspace()
    const supabase = await createClient()
    const t = (k: string, max: number) => String(formData.get(k) ?? '').trim().slice(0, max)
    const nome = t('nome', 80)
    if (nome.length < 2) throw new Error('Dê um nome ao setor.')
    const email = t('email', 200)
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error('E-mail inválido.')
    const ordem = t('ordem', 5)
    if (ordem && !/^\d{1,4}$/.test(ordem)) throw new Error('Ordem: um número de 0 a 9999.')
    const responsavel = t('responsavel_id', 40)
    const p: Record<string, unknown> = { nome, descricao: t('descricao', 300), email, ordem, responsavel_id: /^[0-9a-f-]{36}$/.test(responsavel) ? responsavel : '' }
    if (id) { p.id = id; p.ativo = formData.get('ativo') !== 'nao' }
    const { error } = await supabase.rpc('setor_salvar', { p_workspace_id: context.workspace.id, p })
    if (error) throw new Error(error.code === 'P0001' && error.message ? error.message : 'Não foi possível salvar o setor.')
    for (const c of ['/pessoas', '/pessoas/setores', '/usuarios', '/equipe', '/voluntariado', '/registrar', '/correio']) revalidatePath(c)
    return { ok: Date.now() }
  } catch (causa) {
    return { erro: mensagemDoErro(causa, 'Não foi possível salvar o setor.') }
  }
}
