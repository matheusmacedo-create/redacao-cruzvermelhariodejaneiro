/**
 * Regras do quadro de pautas — puras, para servir à tela e ao servidor e
 * poder ser testadas sem banco.
 */

export const COLUNAS = [
  { status: 'incoming', rotulo: 'Entrada' },
  { status: 'collection', rotulo: 'Coleta' },
  { status: 'production', rotulo: 'Produção' },
  { status: 'review', rotulo: 'Revisão' },
  { status: 'approval', rotulo: 'Aprovação' },
  { status: 'approved', rotulo: 'Pronto' },
] as const

export type StatusDoQuadro = (typeof COLUNAS)[number]['status']

/** Onde dá para criar cartão direto: aprovação tem fluxo próprio, e "pronto" é resultado. */
export const COLUNAS_COM_CRIACAO: readonly StatusDoQuadro[] = ['incoming', 'collection', 'production', 'review']

export const PASSO = 1024

/**
 * A posição de um cartão solto entre dois vizinhos (null = ponta da coluna).
 * Média dos vizinhos: uma escrita só, sem renumerar a coluna.
 */
export function posicaoEntre(antes: number | null, depois: number | null): number {
  if (antes === null && depois === null) return PASSO
  if (antes === null) return (depois as number) - PASSO
  if (depois === null) return antes + PASSO
  return (antes + depois) / 2
}

/** Ordem da coluna: posição crescente; sem posição (recém-criado fora do quadro) vai para o topo. */
export function ordenar<T extends { posicao: number | null; criadaEm: string }>(itens: T[]): T[] {
  return [...itens].sort((a, b) => {
    if (a.posicao === null && b.posicao === null) return b.criadaEm.localeCompare(a.criadaEm)
    if (a.posicao === null) return -1
    if (b.posicao === null) return 1
    return a.posicao - b.posicao
  })
}

export type SituacaoDoPrazo = 'atrasada' | 'hoje' | 'semana' | 'futura' | 'sem'

/** Prazo em "AAAA-MM-DD" contra a data de hoje, também "AAAA-MM-DD" (fuso de quem vê). */
export function situacaoDoPrazo(prazo: string | null, hoje: string, concluida = false): SituacaoDoPrazo {
  if (!prazo) return 'sem'
  if (concluida) return 'futura'
  if (prazo < hoje) return 'atrasada'
  if (prazo === hoje) return 'hoje'
  const dias = (Date.parse(`${prazo}T12:00:00Z`) - Date.parse(`${hoje}T12:00:00Z`)) / 86_400_000
  return dias <= 7 ? 'semana' : 'futura'
}

export const PRIORIDADES = [
  { id: 'critical', rotulo: 'Crítica' },
  { id: 'high', rotulo: 'Alta' },
  { id: 'medium', rotulo: 'Normal' },
  { id: 'low', rotulo: 'Baixa' },
] as const

/**
 * A paleta das etiquetas. Fechada de propósito: cada cor foi conferida para
 * texto branco passar de 4,5:1 de contraste. A etiqueta sempre leva o nome
 * escrito — a cor ajuda a achar, não é a única informação.
 */
export const CORES_DE_ETIQUETA = {
  verde: { rotulo: 'Verde', hex: '#1f7a4d' },
  lima: { rotulo: 'Lima', hex: '#4c6b1f' },
  amarelo: { rotulo: 'Amarelo', hex: '#8a6500' },
  laranja: { rotulo: 'Laranja', hex: '#b54a00' },
  vermelho: { rotulo: 'Vermelho', hex: '#c42b1c' },
  rosa: { rotulo: 'Rosa', hex: '#a8327a' },
  roxo: { rotulo: 'Roxo', hex: '#6247b8' },
  azul: { rotulo: 'Azul', hex: '#1f5fbf' },
  ceu: { rotulo: 'Céu', hex: '#1b6f8a' },
  cinza: { rotulo: 'Cinza', hex: '#5b6577' },
} as const

export type CorDeEtiqueta = keyof typeof CORES_DE_ETIQUETA

export const ehCorDeEtiqueta = (c: string): c is CorDeEtiqueta => Object.prototype.hasOwnProperty.call(CORES_DE_ETIQUETA, c)
