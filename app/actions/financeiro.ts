'use server'

import { createHash, randomUUID } from 'node:crypto'
import { revalidatePath } from 'next/cache'
import { cookies } from 'next/headers'
import { mensagemDoErro } from '@/lib/erro-de-acao'
import { createAdminClient } from '@/lib/supabase/admin'
import { COOKIE_DA_EMPRESA, contextoDoFinanceiro } from '@/lib/financeiro/acesso'
import { documentoValido } from '@/lib/patrimonio/doacoes'
import { dadosDoMes } from '@/lib/financeiro/fechamento-servidor'
import { notificar } from '@/lib/notificacoes/servidor'
import { hojeEmSaoPaulo } from '@/components/app/projetos/comum'
import { conteudoConfere } from '@/lib/rh/regras'
import {
  TAMANHO_MAXIMO, TIPOS_DE_ARQUIVO, ehArquivoAceito, ehNomeDoNivel, ehTipoDeAnexo, ehTipoDeConta, lerDocumento, lerLancamento, lerSaldo,
  lerValor, reais, ehData, type NomeDoNivel,
} from '@/lib/financeiro/regras'

/**
 * O Financeiro — escrita. Toda regra que importa (nível, aprovação, mês
 * fechado, cadastro de outro espaço) é conferida de novo pelo banco; aqui se
 * lê o formulário, se chama a função certa e se avisa quem precisa saber.
 */

type Resultado = { erro?: string }
const BUCKET = 'financeiro-anexos'

function erroDoBanco(error: { message?: string; code?: string } | null, padrao: string): never {
  if (error?.code === 'P0001' && error.message) throw new Error(error.message)
  if (error?.code === '23514') throw new Error('Algum campo está fora do permitido.')
  throw new Error(padrao)
}

function revalidar(id?: string) {
  revalidatePath('/financeiro', 'layout')
  if (id) revalidatePath(`/financeiro/${id}`)
}

/** Quem pode aprovar despesas: admins e quem tem nível aprovar ou gestão. */
async function aprovadores(workspaceId: string): Promise<string[]> {
  const admin = createAdminClient()
  const [{ data: admins }, { data: acessos }] = await Promise.all([
    admin.from('workspace_members').select('user_id').eq('workspace_id', workspaceId).eq('role', 'admin'),
    admin.from('fin_acesso').select('user_id').eq('workspace_id', workspaceId).in('nivel', ['aprovar', 'gestao']),
  ])
  return [...new Set([...(admins ?? []), ...(acessos ?? [])].map((x) => x.user_id as string))]
}

async function avisarAprovacao(workspaceId: string, atorId: string, id: string, descricao: string, valor: number) {
  await notificar(createAdminClient(), {
    workspaceId, para: await aprovadores(workspaceId), atorId, categoria: 'aprovacoes',
    titulo: 'Despesa esperando aprovação', mensagem: `${descricao} — ${reais(valor)}`, link: `/financeiro/${id}`,
    botao: 'Ver a despesa', nota: 'Quem lançou a despesa não pode aprová-la.',
  })
}

// ---------------------------------------------------------------- lançamentos

export async function criarLancamento(_anterior: Resultado & { id?: string }, formData: FormData): Promise<Resultado & { id?: string }> {
  try {
    const { context, supabase, nivel } = await contextoDoFinanceiro()
    if (nivel < 2) throw new Error('Você não tem acesso para lançar.')
    const { dados, ocorrencias, erros } = lerLancamento(formData, hojeEmSaoPaulo())
    if (!dados) throw new Error(erros.join(' '))
    const itens = ocorrencias.map((o) => ({ ...dados, ...o }))
    const { data, error } = await supabase.rpc('financeiro_criar_lancamentos', { p_workspace_id: context.workspace.id, p_itens: itens })
    if (error) erroDoBanco(error, 'Não foi possível salvar o lançamento.')
    const ids = (data ?? []) as string[]
    const { data: primeiro } = await supabase.from('fin_lancamentos').select('id,aprovacao').eq('id', ids[0]).single()
    if (primeiro?.aprovacao === 'pendente') await avisarAprovacao(context.workspace.id, context.user.id, ids[0], dados.descricao, dados.valor)
    revalidar()
    return { id: ids[0] }
  } catch (causa) {
    return { erro: mensagemDoErro(causa, 'Não foi possível salvar o lançamento.') }
  }
}

