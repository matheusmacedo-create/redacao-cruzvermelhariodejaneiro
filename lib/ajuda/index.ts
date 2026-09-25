import { areaDoCaminho, normalizar, type Area, type Grupo } from '../navegacao'
import type { GuiaDaArea, PassoDoTour, TelaDaArea, TopicoGeral } from './tipos'
import { guias as administracao } from './conteudo/administracao'
import { guias as comunicacao } from './conteudo/comunicacao'
import { guias as escola } from './conteudo/escola'
import { guias as expediente } from './conteudo/expediente'
import { guias as financeiro } from './conteudo/financeiro'
import { BOAS_VINDAS, BOAS_VINDAS_ESCOLA, TOPICOS_GERAIS } from './conteudo/geral'
import { guias as meuDia } from './conteudo/meu-dia'
import { guias as patrimonio } from './conteudo/patrimonio'
import { guias as pessoas } from './conteudo/pessoas'
import { guias as planejamento } from './conteudo/planejamento'
import { guias as producao } from './conteudo/producao'
import { guias as relacionamento } from './conteudo/relacionamento'

/**
 * O registro da ajuda: junta o conteúdo de cada grupo e responde "que ajuda
 * vale nesta tela". A chave de tudo é o `href` da área em lib/navegacao.ts —
 * a mesma fonte do menu, da busca e das migalhas —, então a ajuda some junto
 * com a área para quem não pode abri-la.
 *
 * Módulo puro (sem banco), conferido com script (npx tsx).
 */

export type { GuiaDaArea, PassoDoTour, Pergunta, Tarefa, TelaDaArea, TopicoGeral } from './tipos'
export { BOAS_VINDAS, BOAS_VINDAS_ESCOLA, TOPICOS_GERAIS }

export const GUIAS: GuiaDaArea[] = [
  ...meuDia, ...comunicacao, ...planejamento, ...producao, ...relacionamento,
  ...expediente, ...patrimonio, ...financeiro, ...escola, ...pessoas, ...administracao,
]

const POR_HREF = new Map(GUIAS.map((g) => [g.href, g]))

