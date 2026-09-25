'use server'

import { revalidatePath } from 'next/cache'
import { requireWorkspace } from '@/lib/session'
import { pode } from '@/lib/permissoes'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { mensagemDoErro } from '@/lib/erro-de-acao'
import { esquecerToken } from '@/lib/google/gmail'
import { enviarPelaCaixa } from '@/lib/correio/enviar'
import { resumoDaSincronizacao, sincronizarCaixas } from '@/lib/correio/sincronizar'

/**
 * O correio dos setores.
 *
 * Escrita sempre pelo cliente administrativo, depois de conferir em código
 * quem pede (mesmo padrão da newsletter): as tabelas só têm política de
 * leitura. A regra que importa mora em enviarEmailDoSetor: remetente e
 * assinatura saem da caixa no banco, e só envia por uma caixa quem é do
 * setor dono dela.
 */

type Resultado = { erro?: string; recado?: string }
const texto = (f: FormData, k: string) => String(f.get(k) ?? '').trim()
const comoErro = (causa: unknown, padrao: string): Resultado => ({ erro: mensagemDoErro(causa, padrao) })

async function exigirAdmin() {
  const context = await requireWorkspace()
  if (!pode(context.role, 'correio.configurar')) throw new Error('Só administradores configuram o correio dos setores.')
  return context
}

const revalidar = () => { revalidatePath('/configuracoes'); revalidatePath('/correio') }

export async function sincronizarCaixasAgora(): Promise<Resultado> {
  try {
    const context = await exigirAdmin()
    const r = await sincronizarCaixas(context.workspace.id)
    revalidar()
    return { recado: resumoDaSincronizacao(r) }
  } catch (causa) {
    return comoErro(causa, 'Não foi possível sincronizar com o Gmail.')
  }
}

/** Ativa de uma vez as caixas que já têm setor (as sugeridas pela sincronização e as atribuídas à mão). */
export async function ativarCaixasComSetor(): Promise<Resultado> {
  try {
    const context = await exigirAdmin()
    const admin = createAdminClient()
    const { data, error } = await admin.from('caixas_de_email').update({ ativa: true })
      .eq('workspace_id', context.workspace.id).eq('ativa', false).eq('no_gmail', true).not('setor_id', 'is', null).select('id')
    if (error) throw new Error('Não foi possível ativar as caixas.')
    await admin.from('activity_log').insert({
      workspace_id: context.workspace.id, actor_id: context.user.id, action: 'caixas_ativadas',
      entity_type: 'caixa_de_email', metadata: { quantas: data?.length ?? 0 },
    })
    revalidar()
    return { recado: `${data?.length ?? 0} endereço(s) ativado(s). Só envia por cada um quem é do setor dele.` }
  } catch (causa) {
    return comoErro(causa, 'Não foi possível ativar as caixas.')
  }
}

export async function desconectarGoogle(): Promise<Resultado> {
  try {
    const context = await exigirAdmin()
    const supabase = await createClient()
    const { error } = await supabase.rpc('remover_chave_de_integracao', { p_workspace_id: context.workspace.id, p_servico: 'google_gmail' })
    if (error) throw new Error('Não foi possível remover a autorização.')
    esquecerToken(context.workspace.id)
    const admin = createAdminClient()
    await admin.from('google_conexao').delete().eq('workspace_id', context.workspace.id)
    await admin.from('activity_log').insert({
      workspace_id: context.workspace.id, actor_id: context.user.id, action: 'google_desconectado', entity_type: 'integracao', metadata: {},
    })
    revalidar()
    return { recado: 'Conta Google desconectada. Para revogar também do lado do Google: myaccount.google.com/permissions.' }
  } catch (causa) {
    return comoErro(causa, 'Não foi possível desconectar.')
  }
}

export async function criarSetor(formData: FormData): Promise<Resultado> {
  try {
    const context = await exigirAdmin()
    const nome = texto(formData, 'nome')
    if (nome.length < 2 || nome.length > 80) throw new Error('O nome do setor precisa ter entre 2 e 80 caracteres.')
    const { error } = await createAdminClient().from('setores').insert({ workspace_id: context.workspace.id, nome })
    if (error) throw new Error(error.code === '23505' ? 'Já existe um setor com esse nome.' : 'Não foi possível criar o setor.')
    revalidar()
    return { recado: `Setor "${nome}" criado.` }
  } catch (causa) {
    return comoErro(causa, 'Não foi possível criar o setor.')
  }
}

export async function excluirSetor(formData: FormData): Promise<Resultado> {
  try {
    const context = await exigirAdmin()
    const admin = createAdminClient()
    const id = texto(formData, 'id')
    // A caixa do setor apagado fica sem dono E inativa: não pode sobrar um
    // endereço ativo sem ninguém responsável por ele.
    await admin.from('caixas_de_email').update({ ativa: false }).eq('workspace_id', context.workspace.id).eq('setor_id', id)
    const { error } = await admin.from('setores').delete().eq('workspace_id', context.workspace.id).eq('id', id)
    if (error) throw new Error('Não foi possível apagar o setor.')
    revalidar()
    return { recado: 'Setor apagado. As caixas dele ficaram sem setor e desativadas.' }
  } catch (causa) {
    return comoErro(causa, 'Não foi possível apagar o setor.')
  }
}

