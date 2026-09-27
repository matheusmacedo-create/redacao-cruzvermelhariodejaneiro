'use server'

import { revalidatePath } from 'next/cache'
import { requireWorkspace } from '@/lib/session'
import { pode } from '@/lib/permissoes'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { mensagemDoErro } from '@/lib/erro-de-acao'
import { camposDo, ehServico, SERVICOS } from '@/lib/integracoes/chaves'
import { enderecoLocal, instanciaValida, urlDoServidor } from '@/lib/whatsapp/regras'
import { contaDeServicoParaGuardar, lerContaDeServico } from '@/lib/google/conta-de-servico-regras'
import { ID_DA_PROPRIEDADE } from '@/lib/site/analytics'

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
    let recadoExtra = ''
    if (campos.length) {
      const dados: Record<string, string> = {}
      for (const c of campos) {
        const v = String(formData.get(c.id) ?? '').trim()
        if (v.length < (c.minimo ?? 8)) throw new Error(`Preencha "${c.rotulo}" inteiro.`)
        dados[c.id] = v
      }
      // WhatsApp: o endereço sem https:// travava a tela em "Falta configurar" sem dizer o motivo.
      if (servico === 'evolution_api') {
        const url = urlDoServidor(dados.url)
        if (!url) throw new Error('O endereço do servidor não é válido. Use algo como https://seu-endereco.ngrok-free.dev')
        if (enderecoLocal(url)) throw new Error('Esse endereço só existe dentro do seu computador ou da sua rede, e o Palácio roda na internet: use o endereço público (por exemplo, o do ngrok, https://….ngrok-free.dev).')
        if (!instanciaValida(dados.instancia)) throw new Error('O nome da instância só pode ter letras, números, ponto, hífen e sublinhado, sem espaços.')
        dados.url = url
        dados.instancia = dados.instancia.trim()
      }
      valor = JSON.stringify(dados)
    } else if (valor.length < 8) {
      throw new Error('A chave parece curta demais. Cole a chave inteira.')
    } else if (servico === 'google_analytics') {
      // O arquivo JSON inteiro da conta de serviço: confere e guarda só o que o Palácio usa.
      const guardar = contaDeServicoParaGuardar(valor)
      if (typeof guardar !== 'string') throw new Error(guardar.erro)
      valor = guardar
      const conta = lerContaDeServico(guardar)
      if ('email' in conta) recadoExtra = ` Falta um passo: no Google Analytics, dê acesso de Leitor à propriedade ${ID_DA_PROPRIEDADE} para ${conta.email}. Os números aparecem em Resultados.`
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

    revalidatePath('/configuracoes', 'layout')
    revalidatePath('/imprensa')
    revalidatePath('/impacto')
    return { recado: `Chave da ${SERVICOS[servico].nome} guardada no cofre.${recadoExtra}` }
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

    revalidatePath('/configuracoes', 'layout')
    revalidatePath('/imprensa')
    revalidatePath('/impacto')
    return { recado: `Chave da ${SERVICOS[servico].nome} removida do cofre.` }
  } catch (causa) {
    return { erro: mensagemDoErro(causa, 'Não foi possível remover a chave.') }
  }
}
