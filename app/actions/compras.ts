'use server'

import { randomUUID } from 'node:crypto'
import { after } from 'next/server'
import { revalidatePath } from 'next/cache'
import { mensagemDoErro } from '@/lib/erro-de-acao'
import { createAdminClient } from '@/lib/supabase/admin'
import { notificar } from '@/lib/notificacoes/servidor'
import { conteudoConfere } from '@/lib/rh/regras'
import { TAMANHO_MAXIMO, TIPOS_DE_ARQUIVO, ehArquivoAceito, reais } from '@/lib/financeiro/regras'
import { lerValor, numeroDoPedido } from '@/lib/compras/regras'
import { contextoDeCompras, pessoasDaDiretoria, pessoasDoFinanceiro } from '@/lib/compras/servidor'
import { dadosDaOrdem } from '@/lib/compras/ordem'
import { ordemDeCompra } from '@/lib/compras/ordem-pdf'
import { enviarPelaCaixa } from '@/lib/correio/enviar'
import { nivelNaEmpresa } from '@/lib/financeiro/acesso'
import { quemOperaOPatrimonio } from '@/lib/patrimonio/destinatarios'

/**
 * Compras — escrita. Toda regra que importa (quem pode, faixas, justificativa,
 * quem aprova) mora nas funções compras_* do banco; aqui se prepara o que
 * chega da tela, traduz o erro e avisa quem precisa agir.
 */

type Resultado<T = unknown> = { erro?: string } & T
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const BUCKET = 'compras-arquivos'

function erroDoBanco(error: { message?: string; code?: string } | null, padrao: string): never {
  if (error?.code === 'P0001' && error.message) throw new Error(error.message)
  if (error?.code === '23514') throw new Error('Algum campo está fora do permitido.')
  if (error?.code === '22P02' || error?.code === '22007' || error?.code === '22008') throw new Error('Algum valor ou data está num formato inválido.')
  throw new Error(padrao)
}

const revalidar = (id?: string) => {
  revalidatePath('/financeiro/compras')
  if (id) revalidatePath(`/financeiro/compras/${id}`)
}

async function dadosDoAviso(pedidoId: string) {
  const admin = createAdminClient()
  const { data: p } = await admin.from('compras_pedidos')
    .select('id,workspace_id,entidade_id,ano,numero,titulo,solicitante_id,enviado_aprovacao_por,valor_aprovado,exige_diretoria,estado,motivo_encerramento')
    .eq('id', pedidoId).maybeSingle()
  return { admin, p }
}

// ---------------------------------------------------------------- pedido

export type ItemNoFormulario = { id?: string | null; descricao: string; especificacao?: string; quantidade: string | number; unidade?: string; valor_estimado_unit?: string | number | null }
export type PedidoNoFormulario = {
  entidade_id?: string | null; titulo: string; justificativa: string; setor_id?: string | null; projeto_id?: string | null; necessario_ate?: string | null; local_entrega?: string
  categoria_id?: string | null; fonte_id?: string | null; itens: ItemNoFormulario[]
}

