'use server'

import { revalidatePath } from 'next/cache'
import { requireWorkspace } from '@/lib/session'
import { createClient } from '@/lib/supabase/server'
import { mensagemDoErro } from '@/lib/erro-de-acao'
import { COLUNAS, COLUNAS_COM_CRIACAO, PASSO, PRIORIDADES, type StatusDoQuadro } from '@/lib/pautas/quadro'

/**
 * As ações do quadro de pautas. Usam o cliente da sessão: as políticas da
 * tabela de pautas já deixam qualquer membro do espaço editar, e é a mesma
 * regra da sala da pauta.
 *
 * Todas devolvem { erro } em vez de lançar — o quadro desfaz o movimento
 * otimista e mostra o motivo.
 */

type Resultado = { erro?: string }
const texto = (f: FormData, k: string) => String(f.get(k) ?? '').trim()
const ehStatus = (s: string): s is StatusDoQuadro => COLUNAS.some((c) => c.status === s)

function revalidar(id?: string) {
  revalidatePath('/pautas')
  revalidatePath('/projetos')
  if (id) revalidatePath(`/pautas/${id}`)
}

/**
 * Move um cartão: coluna e/ou posição. Ir para "Aprovação" passa pela mesma
 * função do banco que a sala usa — abre a rodada de aprovação, não é só
 * trocar a etiqueta.
 */
export async function moverPauta(formData: FormData): Promise<Resultado> {
  try {
    const context = await requireWorkspace()
    const supabase = await createClient()
    const id = texto(formData, 'id')
    const status = texto(formData, 'status')
    const posicao = Number(texto(formData, 'posicao'))
    if (!ehStatus(status)) throw new Error('Coluna inválida.')
    if (!Number.isFinite(posicao)) throw new Error('Posição inválida.')

    const { data: atual } = await supabase.from('pautas').select('status')
      .eq('id', id).eq('workspace_id', context.workspace.id).maybeSingle()
    if (!atual) throw new Error('Pauta não encontrada.')

    if (atual.status !== status && status === 'approval') {
      const { data: aprovacao, error } = await supabase.rpc('submit_pauta_for_approval', { p_pauta_id: id })
      if (error || !aprovacao) throw new Error(error?.message || 'Não foi possível enviar para aprovação.')
      await supabase.from('pautas').update({ posicao }).eq('id', id).eq('workspace_id', context.workspace.id)
    } else {
      const { error } = await supabase.from('pautas')
        .update({ status, posicao, updated_at: new Date().toISOString() })
        .eq('id', id).eq('workspace_id', context.workspace.id)
      if (error) throw new Error('Não foi possível mover a pauta.')
    }

    if (atual.status !== status) {
      await supabase.from('activity_log').insert({
        workspace_id: context.workspace.id, actor_id: context.user.id, action: 'status_changed',
        entity_type: 'pauta', entity_id: id, metadata: { status, de: atual.status },
      })
    }
    revalidar(id)
    return {}
  } catch (causa) {
    return { erro: mensagemDoErro(causa, 'Não foi possível mover a pauta.') }
  }
}

/** Cartão novo pelo pé da coluna: só o título, entra no fim da coluna. */
export async function criarPautaRapida(formData: FormData): Promise<Resultado & { id?: string }> {
  try {
    const context = await requireWorkspace()
    const supabase = await createClient()
    const titulo = texto(formData, 'titulo')
    const status = texto(formData, 'status')
    if (!ehStatus(status) || !COLUNAS_COM_CRIACAO.includes(status)) throw new Error('Não dá para criar pauta direto nesta coluna.')
    if (titulo.length < 2 || titulo.length > 200) throw new Error('O título precisa ter entre 2 e 200 caracteres.')
    const projeto = texto(formData, 'projeto') || null

    const { data: ultimo } = await supabase.from('pautas').select('posicao')
      .eq('workspace_id', context.workspace.id).eq('status', status).not('posicao', 'is', null)
      .order('posicao', { ascending: false }).limit(1).maybeSingle()

    const { data, error } = await supabase.from('pautas').insert({
      workspace_id: context.workspace.id,
      project_id: projeto,
      title: titulo,
      status,
      priority: 'medium',
      posicao: (ultimo?.posicao ?? 0) + PASSO,
      created_by: context.user.id,
      owner_id: context.user.id,
      tags: ['Outro'],
    }).select('id').single()
    if (error || !data) throw new Error('Não foi possível criar a pauta.')

    await supabase.from('activity_log').insert({
      workspace_id: context.workspace.id, actor_id: context.user.id, action: 'created',
      entity_type: 'pauta', entity_id: data.id, metadata: { title: titulo, pelo: 'quadro' },
    })
    revalidar()
    return { id: data.id }
  } catch (causa) {
    return { erro: mensagemDoErro(causa, 'Não foi possível criar a pauta.') }
  }
}