export async function atualizarLancamento(id: string, _anterior: Resultado & { id?: string }, formData: FormData): Promise<Resultado & { id?: string }> {
  try {
    const { context, supabase } = await contextoDoFinanceiro()
    const { data: antes } = await supabase.from('fin_lancamentos').select('tipo,aprovacao').eq('id', id).single()
    if (!antes) throw new Error('Lançamento não encontrado.')
    formData.set('tipo', antes.tipo as string)
    formData.set('repeticao', 'unica')
    formData.delete('pago')
    const { dados, erros } = lerLancamento(formData, hojeEmSaoPaulo())
    if (!dados) throw new Error(erros.join(' '))
    const escopo = formData.get('escopo') === 'futuros' ? 'futuros' : 'este'
    const { pago_em: _p, valor_pago: _v, ...campos } = dados
    const { error } = await supabase.rpc('financeiro_atualizar_lancamento', { p_id: id, p: campos, p_escopo: escopo })
    if (error) erroDoBanco(error, 'Não foi possível salvar.')
    const { data: depois } = await supabase.from('fin_lancamentos').select('aprovacao').eq('id', id).single()
    if (depois?.aprovacao === 'pendente' && antes.aprovacao !== 'pendente') await avisarAprovacao(context.workspace.id, context.user.id, id, dados.descricao, dados.valor)
    revalidar(id)
    return { id }
  } catch (causa) {
    return { erro: mensagemDoErro(causa, 'Não foi possível salvar.') }
  }
}

export async function pagarLancamento(id: string, p: { pago_em: string; valor_pago: string; conta_id: string; forma: string }): Promise<Resultado> {
  try {
    const { supabase } = await contextoDoFinanceiro()
    if (!ehData(p.pago_em)) throw new Error('Informe a data.')
    if (p.pago_em > hojeEmSaoPaulo()) throw new Error('A data não pode ser no futuro.')
    const valor = p.valor_pago.trim() ? lerValor(p.valor_pago) : null
    if (p.valor_pago.trim() && valor === null) throw new Error('Valor inválido.')
    const { error } = await supabase.rpc('financeiro_pagar', {
      p_id: id, p_pago_em: p.pago_em, p_valor_pago: valor, p_conta_id: /^[0-9a-f-]{36}$/.test(p.conta_id) ? p.conta_id : null, p_forma: p.forma || null,
    })
    if (error) erroDoBanco(error, 'Não foi possível registrar o pagamento.')
    revalidar(id)
    return {}
  } catch (causa) {
    return { erro: mensagemDoErro(causa, 'Não foi possível registrar o pagamento.') }
  }
}

export async function desfazerPagamento(id: string): Promise<Resultado> {
  try {
    const { supabase } = await contextoDoFinanceiro()
    const { error } = await supabase.rpc('financeiro_desfazer_pagamento', { p_id: id })
    if (error) erroDoBanco(error, 'Não foi possível desfazer.')
    revalidar(id)
    return {}
  } catch (causa) {
    return { erro: mensagemDoErro(causa, 'Não foi possível desfazer.') }
  }
}

export async function excluirLancamento(id: string, escopo: 'este' | 'futuros'): Promise<Resultado> {
  try {
    const { supabase } = await contextoDoFinanceiro()
    const { data, error } = await supabase.rpc('financeiro_excluir_lancamento', { p_id: id, p_escopo: escopo === 'futuros' ? 'futuros' : 'este' })
    if (error) erroDoBanco(error, 'Não foi possível excluir.')
    const caminhos = (data ?? []) as string[]
    if (caminhos.length) await createAdminClient().storage.from(BUCKET).remove(caminhos).catch(() => undefined)
    revalidar()
    return {}
  } catch (causa) {
    return { erro: mensagemDoErro(causa, 'Não foi possível excluir.') }
  }
}