export async function salvarPedido(id: string | null, dados: PedidoNoFormulario): Promise<Resultado<{ id?: string }>> {
  try {
    if (id && !UUID.test(id)) throw new Error('Pedido inválido.')
    const { context, supabase } = await contextoDeCompras()
    const itens = (dados.itens ?? []).map((i, n) => {
      const quantidade = lerValor(i.quantidade)
      const estimado = i.valor_estimado_unit === null || i.valor_estimado_unit === undefined || i.valor_estimado_unit === '' ? null : lerValor(i.valor_estimado_unit)
      if (quantidade === null || quantidade <= 0) throw new Error(`Item ${n + 1}: informe a quantidade.`)
      if (estimado !== null && estimado < 0) throw new Error(`Item ${n + 1}: valor inválido.`)
      return { id: i.id && UUID.test(i.id) ? i.id : null, descricao: String(i.descricao ?? '').trim(), especificacao: String(i.especificacao ?? '').trim(), quantidade, unidade: String(i.unidade ?? '').trim(), valor_estimado_unit: estimado }
    })
    const { data, error } = await supabase.rpc('compras_salvar_pedido', {
      p_workspace_id: context.workspace.id, p_id: id,
      p: {
        entidade_id: !id && dados.entidade_id && UUID.test(dados.entidade_id) ? dados.entidade_id : null,
        titulo: String(dados.titulo ?? '').trim(), justificativa: String(dados.justificativa ?? '').trim(),
        setor_id: dados.setor_id || null, projeto_id: dados.projeto_id || null, necessario_ate: dados.necessario_ate || null,
        local_entrega: String(dados.local_entrega ?? '').trim(), categoria_id: dados.categoria_id || null, fonte_id: dados.fonte_id || null, itens,
      },
    })
    if (error || !data) erroDoBanco(error, 'Não foi possível salvar o pedido.')
    const novo = data as string
    if (!id) {
      // Quem cota (nível "lançar" no Financeiro) fica sabendo do pedido novo.
      after(async () => {
        const { admin, p } = await dadosDoAviso(novo)
        if (!p) return
        const para = (await pessoasDoFinanceiro(admin, p.workspace_id, p.entidade_id, 2)).filter((u) => u !== context.user.id)
        await notificar(admin, {
          workspaceId: p.workspace_id, para, atorId: context.user.id, categoria: 'financeiro',
          titulo: `Pedido de compra ${numeroDoPedido(p.ano, p.numero)}: ${p.titulo}`, mensagem: 'Um pedido novo espera cotação.',
          link: `/financeiro/compras/${novo}`, botao: 'Abrir o pedido',
        })
      })
    }
    revalidar(novo)
    return { id: novo }
  } catch (causa) {
    return { erro: mensagemDoErro(causa, 'Não foi possível salvar o pedido.') }
  }
}

export async function cancelarPedido(id: string, motivo: string): Promise<Resultado> {
  try {
    if (!UUID.test(id)) throw new Error('Pedido inválido.')
    const { context, supabase } = await contextoDeCompras()
    const { error } = await supabase.rpc('compras_cancelar', { p_pedido_id: id, p_motivo: String(motivo ?? '').slice(0, 1000) })
    if (error) erroDoBanco(error, 'Não foi possível cancelar.')
    after(async () => {
      const { admin, p } = await dadosDoAviso(id)
      if (!p || !p.solicitante_id || p.solicitante_id === context.user.id) return
      await notificar(admin, {
        workspaceId: p.workspace_id, para: [p.solicitante_id], atorId: context.user.id, categoria: 'financeiro',
        titulo: `Pedido ${numeroDoPedido(p.ano, p.numero)} cancelado`, mensagem: `${p.titulo}. Motivo: ${p.motivo_encerramento ?? ''}`,
        link: `/financeiro/compras/${id}`, botao: 'Ver o pedido',
      })
    })
    revalidar(id)
    return {}
  } catch (causa) {
    return { erro: mensagemDoErro(causa, 'Não foi possível cancelar.') }
  }
}

// ---------------------------------------------------------------- propostas

export type PropostaNoFormulario = {
  favorecido_id: string; recebida_em?: string; validade?: string; prazo_entrega?: string; condicao_pagamento?: string; frete?: string; observacao?: string
  precos: { item_id: string; valor_unitario: string }[]
}

export async function salvarProposta(pedidoId: string, id: string | null, dados: PropostaNoFormulario): Promise<Resultado<{ id?: string }>> {
  try {
    if (!UUID.test(pedidoId) || (id && !UUID.test(id))) throw new Error('Proposta inválida.')
    const { supabase } = await contextoDeCompras()
    const frete = dados.frete ? lerValor(dados.frete) : 0
    if (frete === null || frete < 0) throw new Error('Frete inválido.')
    const precos = (dados.precos ?? []).filter((p) => UUID.test(p.item_id)).map((p) => {
      const v = String(p.valor_unitario ?? '').trim() ? lerValor(p.valor_unitario) : null
      if (String(p.valor_unitario ?? '').trim() && (v === null || v < 0)) throw new Error('Algum preço está num formato inválido.')
      return { item_id: p.item_id, valor_unitario: v }
    })
    const { data, error } = await supabase.rpc('compras_salvar_proposta', {
      p_pedido_id: pedidoId, p_id: id,
      p: {
        favorecido_id: dados.favorecido_id || null, recebida_em: dados.recebida_em || null, validade: dados.validade || null,
        prazo_entrega: dados.prazo_entrega ?? '', condicao_pagamento: dados.condicao_pagamento ?? '', frete, observacao: dados.observacao ?? '', precos,
      },
    })
    if (error || !data) erroDoBanco(error, 'Não foi possível salvar a proposta.')
    revalidar(pedidoId)
    return { id: data as string }
  } catch (causa) {
    return { erro: mensagemDoErro(causa, 'Não foi possível salvar a proposta.') }
  }
}