/** Título, prazo, prioridade e responsável — o que se edita no cartão aberto. */
export async function atualizarCartao(formData: FormData): Promise<Resultado> {
  try {
    const context = await requireWorkspace()
    const supabase = await createClient()
    const id = texto(formData, 'id')
    const titulo = texto(formData, 'titulo')
    const prazo = texto(formData, 'prazo')
    const prioridade = texto(formData, 'prioridade')
    const responsavel = texto(formData, 'responsavel')
    if (titulo.length < 2 || titulo.length > 200) throw new Error('O título precisa ter entre 2 e 200 caracteres.')
    if (prazo && !/^\d{4}-\d{2}-\d{2}$/.test(prazo)) throw new Error('Prazo inválido.')
    if (!PRIORIDADES.some((p) => p.id === prioridade)) throw new Error('Prioridade inválida.')
    if (responsavel) {
      const { data } = await supabase.from('workspace_members').select('user_id')
        .eq('workspace_id', context.workspace.id).eq('user_id', responsavel).maybeSingle()
      if (!data) throw new Error('Responsável precisa ser alguém do espaço.')
    }

    const { error } = await supabase.from('pautas').update({
      title: titulo, due_date: prazo || null, priority: prioridade, owner_id: responsavel || null,
      updated_at: new Date().toISOString(),
    }).eq('id', id).eq('workspace_id', context.workspace.id)
    if (error) throw new Error('Não foi possível salvar o cartão.')

    await supabase.from('activity_log').insert({
      workspace_id: context.workspace.id, actor_id: context.user.id, action: 'card_updated',
      entity_type: 'pauta', entity_id: id, metadata: { prazo: prazo || null, prioridade, responsavel: responsavel || null },
    })
    revalidar(id)
    return {}
  } catch (causa) {
    return { erro: mensagemDoErro(causa, 'Não foi possível salvar o cartão.') }
  }
}

export type ItemDoChecklist = { id: string; texto: string; feito: boolean }

export async function carregarChecklist(formData: FormData): Promise<Resultado & { itens?: ItemDoChecklist[]; descricao?: string }> {
  try {
    const context = await requireWorkspace()
    const supabase = await createClient()
    const id = texto(formData, 'id')
    const [{ data: itens, error }, { data: pauta }] = await Promise.all([
      supabase.from('pauta_checklist').select('id,texto,feito').eq('workspace_id', context.workspace.id).eq('pauta_id', id).order('posicao').order('created_at'),
      supabase.from('pautas').select('description').eq('workspace_id', context.workspace.id).eq('id', id).maybeSingle(),
    ])
    if (error) throw new Error('Não foi possível carregar o checklist.')
    return { itens: itens ?? [], descricao: pauta?.description ?? '' }
  } catch (causa) {
    return { erro: mensagemDoErro(causa, 'Não foi possível carregar o checklist.') }
  }
}

export async function adicionarItemDoChecklist(formData: FormData): Promise<Resultado & { item?: ItemDoChecklist }> {
  try {
    const context = await requireWorkspace()
    const supabase = await createClient()
    const pautaId = texto(formData, 'pautaId')
    const conteudo = texto(formData, 'texto')
    if (!conteudo || conteudo.length > 300) throw new Error('O item precisa ter entre 1 e 300 caracteres.')
    const { data, error } = await supabase.from('pauta_checklist').insert({
      workspace_id: context.workspace.id, pauta_id: pautaId, texto: conteudo,
      posicao: Date.now(), created_by: context.user.id,
    }).select('id,texto,feito').single()
    if (error || !data) throw new Error('Não foi possível adicionar o item.')
    revalidar()
    return { item: data }
  } catch (causa) {
    return { erro: mensagemDoErro(causa, 'Não foi possível adicionar o item.') }
  }
}

export async function marcarItemDoChecklist(formData: FormData): Promise<Resultado> {
  try {
    const context = await requireWorkspace()
    const supabase = await createClient()
    const { error } = await supabase.from('pauta_checklist').update({ feito: texto(formData, 'feito') === 'true' })
      .eq('id', texto(formData, 'id')).eq('workspace_id', context.workspace.id)
    if (error) throw new Error('Não foi possível marcar o item.')
    revalidar()
    return {}
  } catch (causa) {
    return { erro: mensagemDoErro(causa, 'Não foi possível marcar o item.') }
  }
}

export async function removerItemDoChecklist(formData: FormData): Promise<Resultado> {
  try {
    const context = await requireWorkspace()
    const supabase = await createClient()
    const { error } = await supabase.from('pauta_checklist').delete()
      .eq('id', texto(formData, 'id')).eq('workspace_id', context.workspace.id)
    if (error) throw new Error('Não foi possível remover o item.')
    revalidar()
    return {}
  } catch (causa) {
    return { erro: mensagemDoErro(causa, 'Não foi possível remover o item.') }
  }
}