export async function decidirAprovacao(id: string, aprovar: boolean, motivo: string): Promise<Resultado> {
  try {
    const { context, supabase } = await contextoDoFinanceiro()
    const { error } = await supabase.rpc('financeiro_decidir', { p_id: id, p_aprovar: aprovar, p_motivo: motivo.trim().slice(0, 600) || null })
    if (error) erroDoBanco(error, 'Não foi possível registrar a decisão.')
    const { data: l } = await supabase.from('fin_lancamentos').select('descricao,valor,criado_por').eq('id', id).single()
    if (l?.criado_por) {
      await notificar(createAdminClient(), {
        workspaceId: context.workspace.id, para: [l.criado_por as string], atorId: context.user.id, categoria: 'aprovacoes',
        titulo: aprovar ? 'Despesa aprovada' : 'Despesa recusada', mensagem: `${l.descricao} — ${reais(Number(l.valor))}`,
        link: `/financeiro/${id}`, citacao: aprovar ? null : motivo.trim(), botao: 'Ver a despesa',
      })
    }
    revalidar(id)
    return {}
  } catch (causa) {
    return { erro: mensagemDoErro(causa, 'Não foi possível registrar a decisão.') }
  }
}

// ---------------------------------------------------------------- cadastros

type Tabela = 'conta' | 'fonte' | 'categoria' | 'favorecido'

function lerCadastro(tabela: Tabela, f: FormData): Record<string, unknown> {
  const t = (k: string, max = 200) => String(f.get(k) ?? '').trim().slice(0, max)
  const nome = t('nome', 160)
  if (nome.length < 2) throw new Error('Informe o nome.')
  if (tabela === 'conta') {
    const tipo = t('tipo')
    if (!ehTipoDeConta(tipo)) throw new Error('Escolha o tipo da conta.')
    const saldo = lerSaldo(t('saldo_inicial'))
    if (saldo === null) throw new Error('Saldo inicial inválido.')
    const em = t('saldo_inicial_em')
    if (!ehData(em)) throw new Error('Informe a data do saldo inicial.')
    return { nome, tipo, banco: t('banco', 80), agencia: t('agencia', 20), numero: t('numero', 30), fonte_id: t('fonte_id'), saldo_inicial: saldo, saldo_inicial_em: em, ativa: f.get('ativa') !== 'nao' }
  }
  if (tabela === 'fonte') {
    const previsto = t('valor_previsto')
    const valor = previsto ? lerValor(previsto) : null
    if (previsto && valor === null) throw new Error('Valor previsto inválido.')
    const inicio = t('inicio'); const fim = t('fim')
    if ((inicio && !ehData(inicio)) || (fim && !ehData(fim))) throw new Error('Data inválida.')
    if (inicio && fim && fim < inicio) throw new Error('O fim da vigência vem antes do início.')
    return { nome, restrita: f.get('restrita') === 'sim', projeto_id: t('projeto_id'), financiador: t('financiador', 160), descricao: t('descricao', 2000), inicio, fim, valor_previsto: valor ?? '', ativa: f.get('ativa') !== 'nao' }
  }
  if (tabela === 'categoria') {
    const tipo = t('tipo')
    if (tipo !== 'despesa' && tipo !== 'receita') throw new Error('Escolha se é categoria de despesa ou de receita.')
    return { nome, tipo, grupo: t('grupo', 60), codigo_contabil: t('codigo_contabil', 40), fixa: f.get('fixa') === 'sim', ativa: f.get('ativa') !== 'nao' }
  }
  const { documento, valido } = lerDocumento(t('documento', 30))
  if (!valido) throw new Error('CPF tem 11 dígitos; CNPJ, 14.')
  const email = t('email', 200)
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error('E-mail inválido.')
  return {
    nome, tipo_pessoa: documento?.length === 11 ? 'pf' : f.get('tipo_pessoa') === 'pf' ? 'pf' : 'pj', documento: documento ?? '',
    chave_pix: t('chave_pix', 140), email, telefone: t('telefone', 30), observacao: t('observacao', 1000),
  }
}