export async function excluirProposta(pedidoId: string, id: string): Promise<Resultado> {
  try {
    if (!UUID.test(id)) throw new Error('Proposta inválida.')
    const { supabase } = await contextoDeCompras()
    const { data: caminho, error } = await supabase.rpc('compras_excluir_proposta', { p_id: id })
    if (error) erroDoBanco(error, 'Não foi possível excluir a proposta.')
    if (caminho) await createAdminClient().storage.from(BUCKET).remove([String(caminho)]).catch(() => undefined)
    revalidar(pedidoId)
    return {}
  } catch (causa) {
    return { erro: mensagemDoErro(causa, 'Não foi possível excluir a proposta.') }
  }
}

/** Primeiro passo do PDF da proposta: link de envio de uso único, direto do navegador ao Storage. */
export async function prepararArquivoDaProposta(propostaId: string, tipo: string, tamanho: number): Promise<Resultado<{ caminho?: string; token?: string }>> {
  try {
    if (!UUID.test(propostaId)) throw new Error('Proposta inválida.')
    if (!ehArquivoAceito(tipo)) throw new Error('Envie PDF, JPG, PNG ou WEBP.')
    if (!Number.isFinite(tamanho) || tamanho <= 0 || tamanho > TAMANHO_MAXIMO) throw new Error('O arquivo pode ter até 20 MB.')
    const { context, supabase, empresas } = await contextoDeCompras()
    // O RLS só mostra a proposta a quem vê o pedido; lançar é conferido no registro.
    const { data: pr } = await supabase.from('compras_propostas').select('id,pedido_id').eq('id', propostaId).eq('workspace_id', context.workspace.id).maybeSingle()
    if (!pr || !empresas.length) throw new Error('Proposta não encontrada.')
    const caminho = `${context.workspace.id}/${pr.pedido_id}/${randomUUID()}.${TIPOS_DE_ARQUIVO[tipo]}`
    const { data, error } = await createAdminClient().storage.from(BUCKET).createSignedUploadUrl(caminho)
    if (error || !data) throw new Error('Não foi possível preparar o envio.')
    return { caminho, token: data.token }
  } catch (causa) {
    return { erro: mensagemDoErro(causa, 'Não foi possível preparar o envio.') }
  }
}

/** Segundo passo: o banco confere caminho e nível; aqui se confere se o conteúdo é mesmo PDF/imagem. */
export async function registrarArquivoDaProposta(pedidoId: string, propostaId: string, caminho: string, p: { nome: string; mime: string; tamanho: number }): Promise<Resultado> {
  const admin = createAdminClient()
  try {
    if (!UUID.test(propostaId) || !UUID.test(pedidoId)) throw new Error('Proposta inválida.')
    const { supabase } = await contextoDeCompras()
    const { data: blob, error: e1 } = await admin.storage.from(BUCKET).download(caminho)
    const bytes = blob ? new Uint8Array(await blob.arrayBuffer()) : null
    if (e1 || !bytes || !conteudoConfere(p.mime, bytes)) {
      await admin.storage.from(BUCKET).remove([caminho]).catch(() => undefined)
      throw new Error('O conteúdo do arquivo não confere com o tipo (PDF, JPG, PNG ou WEBP). Envie o arquivo original.')
    }
    const { data: anterior, error } = await supabase.rpc('compras_anexar_proposta', {
      p_id: propostaId, p_caminho: caminho, p: { nome: String(p.nome ?? '').slice(0, 200), mime: p.mime, tamanho: p.tamanho },
    })
    if (error) {
      await admin.storage.from(BUCKET).remove([caminho]).catch(() => undefined)
      erroDoBanco(error, 'Não foi possível registrar o arquivo.')
    }
    if (anterior) await admin.storage.from(BUCKET).remove([String(anterior)]).catch(() => undefined)
    revalidar(pedidoId)
    return {}
  } catch (causa) {
    return { erro: mensagemDoErro(causa, 'Não foi possível registrar o arquivo.') }
  }
}

