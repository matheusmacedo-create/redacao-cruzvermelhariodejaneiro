/**
 * As APIs públicas que o Palácio Virtual consulta (BrasilAPI, ViaCEP, IBGE,
 * FIPE, Open-Meteo, Pwned Passwords, Google Safe Browsing, Banco Central,
 * Nominatim): aqui só o que é puro — validar a entrada e ler a resposta.
 * A rede fica em ./servidor.ts. Dá para conferir tudo com tsx.
 *
 * Regra geral: a API externa é ajuda, não dependência. Fora do ar, lenta ou
 * com resposta estranha, o formulário continua funcionando à mão.
 */

export const digitos = (v: unknown) => String(v ?? '').replace(/\D/g, '')

// ---------------------------------------------------------------- CEP

export type Endereco = { cep: string; logradouro: string; bairro: string; cidade: string; uf: string; ibge: string | null }

export function cepValido(v: unknown): string | null {
  const d = digitos(v)
  return d.length === 8 && !/^0{8}$/.test(d) ? d : null
}

export const cepFormatado = (d: string) => (d.length === 8 ? `${d.slice(0, 5)}-${d.slice(5)}` : d)

const texto = (v: unknown, max = 200) => (typeof v === 'string' ? v.replace(/\s+/g, ' ').trim().slice(0, max) : '')

/** BrasilAPI /cep/v2. */
export function lerCepBrasilApi(j: unknown): Endereco | null {
  if (!j || typeof j !== 'object') return null
  const o = j as Record<string, unknown>
  const cep = cepValido(o.cep)
  const uf = texto(o.state, 2).toUpperCase()
  const cidade = texto(o.city)
  if (!cep || !uf || !cidade) return null
  const ibge = o.ibge && typeof o.ibge === 'object' ? texto((o.ibge as Record<string, unknown>).city, 10) || null : null
  return { cep, logradouro: texto(o.street), bairro: texto(o.neighborhood, 120), cidade, uf, ibge }
}

/** ViaCEP /ws/{cep}/json. Devolve {erro: true} para CEP inexistente. */
export function lerCepViaCep(j: unknown): Endereco | null {
  if (!j || typeof j !== 'object') return null
  const o = j as Record<string, unknown>
  if (o.erro) return null
  const cep = cepValido(o.cep)
  const uf = texto(o.uf, 2).toUpperCase()
  const cidade = texto(o.localidade)
  if (!cep || !uf || !cidade) return null
  return { cep, logradouro: texto(o.logradouro), bairro: texto(o.bairro, 120), cidade, uf, ibge: texto(o.ibge, 10) || null }
}

// ---------------------------------------------------------------- CNPJ

export type Empresa = {
  cnpj: string
  razaoSocial: string
  nomeFantasia: string
  situacao: string
  /** false quando a Receita não diz "ATIVA" (baixada, inapta, suspensa, nula). */
  ativa: boolean
  dataSituacao: string | null
  abertura: string | null
  naturezaJuridica: string
  atividade: string
  endereco: string
  municipio: string
  uf: string
  cep: string
  email: string
  telefone: string
}

/** Dígitos verificadores do CNPJ. */
export function cnpjValido(v: unknown): string | null {
  const d = digitos(v)
  if (d.length !== 14 || /^(\d)\1{13}$/.test(d)) return null
  const dv = (n: number) => {
    const pesos = n === 12 ? [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2] : [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]
    const r = pesos.reduce((t, p, i) => t + p * Number(d[i]), 0) % 11
    return r < 2 ? 0 : 11 - r
  }
  return dv(12) === Number(d[12]) && dv(13) === Number(d[13]) ? d : null
}

export const cnpjFormatado = (d: string) =>
  d.length === 14 ? `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8, 12)}-${d.slice(12)}` : d