export async function salvarCadastro(tabela: Tabela, id: string | null, _anterior: Resultado & { ok?: number; id?: string }, formData: FormData): Promise<Resultado & { ok?: number; id?: string }> {
  try {
    const { context, supabase, empresa } = await contextoDoFinanceiro()
    // Conta e fonte nascem na empresa aberta (a de uma conta existente não muda).
    const p = { ...lerCadastro(tabela, formData), ...(id ? { id } : {}), ...((tabela === 'conta' || tabela === 'fonte') && empresa ? { entidade_id: empresa.id } : {}) }
    const { data, error } = await supabase.rpc('financeiro_salvar_cadastro', { p_workspace_id: context.workspace.id, p_tabela: tabela, p })
    if (error) erroDoBanco(error, 'Não foi possível salvar.')
    revalidar()
    return { ok: Date.now(), id: data as string }
  } catch (causa) {
    return { erro: mensagemDoErro(causa, 'Não foi possível salvar.') }
  }
}

export async function salvarRegras(_anterior: Resultado & { ok?: number }, formData: FormData): Promise<Resultado & { ok?: number }> {
  try {
    const { context, supabase } = await contextoDoFinanceiro()
    const ativa = formData.get('aprovacao_ativa') === 'sim'
    const acimaTexto = String(formData.get('aprovacao_acima') ?? '').trim()
    const acima = acimaTexto ? lerValor(acimaTexto) : null
    if (acimaTexto && acima === null) throw new Error('Valor inválido.')
    if (ativa && acima === null) throw new Error('Informe a partir de que valor a despesa pede aprovação.')
    const reserva = Number(String(formData.get('reserva_minima_meses') ?? '3').replace(',', '.'))
    if (!Number.isFinite(reserva) || reserva < 0 || reserva > 36) throw new Error('A reserva mínima vai de 0 a 36 meses.')
    const { error } = await supabase.rpc('financeiro_salvar_config', {
      p_workspace_id: context.workspace.id, p_aprovacao_ativa: ativa, p_aprovacao_acima: acima, p_reserva_minima_meses: reserva,
    })
    if (error) erroDoBanco(error, 'Não foi possível salvar.')
    revalidar()
    return { ok: Date.now() }
  } catch (causa) {
    return { erro: mensagemDoErro(causa, 'Não foi possível salvar.') }
  }
}

export async function definirAcessoDoFinanceiro(userId: string, nivel: NomeDoNivel | null): Promise<Resultado> {
  try {
    const { context, supabase } = await contextoDoFinanceiro()
    if (nivel !== null && !ehNomeDoNivel(nivel)) throw new Error('Nível inválido.')
    const { error } = await supabase.rpc('definir_acesso_financeiro', { p_workspace_id: context.workspace.id, p_user_id: userId, p_nivel: nivel })
    if (error) erroDoBanco(error, 'Não foi possível mudar o acesso.')
    revalidar()
    return {}
  } catch (causa) {
    return { erro: mensagemDoErro(causa, 'Não foi possível mudar o acesso.') }
  }
}

// ---------------------------------------------------------------- anexos

/** Primeiro passo: link de envio de uso único, direto do navegador ao Storage. */
export async function prepararAnexo(lancamentoId: string, tipo: string, tamanho: number): Promise<Resultado & { caminho?: string; token?: string }> {
  try {
    const { context, supabase, nivel } = await contextoDoFinanceiro()
    if (nivel < 2) throw new Error('Você não tem acesso para juntar comprovantes.')
    if (!ehArquivoAceito(tipo)) throw new Error('Envie PDF, JPG, PNG ou WEBP.')
    if (!Number.isFinite(tamanho) || tamanho <= 0 || tamanho > TAMANHO_MAXIMO) throw new Error('O arquivo pode ter até 20 MB.')
    const { data: l } = await supabase.from('fin_lancamentos').select('id').eq('id', lancamentoId).eq('workspace_id', context.workspace.id).maybeSingle()
    if (!l) throw new Error('Lançamento não encontrado.')
    const caminho = `${context.workspace.id}/${lancamentoId}/${randomUUID()}.${TIPOS_DE_ARQUIVO[tipo]}`
    const { data, error } = await createAdminClient().storage.from(BUCKET).createSignedUploadUrl(caminho)
    if (error || !data) throw new Error('Não foi possível preparar o envio.')
    return { caminho, token: data.token }
  } catch (causa) {
    return { erro: mensagemDoErro(causa, 'Não foi possível preparar o envio.') }
  }
}

