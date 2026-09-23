'use server'

import { revalidatePath } from 'next/cache'
import { requireWorkspace } from '@/lib/session'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { mensagemDoErro } from '@/lib/erro-de-acao'
import { enviarPeloGmail, esquecerToken, GmailError } from '@/lib/google/gmail'
import { sincronizarCaixas } from '@/lib/correio/sincronizar'
import { corpoComAssinatura, lerDestinatarios, montarMensagem } from '@/lib/correio/mensagem'

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
  if (context.role !== 'admin') throw new Error('Só administradores configuram o correio dos setores.')
  return context
}

const revalidar = () => { revalidatePath('/configuracoes'); revalidatePath('/correio') }

export async function sincronizarCaixasAgora(): Promise<Resultado> {
  try {
    const context = await exigirAdmin()
    const r = await sincronizarCaixas(context.workspace.id)
    revalidar()
    return { recado: `${r.total} endereço(s) no Gmail.${r.novas ? ` ${r.novas} novo(s): atribua a um setor e ative.` : ''}${r.fora ? ` ${r.fora} sumiram do Gmail e não enviam mais.` : ''}` }
  } catch (causa) {
    return comoErro(causa, 'Não foi possível sincronizar com o Gmail.')
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

const TETO_DE_DESTINATARIOS = 50

/**
 * Envia um e-mail por uma caixa de setor.
 *
 * O que chega da tela é só: qual caixa, para quem, assunto e texto. O
 * remetente, o nome, o responder-para e a assinatura saem da linha da caixa
 * no banco. Quem não é do setor dono da caixa não envia — nem forjando o
 * pedido, porque a conferência é aqui, no servidor.
 */
export async function enviarEmailDoSetor(formData: FormData): Promise<Resultado> {
  let registro: Record<string, unknown> | null = null
  try {
    const context = await requireWorkspace()
    const workspaceId = context.workspace.id
    const admin = createAdminClient()

    const { data: caixa } = await admin.from('caixas_de_email')
      .select('id, setor_id, email, nome_exibicao, assinatura_html, responder_para, ativa, no_gmail')
      .eq('id', texto(formData, 'caixaId')).eq('workspace_id', workspaceId).maybeSingle()
    if (!caixa || !caixa.ativa || !caixa.no_gmail || !caixa.setor_id) throw new Error('Esta caixa não está disponível para envio.')

    if (context.role !== 'admin') {
      const { data: membro } = await admin.from('setor_membros').select('user_id')
        .eq('setor_id', caixa.setor_id).eq('user_id', context.user.id).maybeSingle()
      if (!membro) throw new Error('Você não faz parte do setor desta caixa.')
    }

    const para = lerDestinatarios(texto(formData, 'para'))
    const cc = lerDestinatarios(texto(formData, 'cc'))
    const invalidos = [...para.invalidos, ...cc.invalidos]
    if (invalidos.length) throw new Error(`Endereço inválido: ${invalidos.slice(0, 3).join(', ')}`)
    if (!para.validos.length) throw new Error('Informe ao menos um destinatário.')
    if (para.validos.length + cc.validos.length > TETO_DE_DESTINATARIOS) {
      throw new Error(`No máximo ${TETO_DE_DESTINATARIOS} destinatários por mensagem. Para listas, use as campanhas da Imprensa.`)
    }
    const assunto = texto(formData, 'assunto')
    const corpo = String(formData.get('corpo') ?? '').trim()
    if (!assunto || assunto.length > 200) throw new Error('Escreva um assunto (até 200 caracteres).')
    if (!corpo) throw new Error('Escreva a mensagem.')

    registro = {
      workspace_id: workspaceId, caixa_id: caixa.id, setor_id: caixa.setor_id, autor_id: context.user.id,
      de: caixa.email, para: para.validos, cc: cc.validos, assunto, corpo,
    }

    const conteudo = corpoComAssinatura(corpo, caixa.assinatura_html)
    const { raw } = montarMensagem({
      de: { nome: caixa.nome_exibicao, email: caixa.email },
      para: para.validos,
      cc: cc.validos,
      responderPara: caixa.responder_para,
      assunto,
      texto: conteudo.texto,
      html: conteudo.html,
    })
    const enviado = await enviarPeloGmail(workspaceId, raw)

    await admin.from('emails_enviados').insert({ ...registro, estado: 'enviado', gmail_message_id: enviado.id, gmail_thread_id: enviado.threadId })
    revalidatePath('/correio')
    return { recado: `Enviado de ${caixa.email} para ${para.validos.length + cc.validos.length} destinatário(s).` }
  } catch (causa) {
    const mensagem = causa instanceof GmailError ? causa.message : mensagemDoErro(causa, 'Não foi possível enviar.')
    if (registro) {
      await createAdminClient().from('emails_enviados').insert({ ...registro, estado: 'falhou', erro: mensagem.slice(0, 500) })
      revalidatePath('/correio')
    }
    return { erro: mensagem }
  }
}
