/**
 * Regras do Patrimônio, sem banco nem rede — dá para conferir com tsx.
 */

export const NIVEIS = {
  ver: { valor: 1, rotulo: 'Ver', descricao: 'Bens, com quem estão, manutenções e histórico.' },
  operar: { valor: 2, rotulo: 'Operar', descricao: 'Cadastrar e editar bens, entregar e receber, registrar manutenção, conferir no inventário.' },
  gestao: { valor: 3, rotulo: 'Gestão', descricao: 'Tudo acima, mais categorias, locais, baixa de bens e abrir/concluir inventário.' },
} as const
export type NomeDoNivel = keyof typeof NIVEIS
export type Nivel = 0 | 1 | 2 | 3
export const nivelDoNome = (n: string | null | undefined): Nivel => (n && Object.hasOwn(NIVEIS, n) ? NIVEIS[n as NomeDoNivel].valor : 0) as Nivel
export const ehNomeDoNivel = (n: unknown): n is NomeDoNivel => typeof n === 'string' && Object.hasOwn(NIVEIS, n)

export const SITUACOES = {
  em_uso: { rotulo: 'Em uso', classe: 'bg-success/15 text-success' },
  reserva: { rotulo: 'Reserva', classe: 'bg-muted text-muted-foreground' },
  em_manutencao: { rotulo: 'Em manutenção', classe: 'bg-warning/20 text-warning-foreground' },
  baixado: { rotulo: 'Baixado', classe: 'bg-destructive/10 text-destructive' },
} as const
export type Situacao = keyof typeof SITUACOES

export const ESTADOS = { novo: 'Novo', bom: 'Bom', regular: 'Regular', ruim: 'Ruim', inservivel: 'Inservível' } as const
export type Estado = keyof typeof ESTADOS
export const ehEstado = (e: unknown): e is Estado => typeof e === 'string' && Object.hasOwn(ESTADOS, e)

export const ORIGENS = { compra: 'Compra', doacao: 'Doação', comodato: 'Comodato (emprestado à filial)', outro: 'Outra' } as const
export type Origem = keyof typeof ORIGENS

export const DESTINOS_DE_BAIXA = {
  descarte: 'Descarte', doacao: 'Doado', venda: 'Vendido', furto_perda: 'Furto ou perda', sinistro: 'Sinistro (acidente, incêndio)',
  devolucao_financiador: 'Devolvido ao financiador', outro: 'Outro',
} as const
export type DestinoDeBaixa = keyof typeof DESTINOS_DE_BAIXA
export const ehDestinoDeBaixa = (d: unknown): d is DestinoDeBaixa => typeof d === 'string' && Object.hasOwn(DESTINOS_DE_BAIXA, d)

export const TIPOS_DE_MANUTENCAO = { preventiva: 'Preventiva', corretiva: 'Corretiva (conserto)', calibracao: 'Calibração', inspecao: 'Inspeção' } as const
export type TipoDeManutencao = keyof typeof TIPOS_DE_MANUTENCAO
export const ehTipoDeManutencao = (t: unknown): t is TipoDeManutencao => typeof t === 'string' && Object.hasOwn(TIPOS_DE_MANUTENCAO, t)

/** O endereço que vai no QR da etiqueta. */
export const caminhoDoQr = (plaqueta: string) => `/patrimonio/p/${encodeURIComponent(plaqueta)}`

// ---------------------------------------------------------------- depreciação

export type BemParaDepreciar = { valor: number | null; aquisicao_em: string | null; vida_util_meses: number | null; residual_pct: number; baixado_em: string | null; origem?: string }

/** Meses entre dois "AAAA-MM" (b − a). */
function mesesEntre(a: string, b: string): number {
  return (Number(b.slice(0, 4)) - Number(a.slice(0, 4))) * 12 + Number(b.slice(5, 7)) - Number(a.slice(5, 7))
}

/**
 * Depreciação linear (a de uso geral no Brasil): o valor depreciável
 * (valor − residual) dividido pela vida útil, a partir do mês seguinte à
 * aquisição, até a vida útil acabar ou o mês anterior à baixa. Em centavos:
 * o último mês acerta a diferença, e o total nunca passa do depreciável.
 */
