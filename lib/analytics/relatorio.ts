/**
 * O Google Analytics do site em Resultados: o que é puro (sem rede) —
 * períodos, o pedido à Data API do GA4 e a leitura da resposta. Conferido
 * por scripts/conferir-analytics.ts.
 *
 * O período termina ONTEM: o dia de hoje ainda está chegando ao Analytics,
 * e compará-lo pela metade com o período anterior inteiro faria toda
 * variação parecer queda.
 */

export const PERIODOS = { 7: 'Últimos 7 dias', 28: 'Últimos 28 dias', 90: 'Últimos 90 dias' } as const
export type Periodo = keyof typeof PERIODOS
export const lerPeriodo = (v: unknown): Periodo => (v === '7' || v === 7 ? 7 : v === '90' || v === 90 ? 90 : 28)

type Intervalo = { startDate: string; endDate: string; name: string }

/** O período e o anterior, do mesmo tamanho, colados um no outro. */
export function intervalos(dias: Periodo): { atual: Intervalo; anterior: Intervalo } {
  return {
    atual: { startDate: `${dias}daysAgo`, endDate: 'yesterday', name: 'atual' },
    anterior: { startDate: `${dias * 2}daysAgo`, endDate: `${dias + 1}daysAgo`, name: 'anterior' },
  }
}

/** Os cinco relatórios de uma vez (o batchRunReports aceita até cinco). */
export function pedidoDoLote(dias: Periodo) {
  const { atual, anterior } = intervalos(dias)
  const m = (...nomes: string[]) => nomes.map((name) => ({ name }))
  const d = (...nomes: string[]) => nomes.map((name) => ({ name }))
  return {
    requests: [
      { dateRanges: [atual, anterior], metrics: m('activeUsers', 'sessions', 'screenPageViews', 'userEngagementDuration', 'engagedSessions') },
      { dateRanges: [atual], dimensions: d('date'), metrics: m('activeUsers', 'screenPageViews'), orderBys: [{ dimension: { dimensionName: 'date' } }], limit: 400 },
      { dateRanges: [atual], dimensions: d('sessionDefaultChannelGroup'), metrics: m('sessions'), orderBys: [{ metric: { metricName: 'sessions' }, desc: true }], limit: 10 },
      { dateRanges: [atual], dimensions: d('pagePath', 'pageTitle'), metrics: m('screenPageViews', 'activeUsers'), orderBys: [{ metric: { metricName: 'screenPageViews' }, desc: true }], limit: 10 },
      { dateRanges: [atual], dimensions: d('deviceCategory'), metrics: m('activeUsers'), orderBys: [{ metric: { metricName: 'activeUsers' }, desc: true }], limit: 5 },
    ],
  }
}

/** As cidades vêm num pedido à parte (o lote já tem cinco). */
export function pedidoDasCidades(dias: Periodo) {
  return {
    dateRanges: [intervalos(dias).atual],
    dimensions: [{ name: 'city' }],
    metrics: [{ name: 'activeUsers' }],
    orderBys: [{ metric: { metricName: 'activeUsers' }, desc: true }],
    limit: 8,
  }
}

/** A resposta de um relatório da Data API (só o que usamos). */
export type RelatorioDoGA = {
  dimensionHeaders?: { name: string }[]
  metricHeaders?: { name: string }[]
  rows?: { dimensionValues?: { value?: string }[]; metricValues?: { value?: string }[] }[]
}

/** As linhas como objetos: { date: '20260901', activeUsers: 12, … }. */
export function linhas(r: RelatorioDoGA | undefined): Record<string, string | number>[] {
  const dims = (r?.dimensionHeaders ?? []).map((h) => h.name)
  const mets = (r?.metricHeaders ?? []).map((h) => h.name)
  return (r?.rows ?? []).map((l) => {
    const o: Record<string, string | number> = {}
    dims.forEach((n, i) => { o[n] = l.dimensionValues?.[i]?.value ?? '' })
    mets.forEach((n, i) => { o[n] = Number(l.metricValues?.[i]?.value ?? 0) || 0 })
    return o
  })
}

export type Totais = { pessoas: number; visitas: number; paginas: number; engajamentoPorPessoa: number; visitasEngajadas: number }
export type DadosDoSite = {
  dias: Periodo
  atual: Totais
  anterior: Totais
  /** Um ponto por dia do período, com zero nos dias sem visita. */
  serie: { dia: string; pessoas: number; paginas: number }[]
  canais: { nome: string; visitas: number; fatia: number }[]
  paginas: { caminho: string; titulo: string; vistas: number; pessoas: number }[]
  dispositivos: { nome: string; pessoas: number; fatia: number }[]
  cidades: { nome: string; pessoas: number }[]
}

