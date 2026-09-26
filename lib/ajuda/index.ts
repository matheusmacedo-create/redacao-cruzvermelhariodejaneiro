import { normalizar, type Area, type Grupo } from '../navegacao'
import type { GuiaDaArea, PassoDoTour, TelaDaArea, TopicoGeral } from './tipos'
import { hrefDaAjuda, ondeNaAjuda, type IndiceDaAjuda } from './indice'
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
export { casarCaminho, hrefDaAjuda, ondeNaAjuda, rotuloDoTour, type IndiceDaAjuda, type OndeNaAjuda } from './indice'

export const GUIAS: GuiaDaArea[] = [
  ...meuDia, ...comunicacao, ...planejamento, ...producao, ...relacionamento,
  ...expediente, ...patrimonio, ...financeiro, ...escola, ...pessoas, ...administracao,
]

const POR_HREF = new Map(GUIAS.map((g) => [g.href, g]))

export function guiaDaArea(href: string): GuiaDaArea | null {
  return POR_HREF.get(href) ?? null
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

/**
 * O índice leve (lib/ajuda/indice.ts), montado uma vez a partir do conteúdo.
 * O layout manda para o navegador; o texto fica aqui até alguém pedir.
 */
const INDICE: IndiceDaAjuda = {
  areas: Object.fromEntries(GUIAS.map((g) => [g.href, {
    tour: g.tour.length > 0,
    telas: (g.telas ?? []).map((t) => ({ caminho: t.caminho, rotulo: t.rotulo, tour: t.tour.length > 0 })),
  }])),
  passosDasBoasVindas: { equipe: BOAS_VINDAS.length, escola: BOAS_VINDAS_ESCOLA.length },
}

export function indiceDaAjuda(): IndiceDaAjuda {
  return INDICE
}

/** A ajuda inteira da tela aberta. "Que tela é esta" segue as regras do índice (ondeNaAjuda). */
export function ajudaDoCaminho(pathname: string, grupos: Grupo[]): AjudaDaTela | null {
  const onde = ondeNaAjuda(pathname, grupos, INDICE)
  if (!onde) return null
  const guia = guiaDaArea(onde.area.href)
  const tela = onde.tela ? guia?.telas?.find((t) => t.caminho === onde.tela!.caminho) ?? null : null
  const tour = !onde.chave ? [] : tela ? tela.tour : guia?.tour ?? []
  return { area: onde.area, guia, tela, tour, chave: onde.chave }
}

/** As chaves que o servidor aceita guardar como "tour visto". */
export function ehChaveDeTour(chave: string): boolean {
  const guia = guiaDaArea(chave)
  if (guia) return guia.tour.length > 0
  return GUIAS.some((g) => g.telas?.some((t) => t.caminho === chave && t.tour.length > 0))
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

