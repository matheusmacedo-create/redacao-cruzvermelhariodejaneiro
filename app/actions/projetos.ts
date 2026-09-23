'use server'

import { revalidatePath } from 'next/cache'
import { requireWorkspace } from '@/lib/session'
import { createClient } from '@/lib/supabase/server'
import { mensagemDoErro } from '@/lib/erro-de-acao'
import { ehSituacao } from '@/lib/projetos/cronograma'

/**
 * Projetos no modelo do Asana. Cliente da sessão: as políticas já deixam
 * membros do espaço criar e editar projetos, publicar atualizações e mexer em
 * marcos. Todas devolvem { erro } em vez de lançar.
 */

type Resultado = { erro?: string }
const texto = (f: FormData, k: string) => String(f.get(k) ?? '').trim()
const DATA = /^\d{4}-\d{2}-\d{2}$/

function lerDatas(f: FormData, ki = 'inicio', kf = 'fim') {
  const inicio = texto(f, ki) || null
  const fim = texto(f, kf) || null
  if ((inicio && !DATA.test(inicio)) || (fim && !DATA.test(fim))) throw new Error('Data inválida.')
  if (inicio && fim && inicio > fim) throw new Error('O início precisa vir antes do fim.')
  return { inicio, fim }
}

async function membroOuNulo(supabase: Awaited<ReturnType<typeof createClient>>, workspaceId: string, id: string) {
  if (!id) return null
  const { data } = await supabase.from('workspace_members').select('user_id').eq('workspace_id', workspaceId).eq('user_id', id).maybeSingle()
  if (!data) throw new Error('O responsável precisa ser alguém do espaço.')
  return id
}

function revalidar(id?: string) {
  revalidatePath('/projetos')
  if (id) revalidatePath(`/projetos/${id}`)
}

export async function criarProjeto(formData: FormData): Promise<Resultado & { id?: string }> {
  try {
    const context = await requireWorkspace()
    const supabase = await createClient()
    const nome = texto(formData, 'nome')
    if (nome.length < 3 || nome.length > 120) throw new Error('O nome precisa ter entre 3 e 120 caracteres.')
    const { inicio, fim } = lerDatas(formData)
    const responsavel = await membroOuNulo(supabase, context.workspace.id, texto(formData, 'responsavel'))
    const { data, error } = await supabase.from('projects').insert({
      workspace_id: context.workspace.id, name: nome, description: texto(formData, 'descricao'),
      status: 'active', color: 'blue', inicio, fim, responsavel_id: responsavel ?? context.user.id,
      created_by: context.user.id,
    }).select('id').single()
    if (error || !data) throw new Error('Não foi possível criar o projeto.')
    await supabase.from('activity_log').insert({
      workspace_id: context.workspace.id, actor_id: context.user.id, action: 'created', entity_type: 'project', entity_id: data.id, metadata: { name: nome },
    })
    revalidar()
    return { id: data.id }
  } catch (causa) {
    return { erro: mensagemDoErro(causa, 'Não foi possível criar o projeto.') }
  }
}

export async function atualizarProjeto(formData: FormData): Promise<Resultado> {
  try {
    const context = await requireWorkspace()
    const supabase = await createClient()
    const id = texto(formData, 'id')
    const nome = texto(formData, 'nome')
    if (nome.length < 3 || nome.length > 120) throw new Error('O nome precisa ter entre 3 e 120 caracteres.')
    const { inicio, fim } = lerDatas(formData)
    const responsavel = await membroOuNulo(supabase, context.workspace.id, texto(formData, 'responsavel'))
    const { error } = await supabase.from('projects').update({
      name: nome, description: texto(formData, 'descricao'), inicio, fim, responsavel_id: responsavel,
      updated_at: new Date().toISOString(),
    }).eq('id', id).eq('workspace_id', context.workspace.id)
    if (error) throw new Error('Não foi possível salvar o projeto.')
    revalidar(id)
    return {}
  } catch (causa) {
    return { erro: mensagemDoErro(causa, 'Não foi possível salvar o projeto.') }
  }
}

/** A situação do projeto só muda com uma atualização escrita, que vai para o histórico. */
export async function publicarAtualizacao(formData: FormData): Promise<Resultado> {
  try {
    const context = await requireWorkspace()
    const supabase = await createClient()
    const projectId = texto(formData, 'projectId')
    const situacao = texto(formData, 'situacao')
    const conteudo = String(formData.get('texto') ?? '').trim()
    if (!ehSituacao(situacao)) throw new Error('Escolha a situação do projeto.')
    if (conteudo.length < 3 || conteudo.length > 4000) throw new Error('Escreva a atualização (até 4000 caracteres).')
    const agora = new Date().toISOString()
    const { error } = await supabase.from('project_updates').insert({
      workspace_id: context.workspace.id, project_id: projectId, situacao, texto: conteudo, autor_id: context.user.id,
    })
    if (error) throw new Error('Não foi possível publicar a atualização.')
    await supabase.from('projects').update({ situacao, situacao_em: agora, updated_at: agora })
      .eq('id', projectId).eq('workspace_id', context.workspace.id)
    revalidar(projectId)
    return {}
  } catch (causa) {
    return { erro: mensagemDoErro(causa, 'Não foi possível publicar a atualização.') }
  }
}

