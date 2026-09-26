import { areaDoCaminho, type Area, type Grupo } from '../navegacao'

/**
 * O índice leve da ajuda: que área tem guia, que tela tem tour e o nome de
 * cada tela — sem o texto. É o que o navegador precisa em toda página (a dica
 * de primeira visita, o ?tour=1, o rótulo do balão); o texto inteiro
 * (lib/ajuda, ~140 KB comprimidos) só é baixado quando alguém abre o painel,
 * um tour ou busca uma dúvida (components/app/ajuda/carregar.ts).
 *
 * O índice é montado no servidor a partir do conteúdo (indiceDaAjuda() em
 * lib/ajuda) e chega ao navegador como prop do layout. As regras de "que tela
 * é esta" moram só aqui, e ajudaDoCaminho() usa as mesmas: o índice e o texto
 * não têm como discordar.
 *
 * Módulo puro, conferido com script (npx tsx). Não importe lib/ajuda daqui.
 */

export type TelaNoIndice = { caminho: string; rotulo: string; tour: boolean }

export type IndiceDaAjuda = {
  /** Por href de área: se tem tour na raiz e as telas internas que a ajuda conhece. */
  areas: Record<string, { tour: boolean; telas: TelaNoIndice[] }>
  /** Quantos balões têm as boas-vindas (a janela promete o tempo do tour). */
  passosDasBoasVindas: { equipe: number; escola: number }
}

/** '/pautas/[id]' casa com '/pautas/abc'; '[...x]' casa com o resto do caminho. */
export function casarCaminho(padrao: string, pathname: string): boolean {
  const partes = padrao.split('/').filter(Boolean)
  const reais = pathname.split('/').filter(Boolean)
  for (let i = 0; i < partes.length; i++) {
    const parte = partes[i]
    if (/^\[\.\.\..+\]$/.test(parte)) return reais.length > i
    if (i >= reais.length) return false
    if (/^\[.+\]$/.test(parte)) continue
    if (parte !== reais[i]) return false
  }
  return partes.length === reais.length
}

/** Estático vence dinâmico: '/financeiro/compras/novo' antes de '/financeiro/compras/[id]'. */
function especificidade(padrao: string): number {
  return padrao.split('/').filter((p) => p && !p.startsWith('[')).length
}

export type OndeNaAjuda = {
  area: Area
  /** A área tem guia escrito (passo a passo, perguntas). */
  temGuia: boolean
  /** A tela interna que a ajuda conhece, quando a pessoa está numa. */
  tela: { caminho: string; rotulo: string } | null
  /** A chave do tour que vale aqui; null quando esta tela não tem tour. */
  chave: string | null
}

export function ondeNaAjuda(pathname: string, grupos: Grupo[], indice: IndiceDaAjuda): OndeNaAjuda | null {
  const achado = areaDoCaminho(pathname, grupos)
  if (!achado) return null
  const info = indice.areas[achado.area.href]
  const tela = info?.telas
    .filter((t) => casarCaminho(t.caminho, pathname))
    .sort((a, b) => especificidade(b.caminho) - especificidade(a.caminho))[0] ?? null
  // Na raiz da área vale o tour da área; numa tela interna sem tour próprio, nenhum
  // (o tour da lista apontaria para o que não está na tela).
  const naRaiz = pathname === achado.area.href
  const temTour = tela ? tela.tour : naRaiz && Boolean(info?.tour)
  return {
    area: achado.area,
    temGuia: Boolean(info),
    tela: tela && { caminho: tela.caminho, rotulo: tela.rotulo },
    chave: temTour ? (tela?.caminho ?? achado.area.href) : null,
  }
}

/** "Tour · Pautas", "Tour · Pauta": o rótulo pequeno acima do título do balão. */
export function rotuloDoTour(onde: { area: { rotulo: string }; tela: { rotulo: string } | null }): string {
  return `Tour · ${onde.tela?.rotulo ?? onde.area.rotulo}`
}

/** O endereço de uma área na Central de ajuda (/ajuda/pautas, /ajuda/escola/vendas#id). */
export function hrefDaAjuda(areaHref: string, ancora?: string): string {
  return `/ajuda${areaHref}${ancora ? `#${ancora}` : ''}`
}
