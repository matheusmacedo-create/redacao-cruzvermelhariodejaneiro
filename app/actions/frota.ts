'use server'

import { revalidatePath } from 'next/cache'
import { mensagemDoErro } from '@/lib/erro-de-acao'
import { createAdminClient } from '@/lib/supabase/admin'
import { contextoDoPatrimonio } from '@/lib/patrimonio/acesso'
import { quemOperaOPatrimonio } from '@/lib/patrimonio/destinatarios'
import { notificar } from '@/lib/notificacoes/servidor'
import { valorFipe } from '@/lib/apis-publicas/servidor'
import { ehTipoFipe } from '@/lib/apis-publicas/regras'
import { lerValor } from '@/lib/patrimonio/regras'
import { lerQuantidade } from '@/lib/patrimonio/estoque'
import {
  ehCategoriaCnh, ehCombustivel, ehFinalidadeDeUso, ehTipoDeDocumento, ehTipoDeServico, ehTipoDeVeiculo, km, lerPlaca, placaLegivel,
} from '@/lib/patrimonio/frota'

/**
 * Frota — escrita. O banco (frota_*) confere nível, CNH, curso de
 * emergência, km que não volta e viagem aberta.
 */

type Resultado = { erro?: string }

function erroDoBanco(error: { message?: string; code?: string } | null, padrao: string): never {
  if (error?.code === 'P0001' && error.message) throw new Error(error.message)
  if (error?.code === '23514') throw new Error('Algum campo está fora do permitido.')
  throw new Error(padrao)
}

function revalidar(id?: string) {
  revalidatePath('/patrimonio/frota', 'layout')
  if (id) revalidatePath(`/patrimonio/frota/${id}`)
}

const ehUuid = (v: unknown): v is string => typeof v === 'string' && /^[0-9a-f-]{36}$/.test(v)
const ehData = (v: unknown): v is string => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v)
const uuidOuVazio = (v: unknown) => (ehUuid(v) ? v : '')

/** Inteiro de hodômetro: "52.100" → 52100. */
function lerKm(texto: string, obrigatorio = true): number | null {
  const s = String(texto ?? '').replace(/[.\s]/g, '').replace(/km$/i, '')
  if (!s) { if (obrigatorio) throw new Error('Informe o km do hodômetro.'); return null }
  if (!/^\d{1,7}$/.test(s)) throw new Error('Quilometragem inválida (só números).')
  return Number(s)
}

export async function salvarVeiculo(id: string | null, _anterior: Resultado & { id?: string }, formData: FormData): Promise<Resultado & { id?: string }> {
  try {
    const { context, supabase } = await contextoDoPatrimonio()
    const t = (k: string, max = 200) => String(formData.get(k) ?? '').trim().slice(0, max)
    const placa = lerPlaca(t('placa', 10))
    if (!placa) throw new Error('Placa inválida (ex.: ABC1D23 ou ABC-1234).')
    const tipo = t('tipo', 20), combustivel = t('combustivel', 20)
    if (!ehTipoDeVeiculo(tipo)) throw new Error('Escolha o tipo de veículo.')
    if (!ehCombustivel(combustivel)) throw new Error('Escolha o combustível.')
    const tanque = lerQuantidade(t('tanque_litros', 10))
    if (tanque !== null && (Number.isNaN(tanque) || tanque <= 0)) throw new Error('Tanque inválido.')
    const anos = ['ano_fabricacao', 'ano_modelo'].map((k) => t(k, 4))
    if (anos.some((a) => a && !/^(19[5-9]\d|20\d\d|2100)$/.test(a))) throw new Error('Ano inválido.')
    const renavam = t('renavam', 20).replace(/\D/g, '')
    if (renavam && (renavam.length < 9 || renavam.length > 11)) throw new Error('RENAVAM tem 9 a 11 dígitos.')
    const p = {
      placa, tipo, combustivel, tanque_litros: tanque ?? '', apelido: t('apelido', 60), marca: t('marca', 60), modelo: t('modelo', 80), ano_fabricacao: anos[0], ano_modelo: anos[1],
      cor: t('cor', 30), renavam, chassi: t('chassi', 17), km_atual: lerKm(t('km_atual', 12), !id) ?? '', local_id: uuidOuVazio(t('local_id', 40)), bem_id: uuidOuVazio(t('bem_id', 40)),
      situacao: t('situacao', 20) || 'ativo', observacao: t('observacao', 2000),
    }
    const { data, error } = await supabase.rpc('frota_salvar_veiculo', { p_workspace_id: context.workspace.id, p_id: id, p })
    if (error) erroDoBanco(error, 'Não foi possível salvar o veículo.')
    revalidar(data as string)
    return { id: data as string }
  } catch (causa) {
    return { erro: mensagemDoErro(causa, 'Não foi possível salvar o veículo.') }
  }
}

