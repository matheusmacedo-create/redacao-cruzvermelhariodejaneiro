'use server'

import { revalidatePath } from 'next/cache'
import { mensagemDoErro } from '@/lib/erro-de-acao'
import { createAdminClient } from '@/lib/supabase/admin'
import { contextoDoPatrimonio } from '@/lib/patrimonio/acesso'
import { quemOperaOPatrimonio } from '@/lib/patrimonio/destinatarios'
import { notificar } from '@/lib/notificacoes/servidor'
import { documentoValido, ehTipoDeBeneficiario, lerLinhasRecebidas, type LinhaRecebida } from '@/lib/patrimonio/doacoes'
import { lerQuantidade, quantidade } from '@/lib/patrimonio/estoque'

/**
 * Doações em espécie — escrita. Receber põe cada item no Estoque ou no
 * Patrimônio; entregar tira do Estoque (FEFO). O banco (doacao_*) confere
 * nível, saldo, validade e mês fechado.
 */

type Resultado = { erro?: string }

function erroDoBanco(error: { message?: string; code?: string } | null, padrao: string): never {
  if (error?.code === 'P0001' && error.message) throw new Error(error.message)
  if (error?.code === '23514') throw new Error('Algum campo está fora do permitido.')
  throw new Error(padrao)
}

function revalidar() {
  revalidatePath('/patrimonio', 'layout')
}

const ehUuid = (v: unknown): v is string => typeof v === 'string' && /^[0-9a-f-]{36}$/.test(v)
const ehData = (v: unknown): v is string => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v)
const uuidOuVazio = (v: unknown) => (ehUuid(v) ? v : '')

export type DadosDoDoador = { id?: string; nome: string; documento: string; email: string; telefone: string; observacao: string }

export async function salvarDoador(p: DadosDoDoador): Promise<Resultado & { id?: string }> {
  try {
    const { context, supabase } = await contextoDoPatrimonio()
    if (p.nome.trim().length < 2) throw new Error('Informe o nome do doador.')
    const doc = p.documento.replace(/\D/g, '')
    if (doc && !documentoValido(doc)) throw new Error('CPF ou CNPJ inválido (confira os dígitos).')
    if (p.email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(p.email.trim())) throw new Error('E-mail inválido.')
    const { data, error } = await supabase.rpc('doacao_salvar_doador', {
      p_workspace_id: context.workspace.id,
      p: { id: uuidOuVazio(p.id), nome: p.nome.trim().slice(0, 160), documento: doc, email: p.email.trim().slice(0, 200), telefone: p.telefone.trim().slice(0, 40), observacao: p.observacao.trim().slice(0, 1000) },
    })
    if (error) erroDoBanco(error, 'Não foi possível salvar o doador.')
    revalidar()
    return { id: data as string }
  } catch (causa) {
    return { erro: mensagemDoErro(causa, 'Não foi possível salvar o doador.') }
  }
}

export async function salvarCampanha(id: string | null, _anterior: Resultado & { ok?: number }, formData: FormData): Promise<Resultado & { ok?: number }> {
  try {
    const { context, supabase } = await contextoDoPatrimonio()
    const t = (k: string, max = 200) => String(formData.get(k) ?? '').trim().slice(0, max)
    const nome = t('nome', 120)
    if (nome.length < 2) throw new Error('Dê um nome à campanha (ex.: "SOS Chuvas Petrópolis").')
    const inicio = t('inicio', 10), fim = t('fim', 10)
    if ((inicio && !ehData(inicio)) || (fim && !ehData(fim))) throw new Error('Data inválida.')
    const p: Record<string, unknown> = { nome, descricao: t('descricao', 2000), inicio, fim, projeto_id: uuidOuVazio(t('projeto_id', 40)) }
    if (id) { p.id = id; p.ativa = formData.get('ativa') !== 'nao' }
    const { error } = await supabase.rpc('doacao_salvar_campanha', { p_workspace_id: context.workspace.id, p })
    if (error) erroDoBanco(error, 'Não foi possível salvar a campanha.')
    revalidar()
    return { ok: Date.now() }
  } catch (causa) {
    return { erro: mensagemDoErro(causa, 'Não foi possível salvar a campanha.') }
  }
}