/** Segundo passo: o banco confere caminho e nível; aqui se confere o conteúdo e grava a impressão digital. */
export async function registrarAnexo(lancamentoId: string, caminho: string, p: { nome: string; tipo_doc: string; mime: string; tamanho: number }): Promise<Resultado> {
  const admin = createAdminClient()
  try {
    const { supabase } = await contextoDoFinanceiro()
    if (!ehTipoDeAnexo(p.tipo_doc)) throw new Error('Diga o que é o arquivo.')
    const { data: id, error } = await supabase.rpc('registrar_anexo_financeiro', {
      p_lancamento_id: lancamentoId, p_caminho: caminho, p: { nome_original: p.nome.slice(0, 200), tipo_doc: p.tipo_doc, mime: p.mime, tamanho: p.tamanho },
    })
    if (error) erroDoBanco(error, 'Não foi possível registrar o arquivo.')
    const { data: blob, error: e2 } = await admin.storage.from(BUCKET).download(caminho)
    const bytes = blob ? new Uint8Array(await blob.arrayBuffer()) : null
    if (e2 || !bytes || !conteudoConfere(p.mime, bytes)) {
      const { data: removido } = await supabase.rpc('excluir_anexo_financeiro', { p_id: id })
      await admin.storage.from(BUCKET).remove([String(removido ?? caminho)]).catch(() => undefined)
      throw new Error('O conteúdo do arquivo não confere com o tipo (PDF, JPG, PNG ou WEBP). Envie o arquivo original.')
    }
    await admin.rpc('selar_anexo_financeiro', { p_id: id, p_sha256: createHash('sha256').update(bytes).digest('hex') })
    revalidar(lancamentoId)
    return {}
  } catch (causa) {
    return { erro: mensagemDoErro(causa, 'Não foi possível registrar o arquivo.') }
  }
}

export async function excluirAnexo(lancamentoId: string, id: string): Promise<Resultado> {
  try {
    const { supabase } = await contextoDoFinanceiro()
    const { data: caminho, error } = await supabase.rpc('excluir_anexo_financeiro', { p_id: id })
    if (error) erroDoBanco(error, 'Não foi possível excluir.')
    if (caminho) await createAdminClient().storage.from(BUCKET).remove([String(caminho)]).catch(() => undefined)
    revalidar(lancamentoId)
    return {}
  } catch (causa) {
    return { erro: mensagemDoErro(causa, 'Não foi possível excluir.') }
  }
}


// ---------------------------------------------------------------- extrato e conciliação

type LinhaRecebida = { identificador: string; data: string; valor: number; descricao: string; documento: string | null }

/**
 * O arquivo é lido no navegador (lib/financeiro/extrato, o mesmo código) e
 * chegam só as linhas. Aqui se confere de novo o formato de cada uma: o que
 * vem do navegador não é confiável.
 */
