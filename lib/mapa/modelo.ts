/**
 * Mapa do ecossistema — o modelo puro (docs/mapa-do-ecossistema.md).
 *
 * Recebe as linhas das tabelas `mapa_itens` e `mapa_pendencias` e monta a
 * árvore que a tela navega: raiz → sistema → categoria → item, com os
 * agregados de cada nó (quantos itens em cada estado, quantas pendências
 * abertas, progresso). Nada aqui toca o DOM nem o banco: é conferido por
 * `npx tsx scripts/conferir-mapa.ts`.
 */

export const SISTEMAS = ['palacio', 'site', 'escola'] as const
export type Sistema = (typeof SISTEMAS)[number]

export const ESTADOS = [
  'no ar', 'feito, falta publicar ou configurar', 'em andamento', 'fora do ar por decisão', 'proposta (só documento)',
] as const
export type Estado = (typeof ESTADOS)[number]

/** O estado como a tela o chama. Os cinco são os mesmos do levantamento, só com nome técnico. */
export type Situacao = 'live' | 'pending' | 'development' | 'disabled' | 'idea'
export const SITUACAO_DO_ESTADO: Record<Estado, Situacao> = {
  'no ar': 'live',
  'feito, falta publicar ou configurar': 'pending',
  'em andamento': 'development',
  'fora do ar por decisão': 'disabled',
  'proposta (só documento)': 'idea',
}
export const ESTADO_DA_SITUACAO: Record<Situacao, Estado> = {
  live: 'no ar', pending: 'feito, falta publicar ou configurar', development: 'em andamento', disabled: 'fora do ar por decisão', idea: 'proposta (só documento)',
}
export const ORDEM_DAS_SITUACOES: Situacao[] = ['live', 'pending', 'development', 'disabled', 'idea']
export const ROTULO_DA_SITUACAO: Record<Situacao, string> = {
  live: 'No ar', pending: 'Feito, falta ligar', development: 'Em andamento', disabled: 'Fora do ar por decisão', idea: 'Só proposta',
}
export const NOME_DO_SISTEMA: Record<Sistema, { nome: string; curto: string }> = {
  palacio: { nome: 'Palácio Virtual', curto: 'Palácio' },
  site: { nome: 'Site institucional', curto: 'Site' },
  escola: { nome: 'Plataforma da Escola', curto: 'Escola' },
}

export const SITUACOES_DA_PENDENCIA = ['pendente', 'parcial', 'feito'] as const
export type SituacaoDaPendencia = (typeof SITUACOES_DA_PENDENCIA)[number]
export const TIPOS_DE_PENDENCIA = ['decisao', 'configuracao', 'codigo', 'terceiro', 'ideia'] as const
export type TipoDePendencia = (typeof TIPOS_DE_PENDENCIA)[number]
export const ROTULO_DO_TIPO: Record<TipoDePendencia, string> = {
  decisao: 'Você decide', configuracao: 'Ligar num painel', codigo: 'Programar', terceiro: 'Depende de outros', ideia: 'Ideia para um dia',
}

export type Entrega = { data: string; titulo: string; detalhe?: string }

/** Uma linha de `mapa_itens`. */
export type ItemDoMapa = {
  id: string
  parent_id: string | null
  tipo: 'sistema' | 'categoria' | 'item'
  sistema: Sistema
  nome: string
  descricao: string
  estado: Estado | null
  estado_detalhe: string
  url: string | null
  entregas: Entrega[]
  ordem: number
  atualizado_em?: string | null
}

/** Uma linha de `mapa_pendencias`. */
export type PendenciaDoMapa = {
  id: string
  item_id: string | null
  sistema: Sistema
  titulo: string
  detalhe: string
  tipo: TipoDePendencia
  quem: string
  esforco: string
  prioridade: string
  area: string
  por_que: string
  bloqueia: string
  primeiro_passo: string
  fonte: string
  o_que_falta: string
  situacao: SituacaoDaPendencia
  ordem_fila: number | null
  resolvida_em: string | null
  nota: string
}

export type Contagens = Record<Situacao, number>

export type No = {
  id: string
  name: string
  type: 'root' | 'system' | 'category' | 'item'
  parentId: string | null
  system: Sistema | null
  status: Situacao | null
  estado: Estado | null
  statusDetail: string
  description: string
  url: string | null
  entregas: Entrega[]
  updatedAt: string | null
  /** Pendências ligadas direto a este nó (só o item; o sistema recebe as sem área). */
  pendencias: PendenciaDoMapa[]
  children: No[]
  // agregados
  counts: Contagens
  total: number
  /** Pendências abertas (pendente ou parcial) neste nó e abaixo. */
  pend: number
  /** Pendências já resolvidas neste nó e abaixo. */
  feitas: number
}

