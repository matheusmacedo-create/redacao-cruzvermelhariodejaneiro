'use server'

import { revalidatePath } from 'next/cache'
import { requireWorkspace } from '@/lib/session'
import { pode } from '@/lib/permissoes'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { mensagemDoErro } from '@/lib/erro-de-acao'
import { camposDo, ehServico, SERVICOS } from '@/lib/integracoes/chaves'
import { numeroIdValido } from '@/lib/whatsapp/kapso'
import { nomeDeModeloValido } from '@/lib/whatsapp/regras'
import { contaDeServicoParaGuardar, lerContaDeServico } from '@/lib/google/conta-de-servico-regras'
import { ID_DA_PROPRIEDADE } from '@/lib/site/analytics'
import { lerChaveDaCgu } from '@/lib/participantes/verificacao/regras'
import { testarChaveDaCgu } from '@/lib/participantes/verificacao/cgu'

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
        if (!v && c.opcional) continue
        if (v.length < (c.minimo ?? 8)) throw new Error(`Preencha "${c.rotulo}" inteiro.`)
        dados[c.id] = v
      }
      if (servico === 'kapso') {
        dados.numeroId = dados.numeroId.replace(/\s/g, '')
        if (!numeroIdValido(dados.numeroId)) throw new Error('O Phone number ID tem só números (ex.: 1401089659754587). Copie da tela do número no painel da Kapso.')
        // Os três modelos (avisos, código de Autenticação, segurança): o nome como a Meta grava.
        for (const [id, exemplo] of [['modelo', 'aviso_do_palacio'], ['modeloCodigo', 'codigo_do_palacio'], ['modeloSeguranca', 'seguranca_do_palacio']] as const) {
          if (!dados[id] || nomeDeModeloValido(dados[id])) continue
          throw new Error(`O nome do modelo em "${campos.find((c) => c.id === id)?.rotulo ?? id}" usa só letras minúsculas, números e sublinhado, como aparece na Kapso (ex.: ${exemplo}).`)
        }
        if (dados.modeloCodigo && dados.modeloCodigo === dados.modelo) throw new Error('O modelo do código precisa ser outro, da categoria Autenticação: o dos avisos não serve para mandar códigos.')
      }
      valor = JSON.stringify(dados)
    } else if (valor.length < 8) {
      throw new Error('A chave parece curta demais. Cole a chave inteira.')
    } else if (servico === 'portal_transparencia') {
      // A pessoa cola o que o Portal mostra (JSON, "chave-api-dados: …"): fica só a chave, testada antes de ir ao cofre.
      const chave = lerChaveDaCgu(valor)
      if (!chave) throw new Error('Não achei a chave no que você colou. A chave do Portal da Transparência tem 32 letras e números e chega por e-mail; cole só ela.')
      const teste = await testarChaveDaCgu(chave)
      if ('erro' in teste) {
        if (teste.definitivo) throw new Error(teste.erro)
        recadoExtra = ` ${teste.erro} Ela foi guardada mesmo assim: a consulta na ficha do candidato diz se funciona.`
      } else {
        recadoExtra = ' A CGU aceitou a chave.'
      }
      valor = chave
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
