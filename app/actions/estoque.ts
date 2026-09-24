'use server'

import { revalidatePath } from 'next/cache'
import { mensagemDoErro } from '@/lib/erro-de-acao'
import { createAdminClient } from '@/lib/supabase/admin'
import { contextoDoPatrimonio } from '@/lib/patrimonio/acesso'
import { quemOperaOPatrimonio } from '@/lib/patrimonio/destinatarios'
import { notificar } from '@/lib/notificacoes/servidor'
import { lerValor } from '@/lib/patrimonio/regras'
import { ehCausaDePerda, ehFinalidade, ehOrigemDeEntrada, lerItem, lerQuantidade, quantidade } from '@/lib/patrimonio/estoque'

/**
 * Estoque de materiais — escrita. Tudo passa pelas funções estoque_* do
 * banco, que conferem de novo nível, saldo, validade, FEFO e mês fechado.
 */

type Resultado = { erro?: string }

function erroDoBanco(error: { message?: string; code?: string } | null, padrao: string): never {
  if (error?.code === 'P0001' && error.message) throw new Error(error.message)
  if (error?.code === '23514') throw new Error('Algum campo está fora do permitido.')
  throw new Error(padrao)
}

function revalidar(id?: string) {
  revalidatePath('/patrimonio/estoque', 'layout')
  if (id) revalidatePath(`/patrimonio/estoque/${id}`)
}

const ehUuid = (v: unknown): v is string => typeof v === 'string' && /^[0-9a-f-]{36}$/.test(v)
const ehData = (v: unknown): v is string => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v)
const uuidOuVazio = (v: unknown) => (ehUuid(v) ? v : '')

function lerQtd(texto: string, rotulo = 'a quantidade'): number {
  const q = lerQuantidade(texto)
  if (q === null || Number.isNaN(q) || q <= 0) throw new Error(`Informe ${rotulo} (maior que zero).`)
  return q
}

export async function salvarItem(id: string | null, _anterior: Resultado & { id?: string }, formData: FormData): Promise<Resultado & { id?: string }> {
  try {
    const { context, supabase } = await contextoDoPatrimonio()
    const { dados, erros } = lerItem(formData)
    if (!dados) throw new Error(erros.join(' '))
    const { data, error } = await supabase.rpc('estoque_salvar_item', { p_workspace_id: context.workspace.id, p_id: id, p: dados })
    if (error) erroDoBanco(error, 'Não foi possível salvar o item.')
    revalidar(data as string)
    return { id: data as string }
  } catch (causa) {
    return { erro: mensagemDoErro(causa, 'Não foi possível salvar o item.') }
  }
}

export type DadosDeEntrada = {
  item_id: string; local_id: string; quantidade: string; custo_unitario: string; origem: string; lote: string; validade: string; data: string
  detalhe: string; documento: string; fonte_id: string; projeto_id: string
}

export async function entradaNoEstoque(p: DadosDeEntrada): Promise<Resultado> {
  try {
    const { context, supabase } = await contextoDoPatrimonio()
    if (!ehUuid(p.item_id)) throw new Error('Escolha o item.')
    if (!ehUuid(p.local_id)) throw new Error('Escolha o local.')
    if (!ehOrigemDeEntrada(p.origem)) throw new Error('Escolha a origem.')
    const qtd = lerQtd(p.quantidade)
    const custo = lerValor(p.custo_unitario)
    if (custo !== null && Number.isNaN(custo)) throw new Error('Valor unitário inválido.')
    if (p.validade && !ehData(p.validade)) throw new Error('Validade inválida.')
    if (p.data && !ehData(p.data)) throw new Error('Data inválida.')
    const { error } = await supabase.rpc('estoque_entrada', {
      p_workspace_id: context.workspace.id,
      p: {
        item_id: p.item_id, local_id: p.local_id, quantidade: qtd, custo_unitario: custo ?? '', origem: p.origem, lote: p.lote.trim().slice(0, 60),
        validade: p.validade, data: p.data, detalhe: p.detalhe.slice(0, 600), documento: p.documento.slice(0, 80),
        fonte_id: uuidOuVazio(p.fonte_id), projeto_id: uuidOuVazio(p.projeto_id),
      },
    })
    if (error) erroDoBanco(error, 'Não foi possível registrar a entrada.')
    revalidar(p.item_id)
    return {}
  } catch (causa) {
    return { erro: mensagemDoErro(causa, 'Não foi possível registrar a entrada.') }
  }
}

/** Saída para uso. Se o item acabou de ficar abaixo do mínimo, avisa quem opera o estoque. */
export async function saidaDoEstoque(p: { item_id: string; local_id: string; saldo_id?: string; quantidade: string; finalidade: string; detalhe: string; projeto_id: string; data: string }): Promise<Resultado> {
  try {
    const { context, supabase } = await contextoDoPatrimonio()
    if (!ehUuid(p.item_id)) throw new Error('Escolha o item.')
    if (!p.saldo_id && !ehUuid(p.local_id)) throw new Error('Escolha de onde sai.')
    if (!ehFinalidade(p.finalidade)) throw new Error('Diga para que foi.')
    if (p.data && !ehData(p.data)) throw new Error('Data inválida.')
    const qtd = lerQtd(p.quantidade)
    const { data, error } = await supabase.rpc('estoque_saida', {
      p_workspace_id: context.workspace.id,
      p: { item_id: p.item_id, local_id: uuidOuVazio(p.local_id), saldo_id: uuidOuVazio(p.saldo_id), quantidade: qtd, finalidade: p.finalidade, detalhe: p.detalhe.slice(0, 600), projeto_id: uuidOuVazio(p.projeto_id), data: p.data },
    })
    if (error) erroDoBanco(error, 'Não foi possível registrar a saída.')
    const r = data as { saldo: number; minimo: number; cruzou_minimo: boolean } | null
    if (r?.cruzou_minimo) {
      const { data: item } = await supabase.from('est_itens').select('nome,codigo,unidade').eq('id', p.item_id).single()
      if (item) {
        const admin = createAdminClient()
        await notificar(admin, {
          workspaceId: context.workspace.id, para: await quemOperaOPatrimonio(admin, context.workspace.id), atorId: context.user.id, categoria: 'patrimonio',
          titulo: `Estoque baixo: ${item.nome}`, mensagem: `Restam ${quantidade(Number(r.saldo), item.unidade as string)} (mínimo ${quantidade(Number(r.minimo), item.unidade as string)}). Hora de repor.`,
          link: `/patrimonio/estoque/${p.item_id}`, botao: 'Ver o material',
        })
      }
    }
    revalidar(p.item_id)
    return {}
  } catch (causa) {
    return { erro: mensagemDoErro(causa, 'Não foi possível registrar a saída.') }
  }
}