export type DadosDoCondutor = { id?: string; vinculo: 'equipe' | 'voluntario' | 'outro'; pessoa: string; nome: string; cnh_numero: string; cnh_categoria: string; cnh_validade: string; emergencia_validade: string; telefone: string; ativo: boolean }

export async function salvarCondutor(p: DadosDoCondutor): Promise<Resultado> {
  try {
    const { context, supabase } = await contextoDoPatrimonio()
    if (!ehCategoriaCnh(p.cnh_categoria)) throw new Error('Escolha a categoria da CNH.')
    if (!ehData(p.cnh_validade)) throw new Error('Informe a validade da CNH.')
    if (p.emergencia_validade && !ehData(p.emergencia_validade)) throw new Error('Validade do curso inválida.')
    const cnh = p.cnh_numero.replace(/\D/g, '')
    if (cnh && (cnh.length < 9 || cnh.length > 11)) throw new Error('Número da CNH: 9 a 11 dígitos (registro).')
    if (p.vinculo !== 'outro' && !ehUuid(p.pessoa)) throw new Error('Escolha a pessoa.')
    if (p.vinculo === 'outro' && p.nome.trim().length < 2) throw new Error('Informe o nome.')
    const { error } = await supabase.rpc('frota_salvar_condutor', {
      p_workspace_id: context.workspace.id,
      p: {
        id: uuidOuVazio(p.id), user_id: p.vinculo === 'equipe' ? p.pessoa : '', participante_id: p.vinculo === 'voluntario' ? p.pessoa : '', nome: p.nome.trim().slice(0, 160),
        cnh_numero: cnh, cnh_categoria: p.cnh_categoria, cnh_validade: p.cnh_validade, emergencia_validade: p.emergencia_validade, telefone: p.telefone.trim().slice(0, 40), ativo: p.ativo,
      },
    })
    if (error) erroDoBanco(error, 'Não foi possível salvar o condutor.')
    revalidar()
    return {}
  } catch (causa) {
    return { erro: mensagemDoErro(causa, 'Não foi possível salvar o condutor.') }
  }
}

export async function sairComVeiculo(veiculoId: string, p: { condutor_id: string; km_saida: string; destino: string; finalidade: string; projeto_id: string }): Promise<Resultado> {
  try {
    const { context, supabase } = await contextoDoPatrimonio()
    if (!ehUuid(p.condutor_id)) throw new Error('Escolha quem vai dirigir.')
    if (!ehFinalidadeDeUso(p.finalidade)) throw new Error('Escolha a finalidade.')
    if (p.destino.trim().length < 2) throw new Error('Diga para onde vai.')
    const { error } = await supabase.rpc('frota_sair', {
      p_workspace_id: context.workspace.id,
      p: { veiculo_id: veiculoId, condutor_id: p.condutor_id, km_saida: lerKm(p.km_saida), destino: p.destino.trim().slice(0, 200), finalidade: p.finalidade, projeto_id: uuidOuVazio(p.projeto_id) },
    })
    if (error) erroDoBanco(error, 'Não foi possível registrar a saída.')
    revalidar(veiculoId)
    return {}
  } catch (causa) {
    return { erro: mensagemDoErro(causa, 'Não foi possível registrar a saída.') }
  }
}