export async function importarExtrato(contaId: string, meta: { arquivo: string; formato: 'ofx' | 'csv'; saldo: number | null; saldoEm: string | null }, linhas: LinhaRecebida[]): Promise<Resultado & { novas?: number; linhas?: number }> {
  try {
    const { context, supabase } = await contextoDoFinanceiro()
    if (!Array.isArray(linhas) || !linhas.length) throw new Error('O arquivo não tem movimentos.')
    if (linhas.length > 3000) throw new Error('São mais de 3.000 movimentos: importe um período menor.')
    const limpas = linhas.map((l) => {
      if (!ehData(l.data) || typeof l.valor !== 'number' || !Number.isFinite(l.valor) || l.valor === 0 || Math.abs(l.valor) > 100_000_000) throw new Error('O arquivo tem um movimento inválido.')
      return {
        identificador: String(l.identificador ?? '').slice(0, 300), data: l.data, valor: Math.round(l.valor * 100) / 100,
        descricao: String(l.descricao ?? '').slice(0, 300), documento: l.documento ? String(l.documento).slice(0, 80) : null,
      }
    })
    if (limpas.some((l) => !l.identificador)) throw new Error('O arquivo tem um movimento sem identificador.')
    const saldoValido = typeof meta.saldo === 'number' && Number.isFinite(meta.saldo) && ehData(meta.saldoEm ?? '')
    const { data, error } = await supabase.rpc('financeiro_importar_extrato', {
      p_workspace_id: context.workspace.id, p_conta_id: contaId,
      p_meta: { arquivo: String(meta.arquivo ?? '').slice(0, 200), formato: meta.formato === 'ofx' ? 'ofx' : 'csv', saldo_banco: saldoValido ? meta.saldo : null, saldo_em: saldoValido ? meta.saldoEm : null },
      p_linhas: limpas,
    })
    if (error) erroDoBanco(error, 'Não foi possível importar o extrato.')
    revalidar()
    const r = data as { novas: number; linhas: number }
    return { novas: r.novas, linhas: r.linhas }
  } catch (causa) {
    return { erro: mensagemDoErro(causa, 'Não foi possível importar o extrato.') }
  }
}

export async function conciliar(extratoId: string, lancamentoId: string): Promise<Resultado> {
  try {
    const { supabase } = await contextoDoFinanceiro()
    const { error } = await supabase.rpc('financeiro_conciliar', { p_extrato_id: extratoId, p_lancamento_id: lancamentoId })
    if (error) erroDoBanco(error, 'Não foi possível conciliar.')
    revalidar()
    return {}
  } catch (causa) {
    return { erro: mensagemDoErro(causa, 'Não foi possível conciliar.') }
  }
}

/** Aceita as sugestões de uma vez. Para na primeira que o banco recusar e diz quantas foram. */
export async function conciliarSugestoes(pares: { extrato: string; lancamento: string }[]): Promise<Resultado & { feitas?: number }> {
  let feitas = 0
  try {
    const { supabase } = await contextoDoFinanceiro()
    for (const p of pares.slice(0, 500)) {
      const { error } = await supabase.rpc('financeiro_conciliar', { p_extrato_id: p.extrato, p_lancamento_id: p.lancamento })
      if (error) erroDoBanco(error, 'Não foi possível conciliar.')
      feitas++
    }
    revalidar()
    return { feitas }
  } catch (causa) {
    revalidar()
    return { feitas, erro: `${feitas ? `${feitas} conciliadas; ` : ''}${mensagemDoErro(causa, 'Não foi possível conciliar.')}` }
  }
}

export async function criarDoExtrato(extratoId: string, p: { descricao: string; categoria_id: string; fonte_id: string; favorecido_id: string; projeto_id: string }): Promise<Resultado> {
  try {
    const { supabase } = await contextoDoFinanceiro()
    const uuid = (v: string) => (/^[0-9a-f-]{36}$/.test(v) ? v : '')
    if (!uuid(p.categoria_id)) throw new Error('Escolha a categoria.')
    if (!uuid(p.fonte_id)) throw new Error('Escolha a fonte.')
    const { error } = await supabase.rpc('financeiro_criar_do_extrato', {
      p_extrato_id: extratoId,
      p: { descricao: p.descricao.trim().slice(0, 190), categoria_id: p.categoria_id, fonte_id: p.fonte_id, favorecido_id: uuid(p.favorecido_id), projeto_id: uuid(p.projeto_id) },
    })
    if (error) erroDoBanco(error, 'Não foi possível criar o lançamento.')
    revalidar()
    return {}
  } catch (causa) {
    return { erro: mensagemDoErro(causa, 'Não foi possível criar o lançamento.') }
  }
}

export async function desconciliar(extratoId: string): Promise<Resultado> {
  try {
    const { supabase } = await contextoDoFinanceiro()
    const { error } = await supabase.rpc('financeiro_desconciliar', { p_extrato_id: extratoId })
    if (error) erroDoBanco(error, 'Não foi possível desfazer.')
    revalidar()
    return {}
  } catch (causa) {
    return { erro: mensagemDoErro(causa, 'Não foi possível desfazer.') }
  }
}

