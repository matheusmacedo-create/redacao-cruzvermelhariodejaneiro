'use server'

import { revalidatePath } from 'next/cache'
import { requireWorkspace } from '@/lib/session'
import { pode } from '@/lib/permissoes'
import { mensagemDoErro } from '@/lib/erro-de-acao'
import { createAdminClient } from '@/lib/supabase/admin'
import { criterioEstaVazio, lerCriterio } from '@/lib/imprensa/listas'
import { limparNome } from '@/lib/imprensa/vocabulario'

/**
 * Listas salvas da Imprensa (press_listas e press_lista_contatos).
 *
 * As duas tabelas só aceitam escrita do servidor: cada ação confere o espaço e
 * grava com a chave de serviço, sempre filtrando por workspace_id. Criar,
 * editar e pôr gente numa lista é de todo membro; apagar é de quem criou, ou
 * de administradores e editores (imprensa.organizar). Quem está numa lista por
 * filtro não mora no banco: a tela resolve o critério contra os contatos
 * (lib/imprensa/listas.ts).
 */

const texto = (form: FormData, chave: string) => String(form.get(chave) ?? '').trim()
const comoErro = (causa: unknown, padrao: string): { erro: string } => ({ erro: mensagemDoErro(causa, padrao) })
const ehId = (valor: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(valor)

/** Quantas pessoas uma lista fixa aceita de uma vez. */
const TETO_DA_LISTA = 5000

/** Os ids do formulário, sem repetição. Acima do teto recusa, em vez de cortar calado: a pessoa acharia que todos entraram. */
function lerIds(formData: FormData, chave: string): string[] {
  let bruto: unknown
  try { bruto = JSON.parse(texto(formData, chave) || '[]') } catch { bruto = [] }
  const ids = Array.isArray(bruto) ? [...new Set(bruto.filter((i): i is string => typeof i === 'string' && ehId(i)))] : []
  if (ids.length > TETO_DA_LISTA) {
    throw new Error(`No máximo ${TETO_DA_LISTA} contatos de cada vez numa lista fixa. Para um grupo maior, crie uma lista por filtro.`)
  }
  return ids
}

function emPedacos<T>(itens: T[], tamanho: number): T[][] {
  const pedacos: T[][] = []
  for (let i = 0; i < itens.length; i += tamanho) pedacos.push(itens.slice(i, i + tamanho))
  return pedacos
}

type Admin = ReturnType<typeof createAdminClient>

/**
 * Põe contatos numa lista fixa. Só entram os que são do espaço (quem confere
 * é esta consulta; a chave composta da tabela confere de novo), e quem já
 * estava na lista não é repetido. Devolve quantos estão nela entre os pedidos.
 */
async function porNaLista(admin: Admin, workspaceId: string, listaId: string, ids: string[], autor: string): Promise<number> {
  let postos = 0
  for (const pedaco of emPedacos(ids, 200)) {
    const { data: doEspaco, error: erroDaLeitura } = await admin.from('press_contacts').select('id')
      .eq('workspace_id', workspaceId).in('id', pedaco)
    if (erroDaLeitura) throw new Error('Não foi possível conferir os contatos.')
    const linhas = (doEspaco ?? []).map((c) => ({ lista_id: listaId, contato_id: c.id, workspace_id: workspaceId, adicionado_por: autor }))
    if (!linhas.length) continue
    const { error } = await admin.from('press_lista_contatos').upsert(linhas, { onConflict: 'lista_id,contato_id', ignoreDuplicates: true })
    if (error) throw new Error(postos ? `Entraram ${postos}; o resto falhou. Tente de novo.` : 'Não foi possível pôr os contatos na lista.')
    postos += linhas.length
  }
  return postos
}

const NOME_REPETIDO = 'Já existe uma lista com este nome.'

/**
 * Cria uma lista ou salva as mudanças de uma que existe (quando vem o id).
 * O tipo se escolhe na criação e não muda depois: lista fixa não vira filtro.
 * Na criação de uma lista fixa, `ids` são as pessoas que já entram nela.
 */
export async function salvarLista(formData: FormData): Promise<{ erro?: string; id?: string; postos?: number; aviso?: string }> {
  try {
    const context = await requireWorkspace()
    const workspaceId = context.workspace.id
    const id = texto(formData, 'id')
    const nome = limparNome(texto(formData, 'nome'), 120)
    if (!nome) throw new Error('Dê um nome à lista.')
    const descricao = texto(formData, 'descricao').slice(0, 500)
    const plantao = texto(formData, 'plantao') === 'sim'
    let brutoDoCriterio: unknown = {}
    try { brutoDoCriterio = JSON.parse(texto(formData, 'criterio') || '{}') } catch { brutoDoCriterio = {} }
    const criterio = lerCriterio(brutoDoCriterio)
    const admin = createAdminClient()

    if (id) {
      if (!ehId(id)) throw new Error('Lista não informada.')
      const { data: atual } = await admin.from('press_listas').select('tipo')
        .eq('id', id).eq('workspace_id', workspaceId).maybeSingle()
      if (!atual) throw new Error('Esta lista não existe mais.')
      if (atual.tipo === 'filtro' && criterioEstaVazio(criterio)) throw new Error('Escolha ao menos um filtro: sem filtro, a lista ficaria vazia.')
      const { error } = await admin.from('press_listas')
        .update({ nome, descricao, plantao, ...(atual.tipo === 'filtro' ? { criterio } : {}) })
        .eq('id', id).eq('workspace_id', workspaceId)
      if (error) throw new Error(error.code === '23505' ? NOME_REPETIDO : 'Não foi possível salvar a lista.')
      revalidatePath('/imprensa')
      return { id }
    }

    const tipo = texto(formData, 'tipo') === 'filtro' ? 'filtro' : 'fixa'
    if (tipo === 'filtro' && criterioEstaVazio(criterio)) throw new Error('Escolha ao menos um filtro: sem filtro, a lista ficaria vazia.')
    const ids = tipo === 'fixa' ? lerIds(formData, 'ids') : []

    const { data, error } = await admin.from('press_listas').insert({
      workspace_id: workspaceId, nome, descricao, tipo, plantao,
      criterio: tipo === 'filtro' ? criterio : {},
      created_by: context.user.id,
    }).select('id').single()
    if (error || !data) throw new Error(error?.code === '23505' ? NOME_REPETIDO : 'Não foi possível criar a lista.')

    // A lista já existe a partir daqui. Se os contatos não entrarem, a resposta diz isso
    // em vez de dar erro: um erro faria a pessoa tentar de novo e cair em "já existe".
    let postos = 0
    let aviso: string | undefined
    if (ids.length) {
      try {
        postos = await porNaLista(admin, workspaceId, data.id, ids, context.user.id)
      } catch {
        aviso = `A lista “${nome}” foi criada, mas os contatos não entraram todos. Marque-os de novo e use “Pôr numa lista” para completar.`
      }
    }
    revalidatePath('/imprensa')
    return { id: data.id, postos, aviso }
  } catch (causa) {
    return comoErro(causa, 'Não foi possível salvar a lista.')
  }
}

/** Põe contatos numa lista fixa que já existe, ou tira (`acao` = 'tirar'). */
export async function mudarContatosDaLista(formData: FormData): Promise<{ erro?: string; quantos?: number }> {
  try {
    const context = await requireWorkspace()
    const workspaceId = context.workspace.id
    const listaId = texto(formData, 'listaId')
    if (!ehId(listaId)) throw new Error('Escolha a lista.')
    const ids = lerIds(formData, 'ids')
    if (!ids.length) throw new Error('Nenhum contato selecionado.')

    const admin = createAdminClient()
    const { data: lista } = await admin.from('press_listas').select('tipo')
      .eq('id', listaId).eq('workspace_id', workspaceId).maybeSingle()
    if (!lista) throw new Error('Esta lista não existe mais.')
    if (lista.tipo !== 'fixa') throw new Error('Esta lista é por filtro: quem entra nela é quem atende ao critério. Para mudar, edite o filtro.')

    if (texto(formData, 'acao') === 'tirar') {
      let tirados = 0
      for (const pedaco of emPedacos(ids, 200)) {
        const { count, error } = await admin.from('press_lista_contatos').delete({ count: 'exact' })
          .eq('workspace_id', workspaceId).eq('lista_id', listaId).in('contato_id', pedaco)
        if (error) throw new Error('Não foi possível tirar os contatos da lista.')
        tirados += count ?? 0
      }
      revalidatePath('/imprensa')
      return { quantos: tirados }
    }

    const postos = await porNaLista(admin, workspaceId, listaId, ids, context.user.id)
    revalidatePath('/imprensa')
    return { quantos: postos }
  } catch (causa) {
    return comoErro(causa, 'Não foi possível mudar a lista.')
  }
}

/** Apaga a lista. Os contatos ficam; a campanha que saiu para ela fica, só sem a lista. */
export async function excluirLista(formData: FormData): Promise<{ erro?: string }> {
  try {
    const context = await requireWorkspace()
    const workspaceId = context.workspace.id
    const id = texto(formData, 'id')
    if (!ehId(id)) throw new Error('Lista não informada.')

    const admin = createAdminClient()
    const { data: lista } = await admin.from('press_listas').select('nome, created_by')
      .eq('id', id).eq('workspace_id', workspaceId).maybeSingle()
    if (!lista) throw new Error('Esta lista não existe mais.')
    if (lista.created_by !== context.user.id && !pode(context.role, 'imprensa.organizar')) {
      throw new Error('Só quem criou a lista, administradores e editores podem apagá-la.')
    }

    const { error } = await admin.from('press_listas').delete().eq('id', id).eq('workspace_id', workspaceId)
    if (error) throw new Error('Não foi possível apagar a lista.')

    await admin.from('activity_log').insert({
      workspace_id: workspaceId,
      actor_id: context.user.id,
      action: 'lista_de_imprensa_apagada',
      entity_type: 'press_listas',
      metadata: { nome: lista.nome },
    })
    revalidatePath('/imprensa')
    return {}
  } catch (causa) {
    return comoErro(causa, 'Não foi possível apagar a lista.')
  }
}
