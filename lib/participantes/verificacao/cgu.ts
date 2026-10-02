import 'server-only'
import { BASES_DA_CGU, NOMES_DAS_BASES, lerRespostaDaCgu, resumirSancoes, type BaseDaCgu, type ResultadoDaBase, type Sancoes } from './regras'

/**
 * As consultas gratuitas da CGU (API de dados do Portal da Transparência) por
 * CPF: CEIS, CNEP, CEAF e PEP. Chave gratuita (gov.br prata ou ouro), no
 * cofre de Integrações ou em PORTAL_TRANSPARENCIA_KEY; 90 consultas por
 * minuto. Nunca lança: uma base fora do ar vira "falha" dessa base, e o
 * resumo fica "incompleto" — nunca "nada consta" por falha. Só o resumo
 * saneado sai daqui; a resposta bruta não é guardada em lugar nenhum.
 *
 * O CPF entra só aqui, em memória, para montar a URL; quem chama o descarta.
 */

const URL_PADRAO = 'https://api.portaldatransparencia.gov.br/api-de-dados'
const PRAZO_MS = 8_000

export const urlDaCgu = () => (process.env.PORTAL_TRANSPARENCIA_URL?.trim() || URL_PADRAO).replace(/\/$/, '')

async function consultarBase(chave: string, base: BaseDaCgu, cpf: string): Promise<ResultadoDaBase> {
  const { caminho, parametro } = BASES_DA_CGU[base]
  const url = `${urlDaCgu()}/${caminho}?${new URLSearchParams({ [parametro]: cpf, pagina: '1' }).toString()}`
  try {
    const r = await fetch(url, { headers: { 'chave-api-dados': chave, accept: 'application/json' }, cache: 'no-store', signal: AbortSignal.timeout(PRAZO_MS) })
    let corpo: unknown = null
    try { corpo = await r.json() } catch { corpo = null }
    return lerRespostaDaCgu(base, r.status, corpo)
  } catch (causa) {
    console.error(`[verificacao] CGU ${base}:`, causa instanceof Error ? causa.message : causa)
    return lerRespostaDaCgu(base, 0, null)
  }
}

/**
 * Confere a chave antes de guardar: uma consulta ao CEIS com um CPF que não
 * existe. 200 = chave boa; 401/403 = recusada (definitivo); o resto (fora do
 * ar, limite) não diz nada sobre a chave.
 */
export async function testarChaveDaCgu(chave: string): Promise<{ ok: true } | { erro: string; definitivo: boolean }> {
  const url = `${urlDaCgu()}/${BASES_DA_CGU.ceis.caminho}?${new URLSearchParams({ [BASES_DA_CGU.ceis.parametro]: '00000000000', pagina: '1' }).toString()}`
  try {
    const r = await fetch(url, { headers: { 'chave-api-dados': chave, accept: 'application/json' }, cache: 'no-store', signal: AbortSignal.timeout(PRAZO_MS) })
    if (r.status === 200) return { ok: true }
    if (r.status === 401 || r.status === 403) return { erro: 'A CGU recusou esta chave. Confira se copiou os 32 caracteres inteiros do e-mail do Portal da Transparência e se a chave já está ativa (pode levar alguns minutos depois do cadastro).', definitivo: true }
    if (r.status === 429) return { erro: 'A CGU está no limite de consultas por minuto; a chave não pôde ser testada agora.', definitivo: false }
    return { erro: `A CGU respondeu ${r.status}; a chave não pôde ser testada agora.`, definitivo: false }
  } catch {
    return { erro: 'A CGU não respondeu; a chave não pôde ser testada agora.', definitivo: false }
  }
}

/** As quatro bases, em paralelo, e o resumo. */
export async function consultarCgu(chave: string, cpf: string): Promise<Sancoes> {
  const digitos = cpf.replace(/\D/g, '')
  const resultados = await Promise.all(NOMES_DAS_BASES.map((b) => consultarBase(chave, b, digitos)))
  return resumirSancoes(Object.fromEntries(NOMES_DAS_BASES.map((b, i) => [b, resultados[i]])) as Record<BaseDaCgu, ResultadoDaBase>)
}