/** Retorno. Se um plano de manutenção venceu por km nesta viagem, avisa quem opera a frota. */
export async function retornarVeiculo(veiculoId: string, usoId: string, p: { km_retorno: string; observacao: string }): Promise<Resultado & { kmRodado?: number }> {
  try {
    const { context, supabase } = await contextoDoPatrimonio()
    const { data, error } = await supabase.rpc('frota_retornar', {
      p_workspace_id: context.workspace.id, p: { uso_id: usoId, km_retorno: lerKm(p.km_retorno), observacao: p.observacao.slice(0, 1000) },
    })
    if (error) erroDoBanco(error, 'Não foi possível registrar o retorno.')
    const r = data as { km_rodado: number; planos_vencidos: { nome: string; km: number }[] }
    if (r.planos_vencidos?.length) {
      const { data: v } = await supabase.from('frota_veiculos').select('placa,apelido').eq('id', veiculoId).single()
      const admin = createAdminClient()
      await notificar(admin, {
        workspaceId: context.workspace.id, para: await quemOperaOPatrimonio(admin, context.workspace.id), atorId: context.user.id, categoria: 'patrimonio',
        titulo: `Manutenção vencida: ${v ? `${v.apelido ? `${v.apelido} · ` : ''}${placaLegivel(v.placa as string)}` : 'veículo'}`,
        mensagem: r.planos_vencidos.map((x) => `${x.nome} (${km(x.km)})`).join('; '), link: `/patrimonio/frota/${veiculoId}`, botao: 'Ver o veículo',
      })
    }
    revalidar(veiculoId)
    return { kmRodado: r.km_rodado }
  } catch (causa) {
    return { erro: mensagemDoErro(causa, 'Não foi possível registrar o retorno.') }
  }
}

export async function abastecerVeiculo(veiculoId: string, p: { data: string; km: string; litros: string; valor: string; combustivel: string; tanque_cheio: boolean; posto: string; condutor_id: string }): Promise<Resultado> {
  try {
    const { context, supabase } = await contextoDoPatrimonio()
    if (!ehData(p.data)) throw new Error('Informe a data.')
    const litros = lerQuantidade(p.litros)
    if (litros === null || Number.isNaN(litros) || litros <= 0) throw new Error('Informe os litros.')
    const valor = lerValor(p.valor)
    if (valor === null || Number.isNaN(valor)) throw new Error('Informe o valor pago.')
    const { error } = await supabase.rpc('frota_abastecer', {
      p_workspace_id: context.workspace.id,
      p: { veiculo_id: veiculoId, data: p.data, km: lerKm(p.km), litros, valor, combustivel: p.combustivel, tanque_cheio: p.tanque_cheio, posto: p.posto.trim().slice(0, 120), condutor_id: uuidOuVazio(p.condutor_id) },
    })
    if (error) erroDoBanco(error, 'Não foi possível registrar o abastecimento.')
    revalidar(veiculoId)
    return {}
  } catch (causa) {
    return { erro: mensagemDoErro(causa, 'Não foi possível registrar o abastecimento.') }
  }
}

export async function registrarServico(veiculoId: string, p: { plano_id: string; tipo: string; descricao: string; data: string; km: string; custo: string; fornecedor: string }): Promise<Resultado> {
  try {
    const { context, supabase } = await contextoDoPatrimonio()
    if (!ehTipoDeServico(p.tipo)) throw new Error('Escolha o tipo de serviço.')
    if (p.descricao.trim().length < 2) throw new Error('Descreva o serviço.')
    if (!ehData(p.data)) throw new Error('Informe a data.')
    const custo = lerValor(p.custo)
    if (custo !== null && Number.isNaN(custo)) throw new Error('Custo inválido.')
    const { error } = await supabase.rpc('frota_servico', {
      p_workspace_id: context.workspace.id,
      p: { veiculo_id: veiculoId, plano_id: uuidOuVazio(p.plano_id), tipo: p.tipo, descricao: p.descricao.trim().slice(0, 600), data: p.data, km: lerKm(p.km, false) ?? '', custo: custo ?? '', fornecedor: p.fornecedor.trim().slice(0, 160) },
    })
    if (error) erroDoBanco(error, 'Não foi possível registrar o serviço.')
    revalidar(veiculoId)
    return {}
  } catch (causa) {
    return { erro: mensagemDoErro(causa, 'Não foi possível registrar o serviço.') }
  }
}

export async function salvarPlano(veiculoId: string, p: { id?: string; nome: string; a_cada_km: string; a_cada_meses: string; ultima_km: string; ultima_data: string; ativo: boolean }): Promise<Resultado> {
  try {
    const { context, supabase } = await contextoDoPatrimonio()
    if (p.nome.trim().length < 2) throw new Error('Dê um nome ao plano (ex.: "Troca de óleo").')
    const cadaKm = lerKm(p.a_cada_km, false)
    const meses = p.a_cada_meses.trim()
    if (meses && !/^\d{1,3}$/.test(meses)) throw new Error('Meses inválidos.')
    if (cadaKm === null && !meses) throw new Error('Diga a cada quantos km ou meses.')
    if (p.ultima_data && !ehData(p.ultima_data)) throw new Error('Data inválida.')
    const { error } = await supabase.rpc('frota_salvar_plano', {
      p_workspace_id: context.workspace.id,
      p: { id: uuidOuVazio(p.id), veiculo_id: veiculoId, nome: p.nome.trim().slice(0, 120), a_cada_km: cadaKm ?? '', a_cada_meses: meses, ultima_km: lerKm(p.ultima_km, false) ?? '', ultima_data: p.ultima_data, ativo: p.ativo },
    })
    if (error) erroDoBanco(error, 'Não foi possível salvar o plano.')
    revalidar(veiculoId)
    return {}
  } catch (causa) {
    return { erro: mensagemDoErro(causa, 'Não foi possível salvar o plano.') }
  }
}

