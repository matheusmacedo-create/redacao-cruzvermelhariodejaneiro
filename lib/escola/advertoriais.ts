/**
 * O banco de advertoriais da escola. Puro: os links (botão rastreado e
 * anúncio com UTM), a chave que liga a matrícula ao advertorial, o modelo de
 * texto e a conta de cada página. Dá para conferir com tsx.
 *
 * O caminho de um lead:
 *   anúncio (?utm_source=facebook&utm_campaign=…) → matéria no site (conta a
 *   visita pelo pixel) → botão "garantir vaga" (/api/escola/ir/<peça>, conta o
 *   clique) → página de matrícula com as UTMs do anúncio e utm_content = o
 *   advertorial → a Únicopag grava a venda com esse utm_content.
 */

import type { Peca } from './marketing'

/** O utm_content do advertorial: o endereço (slug) da matéria; antes de publicar, um código da peça. */
export const chaveDoAdvertorial = (slug: string | null, pecaId: string) => (slug && /^[a-z0-9-]{1,100}$/.test(slug) ? slug : `adv-${pecaId.slice(0, 8)}`)

export const linkDoBotao = (baseDaRedacao: string, pecaId: string) => `${baseDaRedacao.replace(/\/+$/, '')}/api/escola/ir/${pecaId}`
export const linkDoPixel = (baseDaRedacao: string, pecaId: string) => `${baseDaRedacao.replace(/\/+$/, '')}/api/escola/v/${pecaId}`

/** O que vem do anúncio e segue até a matrícula (o resto da query da página fica para trás). */
const REPASSADOS = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'fbclid', 'gclid'] as const

/**
 * O endereço final do botão: o destino cadastrado (nunca um endereço vindo
 * da requisição), com as UTMs do anúncio que trouxe a pessoa. Sem anúncio,
 * utm_source=site e utm_medium=advertorial; utm_campaign cai na da campanha;
 * utm_content é sempre o advertorial — é por ele que a matrícula volta aqui.
 */
export function montarDestino(destino: string, entrada: URLSearchParams, info: { chave: string; utmCampaign: string | null }): string | null {
  let u: URL
  try { u = new URL(destino) } catch { return null }
  if (u.protocol !== 'https:') return null
  for (const k of REPASSADOS) {
    const v = entrada.get(k)?.trim()
    if (v && v.length <= 200 && !/[\u0000-\u001f]/.test(v)) u.searchParams.set(k, v)
  }
  if (!u.searchParams.get('utm_source')) u.searchParams.set('utm_source', 'site')
  if (!u.searchParams.get('utm_medium')) u.searchParams.set('utm_medium', 'advertorial')
  if (!u.searchParams.get('utm_campaign') && info.utmCampaign) u.searchParams.set('utm_campaign', info.utmCampaign)
  u.searchParams.set('utm_content', info.chave)
  return u.toString()
}

/** Robôs e pré-carregamentos não contam como visita nem clique. */
export const ehRobo = (ua: string | null) => !ua || /bot|crawl|spider|slurp|facebookexternalhit|facebookcatalog|whatsapp|telegram|preview|headless|lighthouse|pingdom|uptime|curl|wget|python|axios|node-fetch|go-http/i.test(ua)

/** "https://Site.org/noticias/x/?utm=1#a" → "site.org/noticias/x" — para achar os anúncios que apontam para a página. */
export function enderecoBase(url: string | null): string | null {
  if (!url) return null
  try {
    const u = new URL(url)
    return `${u.hostname.replace(/^www\./, '').toLowerCase()}${u.pathname.replace(/\/+$/, '').toLowerCase()}`
  } catch { return null }
}

/** O texto inicial da matéria: a estrutura de um advertorial que converte, com o botão já no lugar. */
export function modeloDoTexto(botao: string, curso: string | null): string {
  const c = curso?.trim() || 'o curso'
  return [
    '## [Abertura: a história de uma pessoa real — quem é, o que ela vivia]',
    'Comece por uma cena. Uma pessoa, um problema concreto, um momento de virada. Nada de vender aqui.',
    '## [O problema que muita gente tem]',
    'Mostre que a situação é comum e o custo de continuar assim (emprego, segurança do paciente, confiança).',
    '## [O que mudou]',
    `Conte como ${c} entrou na história: o que ela aprendeu, com quem, em quanto tempo.`,
    '> [Uma frase dela entre aspas — a prova mais forte da página]',
    '## [Por que funciona]',
    '- [Prática com instrutor]\n- [Certificado da Cruz Vermelha Brasileira]\n- [Turmas pequenas, perto de você]',
    '## [Como garantir a vaga]',
    'Diga o que acontece ao clicar: preço, parcelas, próxima turma e o que fazer depois.',
    `[Quero garantir minha vaga](${botao})`,
  ].join('\n\n')
}