export async function ignorarLinha(extratoId: string, motivo: string): Promise<Resultado> {
  try {
    const { supabase } = await contextoDoFinanceiro()
    const { error } = await supabase.rpc('financeiro_ignorar_extrato', { p_extrato_id: extratoId, p_motivo: motivo.trim().slice(0, 300) })
    if (error) erroDoBanco(error, 'Não foi possível ignorar.')
    revalidar()
    return {}
  } catch (causa) {
    return { erro: mensagemDoErro(causa, 'Não foi possível ignorar.') }
  }
}

export async function excluirImportacao(importacaoId: string): Promise<Resultado> {
  try {
    const { supabase } = await contextoDoFinanceiro()
    const { error } = await supabase.rpc('financeiro_excluir_importacao', { p_importacao_id: importacaoId })
    if (error) erroDoBanco(error, 'Não foi possível excluir.')
    revalidar()
    return {}
  } catch (causa) {
    return { erro: mensagemDoErro(causa, 'Não foi possível excluir.') }
  }
}

// ---------------------------------------------------------------- fechamento do mês

/**
 * Fecha o mês. O resumo e os avisos são recalculados aqui, no servidor — o
 * que a tela mostrou não entra no retrato. Aviso não impede; exige
 * observação (o banco confere de novo).
 */
export async function fecharMes(mes: string, observacao: string): Promise<Resultado> {
  try {
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(mes)) throw new Error('Mês inválido.')
    const d = await dadosDoMes(mes)
    if (d.nivel < 4) throw new Error('Só a gestão do Financeiro fecha o mês.')
    const bloqueio = d.itens.find((i) => i.bloqueia && !i.ok)
    if (bloqueio) throw new Error(`${bloqueio.rotulo}: ${bloqueio.detalhe ?? 'pendente'}`)
    const avisos = d.itens.filter((i) => !i.ok).map((i) => ({ id: i.id, rotulo: i.rotulo, detalhe: i.detalhe }))
    const { error } = await d.supabase.rpc('financeiro_fechar_mes', {
      p_workspace_id: d.context.workspace.id, p_mes: `${mes}-01`, p_entidade_id: d.empresa?.id ?? null,
      // O retrato guarda os totais do patrimônio; a lista bem a bem fica no pacote do contador.
      p_resumo: { ...d.resumo, patrimonio: d.resumo.patrimonio ? { ...d.resumo.patrimonio, linhas: undefined } : undefined, estoque: d.resumo.estoque ? { ...d.resumo.estoque, linhas: undefined } : undefined }, p_avisos: avisos, p_observacao: observacao.trim().slice(0, 2000) || null,
    })
    if (error) erroDoBanco(error, 'Não foi possível fechar o mês.')
    revalidar()
    return {}
  } catch (causa) {
    return { erro: mensagemDoErro(causa, 'Não foi possível fechar o mês.') }
  }
}

export async function reabrirMes(motivo: string): Promise<Resultado> {
  try {
    const { context, supabase, empresa } = await contextoDoFinanceiro()
    const { data: mes, error } = await supabase.rpc('financeiro_reabrir_mes', { p_workspace_id: context.workspace.id, p_motivo: motivo.trim().slice(0, 1000), p_entidade_id: empresa?.id ?? null })
    if (error) erroDoBanco(error, 'Não foi possível reabrir.')
    // Reabrir mês fechado é exceção: os administradores ficam sabendo.
    const { data: admins } = await createAdminClient().from('workspace_members').select('user_id').eq('workspace_id', context.workspace.id).eq('role', 'admin')
    const rotulo = typeof mes === 'string' ? `${mes.slice(5, 7)}/${mes.slice(0, 4)}` : 'o último mês'
    await notificar(createAdminClient(), {
      workspaceId: context.workspace.id, para: (admins ?? []).map((a) => a.user_id as string), atorId: context.user.id, categoria: 'financeiro',
      titulo: `Mês ${rotulo} reaberto no Financeiro`, mensagem: motivo.trim().slice(0, 200), link: '/financeiro/fechamento', citacao: motivo.trim(),
    })
    revalidar()
    return {}
  } catch (causa) {
    return { erro: mensagemDoErro(causa, 'Não foi possível reabrir.') }
  }
}