export async function salvarDocumentoDoVeiculo(veiculoId: string, p: { id?: string; tipo: string; descricao: string; numero: string; vencimento: string; valor: string; observacao: string }): Promise<Resultado> {
  try {
    const { context, supabase } = await contextoDoPatrimonio()
    if (!ehTipoDeDocumento(p.tipo)) throw new Error('Escolha o tipo do documento.')
    if (p.vencimento && !ehData(p.vencimento)) throw new Error('Vencimento inválido.')
    const valor = lerValor(p.valor)
    if (valor !== null && Number.isNaN(valor)) throw new Error('Valor inválido.')
    const { error } = await supabase.rpc('frota_salvar_documento', {
      p_workspace_id: context.workspace.id,
      p: { id: uuidOuVazio(p.id), veiculo_id: veiculoId, tipo: p.tipo, descricao: p.descricao.trim().slice(0, 200), numero: p.numero.trim().slice(0, 60), vencimento: p.vencimento, valor: valor ?? '', observacao: p.observacao.trim().slice(0, 600) },
    })
    if (error) erroDoBanco(error, 'Não foi possível salvar o documento.')
    revalidar(veiculoId)
    return {}
  } catch (causa) {
    return { erro: mensagemDoErro(causa, 'Não foi possível salvar o documento.') }
  }
}

export async function excluirDaFrota(veiculoId: string, tabela: 'documento' | 'plano' | 'abastecimento' | 'servico', id: string): Promise<Resultado> {
  try {
    const { context, supabase } = await contextoDoPatrimonio()
    if (!['documento', 'plano', 'abastecimento', 'servico'].includes(tabela) || !ehUuid(id)) throw new Error('Registro inválido.')
    const { error } = await supabase.rpc('frota_excluir', { p_workspace_id: context.workspace.id, p_tabela: tabela, p_id: id })
    if (error) erroDoBanco(error, 'Não foi possível excluir.')
    revalidar(veiculoId)
    return {}
  } catch (causa) {
    return { erro: mensagemDoErro(causa, 'Não foi possível excluir.') }
  }
}

/**
 * Guarda no veículo o valor da Tabela FIPE escolhido na tela. O valor é
 * consultado de novo aqui, no servidor, pelos códigos: o que vai ao banco é
 * o que a FIPE diz, não um número vindo do navegador.
 */
export async function registrarFipe(veiculoId: string, escolha: { tipo: string; marca: string; modelo: string; ano: string } | null): Promise<Resultado & { valor?: number; referencia?: string }> {
  try {
    const { context, supabase } = await contextoDoPatrimonio()
    let p: Record<string, string> = {}
    if (escolha) {
      if (!ehTipoFipe(escolha.tipo)) throw new Error('Tipo de veículo inválido.')
      const v = await valorFipe(escolha.tipo, escolha.marca, escolha.modelo, escolha.ano)
      if (!v) throw new Error('A Tabela FIPE não respondeu agora. Tente de novo em instantes.')
      p = { codigo: v.codigoFipe, descricao: [v.marca, v.modelo, v.anoModelo, v.combustivel].filter(Boolean).join(' · '), valor: v.valor.toFixed(2), referencia: v.referencia }
    }
    const { error } = await supabase.rpc('frota_registrar_fipe', { p_workspace_id: context.workspace.id, p_veiculo_id: veiculoId, p })
    if (error) erroDoBanco(error, 'Não foi possível guardar o valor FIPE.')
    revalidar(veiculoId)
    return escolha ? { valor: Number(p.valor), referencia: p.referencia } : {}
  } catch (causa) {
    return { erro: mensagemDoErro(causa, 'Não foi possível guardar o valor FIPE.') }
  }
}