/** Troca a lista inteira de membros de um setor. */
export async function definirMembros(formData: FormData): Promise<Resultado> {
  try {
    const context = await exigirAdmin()
    const workspaceId = context.workspace.id
    const setorId = texto(formData, 'setorId')
    let ids: string[]
    try { ids = JSON.parse(texto(formData, 'ids') || '[]') } catch { ids = [] }
    ids = Array.isArray(ids) ? [...new Set(ids.filter((i) => typeof i === 'string'))] : []

    const admin = createAdminClient()
    const { data: setor } = await admin.from('setores').select('id').eq('id', setorId).eq('workspace_id', workspaceId).maybeSingle()
    if (!setor) throw new Error('Setor não encontrado.')
    // Só entra quem é do espaço: um id de fora nunca vira membro de setor.
    const { data: doEspaco } = ids.length
      ? await admin.from('workspace_members').select('user_id').eq('workspace_id', workspaceId).in('user_id', ids)
      : { data: [] as { user_id: string }[] }
    const validos = (doEspaco ?? []).map((m) => m.user_id as string)

    await admin.from('setor_membros').delete().eq('setor_id', setorId)
    if (validos.length) {
      const { error } = await admin.from('setor_membros').insert(validos.map((user_id) => ({ setor_id: setorId, user_id, workspace_id: workspaceId })))
      if (error) throw new Error('Não foi possível salvar os membros.')
    }
    await admin.from('activity_log').insert({
      workspace_id: workspaceId, actor_id: context.user.id, action: 'setor_membros_definidos',
      entity_type: 'setor', entity_id: setorId, metadata: { quantos: validos.length },
    })
    revalidar()
    return { recado: `${validos.length} pessoa(s) no setor.` }
  } catch (causa) {
    return comoErro(causa, 'Não foi possível salvar os membros.')
  }
}

/** A que setor pertence uma caixa, e se ela envia. */
export async function configurarCaixa(formData: FormData): Promise<Resultado> {
  try {
    const context = await exigirAdmin()
    const workspaceId = context.workspace.id
    const id = texto(formData, 'id')
    const setorId = texto(formData, 'setorId') || null
    const ativa = texto(formData, 'ativa') === 'true'
    const admin = createAdminClient()
    if (setorId) {
      const { data } = await admin.from('setores').select('id').eq('id', setorId).eq('workspace_id', workspaceId).maybeSingle()
      if (!data) throw new Error('Setor não encontrado.')
    }
    if (ativa && !setorId) throw new Error('Atribua a caixa a um setor antes de ativar.')
    const { error } = await admin.from('caixas_de_email').update({ setor_id: setorId, ativa }).eq('id', id).eq('workspace_id', workspaceId)
    if (error) throw new Error('Não foi possível salvar a caixa.')
    await admin.from('activity_log').insert({
      workspace_id: workspaceId, actor_id: context.user.id, action: 'caixa_configurada',
      entity_type: 'caixa_de_email', entity_id: id, metadata: { setorId, ativa },
    })
    revalidar()
    return {}
  } catch (causa) {
    return comoErro(causa, 'Não foi possível salvar a caixa.')
  }
}

/**
 * O nome que o destinatário vê como remetente (ex.: "CVB-RJ · Comunicação
 * Social"). Com a lista toda: grava vários de uma vez ("usar as sugestões").
 */
export async function nomearCaixas(nomes: { id: string; nome: string }[]): Promise<Resultado> {
  try {
    const context = await exigirAdmin()
    const workspaceId = context.workspace.id
    const lista = (nomes ?? []).slice(0, 200).map((n) => ({ id: String(n.id ?? ''), nome: String(n.nome ?? '').replace(/[<>"\r\n]/g, '').replace(/\s+/g, ' ').trim() }))
    if (lista.some((n) => n.nome.length > 80)) throw new Error('O nome do remetente pode ter até 80 caracteres.')
    const admin = createAdminClient()
    for (const n of lista) {
      const { error } = await admin.from('caixas_de_email').update({ nome_remetente: n.nome }).eq('id', n.id).eq('workspace_id', workspaceId)
      if (error) throw new Error('Não foi possível salvar o nome.')
    }
    await admin.from('activity_log').insert({
      workspace_id: workspaceId, actor_id: context.user.id, action: 'caixa_nomeada',
      entity_type: 'caixa_de_email', entity_id: lista.length === 1 ? lista[0].id : null, metadata: { nomes: lista },
    })
    revalidar()
    return {}
  } catch (causa) {
    return comoErro(causa, 'Não foi possível salvar o nome.')
  }
}

/**
 * Envia um e-mail por uma caixa de setor.
 *
 * O que chega da tela é só: qual caixa, para quem, assunto e texto. O
 * remetente, o nome, o responder-para e a assinatura saem da linha da caixa
 * no banco. Quem não é do setor dono da caixa não envia — nem forjando o
 * pedido, porque a conferência é aqui, no servidor.
 */
export async function enviarEmailDoSetor(formData: FormData): Promise<Resultado> {
  try {
    const context = await requireWorkspace()
    const { de, destinatarios } = await enviarPelaCaixa(context, texto(formData, 'caixaId'), {
      para: texto(formData, 'para'), cc: texto(formData, 'cc'), assunto: texto(formData, 'assunto'), corpo: String(formData.get('corpo') ?? ''),
    })
    revalidatePath('/correio')
    return { recado: `Enviado de ${de} para ${destinatarios.length} destinatário(s).` }
  } catch (causa) {
    // enviarPelaCaixa já registrou a falha em emails_enviados (quando chegou a montar o envio).
    revalidatePath('/correio')
    return { erro: mensagemDoErro(causa, 'Não foi possível enviar.') }
  }
}
