/**
 * Compras, sem banco nem rede — dá para conferir com tsx.
 *
 * O caminho, inspirado no manual de compras da Cruz Vermelha (IFRC) e no
 * ciclo do ERPNext: pedido → cotação (propostas dos fornecedores e o mapa
 * comparativo) → aprovação → ordem de compra → recebimento → conta a pagar.
 *
 * Nomes: "Orçamento" no Financeiro é a verba planejada por categoria. O preço
 * que o fornecedor manda é a PROPOSTA; o conjunto delas, a COTAÇÃO.
 *
 * Faixas (editáveis em Financeiro → Cadastros): até o limite simples, basta
 * uma proposta; acima dele, o mínimo de propostas; acima do limite da
 * Diretoria, também a aprovação dela. Menos propostas que o exigido, ou a
 * escolha de uma que não é a mais barata, pedem justificativa escrita.
 */

export type EstadoDoPedido = 'aberto' | 'em_cotacao' | 'em_aprovacao' | 'aprovado' | 'recusado' | 'cancelado'

export const ESTADOS: Record<EstadoDoPedido, { rotulo: string; tom: 'neutro' | 'aviso' | 'ok' | 'erro' }> = {
  aberto: { rotulo: 'Aguardando cotação', tom: 'neutro' },
  em_cotacao: { rotulo: 'Em cotação', tom: 'aviso' },
  em_aprovacao: { rotulo: 'Em aprovação', tom: 'aviso' },
  aprovado: { rotulo: 'Aprovado', tom: 'ok' },
  recusado: { rotulo: 'Recusado', tom: 'erro' },
  cancelado: { rotulo: 'Cancelado', tom: 'neutro' },
}

export type RegrasDeCompra = { limite_simples: number; limite_diretoria: number; cotacoes_minimas: number }
export const REGRAS_PADRAO: RegrasDeCompra = { limite_simples: 1000, limite_diretoria: 10000, cotacoes_minimas: 3 }

export type ItemDoPedido = { id: string; descricao: string; especificacao: string | null; quantidade: number; unidade: string; valor_estimado_unit: number | null; ordem: number }
export type PrecoDaProposta = { item_id: string; valor_unitario: number | null }
export type Proposta = { id: string; favorecido_id: string; frete: number; precos: PrecoDaProposta[] }

/** "PC-2026-0007". */
export const numeroDoPedido = (ano: number, numero: number) => `PC-${ano}-${String(numero).padStart(4, '0')}`

const centavos = (n: number) => Math.round(n * 100)
const reaisDe = (c: number) => c / 100

/** O total de uma linha, arredondado ao centavo como no banco. */
export const totalDaLinha = (quantidade: number, unitario: number) => reaisDe(Math.round(quantidade * unitario * 100))

/** O valor estimado do pedido (só as linhas que têm estimativa). */
export function totalEstimado(itens: Pick<ItemDoPedido, 'quantidade' | 'valor_estimado_unit'>[]): number {
  return reaisDe(itens.reduce((s, i) => s + (i.valor_estimado_unit ? centavos(totalDaLinha(i.quantidade, i.valor_estimado_unit)) : 0), 0))
}

/** Uma proposta cota o pedido inteiro quando tem preço para todos os itens. */
export function cotaTudo(itens: Pick<ItemDoPedido, 'id'>[], p: Pick<Proposta, 'precos'>): boolean {
  const preco = new Map(p.precos.map((x) => [x.item_id, x.valor_unitario]))
  return itens.length > 0 && itens.every((i) => (preco.get(i.id) ?? null) !== null)
}

/** O total da proposta: itens cotados + frete. Proposta que não cota tudo tem total parcial. */
export function totalDaProposta(itens: Pick<ItemDoPedido, 'id' | 'quantidade'>[], p: Pick<Proposta, 'precos' | 'frete'>): number {
  const preco = new Map(p.precos.map((x) => [x.item_id, x.valor_unitario]))
  const linhas = itens.reduce((s, i) => {
    const u = preco.get(i.id)
    return s + (u === null || u === undefined ? 0 : centavos(totalDaLinha(i.quantidade, u)))
  }, 0)
  return reaisDe(linhas + centavos(p.frete || 0))
}