/** BrasilAPI /cnpj/v1. */
export function lerCnpjBrasilApi(j: unknown): Empresa | null {
  if (!j || typeof j !== 'object') return null
  const o = j as Record<string, unknown>
  const cnpj = cnpjValido(o.cnpj)
  const razaoSocial = texto(o.razao_social, 250)
  if (!cnpj || !razaoSocial) return null
  const situacao = texto(o.descricao_situacao_cadastral, 40).toUpperCase()
  const partes = [texto(o.descricao_tipo_de_logradouro, 30), texto(o.logradouro), texto(o.numero, 20), texto(o.complemento, 120), texto(o.bairro, 120)].filter(Boolean)
  const ddd = texto(o.ddd_telefone_1, 20)
  return {
    cnpj, razaoSocial,
    nomeFantasia: texto(o.nome_fantasia, 250),
    situacao: situacao || 'DESCONHECIDA',
    ativa: situacao === 'ATIVA',
    dataSituacao: texto(o.data_situacao_cadastral, 10) || null,
    abertura: texto(o.data_inicio_atividade, 10) || null,
    naturezaJuridica: texto(o.natureza_juridica, 120),
    atividade: texto(o.cnae_fiscal_descricao, 250),
    endereco: partes.join(', '),
    municipio: texto(o.municipio, 120),
    uf: texto(o.uf, 2).toUpperCase(),
    cep: cepValido(o.cep) ?? '',
    email: texto(o.email, 200).toLowerCase(),
    telefone: ddd,
  }
}

// ---------------------------------------------------------------- feriados

export type Feriado = { data: string; nome: string; abrangencia: 'nacional' | 'estadual' | 'municipal' }

/**
 * Feriados do Rio que a BrasilAPI (só nacionais) não traz, ambos de data
 * fixa: São Sebastião (20/1, municipal, padroeiro da cidade) e São Jorge
 * (23/4, estadual). Ponto facultativo não entra: não é feriado.
 */
export function feriadosLocaisDoRio(ano: number): Feriado[] {
  return [
    { data: `${ano}-01-20`, nome: 'São Sebastião (padroeiro do Rio)', abrangencia: 'municipal' },
    { data: `${ano}-04-23`, nome: 'São Jorge', abrangencia: 'estadual' },
  ]
}

/** BrasilAPI /feriados/v1/{ano} + os locais, sem repetir data, em ordem. */
export function lerFeriados(j: unknown, ano: number): Feriado[] {
  const nacionais: Feriado[] = Array.isArray(j)
    ? j.flatMap((f) => {
      const o = (f ?? {}) as Record<string, unknown>
      const data = texto(o.date, 10)
      return /^\d{4}-\d{2}-\d{2}$/.test(data) && data.startsWith(String(ano)) ? [{ data, nome: texto(o.name, 80) || 'Feriado', abrangencia: 'nacional' as const }] : []
    })
    : []
  const porData = new Map<string, Feriado>()
  for (const f of [...nacionais, ...feriadosLocaisDoRio(ano)]) if (!porData.has(f.data)) porData.set(f.data, f)
  return [...porData.values()].sort((a, b) => a.data.localeCompare(b.data))
}

// ---------------------------------------------------------------- IBGE

/** Sem acento, sem caixa, espaço simples — para casar "niteroi" com "Niterói". */
export const chaveDoNome = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim()

export function lerMunicipios(j: unknown): string[] {
  if (!Array.isArray(j)) return []
  return j.map((m) => texto((m as Record<string, unknown>)?.nome, 120)).filter(Boolean).sort((a, b) => a.localeCompare(b, 'pt-BR'))
}

/** A grafia oficial do município, se o texto digitado for um deles. */
export function municipioOficial(digitado: string, municipios: readonly string[]): string | null {
  const k = chaveDoNome(digitado)
  if (!k) return null
  return municipios.find((m) => chaveDoNome(m) === k) ?? null
}

// ---------------------------------------------------------------- FIPE

export const TIPOS_FIPE = { carros: 'Carro', motos: 'Moto', caminhoes: 'Caminhão' } as const
export type TipoFipe = keyof typeof TIPOS_FIPE
export const ehTipoFipe = (v: unknown): v is TipoFipe => typeof v === 'string' && v in TIPOS_FIPE

