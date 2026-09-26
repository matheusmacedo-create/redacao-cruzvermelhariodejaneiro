import 'server-only'
import { createHash } from 'node:crypto'
import { obterChave } from '@/lib/integracoes/chaves'
import {
  cepValido, cnpjValido, lerAmeacas, lerCepBrasilApi, lerCepViaCep, lerCnpjBrasilApi, lerFeriados, lerMunicipios,
  NOME_DA_AMEACA, lerNominatim, lerOpcoesFipe, lerPrevisao, lerPtax, lerSerieSgs, lerValorFipe, linksDoTexto, vezesNoVazamento,
  type DiaDoTempo, type Empresa, type Endereco, type Feriado, type OpcaoFipe, type PontoDaSerie, type Ponto, type TipoFipe, type ValorFipe,
} from './regras'

/**
 * As chamadas às APIs públicas. Toda chamada tem prazo curto e nunca lança:
 * devolve null (ou lista vazia) e deixa a tela seguir no modo manual.
 *
 * O que muda pouco fica no cache de dados do Next (revalidate): CEP e CNPJ
 * por um dia, municípios e feriados por um mês, previsão por 30 minutos.
 * Isso também respeita os limites de uso das APIs gratuitas.
 */

const AGENTE = 'PalacioVirtual/1.0 (+https://redacao.cruzvermelhariodejaneiro.org; comunicacao@cruzvermelhariodejaneiro.org)'
const DIA = 86_400

async function json(url: string, opcoes: { revalidar?: number; prazoMs?: number; init?: RequestInit } = {}): Promise<unknown | null> {
  try {
    const r = await fetch(url, {
      ...opcoes.init,
      headers: { Accept: 'application/json', 'User-Agent': AGENTE, ...(opcoes.init?.headers ?? {}) },
      signal: AbortSignal.timeout(opcoes.prazoMs ?? 6000),
      ...(opcoes.revalidar ? { next: { revalidate: opcoes.revalidar } } : { cache: 'no-store' as const }),
    })
    if (!r.ok) return null
    return await r.json()
  } catch (causa) {
    console.error('[apis-publicas]', new URL(url).host, causa instanceof Error ? causa.message : causa)
    return null
  }
}

// ---------------------------------------------------------------- CEP

/** BrasilAPI primeiro (junta várias fontes); ViaCEP se ela falhar. */
export async function buscarCep(entrada: string): Promise<Endereco | null> {
  const cep = cepValido(entrada)
  if (!cep) return null
  return lerCepBrasilApi(await json(`https://brasilapi.com.br/api/cep/v2/${cep}`, { revalidar: DIA }))
    ?? lerCepViaCep(await json(`https://viacep.com.br/ws/${cep}/json/`, { revalidar: DIA }))
}

// ---------------------------------------------------------------- CNPJ

export async function buscarCnpj(entrada: string): Promise<Empresa | null> {
  const cnpj = cnpjValido(entrada)
  if (!cnpj) return null
  return lerCnpjBrasilApi(await json(`https://brasilapi.com.br/api/cnpj/v1/${cnpj}`, { revalidar: DIA, prazoMs: 10_000 }))
}

// ---------------------------------------------------------------- feriados

/** Feriados nacionais (BrasilAPI) + os do Rio. Sem a API, só os do Rio. */
export async function feriadosDoAno(ano: number): Promise<Feriado[]> {
  if (!Number.isInteger(ano) || ano < 1900 || ano > 2199) return []
  return lerFeriados(await json(`https://brasilapi.com.br/api/feriados/v1/${ano}`, { revalidar: 30 * DIA }), ano)
}

/** As datas ("AAAA-MM-DD") de feriado de um intervalo de anos, para as contas de prazo. */
export async function datasDeFeriado(anos: number[]): Promise<Set<string>> {
  const listas = await Promise.all([...new Set(anos)].map(feriadosDoAno))
  return new Set(listas.flat().map((f) => f.data))
}

// ---------------------------------------------------------------- IBGE

/** Os 92 municípios do estado do Rio, com a grafia oficial. */
export async function municipiosDoRio(): Promise<string[]> {
  return lerMunicipios(await json('https://servicodados.ibge.gov.br/api/v1/localidades/estados/33/municipios', { revalidar: 30 * DIA }))
}

// ---------------------------------------------------------------- FIPE

