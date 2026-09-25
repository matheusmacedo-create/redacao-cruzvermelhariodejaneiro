/**
 * O que a requisição diz sobre quem está do outro lado: navegador, sistema,
 * tipo de aparelho, IP e local aproximado (docs/registro-de-acessos.md §3,
 * nível 1). Módulo puro: recebe os cabeçalhos como um leitor, sem Next nem
 * banco, e é conferido com `npx tsx`.
 */

export type Dispositivo = 'computador' | 'celular' | 'tablet'

export type Agente = { navegador: string | null; sistema: string | null; dispositivo: Dispositivo }

export type DadosDaRequisicao = Agente & {
  ip: string | null
  pais: string | null
  estado: string | null
  cidade: string | null
  latitude: number | null
  longitude: number | null
  fuso: string | null
  userAgent: string | null
  idiomas: string | null
}

type LerCabecalho = (nome: string) => string | null

const versao = (ua: string, re: RegExp) => re.exec(ua)?.[1]?.split('.')[0] ?? ''

/** "Chrome 131", "Safari 17", "Edge 130"… A ordem importa: Edge e Opera também dizem "Chrome". */
function navegadorDoUa(ua: string): string | null {
  if (/Edg(?:e|A|iOS)?\//.test(ua)) return `Edge ${versao(ua, /Edg(?:e|A|iOS)?\/([\d.]+)/)}`.trim()
  if (/OPR\/|Opera/.test(ua)) return `Opera ${versao(ua, /OPR\/([\d.]+)/)}`.trim()
  if (/SamsungBrowser\//.test(ua)) return `Samsung Internet ${versao(ua, /SamsungBrowser\/([\d.]+)/)}`.trim()
  if (/FxiOS\//.test(ua)) return `Firefox ${versao(ua, /FxiOS\/([\d.]+)/)}`.trim()
  if (/CriOS\//.test(ua)) return `Chrome ${versao(ua, /CriOS\/([\d.]+)/)}`.trim()
  if (/Firefox\//.test(ua)) return `Firefox ${versao(ua, /Firefox\/([\d.]+)/)}`.trim()
  if (/Chrome\//.test(ua)) return `Chrome ${versao(ua, /Chrome\/([\d.]+)/)}`.trim()
  if (/Safari\//.test(ua) && /Version\//.test(ua)) return `Safari ${versao(ua, /Version\/([\d.]+)/)}`.trim()
  if (/curl\//i.test(ua)) return 'curl'
  return null
}

function sistemaDoUa(ua: string): string | null {
  if (/iPad/.test(ua)) return `iPadOS ${versao(ua, /OS (\d+)/)}`.trim()
  if (/iPhone|iPod/.test(ua)) return `iOS ${versao(ua, /OS (\d+)/)}`.trim()
  if (/Android/.test(ua)) return `Android ${versao(ua, /Android ([\d.]+)/)}`.trim()
  if (/CrOS/.test(ua)) return 'ChromeOS'
  // "Windows NT 10.0" é tanto o 10 quanto o 11: só a dica sec-ch-ua-platform-version separa.
  if (/Windows NT 10/.test(ua)) return 'Windows'
  if (/Windows NT 6\.[23]/.test(ua)) return 'Windows 8'
  if (/Windows NT 6\.1/.test(ua)) return 'Windows 7'
  if (/Windows/.test(ua)) return 'Windows'
  if (/Mac OS X/.test(ua)) return 'macOS'
  if (/Linux/.test(ua)) return 'Linux'
  return null
}

/** A marca de verdade nas client hints: '"Chromium";v="131", "Google Chrome";v="131", "Not?A_Brand";v="99"'. */
function navegadorDasDicas(dica: string | null): string | null {
  if (!dica) return null
  const marcas = [...dica.matchAll(/"([^"]+)";v="(\d+)/g)].map((m) => ({ nome: m[1], v: m[2] }))
    .filter((m) => !/not.?a.?brand|chromium/i.test(m.nome))
  const m = marcas.find((x) => /edge/i.test(x.nome)) ?? marcas.find((x) => /opera/i.test(x.nome)) ?? marcas[0]
  if (!m) return null
  const nome = /google chrome/i.test(m.nome) ? 'Chrome' : /microsoft edge/i.test(m.nome) ? 'Edge' : m.nome
  return `${nome} ${m.v}`
}

const semAspas = (v: string | null) => v?.replace(/^"|"$/g, '').trim() || null

export function interpretarAgente(ua: string, dicas: { marcas?: string | null; plataforma?: string | null; versaoDaPlataforma?: string | null; movel?: string | null } = {}): Agente {
  let sistema = sistemaDoUa(ua)
  const plataforma = semAspas(dicas.plataforma ?? null)
  if (plataforma === 'Windows') {
    // Windows 11 informa a versão da plataforma 13 ou maior.
    const maior = Number(semAspas(dicas.versaoDaPlataforma ?? null)?.split('.')[0])
    sistema = Number.isFinite(maior) && maior > 0 ? (maior >= 13 ? 'Windows 11' : 'Windows 10') : sistema ?? 'Windows'
  } else if (plataforma && !sistema) {
    sistema = plataforma === 'macOS' ? 'macOS' : plataforma
  }
  const tablet = /iPad|Tablet/.test(ua) || (/Android/.test(ua) && !/Mobile/.test(ua))
  const celular = dicas.movel === '?1' || (/Mobi|iPhone|iPod/.test(ua) && !tablet)
  return {
    navegador: navegadorDasDicas(dicas.marcas ?? null) ?? navegadorDoUa(ua),
    sistema,
    dispositivo: tablet ? 'tablet' : celular ? 'celular' : 'computador',
  }
}

const IPV4 = /^(25[0-5]|2[0-4]\d|1?\d?\d)(\.(25[0-5]|2[0-4]\d|1?\d?\d)){3}$/
const IPV6 = /^[0-9a-f:]+$/i

/** Só devolve o que o Postgres aceita como `inet`; o resto vira nulo. */
export function ipValido(bruto: string | null | undefined): string | null {
  const v = (bruto ?? '').trim()
  if (IPV4.test(v)) return v
  if (v.includes(':') && IPV6.test(v) && v.length <= 45) return v
  return null
}

const decodificar = (v: string | null) => {
  if (!v) return null
  try { return decodeURIComponent(v).slice(0, 200) } catch { return v.slice(0, 200) }
}
const numero = (v: string | null) => {
  const n = Number(v)
  return v && Number.isFinite(n) ? n : null
}

/**
 * Os dados do nível 1, dos cabeçalhos. Na Vercel, `x-real-ip` é o IP que
 * chegou à borda; `x-forwarded-for` pode vir forjado pelo cliente e só vale
 * quando o outro não existe (desenvolvimento local). A localização vem dos
 * cabeçalhos `x-vercel-ip-*`, sem mandar o IP a ninguém.
 */
export function dadosDaRequisicao(ler: LerCabecalho): DadosDaRequisicao {
  const ua = (ler('user-agent') ?? '').slice(0, 400)
  const agente = interpretarAgente(ua, {
    marcas: ler('sec-ch-ua'),
    plataforma: ler('sec-ch-ua-platform'),
    versaoDaPlataforma: ler('sec-ch-ua-platform-version'),
    movel: ler('sec-ch-ua-mobile'),
  })
  return {
    ...agente,
    ip: ipValido(ler('x-real-ip')) ?? ipValido((ler('x-forwarded-for') ?? '').split(',')[0]),
    pais: (ler('x-vercel-ip-country') ?? '').slice(0, 8) || null,
    estado: (ler('x-vercel-ip-country-region') ?? '').slice(0, 16) || null,
    cidade: decodificar(ler('x-vercel-ip-city')),
    latitude: numero(ler('x-vercel-ip-latitude')),
    longitude: numero(ler('x-vercel-ip-longitude')),
    fuso: (ler('x-vercel-ip-timezone') ?? '').slice(0, 64) || null,
    userAgent: ua || null,
    idiomas: (ler('accept-language') ?? '').slice(0, 120) || null,
  }
}

/** "Chrome 131 · Windows 11 · computador". */
export function rotuloDoAparelho(a: Agente): string {
  return [a.navegador ?? 'Navegador desconhecido', a.sistema, a.dispositivo].filter(Boolean).join(' · ').slice(0, 200)
}

/** "Rio de Janeiro/RJ, BR" — o que a lista mostra. */
export function lugar(d: { cidade: string | null; estado: string | null; pais: string | null }): string {
  const cidade = [d.cidade, d.estado].filter(Boolean).join('/')
  return [cidade, d.pais].filter(Boolean).join(', ') || 'Local desconhecido'
}