export type OpcaoFipe = { codigo: string; nome: string }

/** Tipo do veículo na frota → tabela da FIPE (barco e "outro" não têm). */
export function tipoFipeDoVeiculo(tipo: string): TipoFipe | null {
  if (tipo === 'moto') return 'motos'
  if (tipo === 'caminhao') return 'caminhoes'
  if (['carro', 'van', 'caminhonete', 'ambulancia'].includes(tipo)) return 'carros'
  return null
}

/** Listas de marcas/anos ([{codigo,nome}]) e de modelos ({modelos:[...]}). */
export function lerOpcoesFipe(j: unknown): OpcaoFipe[] {
  const lista = Array.isArray(j) ? j : j && typeof j === 'object' && Array.isArray((j as Record<string, unknown>).modelos) ? (j as { modelos: unknown[] }).modelos : []
  return lista.flatMap((o) => {
    const r = (o ?? {}) as Record<string, unknown>
    const codigo = texto(String(r.codigo ?? ''), 20)
    const nome = texto(r.nome, 120)
    return codigo && nome && /^[0-9A-Za-z-]+$/.test(codigo) ? [{ codigo, nome }] : []
  })
}

export type ValorFipe = { valor: number; marca: string; modelo: string; anoModelo: number | null; combustivel: string; codigoFipe: string; referencia: string }

/** "R$ 45.123,00" → 45123. */
export function lerReais(v: unknown): number | null {
  const s = texto(v, 40).replace(/[^\d,.-]/g, '').replace(/\./g, '').replace(',', '.')
  const n = Number(s)
  return s && Number.isFinite(n) ? Math.round(n * 100) / 100 : null
}

export function lerValorFipe(j: unknown): ValorFipe | null {
  if (!j || typeof j !== 'object') return null
  const o = j as Record<string, unknown>
  const valor = lerReais(o.Valor)
  if (valor == null) return null
  return {
    valor,
    marca: texto(o.Marca, 80), modelo: texto(o.Modelo, 160),
    anoModelo: typeof o.AnoModelo === 'number' && o.AnoModelo < 32000 ? o.AnoModelo : null,
    combustivel: texto(o.Combustivel, 30), codigoFipe: texto(o.CodigoFipe, 20), referencia: texto(o.MesReferencia, 40),
  }
}

// ---------------------------------------------------------------- tempo (Open-Meteo)

export type DiaDoTempo = {
  data: string
  chuvaMm: number
  chanceDeChuva: number | null
  maxima: number | null
  minima: number | null
  rajadaKmh: number | null
  codigo: number | null
}

export type Alerta = { nivel: 'atencao' | 'alerta'; motivo: string }

/**
 * Limiares de atenção para o Rio, na linha dos estágios do Centro de
 * Operações Rio (chuva de 24 h): acima de 25 mm pede atenção; acima de 50 mm
 * é chuva forte com risco de alagamento e deslizamento. Rajada de 60 km/h e
 * máxima de 38 °C também entram.
 */
export function alertasDoDia(d: DiaDoTempo): Alerta[] {
  const r: Alerta[] = []
  if (d.chuvaMm >= 50) r.push({ nivel: 'alerta', motivo: `Chuva forte: ${Math.round(d.chuvaMm)} mm previstos` })
  else if (d.chuvaMm >= 25) r.push({ nivel: 'atencao', motivo: `Chuva moderada a forte: ${Math.round(d.chuvaMm)} mm` })
  if (d.rajadaKmh != null && d.rajadaKmh >= 75) r.push({ nivel: 'alerta', motivo: `Ventania: rajadas de ${Math.round(d.rajadaKmh)} km/h` })
  else if (d.rajadaKmh != null && d.rajadaKmh >= 60) r.push({ nivel: 'atencao', motivo: `Vento forte: rajadas de ${Math.round(d.rajadaKmh)} km/h` })
  if (d.maxima != null && d.maxima >= 40) r.push({ nivel: 'alerta', motivo: `Calor extremo: ${Math.round(d.maxima)} °C` })
  else if (d.maxima != null && d.maxima >= 38) r.push({ nivel: 'atencao', motivo: `Calor forte: ${Math.round(d.maxima)} °C` })
  return r
}