const FIPE = 'https://parallelum.com.br/fipe/api/v1'
const codigo = (v: string) => /^[0-9A-Za-z-]{1,20}$/.test(v)

export async function marcasFipe(tipo: TipoFipe): Promise<OpcaoFipe[]> {
  return lerOpcoesFipe(await json(`${FIPE}/${tipo}/marcas`, { revalidar: 7 * DIA }))
}
export async function modelosFipe(tipo: TipoFipe, marca: string): Promise<OpcaoFipe[]> {
  if (!codigo(marca)) return []
  return lerOpcoesFipe(await json(`${FIPE}/${tipo}/marcas/${marca}/modelos`, { revalidar: 7 * DIA }))
}
export async function anosFipe(tipo: TipoFipe, marca: string, modelo: string): Promise<OpcaoFipe[]> {
  if (!codigo(marca) || !codigo(modelo)) return []
  return lerOpcoesFipe(await json(`${FIPE}/${tipo}/marcas/${marca}/modelos/${modelo}/anos`, { revalidar: 7 * DIA }))
}
export async function valorFipe(tipo: TipoFipe, marca: string, modelo: string, ano: string): Promise<ValorFipe | null> {
  if (!codigo(marca) || !codigo(modelo) || !codigo(ano)) return null
  return lerValorFipe(await json(`${FIPE}/${tipo}/marcas/${marca}/modelos/${modelo}/anos/${ano}`, { revalidar: DIA }))
}

// ---------------------------------------------------------------- tempo

/** Sede da filial: Praça Cruz Vermelha, Centro do Rio. */
export const SEDE = { lat: -22.9113, lng: -43.1873 }

export async function previsaoDoRio(): Promise<DiaDoTempo[]> {
  const q = new URLSearchParams({
    latitude: String(SEDE.lat), longitude: String(SEDE.lng), timezone: 'America/Sao_Paulo', forecast_days: '7',
    daily: 'weather_code,temperature_2m_max,temperature_2m_min,precipitation_sum,precipitation_probability_max,wind_gusts_10m_max',
  })
  return lerPrevisao(await json(`https://api.open-meteo.com/v1/forecast?${q}`, { revalidar: 1800 }))
}

// ---------------------------------------------------------------- senha vazada

/**
 * Quantas vezes a senha apareceu em vazamentos conhecidos (Have I Been
 * Pwned, Pwned Passwords). Anonimato por faixa: só os 5 primeiros
 * caracteres do SHA-1 saem daqui; a senha e o hash inteiro nunca.
 * null = não deu para consultar (e quem chama deixa passar).
 */
export async function vezesQueVazou(senha: string): Promise<number | null> {
  if (!senha) return null
  const hash = createHash('sha1').update(senha, 'utf8').digest('hex').toUpperCase()
  try {
    const r = await fetch(`https://api.pwnedpasswords.com/range/${hash.slice(0, 5)}`, {
      headers: { 'User-Agent': AGENTE, 'Add-Padding': 'true' },
      signal: AbortSignal.timeout(4000),
      cache: 'no-store',
    })
    if (!r.ok) return null
    return vezesNoVazamento(await r.text(), hash.slice(5))
  } catch {
    return null
  }
}

// ---------------------------------------------------------------- links

export type ResultadoDosLinks = { conferido: boolean; perigosos: { url: string; tipo: string }[] }

/**
 * Confere os links de um texto no Google Safe Browsing. Sem chave
 * configurada (Configurações → Integrações), não confere e diz isso.
 */
export async function conferirLinks(workspaceId: string, textoOuLinks: string | string[]): Promise<ResultadoDosLinks> {
  const urls = Array.isArray(textoOuLinks) ? textoOuLinks.slice(0, 500) : linksDoTexto(textoOuLinks, 500)
  if (!urls.length) return { conferido: true, perigosos: [] }
  const chave = await obterChave(workspaceId, 'google_safe_browsing')
  if (!chave) return { conferido: false, perigosos: [] }
  const corpo = await json(`https://safebrowsing.googleapis.com/v4/threatMatches:find?key=${encodeURIComponent(chave)}`, {
    prazoMs: 6000,
    init: {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        client: { clientId: 'palacio-virtual-cvb-rj', clientVersion: '1.0' },
        threatInfo: {
          threatTypes: ['MALWARE', 'SOCIAL_ENGINEERING', 'UNWANTED_SOFTWARE', 'POTENTIALLY_HARMFUL_APPLICATION'],
          platformTypes: ['ANY_PLATFORM'],
          threatEntryTypes: ['URL'],
          threatEntries: urls.map((url) => ({ url })),
        },
      }),
    },
  })
  if (corpo === null) return { conferido: false, perigosos: [] }
  return { conferido: true, perigosos: lerAmeacas(corpo) }
}