/** O que as faixas exigem para este valor. */
export function exigencias(total: number, r: RegrasDeCompra): { propostas: number; diretoria: boolean; faixa: 'simples' | 'cotacao' | 'diretoria' } {
  if (total > r.limite_diretoria) return { propostas: r.cotacoes_minimas, diretoria: true, faixa: 'diretoria' }
  if (total > r.limite_simples) return { propostas: r.cotacoes_minimas, diretoria: false, faixa: 'cotacao' }
  return { propostas: 1, diretoria: false, faixa: 'simples' }
}

export type Mapa = {
  /** Por item: o menor preço unitário e quem o deu (empate: todos). */
  menorPorItem: Map<string, { valor: number; propostas: string[] }>
  /** Total de cada proposta e se ela cota o pedido inteiro. */
  totais: Map<string, { total: number; completa: boolean }>
  /** A proposta completa mais barata (empate: a primeira). */
  maisBarata: string | null
  /** Quantas propostas cotam o pedido inteiro — é o que conta para o mínimo. */
  completas: number
}

/** O mapa comparativo das propostas (a "Comparative Bid Analysis" do manual da Cruz Vermelha). */
export function mapaComparativo(itens: Pick<ItemDoPedido, 'id' | 'quantidade'>[], propostas: Proposta[]): Mapa {
  const menorPorItem = new Map<string, { valor: number; propostas: string[] }>()
  for (const i of itens) {
    for (const p of propostas) {
      const u = p.precos.find((x) => x.item_id === i.id)?.valor_unitario
      if (u === null || u === undefined) continue
      const atual = menorPorItem.get(i.id)
      if (!atual || u < atual.valor) menorPorItem.set(i.id, { valor: u, propostas: [p.id] })
      else if (u === atual.valor) atual.propostas.push(p.id)
    }
  }
  const totais = new Map(propostas.map((p) => [p.id, { total: totalDaProposta(itens, p), completa: cotaTudo(itens, p) }]))
  let maisBarata: string | null = null
  for (const p of propostas) {
    const t = totais.get(p.id)!
    if (t.completa && (maisBarata === null || t.total < totais.get(maisBarata)!.total)) maisBarata = p.id
  }
  return { menorPorItem, totais, maisBarata, completas: [...totais.values()].filter((t) => t.completa).length }
}

/**
 * Antes de mandar para aprovação: o que falta, o que precisa de justificativa.
 * O banco confere a mesma coisa (compras_enviar_para_aprovacao); aqui é para a tela avisar antes.
 */
export function conferirEscolha(itens: Pick<ItemDoPedido, 'id' | 'quantidade'>[], propostas: Proposta[], escolhida: string | null, r: RegrasDeCompra): {
  total: number; exige: ReturnType<typeof exigencias>; faltamPropostas: number; naoEhAMaisBarata: boolean; precisaJustificar: boolean; erro: string | null
} {
  const mapa = mapaComparativo(itens, propostas)
  const t = escolhida ? mapa.totais.get(escolhida) : undefined
  const total = t?.total ?? 0
  const exige = exigencias(total, r)
  const faltamPropostas = Math.max(0, exige.propostas - mapa.completas)
  const naoEhAMaisBarata = Boolean(escolhida && mapa.maisBarata && escolhida !== mapa.maisBarata && total > (mapa.totais.get(mapa.maisBarata)?.total ?? 0))
  const erro = !itens.length ? 'O pedido não tem itens.'
    : !escolhida || !t ? 'Escolha a proposta vencedora.'
      : !t.completa ? 'A proposta escolhida não tem preço para todos os itens.'
        : null
  return { total, exige, faltamPropostas, naoEhAMaisBarata, precisaJustificar: faltamPropostas > 0 || naoEhAMaisBarata, erro }
}

/** Quem ainda falta aprovar (a Diretoria só entra acima do limite dela). */
export function aprovacoesQueFaltam(p: { exige_diretoria: boolean; aprovado_fin_em: string | null; aprovado_dir_em: string | null }): ('financeiro' | 'diretoria')[] {
  return [...(p.aprovado_fin_em ? [] : ['financeiro' as const]), ...(p.exige_diretoria && !p.aprovado_dir_em ? ['diretoria' as const] : [])]
}

/** Lê número que veio do formulário ("1.234,56", "1234.56", "12"). */
export function lerValor(bruto: unknown): number | null {
  if (typeof bruto === 'number') return Number.isFinite(bruto) ? bruto : null
  const t = String(bruto ?? '').trim().replace(/\s|R\$/g, '')
  if (!t) return null
  const normal = t.includes(',') ? t.replace(/\./g, '').replace(',', '.') : t
  const n = Number(normal)
  return Number.isFinite(n) ? n : null
}
