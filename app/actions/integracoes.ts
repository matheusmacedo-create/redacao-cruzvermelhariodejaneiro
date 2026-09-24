'use server'

import { revalidatePath } from 'next/cache'
import { requireWorkspace } from '@/lib/session'
import { pode } from '@/lib/permissoes'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { mensagemDoErro } from '@/lib/erro-de-acao'
import { camposDo, ehServico, SERVICOS } from '@/lib/integracoes/chaves'

/**
 * Gravar e remover chaves de integração. A regra "só admin" mora no banco
 * (as funções recusam quem não é); a conferência aqui é para a mensagem sair
 * clara antes de ir ao banco.
 *
 * A chave recebida nunca volta na resposta nem vai para o registro de
 * atividade — só o fato de ter sido trocada, e por quem.
 */

type Resultado = { erro?: string; recado?: string }

export async function salvarChaveDeIntegracao(formData: FormData): Promise<Resultado> {
  try {
    const context = await requireWorkspace()
    if (!pode(context.role, 'integracoes.configurar')) throw new Error('Só administradores podem configurar chaves de integração.')

    const servico = String(formData.get('servico') ?? '')
    if (!ehServico(servico) || 'oculto' in SERVICOS[servico]) throw new Error('Serviço desconhecido.')
    const campos = camposDo(servico)
    let valor = String(formData.get('valor') ?? '').trim()
    if (campos.length) {
      const dados: Record<string, string> = {}
      for (const c of campos) {
        const v = String(formData.get(c.id) ?? '').trim()
        if (v.length < 8) throw new Error(`Preencha "${c.rotulo}" inteiro.`)
        dados[c.id] = v
      }
      valor = JSON.stringify(dados)
    } else if (valor.length < 8) {
      throw new Error('A chave parece curta demais. Cole a chave inteira.')
    }

    const supabase = await createClient()
    const { error } = await supabase.rpc('definir_chave_de_integracao', {
      p_workspace_id: context.workspace.id, p_servico: servico, p_valor: valor,
    })
    if (error) throw new Error('Não foi possível guardar a chave no cofre.')

    await createAdminClient().from('activity_log').insert({
      workspace_id: context.workspace.id,
      actor_id: context.user.id,
      action: 'integracao_chave_definida',
      entity_type: 'integracao',
      metadata: { servico },
    })

    revalidatePath('/configuracoes')
    revalidatePath('/imprensa')
    return { recado: `Chave da ${SERVICOS[servico].nome} guardada no cofre.` }
  } catch (causa) {
    return { erro: mensagemDoErro(causa, 'Não foi possível guardar a chave.') }
  }
}

export async function removerChaveDeIntegracao(formData: FormData): Promise<Resultado> {
  try {
    const context = await requireWorkspace()
    if (!pode(context.role, 'integracoes.configurar')) throw new Error('Só administradores podem remover chaves de integração.')

    const servico = String(formData.get('servico') ?? '')
    if (!ehServico(servico) || 'oculto' in SERVICOS[servico]) throw new Error('Serviço desconhecido.')

    const supabase = await createClient()
    const { error } = await supabase.rpc('remover_chave_de_integracao', {
      p_workspace_id: context.workspace.id, p_servico: servico,
    })
    if (error) throw new Error('Não foi possível remover a chave.')

    await createAdminClient().from('activity_log').insert({
      workspace_id: context.workspace.id,
      actor_id: context.user.id,
      action: 'integracao_chave_removida',
      entity_type: 'integracao',
      metadata: { servico },
    })

    revalidatePath('/configuracoes')
    revalidatePath('/imprensa')
    return { recado: `Chave da ${SERVICOS[servico].nome} removida do cofre.` }
  } catch (causa) {
    return { erro: mensagemDoErro(causa, 'Não foi possível remover a chave.') }
  }
}