// ---------------------------------------------------------------- aprovação

export async function enviarParaAprovacao(pedidoId: string, propostaId: string, justificativa: string): Promise<Resultado> {
  try {
    if (!UUID.test(pedidoId) || !UUID.test(propostaId)) throw new Error('Escolha a proposta vencedora.')
    const { context, supabase, diretoriaSetorId } = await contextoDeCompras()
    const { error } = await supabase.rpc('compras_enviar_para_aprovacao', { p_pedido_id: pedidoId, p_proposta_id: propostaId, p_justificativa: String(justificativa ?? '').slice(0, 2000) })
    if (error) erroDoBanco(error, 'Não foi possível mandar para aprovação.')
    after(async () => {
      const { admin, p } = await dadosDoAviso(pedidoId)
      if (!p) return
      const fora = new Set([context.user.id, p.solicitante_id])
      const aprovam = (await pessoasDoFinanceiro(admin, p.workspace_id, p.entidade_id, 3)).filter((u) => !fora.has(u))
      const diretoria = p.exige_diretoria ? (await pessoasDaDiretoria(admin, p.workspace_id, diretoriaSetorId)).filter((u) => !fora.has(u)) : []
      const titulo = `Aprovar compra ${numeroDoPedido(p.ano, p.numero)}: ${p.titulo}`
      const mensagem = `${reais(Number(p.valor_aprovado ?? 0))}${p.exige_diretoria ? ' — acima do limite, passa também pela Diretoria.' : '.'}`
      await notificar(admin, { workspaceId: p.workspace_id, para: [...new Set([...aprovam, ...diretoria])], atorId: context.user.id, categoria: 'financeiro', titulo, mensagem, link: `/financeiro/compras/${pedidoId}`, botao: 'Ver a cotação' })
      if (p.solicitante_id && p.solicitante_id !== context.user.id) {
        await notificar(admin, { workspaceId: p.workspace_id, para: [p.solicitante_id], atorId: context.user.id, categoria: 'financeiro', titulo: `Seu pedido ${numeroDoPedido(p.ano, p.numero)} foi cotado`, mensagem: `Agora está em aprovação (${reais(Number(p.valor_aprovado ?? 0))}).`, link: `/financeiro/compras/${pedidoId}`, botao: 'Acompanhar' })
      }
    })
    revalidar(pedidoId)
    return {}
  } catch (causa) {
    return { erro: mensagemDoErro(causa, 'Não foi possível mandar para aprovação.') }
  }
}

export async function decidirPedido(pedidoId: string, decisao: 'aprovar' | 'recusar' | 'devolver', motivo: string, papel: 'financeiro' | 'diretoria'): Promise<Resultado<{ estado?: string }>> {
  try {
    if (!UUID.test(pedidoId) || !['aprovar', 'recusar', 'devolver'].includes(decisao) || !['financeiro', 'diretoria'].includes(papel)) throw new Error('Decisão inválida.')
    const { context, supabase } = await contextoDeCompras()
    const { data: estado, error } = await supabase.rpc('compras_decidir', { p_pedido_id: pedidoId, p_decisao: decisao, p_motivo: String(motivo ?? '').slice(0, 1000), p_papel: papel })
    if (error) erroDoBanco(error, 'Não foi possível registrar a decisão.')
    after(async () => {
      const { admin, p } = await dadosDoAviso(pedidoId)
      if (!p) return
      const numero = numeroDoPedido(p.ano, p.numero)
      const interessados = [p.solicitante_id, p.enviado_aprovacao_por].filter((u): u is string => Boolean(u) && u !== context.user.id)
      const texto = estado === 'aprovado' ? { titulo: `Compra ${numero} aprovada`, mensagem: `${p.titulo} — ${reais(Number(p.valor_aprovado ?? 0))}.` }
        : estado === 'recusado' ? { titulo: `Compra ${numero} recusada`, mensagem: `${p.titulo}. Motivo: ${motivo}` }
          : decisao === 'devolver' ? { titulo: `Compra ${numero} voltou para a cotação`, mensagem: `${p.titulo}. ${motivo}` }
            : null
      if (!texto) return
      await notificar(admin, { workspaceId: p.workspace_id, para: [...new Set(interessados)], atorId: context.user.id, categoria: 'financeiro', ...texto, link: `/financeiro/compras/${pedidoId}`, botao: 'Ver o pedido' })
    })
    revalidar(pedidoId)
    return { estado: estado as string }
  } catch (causa) {
    return { erro: mensagemDoErro(causa, 'Não foi possível registrar a decisão.') }
  }
}