export function lerPrevisao(j: unknown): DiaDoTempo[] {
  const daily = j && typeof j === 'object' ? (j as Record<string, unknown>).daily as Record<string, unknown[]> | undefined : undefined
  if (!daily || !Array.isArray(daily.time)) return []
  const n = (arr: unknown[] | undefined, i: number) => (Array.isArray(arr) && typeof arr[i] === 'number' ? arr[i] as number : null)
  return daily.time.slice(0, 16).flatMap((t, i) => {
    const data = typeof t === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(t) ? t : null
    return data ? [{
      data,
      chuvaMm: n(daily.precipitation_sum, i) ?? 0,
      chanceDeChuva: n(daily.precipitation_probability_max, i),
      maxima: n(daily.temperature_2m_max, i),
      minima: n(daily.temperature_2m_min, i),
      rajadaKmh: n(daily.wind_gusts_10m_max, i),
      codigo: n(daily.weather_code, i),
    }] : []
  })
}

/** Código WMO → descrição curta. */
export function descricaoDoTempo(codigo: number | null): string {
  if (codigo == null) return '—'
  if (codigo === 0) return 'Céu limpo'
  if (codigo <= 2) return 'Poucas nuvens'
  if (codigo === 3) return 'Nublado'
  if (codigo <= 48) return 'Neblina'
  if (codigo <= 57) return 'Garoa'
  if (codigo <= 67) return 'Chuva'
  if (codigo <= 77) return 'Neve'
  if (codigo <= 82) return 'Pancadas de chuva'
  if (codigo <= 86) return 'Neve'
  return 'Tempestade'
}

// ---------------------------------------------------------------- senha vazada

/** Na resposta de /range/{prefixo}, quantas vezes o sufixo apareceu (0 se não). */
export function vezesNoVazamento(corpo: string, sufixo: string): number {
  const alvo = sufixo.toUpperCase()
  for (const linha of corpo.split(/\r?\n/)) {
    const [suf, n] = linha.trim().split(':')
    if (suf?.toUpperCase() === alvo) return Number(n) || 0
  }
  return 0
}

// ---------------------------------------------------------------- links