export async function receberDoacao(p: { doador_id: string; campanha_id: string; local_id: string; data: string; observacao: string; linhas: LinhaRecebida[] }): Promise<Resultado & { id?: string }> {
  try {
    const { context, supabase } = await contextoDoPatrimonio()
    if (!ehUuid(p.local_id)) throw new Error('Escolha onde os itens ficam.')
    if (p.data && !ehData(p.data)) throw new Error('Data inválida.')
    const { itens, erros } = lerLinhasRecebidas(Array.isArray(p.linhas) ? p.linhas : [])
    if (erros.length) throw new Error(erros.slice(0, 4).join(' '))
    const { data, error } = await supabase.rpc('doacao_receber', {
      p_workspace_id: context.workspace.id,
      p: { doador_id: uuidOuVazio(p.doador_id), campanha_id: uuidOuVazio(p.campanha_id), local_id: p.local_id, data: p.data, observacao: p.observacao.slice(0, 2000), itens },
    })
    if (error) erroDoBanco(error, 'Não foi possível registrar a doação.')
    revalidar()
    return { id: data as string }
  } catch (causa) {
    return { erro: mensagemDoErro(causa, 'Não foi possível registrar a doação.') }
  }
}

export type DadosDaEntrega = {
  campanha_id: string; local_id: string; data: string; beneficiario_tipo: string; beneficiario_nome: string; beneficiario_documento: string; responsavel: string
  pessoas: string; municipio: string; bairro: string; observacao: string; itens: { item_id: string; quantidade: string }[]
}

/** Entrega a um beneficiário. Se algum item ficou abaixo do mínimo, avisa quem opera o estoque. */
export async function entregarDoacao(p: DadosDaEntrega): Promise<Resultado & { id?: string }> {
  try {
    const { context, supabase } = await contextoDoPatrimonio()
    if (!ehUuid(p.local_id)) throw new Error('Escolha de onde saem os itens.')
    if (!ehTipoDeBeneficiario(p.beneficiario_tipo)) throw new Error('Escolha o tipo de beneficiário.')
    if (p.beneficiario_nome.trim().length < 2) throw new Error('Diga quem recebeu.')
    if (p.data && !ehData(p.data)) throw new Error('Data inválida.')
    const pessoas = p.pessoas.trim()
    if (pessoas && (!/^\d+$/.test(pessoas) || Number(pessoas) < 1)) throw new Error('Número de pessoas inválido.')
    const itens = (Array.isArray(p.itens) ? p.itens : []).filter((i) => i.item_id).map((i, k) => {
      const q = lerQuantidade(i.quantidade)
      if (!ehUuid(i.item_id) || q === null || Number.isNaN(q) || q <= 0) throw new Error(`Linha ${k + 1}: escolha o material e a quantidade.`)
      return { item_id: i.item_id, quantidade: q }
    })
    if (!itens.length) throw new Error('Inclua ao menos um item entregue.')
    if (new Set(itens.map((i) => i.item_id)).size !== itens.length) throw new Error('Um material aparece duas vezes: some as quantidades numa linha só.')
    const { data, error } = await supabase.rpc('doacao_entregar', {
      p_workspace_id: context.workspace.id,
      p: {
        campanha_id: uuidOuVazio(p.campanha_id), local_id: p.local_id, data: p.data, beneficiario_tipo: p.beneficiario_tipo, beneficiario_nome: p.beneficiario_nome.trim().slice(0, 160),
        beneficiario_documento: p.beneficiario_documento.trim().slice(0, 30), responsavel: p.responsavel.trim().slice(0, 160), pessoas,
        municipio: p.municipio.trim().slice(0, 80), bairro: p.bairro.trim().slice(0, 80), observacao: p.observacao.slice(0, 2000), itens,
      },
    })
    if (error) erroDoBanco(error, 'Não foi possível registrar a entrega.')
    const r = data as { id: string; codigo: string; abaixo_do_minimo: { item_id: string; saldo: number; minimo: number }[] }
    if (r.abaixo_do_minimo?.length) {
      const { data: nomes } = await supabase.from('est_itens').select('id,nome,unidade').in('id', r.abaixo_do_minimo.map((x) => x.item_id))
      const admin = createAdminClient()
      const para = await quemOperaOPatrimonio(admin, context.workspace.id)
      for (const x of r.abaixo_do_minimo) {
        const i = (nomes ?? []).find((n) => n.id === x.item_id)
        if (!i) continue
        await notificar(admin, {
          workspaceId: context.workspace.id, para, atorId: context.user.id, categoria: 'patrimonio', titulo: `Estoque baixo: ${i.nome}`,
          mensagem: `Depois da entrega ${r.codigo}, restam ${quantidade(Number(x.saldo), i.unidade as string)} (mínimo ${quantidade(Number(x.minimo), i.unidade as string)}).`,
          link: `/patrimonio/estoque/${x.item_id}`, botao: 'Ver o material',
        })
      }
    }
    revalidar()
    return { id: r.id }
  } catch (causa) {
    return { erro: mensagemDoErro(causa, 'Não foi possível registrar a entrega.') }
  }
}