// ---------------------------------------------------------------- ordem de compra

export async function emitirOrdem(pedidoId: string, observacao: string): Promise<Resultado<{ codigo?: string }>> {
  try {
    if (!UUID.test(pedidoId)) throw new Error('Pedido inválido.')
    const { context, supabase } = await contextoDeCompras()
    const { data: codigo, error } = await supabase.rpc('compras_emitir_ordem', { p_pedido_id: pedidoId, p_observacao: String(observacao ?? '').slice(0, 2000) })
    if (error || !codigo) erroDoBanco(error, 'Não foi possível emitir a ordem de compra.')
    after(async () => {
      const { admin, p } = await dadosDoAviso(pedidoId)
      if (!p?.solicitante_id || p.solicitante_id === context.user.id) return
      await notificar(admin, {
        workspaceId: p.workspace_id, para: [p.solicitante_id], atorId: context.user.id, categoria: 'financeiro',
        titulo: `Compra ${numeroDoPedido(p.ano, p.numero)}: ordem ${codigo} emitida`, mensagem: `${p.titulo}. Quando o material chegar, registre o recebimento no pedido.`,
        link: `/financeiro/compras/${pedidoId}`, botao: 'Ver o pedido',
      })
    })
    revalidar(pedidoId)
    return { codigo: codigo as string }
  } catch (causa) {
    return { erro: mensagemDoErro(causa, 'Não foi possível emitir a ordem de compra.') }
  }
}

/** Manda a ordem (PDF anexo) ao fornecedor pelo e-mail de um setor e registra o envio no pedido. */
export async function enviarOrdem(pedidoId: string, dados: { caixaId: string; para: string; cc?: string; mensagem: string }): Promise<Resultado<{ destinatarios?: string[] }>> {
  try {
    if (!UUID.test(pedidoId)) throw new Error('Pedido inválido.')
    if (!UUID.test(dados.caixaId ?? '')) throw new Error('Escolha o e-mail de onde a ordem sai.')
    const ctx = await contextoDeCompras()
    const { context, supabase } = ctx
    const { data: p } = await supabase.from('compras_pedidos').select('id,entidade_id,titulo,oc_numero').eq('id', pedidoId).eq('workspace_id', context.workspace.id).maybeSingle()
    // Mesma conferência do banco (compras_registrar_envio), antes de o e-mail sair.
    if (!p || nivelNaEmpresa(ctx, p.entidade_id) < 2) throw new Error('Pedido não encontrado.')
    const ordem = p.oc_numero ? await dadosDaOrdem(createAdminClient(), context.workspace.id, pedidoId) : null
    if (!ordem) throw new Error('Emita a ordem de compra antes de enviar.')
    const pdf = await ordemDeCompra(ordem.dados)
    const envio = await enviarPelaCaixa(context, dados.caixaId, {
      para: dados.para, cc: dados.cc, assunto: `Ordem de compra ${ordem.codigo} — ${p.titulo}`.slice(0, 200), corpo: String(dados.mensagem ?? ''),
      anexos: [{ nome: `${ordem.codigo}.pdf`, tipo: 'application/pdf', conteudo: pdf }],
    })
    const { error } = await supabase.rpc('compras_registrar_envio', { p_pedido_id: pedidoId, p_para: envio.destinatarios.join(', ') })
    if (error) erroDoBanco(error, 'A ordem foi enviada, mas não foi possível registrar o envio no pedido.')
    revalidar(pedidoId)
    return { destinatarios: envio.destinatarios }
  } catch (causa) {
    return { erro: mensagemDoErro(causa, 'Não foi possível enviar a ordem.') }
  }
}

