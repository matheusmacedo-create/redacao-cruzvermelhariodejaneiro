'use server'

import { after } from 'next/server'
import { revalidatePath } from 'next/cache'
import { mensagemDoErro } from '@/lib/erro-de-acao'
import { createAdminClient } from '@/lib/supabase/admin'
import { contextoDaEscola, servicoDaConta, sincronizarEspaco, testarChave } from '@/lib/escola/servidor'
import { finalDaChave } from '@/lib/escola/unicopag'

/**
 * Contas da Únicopag da Escola. Cadastrar, trocar a chave e tirar uma conta
 * é de admin (o banco confere de novo); atualizar os números é de quem vê a
 * Escola. A chave recebida nunca volta na resposta nem vai para o registro
 * de atividade — só o fato de ter sido trocada, e por quem.
 */

type Estado = { erro?: string; recado?: string; ok?: number }

const revalidar = () => { for (const c of ['/escola', '/escola/vendas', '/escola/vendas/transacoes', '/escola/configuracoes', '/financeiro']) revalidatePath(c) }

async function registrar(workspaceId: string, actorId: string, action: string, contaId: string) {
  await createAdminClient().from('activity_log').insert({ workspace_id: workspaceId, actor_id: actorId, action, entity_type: 'escola_conta', entity_id: contaId, metadata: {} })
}

export async function salvarContaDaEscola(id: string | null, _anterior: Estado, formData: FormData): Promise<Estado> {
  try {
    const { context, supabase, nivel } = await contextoDaEscola()
    if (nivel < 3) throw new Error('Só um admin cadastra as contas da escola.')
    const t = (k: string, max: number) => String(formData.get(k) ?? '').trim().slice(0, max)
    const nome = t('nome', 80)
    if (nome.length < 2) throw new Error('Dê um nome à conta (ex.: Punção Venosa).')
    const url = t('sistema_url', 300)
    if (url && !/^https:\/\/\S+$/.test(url)) throw new Error('O endereço do sistema precisa começar com https://.')
    const chave = String(formData.get('chave') ?? '').trim()
    if (chave && (chave.length < 16 || /\s/.test(chave))) throw new Error('A chave parece incompleta. Cole a chave de API inteira, sem espaços.')
    // Testa a chave ANTES de gravar qualquer coisa: chave errada não entra no cofre.
    if (chave) {
      const teste = await testarChave(chave)
      if ('erro' in teste) throw new Error(teste.erro)
    }
    const desde = t('lancar_desde', 10)
    if (desde && !/^\d{4}-\d{2}-\d{2}$/.test(desde)) throw new Error('Data de início dos lançamentos inválida.')
    const p: Record<string, unknown> = { nome, descricao: t('descricao', 300), sistema_url: url, lancar_desde: desde }
    if (id) { p.id = id; p.ativa = formData.get('ativa') !== 'nao' }
    const { data: contaId, error } = await supabase.rpc('escola_salvar_conta', { p_workspace_id: context.workspace.id, p })
    if (error || !contaId) throw new Error(error?.code === 'P0001' && error.message ? error.message : 'Não foi possível salvar a conta.')
    let recado = id ? 'Conta atualizada.' : 'Conta cadastrada.'
    // Mudou a data de início: leva ao Financeiro o que já foi lido, sem esperar a próxima leitura.
    if (id && desde && !chave) after(async () => { await createAdminClient().rpc('escola_lancar_no_financeiro', { p_conta_id: id }) })
    if (chave) {
      const { error: e2 } = await supabase.rpc('definir_chave_de_integracao', { p_workspace_id: context.workspace.id, p_servico: servicoDaConta(contaId as string), p_valor: chave })
      if (e2) throw new Error('A conta foi salva, mas não foi possível guardar a chave no cofre. Tente de novo.')
      await createAdminClient().rpc('escola_marcar_chave', { p_conta_id: contaId, p_final: finalDaChave(chave) })
      await registrar(context.workspace.id, context.user.id, 'escola_chave_definida', contaId as string)
      // A primeira leitura pode levar um minuto (todas as páginas): roda depois da resposta.
      after(() => sincronizarEspaco(context.workspace.id, contaId as string).then(() => undefined))
      recado += ' Chave conferida e guardada no cofre; as transações estão sendo lidas — atualize a página em um minuto.'
    }
    revalidar()
    return { recado, ok: Date.now() }
  } catch (causa) {
    return { erro: mensagemDoErro(causa, 'Não foi possível salvar a conta.') }
  }
}

export async function removerChaveDaEscola(contaId: string): Promise<Estado> {
  try {
    const { context, supabase, nivel } = await contextoDaEscola()
    if (nivel < 3) throw new Error('Só um admin tira a chave de uma conta.')
    const { data: conta } = await supabase.from('escola_contas').select('id').eq('id', contaId).eq('workspace_id', context.workspace.id).maybeSingle()
    if (!conta) throw new Error('Conta não encontrada.')
    const { error } = await supabase.rpc('remover_chave_de_integracao', { p_workspace_id: context.workspace.id, p_servico: servicoDaConta(contaId) })
    if (error) throw new Error('Não foi possível tirar a chave do cofre.')
    await createAdminClient().rpc('escola_marcar_chave', { p_conta_id: contaId, p_final: '' })
    await registrar(context.workspace.id, context.user.id, 'escola_chave_removida', contaId)
    revalidar()
    return { recado: 'Chave tirada do cofre. As transações já lidas continuam aqui.', ok: Date.now() }
  } catch (causa) {
    return { erro: mensagemDoErro(causa, 'Não foi possível tirar a chave.') }
  }
}

export async function excluirContaDaEscola(contaId: string): Promise<Estado> {
  try {
    const { context, supabase, nivel } = await contextoDaEscola()
    if (nivel < 3) throw new Error('Só um admin tira uma conta da escola.')
    const { error } = await supabase.rpc('escola_excluir_conta', { p_workspace_id: context.workspace.id, p_id: contaId })
    if (error) throw new Error(error.code === 'P0001' && error.message ? error.message : 'Não foi possível tirar a conta.')
    await registrar(context.workspace.id, context.user.id, 'escola_conta_excluida', contaId)
    revalidar()
    return { recado: 'Conta tirada da Redação. Na Únicopag nada mudou.', ok: Date.now() }
  } catch (causa) {
    return { erro: mensagemDoErro(causa, 'Não foi possível tirar a conta.') }
  }
}

/** "Atualizar agora": relê saldo e transações de todas as contas ativas. */
export async function sincronizarEscolaAgora(): Promise<Estado> {
  try {
    const { context, nivel } = await contextoDaEscola()
    if (nivel < 2) throw new Error('Sem acesso à Escola.')
    const r = await sincronizarEspaco(context.workspace.id)
    revalidar()
    if (!r.length) return { recado: 'Nenhuma conta ativa para atualizar.', ok: Date.now() }
    const falhas = r.filter((x) => !x.ok)
    if (falhas.length) return { erro: falhas.map((f) => `${f.conta}: ${f.mensagem}`).join(' '), ok: Date.now() }
    return { recado: r.length === 1 ? `Atualizado: ${r[0].mensagem}` : `${r.length} contas atualizadas.`, ok: Date.now() }
  } catch (causa) {
    return { erro: mensagemDoErro(causa, 'Não foi possível atualizar.') }
  }
}