export async function transferirNoEstoque(itemId: string, p: { saldo_id: string; local_id: string; quantidade: string; detalhe: string }): Promise<Resultado> {
  try {
    const { context, supabase } = await contextoDoPatrimonio()
    if (!ehUuid(p.saldo_id)) throw new Error('Lote inválido.')
    if (!ehUuid(p.local_id)) throw new Error('Escolha para onde vai.')
    const { error } = await supabase.rpc('estoque_transferir', {
      p_workspace_id: context.workspace.id, p: { saldo_id: p.saldo_id, local_id: p.local_id, quantidade: lerQtd(p.quantidade), detalhe: p.detalhe.slice(0, 600) },
    })
    if (error) erroDoBanco(error, 'Não foi possível transferir.')
    revalidar(itemId)
    return {}
  } catch (causa) {
    return { erro: mensagemDoErro(causa, 'Não foi possível transferir.') }
  }
}

export async function contarNoEstoque(itemId: string, p: { saldo_id: string; quantidade: string; detalhe: string }): Promise<Resultado & { diferenca?: number }> {
  try {
    const { context, supabase } = await contextoDoPatrimonio()
    if (!ehUuid(p.saldo_id)) throw new Error('Lote inválido.')
    const q = lerQuantidade(p.quantidade)
    if (q === null || Number.isNaN(q) || q < 0) throw new Error('Informe quanto foi contado.')
    const { data, error } = await supabase.rpc('estoque_contar', { p_workspace_id: context.workspace.id, p: { saldo_id: p.saldo_id, quantidade: q, detalhe: p.detalhe.slice(0, 600) } })
    if (error) erroDoBanco(error, 'Não foi possível registrar a contagem.')
    revalidar(itemId)
    return { diferenca: Number(data) }
  } catch (causa) {
    return { erro: mensagemDoErro(causa, 'Não foi possível registrar a contagem.') }
  }
}

export async function perdaNoEstoque(itemId: string, p: { saldo_id: string; quantidade: string; causa: string; detalhe: string }): Promise<Resultado> {
  try {
    const { context, supabase } = await contextoDoPatrimonio()
    if (!ehUuid(p.saldo_id)) throw new Error('Lote inválido.')
    if (!ehCausaDePerda(p.causa)) throw new Error('Diga o que aconteceu.')
    const { error } = await supabase.rpc('estoque_perda', {
      p_workspace_id: context.workspace.id, p: { saldo_id: p.saldo_id, quantidade: lerQtd(p.quantidade), causa: p.causa, detalhe: p.detalhe.slice(0, 600) },
    })
    if (error) erroDoBanco(error, 'Não foi possível registrar a perda.')
    revalidar(itemId)
    return {}
  } catch (causa) {
    return { erro: mensagemDoErro(causa, 'Não foi possível registrar a perda.') }
  }
}

export async function montarKits(kitId: string, p: { local_id: string; quantidade: string }): Promise<Resultado> {
  try {
    const { context, supabase } = await contextoDoPatrimonio()
    if (!ehUuid(p.local_id)) throw new Error('Escolha onde montar.')
    const n = lerQtd(p.quantidade, 'quantos kits')
    if (!Number.isInteger(n)) throw new Error('Informe quantos kits (número inteiro).')
    const { error } = await supabase.rpc('estoque_montar_kit', { p_workspace_id: context.workspace.id, p: { kit_id: kitId, local_id: p.local_id, quantidade: n } })
    if (error) erroDoBanco(error, 'Não foi possível montar os kits.')
    revalidar(kitId)
    return {}
  } catch (causa) {
    return { erro: mensagemDoErro(causa, 'Não foi possível montar os kits.') }
  }
}

export async function salvarCategoriaDoEstoque(id: string | null, _anterior: Resultado & { ok?: number }, formData: FormData): Promise<Resultado & { ok?: number }> {
  try {
    const { context, supabase } = await contextoDoPatrimonio()
    const nome = String(formData.get('nome') ?? '').trim().slice(0, 80)
    if (nome.length < 2) throw new Error('Informe o nome.')
    const p: Record<string, unknown> = { nome, conta_contabil: String(formData.get('conta_contabil') ?? '').trim().slice(0, 40) }
    if (id) { p.id = id; p.ativa = formData.get('ativa') !== 'nao' }
    const { error } = await supabase.rpc('estoque_salvar_categoria', { p_workspace_id: context.workspace.id, p })
    if (error) erroDoBanco(error, 'Não foi possível salvar.')
    revalidatePath('/patrimonio', 'layout')
    return { ok: Date.now() }
  } catch (causa) {
    return { erro: mensagemDoErro(causa, 'Não foi possível salvar.') }
  }
}