// ---------------------------------------------------------------- Banco Central

/** IPCA mensal (série 433 do SGS) desde `desde` ("AAAA-MM"). */
export async function ipcaMensal(desde: string): Promise<PontoDaSerie[]> {
  const m = /^(\d{4})-(\d{2})$/.exec(desde)
  if (!m) return []
  const q = new URLSearchParams({ formato: 'json', dataInicial: `01/${m[2]}/${m[1]}` })
  return lerSerieSgs(await json(`https://api.bcb.gov.br/dados/serie/bcdata.sgs.433/dados?${q}`, { revalidar: DIA, prazoMs: 10_000 }))
}

/** PTAX de venda mais recente (últimos 7 dias, para cobrir fim de semana e feriado). */
export async function ptax(moeda: 'USD' | 'EUR'): Promise<{ venda: number; quando: string } | null> {
  const fmt = (d: Date) => `${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}-${d.getFullYear()}`
  const fim = new Date()
  const inicio = new Date(fim.getTime() - 7 * DIA * 1000)
  const url = `https://olinda.bcb.gov.br/olinda/servico/PTAX/versao/v1/odata/CotacaoMoedaPeriodo(moeda=@moeda,dataInicial=@dataInicial,dataFinalCotacao=@dataFinalCotacao)`
    + `?@moeda='${moeda}'&@dataInicial='${fmt(inicio)}'&@dataFinalCotacao='${fmt(fim)}'&$filter=tipoBoletim%20eq%20'Fechamento'&$format=json`
  return lerPtax(await json(url, { revalidar: 3600, prazoMs: 10_000 }))
}

// ---------------------------------------------------------------- mapa

/**
 * Endereço → ponto no mapa (Nominatim/OpenStreetMap). A política de uso pede
 * identificação e no máximo uma consulta por segundo; o cache de um mês
 * garante que o mesmo endereço não é consultado de novo.
 */
export async function localizar(endereco: string): Promise<Ponto | null> {
  const q = endereco.replace(/\s+/g, ' ').trim().slice(0, 300)
  if (q.length < 4) return null
  // viewbox só dá preferência ao estado do Rio (sem bounded): endereço de fora ainda é achado.
  const params = new URLSearchParams({ q, format: 'json', limit: '1', countrycodes: 'br', 'accept-language': 'pt-BR', viewbox: '-44.9,-20.7,-40.9,-23.4' })
  return lerNominatim(await json(`https://nominatim.openstreetmap.org/search?${params}`, { revalidar: 30 * DIA }))
}

/**
 * A frase para recusar uma senha que já vazou, ou null. Se a consulta falhar
 * (API fora do ar), deixa passar: as outras regras de senha continuam valendo
 * e ninguém fica sem conseguir trocar a senha por causa de um serviço externo.
 */
export async function problemaDeSenhaVazada(senha: string): Promise<string | null> {
  const vezes = await vezesQueVazou(senha)
  if (!vezes) return null
  const quantas = vezes === 1 ? 'uma vez' : `${vezes.toLocaleString('pt-BR')} vezes`
  return `Esta senha já apareceu ${quantas} em vazamentos de dados conhecidos: é das primeiras que um invasor tenta. Escolha outra.`
}

/**
 * Para publicar: a frase que impede a publicação se algum link do texto
 * estiver marcado como perigoso, ou null. Sem chave configurada, ou com o
 * Google fora do ar, não impede (a conferência é camada extra, não portão).
 */
export async function problemaDeLinkPerigoso(workspaceId: string, texto: string): Promise<string | null> {
  const r = await conferirLinks(workspaceId, texto)
  if (!r.perigosos.length) return null
  const lista = r.perigosos.slice(0, 3).map((p) => `${p.url} (${NOME_DA_AMEACA[p.tipo] ?? 'ameaça'})`).join('; ')
  return `O Google Safe Browsing marcou ${r.perigosos.length === 1 ? 'um link' : `${r.perigosos.length} links`} do texto como perigoso: ${lista}. Tire o link e publique de novo.`
}