export function depreciacao(b: BemParaDepreciar, ateMes: string): { mensal: number; noMes: number; acumulada: number; contabil: number; meses: number; terminou: boolean } | null {
  if (b.valor === null || !b.aquisicao_em || !b.vida_util_meses || b.origem === 'comodato') return null
  const vida = b.vida_util_meses
  const valor = Math.round(b.valor * 100)
  const deprec = Math.round(valor * (1 - b.residual_pct / 100))
  const mensal = Math.floor(deprec / vida)
  const inicio = b.aquisicao_em.slice(0, 7)
  const limiteBaixa = b.baixado_em ? mesesEntre(inicio, b.baixado_em.slice(0, 7)) - 1 : Infinity
  const meses = Math.max(0, Math.min(vida, mesesEntre(inicio, ateMes), limiteBaixa))
  const acumuladaDe = (n: number) => (n >= vida ? deprec : mensal * n)
  const acumulada = acumuladaDe(meses)
  const anterior = acumuladaDe(Math.max(0, Math.min(vida, mesesEntre(inicio, ateMes) - 1, limiteBaixa)))
  return {
    mensal: mensal / 100, noMes: (acumulada - anterior) / 100, acumulada: acumulada / 100, contabil: (valor - acumulada) / 100,
    meses, terminou: meses >= vida,
  }
}

// ---------------------------------------------------------------- manutenção

export function situacaoDaManutencao(prevista: string | null, realizada: string | null, hoje: string): 'feita' | 'vencida' | 'proxima' | 'agendada' {
  if (realizada) return 'feita'
  if (!prevista) return 'agendada'
  if (prevista < hoje) return 'vencida'
  const dias = Math.round((Date.parse(`${prevista}T12:00:00Z`) - Date.parse(`${hoje}T12:00:00Z`)) / 86_400_000)
  return dias <= 30 ? 'proxima' : 'agendada'
}

// ---------------------------------------------------------------- formulário

const ehData = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(`${s}T12:00:00Z`))

/** "R$ 1.234,56" → 1234.56. Vazio → null. Inválido → NaN. */
export function lerValor(texto: string): number | null {
  let s = String(texto ?? '').replace(/[R$\s]/g, '')
  if (!s) return null
  if (s.includes(',')) s = s.replace(/\./g, '').replace(',', '.')
  else if (/^\d{1,3}(\.\d{3})+$/.test(s)) s = s.replace(/\./g, '')
  if (!/^\d+(\.\d{1,2})?$/.test(s)) return Number.NaN
  return Math.round(Number(s) * 100) / 100
}

export function lerBem(f: FormData, hoje: string): { dados: Record<string, string | number | null> | null; erros: string[] } {
  const erros: string[] = []
  const t = (k: string, max = 200) => String(f.get(k) ?? '').trim().slice(0, max)
  const nome = t('nome', 160)
  if (nome.length < 2) erros.push('Dê um nome ao bem (ex.: "Desfibrilador Philips HS1").')
  const categoria_id = t('categoria_id', 40)
  if (!/^[0-9a-f-]{36}$/.test(categoria_id)) erros.push('Escolha a categoria.')
  const aquisicao_em = t('aquisicao_em', 10)
  if (aquisicao_em && (!ehData(aquisicao_em) || aquisicao_em > hoje)) erros.push('Data de aquisição inválida.')
  const garantia_ate = t('garantia_ate', 10)
  if (garantia_ate && !ehData(garantia_ate)) erros.push('Data de garantia inválida.')
  const valor = lerValor(t('valor', 30))
  if (valor !== null && Number.isNaN(valor)) erros.push('Valor inválido.')
  const origem = t('origem', 20) || 'compra'
  if (!Object.hasOwn(ORIGENS, origem)) erros.push('Origem inválida.')
  if (origem === 'doacao' && valor === null) erros.push('Bem doado entra pelo valor de mercado (ITG 2002): informe o valor.')
  const estado = t('estado', 20) || 'bom'
  if (!ehEstado(estado)) erros.push('Estado inválido.')
  const situacao = t('situacao', 20) || 'em_uso'
  if (!['em_uso', 'reserva', 'em_manutencao'].includes(situacao)) erros.push('Situação inválida.')
  const manut = t('manutencao_meses', 4)
  if (manut && (!/^\d+$/.test(manut) || Number(manut) < 1 || Number(manut) > 120)) erros.push('Periodicidade de manutenção: de 1 a 120 meses.')
  if (erros.length) return { dados: null, erros }
  return {
    dados: {
      nome, categoria_id, descricao: t('descricao', 2000), local_id: t('local_id', 40), marca: t('marca', 80), modelo: t('modelo', 80),
      numero_serie: t('numero_serie', 80), plaqueta_antiga: t('plaqueta_antiga', 40), situacao, estado, origem, aquisicao_em, valor,
      fornecedor: t('fornecedor', 160), nota_fiscal: t('nota_fiscal', 80), fonte_id: t('fonte_id', 40), projeto_id: t('projeto_id', 40),
      lancamento_id: t('lancamento_id', 40), garantia_ate, manutencao_meses: manut ? Number(manut) : null, observacao: t('observacao', 2000),
    },
    erros,
  }
}
