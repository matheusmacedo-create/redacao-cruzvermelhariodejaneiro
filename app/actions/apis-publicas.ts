'use server'

import { obterWorkspace } from '@/lib/session'
import { sessaoDoMembro } from '@/lib/membro/sessao'
import {
  anosFipe, buscarCep, buscarCnpj, ipcaMensal, marcasFipe, modelosFipe, municipiosDoRio, valorFipe,
} from '@/lib/apis-publicas/servidor'
import { corrigirPeloIpca, ehTipoFipe, type Empresa, type Endereco, type OpcaoFipe, type ValorFipe } from '@/lib/apis-publicas/regras'

/**
 * As consultas às APIs públicas que as telas fazem enquanto a pessoa
 * preenche um formulário. Só para quem está logado — na Redação ou na Área
 * do Membro (CEP e municípios) — para ninguém usar o servidor como
 * repetidor gratuito dessas APIs.
 */

async function logadoNaRedacao() {
  return Boolean(await obterWorkspace())
}
async function logadoEmAlgumLugar() {
  return (await logadoNaRedacao()) || Boolean(await sessaoDoMembro())
}

export async function consultarCep(cep: string): Promise<{ endereco?: Endereco; erro?: string }> {
  if (!(await logadoEmAlgumLugar())) return { erro: 'Sessão expirada.' }
  const endereco = await buscarCep(String(cep ?? ''))
  return endereco ? { endereco } : { erro: 'CEP não encontrado. Preencha o endereço à mão.' }
}

export async function listarMunicipiosDoRio(): Promise<string[]> {
  if (!(await logadoEmAlgumLugar())) return []
  return municipiosDoRio()
}

export async function consultarCnpj(cnpj: string): Promise<{ empresa?: Empresa; erro?: string }> {
  if (!(await logadoNaRedacao())) return { erro: 'Sessão expirada.' }
  const empresa = await buscarCnpj(String(cnpj ?? ''))
  return empresa ? { empresa } : { erro: 'Não achei este CNPJ na Receita agora. Confira os números ou preencha à mão.' }
}

/** Marcas, modelos ou anos, conforme o que já foi escolhido. */
export async function opcoesFipe(tipo: string, marca?: string, modelo?: string): Promise<OpcaoFipe[]> {
  if (!(await logadoNaRedacao()) || !ehTipoFipe(tipo)) return []
  if (marca && modelo) return anosFipe(tipo, marca, modelo)
  if (marca) return modelosFipe(tipo, marca)
  return marcasFipe(tipo)
}

export async function consultarValorFipe(tipo: string, marca: string, modelo: string, ano: string): Promise<{ valor?: ValorFipe; erro?: string }> {
  if (!(await logadoNaRedacao())) return { erro: 'Sessão expirada.' }
  if (!ehTipoFipe(tipo)) return { erro: 'Tipo de veículo inválido.' }
  const valor = await valorFipe(tipo, marca, modelo, ano)
  return valor ? { valor } : { erro: 'A Tabela FIPE não respondeu agora. Tente de novo em instantes.' }
}

/** Valor corrigido pelo IPCA de cada mês do período, do primeiro ao último, inclusive ("AAAA-MM"). */
export async function corrigirValor(valor: number, de: string, ate: string): Promise<{ corrigido?: number; percentual?: number; meses?: number; erro?: string }> {
  if (!(await logadoNaRedacao())) return { erro: 'Sessão expirada.' }
  if (!Number.isFinite(valor) || valor <= 0) return { erro: 'Informe um valor.' }
  if (!/^\d{4}-\d{2}$/.test(de) || !/^\d{4}-\d{2}$/.test(ate) || de > ate) return { erro: 'O último mês não pode vir antes do primeiro.' }
  const r = corrigirPeloIpca(valor, de, ate, await ipcaMensal(de))
  return r ?? { erro: 'O IPCA de algum mês do período ainda não foi divulgado (ou o Banco Central não respondeu).' }
}