const CANAIS: Record<string, string> = {
  'Organic Search': 'Busca no Google e outros', Direct: 'Direto (digitou ou favorito)', 'Organic Social': 'Redes sociais',
  Referral: 'Outros sites', Email: 'E-mail', 'Paid Search': 'Busca paga', 'Paid Social': 'Redes sociais (anúncio)',
  'Organic Video': 'Vídeo', 'Organic Shopping': 'Compras', Display: 'Anúncios de display', 'Cross-network': 'Várias redes (anúncio)',
  'Paid Other': 'Outros anúncios', Affiliates: 'Afiliados', 'SMS': 'SMS', 'Mobile Push Notifications': 'Notificações', Unassigned: 'Não identificado',
}
export const nomeDoCanal = (c: string) => CANAIS[c] ?? c
const DISPOSITIVOS: Record<string, string> = { mobile: 'Celular', desktop: 'Computador', tablet: 'Tablet', 'smart tv': 'TV' }
export const nomeDoDispositivo = (d: string) => DISPOSITIVOS[d.toLowerCase()] ?? d

/** "20260901" → "2026-09-01". */
const dataIso = (d: string) => (/^\d{8}$/.test(d) ? `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}` : d)

/** Os dias do período (de `dias` atrás até ontem), no fuso de São Paulo, para completar a série. */
export function diasDoPeriodo(dias: Periodo, hoje: string): string[] {
  const [a, m, d] = hoje.split('-').map(Number)
  const base = Date.UTC(a, m - 1, d)
  return Array.from({ length: dias }, (_v, i) => new Date(base - (dias - i) * 86_400_000).toISOString().slice(0, 10))
}

function totais(l: Record<string, string | number> | undefined): Totais {
  const pessoas = Number(l?.activeUsers ?? 0)
  return {
    pessoas, visitas: Number(l?.sessions ?? 0), paginas: Number(l?.screenPageViews ?? 0),
    engajamentoPorPessoa: pessoas ? Number(l?.userEngagementDuration ?? 0) / pessoas : 0,
    visitasEngajadas: Number(l?.engagedSessions ?? 0),
  }
}

/** A resposta do lote (+ cidades) no formato da tela. `hoje` em AAAA-MM-DD (São Paulo). */
export function lerDadosDoSite(dias: Periodo, lote: { reports?: RelatorioDoGA[] }, cidades: RelatorioDoGA | undefined, hoje: string): DadosDoSite {
  const [rTotais, rSerie, rCanais, rPaginas, rDisp] = lote.reports ?? []
  const t = linhas(rTotais)
  // Com dois períodos, a API põe a dimensão dateRange com o nome de cada um.
  const doPeriodo = (nome: string, i: number) => t.find((l) => l.dateRange === nome) ?? (t.length === 2 ? t[i] : undefined)
  const porDia = new Map(linhas(rSerie).map((l) => [dataIso(String(l.date)), l]))
  const canais = linhas(rCanais)
  const visitasNosCanais = canais.reduce((s, c) => s + Number(c.sessions), 0)
  const disp = linhas(rDisp)
  const pessoasNosDisp = disp.reduce((s, c) => s + Number(c.activeUsers), 0)
  return {
    dias,
    atual: totais(doPeriodo('atual', 0)),
    anterior: totais(doPeriodo('anterior', 1)),
    serie: diasDoPeriodo(dias, hoje).map((dia) => ({ dia, pessoas: Number(porDia.get(dia)?.activeUsers ?? 0), paginas: Number(porDia.get(dia)?.screenPageViews ?? 0) })),
    canais: canais.map((c) => ({ nome: nomeDoCanal(String(c.sessionDefaultChannelGroup)), visitas: Number(c.sessions), fatia: visitasNosCanais ? Number(c.sessions) / visitasNosCanais : 0 })),
    paginas: linhas(rPaginas).map((p) => ({ caminho: String(p.pagePath), titulo: limparTitulo(String(p.pageTitle)), vistas: Number(p.screenPageViews), pessoas: Number(p.activeUsers) })),
    dispositivos: disp.map((c) => ({ nome: nomeDoDispositivo(String(c.deviceCategory)), pessoas: Number(c.activeUsers), fatia: pessoasNosDisp ? Number(c.activeUsers) / pessoasNosDisp : 0 })),
    cidades: linhas(cidades).filter((c) => c.city && c.city !== '(not set)').map((c) => ({ nome: String(c.city), pessoas: Number(c.activeUsers) })),
  }
}

/** "Título da matéria | Cruz Vermelha Brasileira – RJ" → "Título da matéria". */
export function limparTitulo(t: string): string {
  const limpo = t.replace(/\s*[|–—-]\s*Cruz Vermelha[^|]*$/i, '').trim()
  return limpo && limpo !== '(not set)' ? limpo : ''
}

/** Variação em relação ao período anterior (0,25 = +25%). Null sem base de comparação. */
export function variacao(atual: number, anterior: number): number | null {
  if (!anterior) return null
  return (atual - anterior) / anterior
}

/** 83 s → "1 min 23 s". */
export function duracaoLegivel(segundos: number): string {
  const s = Math.round(segundos)
  if (s < 60) return `${s} s`
  const min = Math.floor(s / 60)
  const resto = s % 60
  return resto ? `${min} min ${resto} s` : `${min} min`
}

/** O caminho de uma página do site, sem domínio e sem consulta: casa o pagePath do GA com o site_url das matérias. */
export function caminhoDaPagina(url: string): string {
  try {
    const u = new URL(url, 'https://cruzvermelhariodejaneiro.org')
    const p = u.pathname.replace(/\/index\.html?$/i, '/')
    return p.endsWith('/') ? p : `${p}/`
  } catch {
    return ''
  }
}