const contagensVazias = (): Contagens => ({ live: 0, pending: 0, development: 0, disabled: 0, idea: 0 })

const TIPO_DO_NO = { sistema: 'system', categoria: 'category', item: 'item' } as const

/** Monta a árvore a partir das linhas. Itens sem pai conhecido ficam de fora (e são devolvidos em `orfaos`). */
export function montarArvore(itens: ItemDoMapa[], pendencias: PendenciaDoMapa[]): { raiz: No; porId: Map<string, No>; orfaos: string[] } {
  const porId = new Map<string, No>()
  const raiz: No = {
    id: 'inicio', name: 'Cruz Vermelha Brasileira do Rio de Janeiro', type: 'root', parentId: null, system: null, status: null, estado: null,
    statusDetail: '', description: '', url: null, entregas: [], updatedAt: null, pendencias: [], children: [], counts: contagensVazias(), total: 0, pend: 0, feitas: 0,
  }
  porId.set(raiz.id, raiz)
  const ordenados = [...itens].sort((a, b) => a.ordem - b.ordem || a.nome.localeCompare(b.nome, 'pt-BR'))
  for (const it of ordenados) {
    porId.set(it.id, {
      id: it.id, name: it.nome, type: TIPO_DO_NO[it.tipo], parentId: it.tipo === 'sistema' ? 'inicio' : it.parent_id, system: it.sistema,
      status: it.estado ? SITUACAO_DO_ESTADO[it.estado] : null, estado: it.estado, statusDetail: it.estado_detalhe ?? '', description: it.descricao ?? '',
      url: it.url, entregas: Array.isArray(it.entregas) ? it.entregas : [], updatedAt: null, pendencias: [], children: [], counts: contagensVazias(), total: 0, pend: 0, feitas: 0,
    })
  }
  const orfaos: string[] = []
  for (const it of ordenados) {
    const no = porId.get(it.id)!
    const pai = no.parentId ? porId.get(no.parentId) : null
    if (!pai) { orfaos.push(it.id); continue }
    pai.children.push(no)
  }
  for (const p of pendencias) {
    const alvo = (p.item_id && porId.get(p.item_id)) || porId.get(p.sistema)
    if (alvo) alvo.pendencias.push(p)
  }
  agregar(raiz)
  return { raiz, porId, orfaos }
}

function agregar(n: No): No {
  const abertas = n.pendencias.filter((p) => p.situacao !== 'feito').length
  const feitas = n.pendencias.length - abertas
  if (n.type === 'item') {
    n.counts = contagensVazias()
    if (n.status) n.counts[n.status] = 1
    n.total = 1
    n.pend = abertas
    n.feitas = feitas
    n.updatedAt = n.entregas.map((e) => e.data).sort().pop() ?? null
    return n
  }
  n.counts = contagensVazias(); n.total = 0; n.pend = abertas; n.feitas = feitas
  for (const f of n.children) {
    agregar(f)
    for (const k of ORDEM_DAS_SITUACOES) n.counts[k] += f.counts[k]
    n.total += f.total; n.pend += f.pend; n.feitas += f.feitas
  }
  n.updatedAt = n.children.map((f) => f.updatedAt).filter((d): d is string => Boolean(d)).sort().pop() ?? null
  return n
}

/** Percentual de itens no ar, de 0 a 100. */
export const percentualNoAr = (n: Pick<No, 'counts' | 'total'>): number => (n.total ? Math.round((100 * n.counts.live) / n.total) : 0)

/** O caminho da raiz até o nó. */
export function caminho(n: No, porId: Map<string, No>): No[] {
  const c: No[] = []
  let x: No | undefined = n
  while (x) { c.unshift(x); x = x.parentId ? porId.get(x.parentId) : undefined }
  return c
}

/** Slug no padrão dos ids do mapa (sem acento, minúsculas, hífens). */
export function slugDoMapa(texto: string): string {
  return texto.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
}

/** A fila de próximos passos: pendências abertas com posição, em ordem. */
export function filaDeProximos(pendencias: PendenciaDoMapa[]): PendenciaDoMapa[] {
  return pendencias.filter((p) => p.situacao !== 'feito' && p.ordem_fila !== null).sort((a, b) => (a.ordem_fila ?? 0) - (b.ordem_fila ?? 0))
}