export type Advertorial = {
  peca: Peca
  titulo: string; subtitulo: string | null; slug: string | null; site_url: string | null; capa: string | null; publicada_em: string | null; status_materia: string | null
}

export type LinhaDoAdvertorial = Advertorial & {
  chave: string
  visitas: number; cliques: number; visitas30: number
  /** Cliques no botão ÷ visitas. */
  taxaDeClique: number | null
  anuncios: number; investimento: number; leadsDosAnuncios: number
  matriculas: number; receita: number
  custoPorVisita: number | null; custoPorMatricula: number | null; retorno: number | null
}

/**
 * A conta de cada advertorial: visitas e cliques (pixel e botão), anúncios
 * que apontam para a página (investimento e contatos), matrículas e receita
 * (Únicopag pelo utm_content). Valores em reais.
 */
export function linhasDosAdvertoriais(
  advs: Advertorial[],
  metricas: { peca_id: string; dia: string; visitas: number; cliques: number }[],
  anuncios: Pick<Peca, 'url' | 'investimento' | 'leads' | 'referencia'>[],
  receitas: { conteudo: string; recebido: number; pagamentos: number }[],
  hoje: string,
): LinhaDoAdvertorial[] {
  const limite30 = new Date(Date.parse(`${hoje}T12:00:00Z`) - 29 * 86_400_000).toISOString().slice(0, 10)
  const porEndereco = new Map<string, { n: number; inv: number; leads: number }>()
  for (const a of anuncios) {
    const e = enderecoBase(a.url)
    if (!e || a.referencia) continue
    const t = porEndereco.get(e) ?? { n: 0, inv: 0, leads: 0 }
    t.n++; t.inv += a.investimento ?? 0; t.leads += a.leads ?? 0
    porEndereco.set(e, t)
  }
  const receita = new Map(receitas.map((r) => [r.conteudo, r]))
  return advs.map((a) => {
    const m = metricas.filter((x) => x.peca_id === a.peca.id)
    const visitas = m.reduce((s, x) => s + x.visitas, 0), cliques = m.reduce((s, x) => s + x.cliques, 0)
    const ads = porEndereco.get(enderecoBase(a.site_url) ?? '—') ?? { n: 0, inv: 0, leads: 0 }
    const chave = chaveDoAdvertorial(a.slug, a.peca.id)
    const r = receita.get(chave)
    const valor = r ? r.recebido / 100 : 0
    const matriculas = r ? r.pagamentos : 0
    return {
      ...a, chave, visitas, cliques, visitas30: m.filter((x) => x.dia >= limite30).reduce((s, x) => s + x.visitas, 0),
      taxaDeClique: visitas > 0 ? cliques / visitas : null,
      anuncios: ads.n, investimento: Math.round(ads.inv * 100) / 100, leadsDosAnuncios: ads.leads,
      matriculas, receita: valor,
      custoPorVisita: ads.inv > 0 && visitas > 0 ? ads.inv / visitas : null,
      custoPorMatricula: ads.inv > 0 && matriculas > 0 ? ads.inv / matriculas : null,
      retorno: ads.inv > 0 ? valor / ads.inv : null,
    }
  })
}

export type OrdemDosAdvertoriais = 'recentes' | 'matriculas' | 'clique' | 'visitas' | 'retorno'
export const ORDENS: Record<OrdemDosAdvertoriais, string> = {
  recentes: 'Mais recentes', matriculas: 'Mais matrículas', clique: 'Maior taxa de clique', visitas: 'Mais visitas', retorno: 'Melhor retorno',
}

export function ordenar(linhas: LinhaDoAdvertorial[], ordem: OrdemDosAdvertoriais): LinhaDoAdvertorial[] {
  const data = (l: LinhaDoAdvertorial) => l.publicada_em ?? l.peca.created_at
  const n = (v: number | null) => v ?? -1
  const r = [...linhas]
  if (ordem === 'matriculas') r.sort((a, b) => b.matriculas - a.matriculas || b.receita - a.receita)
  else if (ordem === 'clique') r.sort((a, b) => n(b.taxaDeClique) - n(a.taxaDeClique) || b.visitas - a.visitas)
  else if (ordem === 'visitas') r.sort((a, b) => b.visitas - a.visitas)
  else if (ordem === 'retorno') r.sort((a, b) => n(b.retorno) - n(a.retorno))
  else r.sort((a, b) => data(b).localeCompare(data(a)))
  return r
}