/** Os endereços http(s) de um texto (markdown ou HTML), sem repetir, até `max`. */
export function linksDoTexto(textoLivre: string, max = 200): string[] {
  const vistos = new Set<string>()
  for (const m of String(textoLivre ?? '').matchAll(/https?:\/\/[^\s<>"'()\]]+/gi)) {
    const url = m[0].replace(/[.,;:!?]+$/, '')
    try { vistos.add(new URL(url).toString()) } catch { /* não é URL */ }
    if (vistos.size >= max) break
  }
  return [...vistos]
}

/** Google Safe Browsing v4 threatMatches:find → endereços marcados. */
export function lerAmeacas(j: unknown): { url: string; tipo: string }[] {
  const matches = j && typeof j === 'object' ? (j as Record<string, unknown>).matches : null
  if (!Array.isArray(matches)) return []
  return matches.flatMap((m) => {
    const o = (m ?? {}) as Record<string, unknown>
    const url = texto((o.threat as Record<string, unknown> | undefined)?.url, 2000)
    return url ? [{ url, tipo: texto(o.threatType, 40) }] : []
  })
}

export const NOME_DA_AMEACA: Record<string, string> = {
  MALWARE: 'vírus ou programa malicioso',
  SOCIAL_ENGINEERING: 'golpe ou página falsa (phishing)',
  UNWANTED_SOFTWARE: 'programa indesejado',
  POTENTIALLY_HARMFUL_APPLICATION: 'aplicativo nocivo',
}

// ---------------------------------------------------------------- Banco Central

export type PontoDaSerie = { data: string; valor: number }

/** SGS: [{"data":"01/09/2025","valor":"0.48"}] → [{data:"2025-09-01", valor:0.48}]. */
export function lerSerieSgs(j: unknown): PontoDaSerie[] {
  if (!Array.isArray(j)) return []
  return j.flatMap((p) => {
    const o = (p ?? {}) as Record<string, unknown>
    const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(texto(o.data, 10))
    const valor = Number(texto(o.valor, 20))
    return m && Number.isFinite(valor) ? [{ data: `${m[3]}-${m[2]}-${m[1]}`, valor }] : []
  })
}

/** Variações mensais em % → acumulado composto em %. */
export function acumulado(variacoes: number[]): number {
  const fator = variacoes.reduce((f, v) => f * (1 + v / 100), 1)
  return Math.round((fator - 1) * 10000) / 100
}

/**
 * Corrige um valor pelo IPCA aplicando a variação de cada mês do período,
 * do primeiro ao último, os dois inclusive ("AAAA-MM"). Devolve null se
 * faltar algum mês na série (o índice do mês corrente ainda não saiu).
 */
export function corrigirPeloIpca(valor: number, de: string, ate: string, serie: PontoDaSerie[]): { corrigido: number; percentual: number; meses: number } | null {
  if (!/^\d{4}-\d{2}$/.test(de) || !/^\d{4}-\d{2}$/.test(ate) || de > ate || !Number.isFinite(valor)) return null
  const porMes = new Map(serie.map((p) => [p.data.slice(0, 7), p.valor]))
  const meses: number[] = []
  let [a, m] = de.split('-').map(Number)
  for (let guarda = 0; guarda < 600; guarda++) {
    const chave = `${a}-${String(m).padStart(2, '0')}`
    if (chave > ate) break
    const v = porMes.get(chave)
    if (v == null) return null
    meses.push(v)
    m += 1
    if (m > 12) { m = 1; a += 1 }
  }
  if (!meses.length) return null
  const percentual = acumulado(meses)
  return { corrigido: Math.round(valor * (1 + percentual / 100) * 100) / 100, percentual, meses: meses.length }
}

/** PTAX (olinda): value[0].cotacaoVenda e dataHoraCotacao. */
export function lerPtax(j: unknown): { venda: number; quando: string } | null {
  const v = j && typeof j === 'object' ? (j as Record<string, unknown>).value : null
  if (!Array.isArray(v) || !v.length) return null
  const ultimo = v[v.length - 1] as Record<string, unknown>
  const venda = typeof ultimo.cotacaoVenda === 'number' ? ultimo.cotacaoVenda : null
  const quando = texto(ultimo.dataHoraCotacao, 30)
  return venda != null ? { venda, quando } : null
}

// ---------------------------------------------------------------- mapa (Nominatim)

export type Ponto = { lat: number; lng: number; nome: string }

export function lerNominatim(j: unknown): Ponto | null {
  if (!Array.isArray(j) || !j.length) return null
  const o = j[0] as Record<string, unknown>
  const lat = Number(o.lat), lng = Number(o.lon)
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) return null
  return { lat, lng, nome: texto(o.display_name, 300) }
}

/** O mapa do OpenStreetMap embutível, centrado no ponto, com marcador. */
export function urlDoMapa(p: Pick<Ponto, 'lat' | 'lng'>, raio = 0.006): { embutido: string; link: string } {
  const f = (n: number) => n.toFixed(6)
  const bbox = [p.lng - raio, p.lat - raio * 0.6, p.lng + raio, p.lat + raio * 0.6].map(f).join('%2C')
  return {
    embutido: `https://www.openstreetmap.org/export/embed.html?bbox=${bbox}&layer=mapnik&marker=${f(p.lat)}%2C${f(p.lng)}`,
    link: `https://www.openstreetmap.org/?mlat=${f(p.lat)}&mlon=${f(p.lng)}#map=17/${f(p.lat)}/${f(p.lng)}`,
  }
}