export function guiaDaArea(href: string): GuiaDaArea | null {
  return POR_HREF.get(href) ?? null
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

export type AjudaDaTela = {
  area: Area
  guia: GuiaDaArea | null
  /** A tela interna com tour próprio, quando a pessoa está numa. */
  tela: TelaDaArea | null
  /** O tour que vale aqui (o da tela interna, se houver; senão o da área na raiz dela). */
  tour: PassoDoTour[]
  /** A chave com que o tour é lembrado como visto. */
  chave: string | null
}

export function ajudaDoCaminho(pathname: string, grupos: Grupo[]): AjudaDaTela | null {
  const achado = areaDoCaminho(pathname, grupos)
  if (!achado) return null
  const guia = guiaDaArea(achado.area.href)
  const tela = guia?.telas
    ?.filter((t) => casarCaminho(t.caminho, pathname))
    .sort((a, b) => especificidade(b.caminho) - especificidade(a.caminho))[0] ?? null
  // Na raiz da área vale o tour da área; numa tela interna sem tour próprio, nenhum
  // (o tour da lista apontaria para o que não está na tela).
  const naRaiz = pathname === achado.area.href
  const tour = tela ? tela.tour : naRaiz ? guia?.tour ?? [] : []
  return { area: achado.area, guia, tela, tour, chave: tour.length ? (tela?.caminho ?? achado.area.href) : null }
}

/** As chaves que o servidor aceita guardar como "tour visto". */
export function ehChaveDeTour(chave: string): boolean {
  const guia = guiaDaArea(chave)
  if (guia) return guia.tour.length > 0
  return GUIAS.some((g) => g.telas?.some((t) => t.caminho === chave && t.tour.length > 0))
}

/** O endereço de uma área na Central de ajuda (/ajuda/pautas, /ajuda/escola/vendas#id). */
export function hrefDaAjuda(areaHref: string, ancora?: string): string {
  return `/ajuda${areaHref}${ancora ? `#${ancora}` : ''}`
}

/** As áreas que a pessoa pode abrir e que têm ajuda escrita, na ordem do menu. */
export function guiasVisiveis(grupos: Grupo[]): { grupo: Grupo; area: Area; guia: GuiaDaArea }[] {
  return grupos.flatMap((grupo) => grupo.areas.flatMap((area) => {
    const guia = guiaDaArea(area.href)
    return guia ? [{ grupo, area, guia }] : []
  }))
}

export type Achado = {
  tipo: 'pergunta' | 'tarefa'
  titulo: string
  trecho: string
  /** Nome da área ou do tópico geral. */
  onde: string
  /** Link para a resposta na Central de ajuda. */
  href: string
}

/**
 * Busca por palavras nas perguntas e nas tarefas das áreas visíveis e nos
 * tópicos gerais. Todas as palavras precisam aparecer; o título casando vem
 * antes de quem só casou pela resposta.
 */
export function buscarNaAjuda(busca: string, grupos: Grupo[], limite = 20): Achado[] {
  const palavras = normalizar(busca).split(/\s+/).filter((p) => p.length > 1)
  if (!palavras.length) return []
  const candidatos: (Achado & { titulo_: string; corpo: string })[] = []
  for (const { area, guia } of guiasVisiveis(grupos)) {
    for (const p of guia.perguntas) candidatos.push({ tipo: 'pergunta', titulo: p.pergunta, trecho: p.resposta, onde: area.rotulo, href: hrefDaAjuda(area.href, p.id), titulo_: normalizar(p.pergunta), corpo: normalizar([p.resposta, ...(p.termos ?? []), area.rotulo].join(' ')) })
    for (const t of guia.tarefas) candidatos.push({ tipo: 'tarefa', titulo: t.titulo, trecho: t.passos.join(' '), onde: area.rotulo, href: hrefDaAjuda(area.href, t.id), titulo_: normalizar(t.titulo), corpo: normalizar([...t.passos, t.dica ?? '', area.rotulo].join(' ')) })
  }
  for (const topico of TOPICOS_GERAIS) {
    for (const p of topico.perguntas) candidatos.push({ tipo: 'pergunta', titulo: p.pergunta, trecho: p.resposta, onde: topico.titulo, href: `/ajuda#${p.id}`, titulo_: normalizar(p.pergunta), corpo: normalizar([p.resposta, ...(p.termos ?? []), topico.titulo].join(' ')) })
    for (const t of topico.tarefas) candidatos.push({ tipo: 'tarefa', titulo: t.titulo, trecho: t.passos.join(' '), onde: topico.titulo, href: `/ajuda#${t.id}`, titulo_: normalizar(t.titulo), corpo: normalizar([...t.passos, t.dica ?? '', topico.titulo].join(' ')) })
  }
  return candidatos
    .map((c, ordem) => {
      const tudo = `${c.titulo_} ${c.corpo}`
      if (!palavras.every((p) => tudo.includes(p))) return null
      const noTitulo = palavras.filter((p) => c.titulo_.includes(p)).length
      return { c, pontos: noTitulo === palavras.length ? 0 : noTitulo > 0 ? 1 : 2, ordem }
    })
    .filter((x): x is NonNullable<typeof x> => x !== null)
    .sort((a, b) => a.pontos - b.pontos || a.ordem - b.ordem)
    .slice(0, limite)
    .map(({ c }) => ({ tipo: c.tipo, titulo: c.titulo, trecho: c.trecho, onde: c.onde, href: c.href }))
}

/** Todos os alvos citados nos tours (para o script de conferência achar alvo sem elemento). */
export function alvosCitados(): { alvo: string; onde: string }[] {
  const tours: { onde: string; passos: PassoDoTour[] }[] = [
    { onde: 'boas-vindas', passos: BOAS_VINDAS },
    { onde: 'boas-vindas da escola', passos: BOAS_VINDAS_ESCOLA },
    ...GUIAS.flatMap((g) => [{ onde: g.href, passos: g.tour }, ...(g.telas ?? []).map((t) => ({ onde: t.caminho, passos: t.tour }))]),
  ]
  return tours.flatMap(({ onde, passos }) => passos.flatMap((p) => (p.alvo ? [{ alvo: p.alvo, onde }] : [])))
}