export async function excluirAtualizacao(formData: FormData): Promise<Resultado> {
  try {
    const context = await requireWorkspace()
    const supabase = await createClient()
    const { data, error } = await supabase.from('project_updates').delete()
      .eq('id', texto(formData, 'id')).eq('workspace_id', context.workspace.id).select('project_id').maybeSingle()
    if (error) throw new Error('Não foi possível apagar a atualização.')
    if (!data) throw new Error('Só quem escreveu, ou um administrador, apaga a atualização.')
    // A situação do projeto volta a ser a da atualização anterior, se houver.
    const { data: anterior } = await supabase.from('project_updates').select('situacao,created_at')
      .eq('project_id', data.project_id).order('created_at', { ascending: false }).limit(1).maybeSingle()
    await supabase.from('projects').update({ situacao: anterior?.situacao ?? null, situacao_em: anterior?.created_at ?? null })
      .eq('id', data.project_id).eq('workspace_id', context.workspace.id)
    revalidar(data.project_id)
    return {}
  } catch (causa) {
    return { erro: mensagemDoErro(causa, 'Não foi possível apagar a atualização.') }
  }
}

export async function concluirProjeto(formData: FormData): Promise<Resultado> {
  try {
    const context = await requireWorkspace()
    const supabase = await createClient()
    const id = texto(formData, 'id')
    const concluir = texto(formData, 'concluir') === 'true'
    const { error } = await supabase.from('projects').update({
      status: concluir ? 'completed' : 'active', concluido_em: concluir ? new Date().toISOString() : null,
      updated_at: new Date().toISOString(),
    }).eq('id', id).eq('workspace_id', context.workspace.id)
    if (error) throw new Error('Não foi possível mudar o projeto.')
    await supabase.from('activity_log').insert({
      workspace_id: context.workspace.id, actor_id: context.user.id, action: concluir ? 'project_completed' : 'project_reopened',
      entity_type: 'project', entity_id: id, metadata: {},
    })
    revalidar(id)
    return {}
  } catch (causa) {
    return { erro: mensagemDoErro(causa, 'Não foi possível mudar o projeto.') }
  }
}

export async function criarMarco(formData: FormData): Promise<Resultado> {
  try {
    const context = await requireWorkspace()
    const supabase = await createClient()
    const projectId = texto(formData, 'projectId')
    const titulo = texto(formData, 'titulo')
    const data = texto(formData, 'data')
    if (!titulo || titulo.length > 120) throw new Error('Dê um nome ao marco (até 120 caracteres).')
    if (!DATA.test(data)) throw new Error('Escolha a data do marco.')
    const { error } = await supabase.from('project_marcos').insert({
      workspace_id: context.workspace.id, project_id: projectId, titulo, data, created_by: context.user.id,
    })
    if (error) throw new Error('Não foi possível criar o marco.')
    revalidar(projectId)
    return {}
  } catch (causa) {
    return { erro: mensagemDoErro(causa, 'Não foi possível criar o marco.') }
  }
}

export async function alternarMarco(formData: FormData): Promise<Resultado> {
  try {
    const context = await requireWorkspace()
    const supabase = await createClient()
    const { data, error } = await supabase.from('project_marcos').update({ feito: texto(formData, 'feito') === 'true' })
      .eq('id', texto(formData, 'id')).eq('workspace_id', context.workspace.id).select('project_id').maybeSingle()
    if (error) throw new Error('Não foi possível marcar.')
    revalidar(data?.project_id)
    return {}
  } catch (causa) {
    return { erro: mensagemDoErro(causa, 'Não foi possível marcar.') }
  }
}

export async function excluirMarco(formData: FormData): Promise<Resultado> {
  try {
    const context = await requireWorkspace()
    const supabase = await createClient()
    const { data, error } = await supabase.from('project_marcos').delete()
      .eq('id', texto(formData, 'id')).eq('workspace_id', context.workspace.id).select('project_id').maybeSingle()
    if (error) throw new Error('Não foi possível apagar o marco.')
    revalidar(data?.project_id)
    return {}
  } catch (causa) {
    return { erro: mensagemDoErro(causa, 'Não foi possível apagar o marco.') }
  }
}

/** Início e prazo de uma pauta — é o que a põe na linha do tempo. */
export async function definirDatasDaPauta(formData: FormData): Promise<Resultado> {
  try {
    const context = await requireWorkspace()
    const supabase = await createClient()
    const id = texto(formData, 'id')
    const { inicio, fim } = lerDatas(formData)
    const { data, error } = await supabase.from('pautas')
      .update({ data_inicio: inicio, due_date: fim, updated_at: new Date().toISOString() })
      .eq('id', id).eq('workspace_id', context.workspace.id).select('project_id').maybeSingle()
    if (error) throw new Error('Não foi possível salvar as datas.')
    revalidar(data?.project_id ?? undefined)
    revalidatePath('/pautas')
    return {}
  } catch (causa) {
    return { erro: mensagemDoErro(causa, 'Não foi possível salvar as datas.') }
  }
}