export async function salvarValorHora(valor: string): Promise<Resultado> {
  try {
    const { context, supabase } = await contextoDoFinanceiro()
    const v = valor.trim() ? lerValor(valor) : null
    if (valor.trim() && v === null) throw new Error('Valor inválido.')
    const { error } = await supabase.rpc('financeiro_salvar_valor_hora', { p_workspace_id: context.workspace.id, p_valor: v })
    if (error) erroDoBanco(error, 'Não foi possível salvar.')
    revalidar()
    return {}
  } catch (causa) {
    return { erro: mensagemDoErro(causa, 'Não foi possível salvar.') }
  }
}

// ---------------------------------------------------------------- orçamento

export async function salvarOrcamento(ano: number, itens: { categoria_id: string; valor: string }[]): Promise<Resultado & { ok?: number }> {
  try {
    const { context, supabase, empresa } = await contextoDoFinanceiro()
    if (!Number.isInteger(ano) || ano < 2020 || ano > 2100) throw new Error('Ano inválido.')
    const limpos = itens.slice(0, 500).map((i) => {
      const texto = i.valor.trim()
      const valor = texto ? lerValor(texto) : null
      if (texto && valor === null) throw new Error(`Valor inválido: "${texto}".`)
      return { categoria_id: i.categoria_id, valor_mensal: valor ?? '' }
    })
    const { error } = await supabase.rpc('financeiro_salvar_orcamento', { p_workspace_id: context.workspace.id, p_ano: ano, p_itens: limpos, p_entidade_id: empresa?.id ?? null })
    if (error) erroDoBanco(error, 'Não foi possível salvar o orçamento.')
    revalidar()
    return { ok: Date.now() }
  } catch (causa) {
    return { erro: mensagemDoErro(causa, 'Não foi possível salvar o orçamento.') }
  }
}

// ---------------------------------------------------------------- empresas

/** Abre o Financeiro de outra empresa (a filial ou a Escola). */
export async function escolherEmpresa(id: string): Promise<Resultado> {
  try {
    const { empresas } = await contextoDoFinanceiro()
    if (!empresas.some((e) => e.id === id)) throw new Error('Empresa não encontrada.')
    ;(await cookies()).set(COOKIE_DA_EMPRESA, id, { path: '/', httpOnly: true, sameSite: 'lax', secure: true, maxAge: 60 * 60 * 24 * 365 })
    revalidar()
    return {}
  } catch (causa) {
    return { erro: mensagemDoErro(causa, 'Não foi possível trocar de empresa.') }
  }
}

/** Nome, razão social e CNPJ de uma empresa (gestão do Financeiro). */
export async function salvarEmpresa(id: string, _anterior: Resultado & { ok?: number }, formData: FormData): Promise<Resultado & { ok?: number }> {
  try {
    const { context, supabase, nivel } = await contextoDoFinanceiro()
    if (nivel < 4) throw new Error('Só a gestão do Financeiro muda os dados da empresa.')
    const t = (k: string, max: number) => String(formData.get(k) ?? '').trim().slice(0, max)
    const cnpj = t('cnpj', 20).replace(/\D/g, '')
    if (cnpj && (cnpj.length !== 14 || !documentoValido(cnpj))) throw new Error('CNPJ inválido: confira os dígitos.')
    const { error } = await supabase.rpc('financeiro_salvar_entidade', { p_workspace_id: context.workspace.id, p_id: id, p: { nome: t('nome', 80), razao_social: t('razao_social', 200), cnpj } })
    if (error) erroDoBanco(error, 'Não foi possível salvar a empresa.')
    revalidar()
    return { ok: Date.now() }
  } catch (causa) {
    return { erro: mensagemDoErro(causa, 'Não foi possível salvar a empresa.') }
  }
}