// ---------------------------------------------------------------- recebimento

export type RecebimentoNoFormulario = { recebido_em: string; nota_fiscal?: string; observacao?: string; itens: { item_id: string; quantidade: string }[] }

export async function receberPedido(pedidoId: string, dados: RecebimentoNoFormulario): Promise<Resultado<{ estado?: string }>> {
  try {
    if (!UUID.test(pedidoId)) throw new Error('Pedido inválido.')
    const { context, supabase } = await contextoDeCompras()
    const itens = (dados.itens ?? []).filter((i) => UUID.test(i.item_id) && String(i.quantidade ?? '').trim()).map((i) => {
      const quantidade = lerValor(i.quantidade)
      if (quantidade === null || quantidade < 0) throw new Error('Alguma quantidade está num formato inválido.')
      return { item_id: i.item_id, quantidade }
    })
    const { data: estado, error } = await supabase.rpc('compras_receber', {
      p_pedido_id: pedidoId,
      p: { recebido_em: dados.recebido_em || null, nota_fiscal: String(dados.nota_fiscal ?? '').slice(0, 60), observacao: String(dados.observacao ?? '').slice(0, 1000), itens },
    })
    if (error || !estado) erroDoBanco(error, 'Não foi possível registrar o recebimento.')
    after(async () => {
      const { admin, p } = await dadosDoAviso(pedidoId)
      if (!p) return
      // O Financeiro fica sabendo (é a deixa para lançar a conta); quem pediu, se foi outra pessoa que recebeu.
      const para = new Set([...(await pessoasDoFinanceiro(admin, p.workspace_id, p.entidade_id, 2)), ...(p.solicitante_id ? [p.solicitante_id] : [])])
      para.delete(context.user.id)
      const titulo = `Compra ${numeroDoPedido(p.ano, p.numero)}: ${estado === 'recebido' ? 'tudo recebido' : 'parte recebida'}`
      await notificar(admin, {
        workspaceId: p.workspace_id, para: [...para], atorId: context.user.id, categoria: 'financeiro', titulo,
        mensagem: `${p.titulo}.${dados.nota_fiscal ? ` Nota fiscal ${dados.nota_fiscal}.` : ''}`, link: `/financeiro/compras/${pedidoId}`, botao: 'Ver o pedido',
      })
      // Quem opera o Patrimônio dá a entrada no estoque ou no patrimônio.
      const patrimonio = (await quemOperaOPatrimonio(admin, p.workspace_id)).filter((u) => u !== context.user.id && !para.has(u))
      await notificar(admin, {
        workspaceId: p.workspace_id, para: patrimonio, atorId: context.user.id, categoria: 'patrimonio', titulo,
        mensagem: `${p.titulo}. Dê a entrada do que chegou no estoque ou no patrimônio.`, link: `/financeiro/compras/${pedidoId}`, botao: 'Dar entrada',
      })
    })
    revalidar(pedidoId)
    return { estado: estado as string }
  } catch (causa) {
    return { erro: mensagemDoErro(causa, 'Não foi possível registrar o recebimento.') }
  }
}

// ---------------------------------------------------------------- entrada no estoque ou patrimônio

export type EntradaNoFormulario = {
  tipo: string; quantidade: string; data?: string; observacao?: string
  est_item_id?: string; est_quantidade?: string; local_id?: string; lote?: string; validade?: string
  categoria_id?: string; nome?: string; marca?: string; modelo?: string
}

