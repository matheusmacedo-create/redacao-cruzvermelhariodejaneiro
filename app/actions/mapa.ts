'use server'

import { revalidatePath } from 'next/cache'
import { requireWorkspace } from '@/lib/session'
import { pode } from '@/lib/permissoes'
import { createAdminClient } from '@/lib/supabase/admin'
import { mensagemDoErro } from '@/lib/erro-de-acao'
import { ESTADOS, SITUACOES_DA_PENDENCIA, type Estado, type SituacaoDaPendencia } from '@/lib/mapa/modelo'

/**
 * As duas escritas do mapa do ecossistema (docs/mapa-do-ecossistema.md).
 * Quem tem `mapa.editar` marca uma pendência como resolvida (ou volta atrás)
 * e muda o estado de um item. As contagens, o progresso e a fila se
 * recalculam na leitura (lib/mapa/modelo.ts): nada fica gravado em dobro.
 */

export type Estado_ = { erro?: string; ok?: true }

export async function marcarPendenciaDoMapa(id: string, situacao: SituacaoDaPendencia, nota?: string): Promise<Estado_> {
  try {
    const context = await requireWorkspace()
    if (!pode(context.role, 'mapa.editar')) throw new Error('Só quem pode editar o mapa marca pendências.')
    if (!/^[A-Z]{1,3}-\d{1,4}$/.test(id)) throw new Error('Pendência inválida.')
    if (!(SITUACOES_DA_PENDENCIA as readonly string[]).includes(situacao)) throw new Error('Situação inválida.')
    const resolvida = situacao === 'feito'
    const { error, count } = await createAdminClient()
      .from('mapa_pendencias')
      .update({
        situacao,
        resolvida_em: resolvida ? new Date().toISOString() : null,
        resolvida_por: resolvida ? context.user.id : null,
        ...(nota !== undefined ? { nota: nota.trim().slice(0, 2000) } : {}),
        atualizado_em: new Date().toISOString(),
      }, { count: 'exact' })
      .eq('workspace_id', context.workspace.id).eq('id', id)
    if (error) throw new Error('Não foi possível gravar a pendência.')
    if (!count) throw new Error('Pendência não encontrada.')
    revalidatePath('/mapa')
    return { ok: true }
  } catch (causa) {
    return { erro: mensagemDoErro(causa, 'Não foi possível atualizar a pendência.') }
  }
}

export async function mudarEstadoDoItemDoMapa(id: string, estado: Estado, detalhe?: string): Promise<Estado_> {
  try {
    const context = await requireWorkspace()
    if (!pode(context.role, 'mapa.editar')) throw new Error('Só quem pode editar o mapa muda o estado de um item.')
    if (!/^[a-z0-9][a-z0-9.-]{0,200}$/.test(id)) throw new Error('Item inválido.')
    if (!(ESTADOS as readonly string[]).includes(estado)) throw new Error('Estado inválido.')
    const { error, count } = await createAdminClient()
      .from('mapa_itens')
      .update({
        estado,
        ...(detalhe !== undefined ? { estado_detalhe: detalhe.trim().slice(0, 2000) } : {}),
        atualizado_em: new Date().toISOString(),
        atualizado_por: context.user.id,
      }, { count: 'exact' })
      .eq('workspace_id', context.workspace.id).eq('id', id).eq('tipo', 'item')
    if (error) throw new Error('Não foi possível gravar o estado.')
    if (!count) throw new Error('Item não encontrado.')
    revalidatePath('/mapa')
    return { ok: true }
  } catch (causa) {
    return { erro: mensagemDoErro(causa, 'Não foi possível mudar o estado.') }
  }
}