export async function darEntrada(pedidoId: string, itemId: string, dados: EntradaNoFormulario): Promise<Resultado> {
  try {
    if (!UUID.test(pedidoId) || !UUID.test(itemId)) throw new Error('Item inválido.')
    if (!['estoque', 'patrimonio', 'consumo'].includes(dados.tipo)) throw new Error('Escolha o destino.')
    const { supabase } = await contextoDeCompras()
    const quantidade = lerValor(dados.quantidade)
    if (quantidade === null || quantidade <= 0) throw new Error('Informe a quantidade.')
    const noEstoque = String(dados.est_quantidade ?? '').trim() ? lerValor(dados.est_quantidade) : null
    if (noEstoque !== null && noEstoque <= 0) throw new Error('Informe a quantidade no estoque.')
    const id = (v?: string) => (v && UUID.test(v) ? v : null)
    const texto = (v: string | undefined, max: number) => String(v ?? '').trim().slice(0, max)
    const { error } = await supabase.rpc('compras_dar_entrada', {
      p_item_id: itemId,
      p: {
        tipo: dados.tipo, quantidade, data: dados.data || null, observacao: texto(dados.observacao, 600),
        est_item_id: id(dados.est_item_id), est_quantidade: noEstoque, local_id: id(dados.local_id), lote: texto(dados.lote, 60), validade: dados.validade || null,
        categoria_id: id(dados.categoria_id), nome: texto(dados.nome, 160), marca: texto(dados.marca, 80), modelo: texto(dados.modelo, 80),
      },
    })
    if (error) erroDoBanco(error, 'Não foi possível dar a entrada.')
    revalidar(pedidoId)
    revalidatePath('/patrimonio')
    return {}
  } catch (causa) {
    return { erro: mensagemDoErro(causa, 'Não foi possível dar a entrada.') }
  }
}

// ---------------------------------------------------------------- conta a pagar

export type ContaNoFormulario = { conta_id: string; vencimento: string; competencia?: string; valor: string; parcelas: string; documento?: string }

export async function lancarContaDaCompra(pedidoId: string, dados: ContaNoFormulario): Promise<Resultado<{ id?: string }>> {
  try {
    if (!UUID.test(pedidoId)) throw new Error('Pedido inválido.')
    const { supabase } = await contextoDeCompras()
    const valor = String(dados.valor ?? '').trim() ? lerValor(dados.valor) : 0
    if (valor === null || valor < 0) throw new Error('Valor inválido.')
    const parcelas = Number(dados.parcelas || 1)
    if (!Number.isInteger(parcelas) || parcelas < 1 || parcelas > 12) throw new Error('De 1 a 12 parcelas.')
    const { data: id, error } = await supabase.rpc('compras_lancar_conta', {
      p_pedido_id: pedidoId,
      p: { conta_id: UUID.test(dados.conta_id ?? '') ? dados.conta_id : null, vencimento: dados.vencimento || null, competencia: dados.competencia || null, valor, parcelas, documento: String(dados.documento ?? '').slice(0, 80) },
    })
    if (error || !id) erroDoBanco(error, 'Não foi possível lançar a conta a pagar.')
    revalidar(pedidoId)
    revalidatePath('/financeiro')
    return { id: id as string }
  } catch (causa) {
    return { erro: mensagemDoErro(causa, 'Não foi possível lançar a conta a pagar.') }
  }
}

// ---------------------------------------------------------------- regras

export async function salvarRegrasDeCompra(dados: { limite_simples: string; limite_diretoria: string; cotacoes_minimas: string; diretoria_setor_id: string }): Promise<Resultado> {
  try {
    const { context, supabase } = await contextoDeCompras()
    const simples = lerValor(dados.limite_simples)
    const diretoria = lerValor(dados.limite_diretoria)
    const minimo = Number(dados.cotacoes_minimas)
    if (simples === null || diretoria === null) throw new Error('Informe os dois limites.')
    const { error } = await supabase.rpc('compras_salvar_regras', {
      p_workspace_id: context.workspace.id,
      p: { limite_simples: simples, limite_diretoria: diretoria, cotacoes_minimas: minimo, diretoria_setor_id: UUID.test(dados.diretoria_setor_id ?? '') ? dados.diretoria_setor_id : null },
    })
    if (error) erroDoBanco(error, 'Não foi possível salvar as regras.')
    revalidatePath('/financeiro/cadastros')
    revalidar()
    return {}
  } catch (causa) {
    return { erro: mensagemDoErro(causa, 'Não foi possível salvar as regras.') }
  }
}
