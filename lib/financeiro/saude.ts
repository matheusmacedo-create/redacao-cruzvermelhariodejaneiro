/**
 * Saúde do caixa: os números que respondem "estamos bem?" para uma
 * entidade sem fins lucrativos. Puro — dá para conferir com tsx.
 *
 *  - Caixa LIVRE separado do caixa COM DESTINO: dinheiro de convênio no
 *    banco não paga a luz. O fôlego conta só o livre.
 *  - Fôlego: quantos meses o caixa livre paga as despesas fixas (média dos
 *    últimos três meses completos), contra a reserva mínima definida.
 *  - Previsão de 90 dias: o saldo livre dia a dia com o que está agendado
 *    (atrasado conta como se fosse pago hoje).
 *  - Orçamento: previsto x realizado do mês, por competência.
 *  - Fontes com destino: quanto falta receber, quanto sobra e quando acaba
 *    a vigência (sobra no fim do convênio costuma ter de ser devolvida).
 *  - Concentração: quanto das receitas do ano vem de uma origem só.
 */

import { somarDias } from './avisos'
import { primeiroDia, somar, ultimoDia, mesAnterior, mesDe, reais, type Lancamento } from './regras'

export type FonteDaSaude = { id: string; nome: string; restrita: boolean; financiador: string | null; fim: string | null; valor_previsto: number | null; ativa: boolean }
export type CategoriaDaSaude = { id: string; nome: string; tipo: 'despesa' | 'receita'; fixa: boolean }
export type Orcamento = { categoria_id: string; valor_mensal: number }

const valorEfetivo = (l: Pick<Lancamento, 'valor' | 'valor_pago' | 'pago_em'>) => (l.pago_em ? (l.valor_pago ?? l.valor) : l.valor)
const noMes = (d: string | null, mes: string) => Boolean(d && d >= primeiroDia(mes) && d <= ultimoDia(mes))

/** Os `n` meses completos antes do mês de `hoje` ("2026-06", "2026-07", "2026-08"). */
export function mesesCompletos(hoje: string, n = 3): string[] {
  const r: string[] = []
  let m = mesAnterior(mesDe(hoje))
  for (let i = 0; i < n; i++) { r.unshift(m); m = mesAnterior(m) }
  return r
}

/** Média mensal das despesas fixas pagas com dinheiro livre nos meses dados. */
export function despesaFixaMedia(lancamentos: Lancamento[], meses: string[], fixas: Set<string>, livres: Set<string>): number {
  const total = somar(lancamentos.filter((l) => l.tipo === 'despesa' && l.pago_em && l.categoria_id && fixas.has(l.categoria_id) && livres.has(l.fonte_id)
    && meses.some((m) => noMes(l.pago_em, m))).map(valorEfetivo))
  return meses.length ? Math.round((total / meses.length) * 100) / 100 : 0
}

/** Resultado médio (entradas − saídas) do dinheiro livre nos meses dados. */
export function resultadoMedio(lancamentos: Lancamento[], meses: string[], livres: Set<string>): number {
  const doPeriodo = lancamentos.filter((l) => l.pago_em && livres.has(l.fonte_id) && meses.some((m) => noMes(l.pago_em, m)))
  const r = somar(doPeriodo.filter((l) => l.tipo === 'receita').map(valorEfetivo)) - somar(doPeriodo.filter((l) => l.tipo === 'despesa').map(valorEfetivo))
  return meses.length ? Math.round((r / meses.length) * 100) / 100 : 0
}

export type Ponto = { data: string; livre: number; total: number }

/**
 * O saldo previsto dia a dia. `abertos` = o que não foi pago nem recusado;
 * o atrasado entra no primeiro dia (como se fosse pago hoje). Transferência
 * não muda o total nem o livre.
 */
export function previsao(p: { hoje: string; dias: number; livreHoje: number; totalHoje: number; abertos: Lancamento[]; livres: Set<string> }): Ponto[] {
  const porDia = new Map<string, { livre: number; total: number }>()
  for (const l of p.abertos) {
    if (l.pago_em || l.aprovacao === 'recusada' || l.tipo === 'transferencia') continue
    const dia = l.vencimento < p.hoje ? p.hoje : l.vencimento
    const s = (l.tipo === 'receita' ? 1 : -1) * Math.round(l.valor * 100)
    const atual = porDia.get(dia) ?? { livre: 0, total: 0 }
    atual.total += s
    if (p.livres.has(l.fonte_id)) atual.livre += s
    porDia.set(dia, atual)
  }
  const pontos: Ponto[] = []
  let livre = Math.round(p.livreHoje * 100)
  let total = Math.round(p.totalHoje * 100)
  for (let i = 0; i <= p.dias; i++) {
    const data = somarDias(p.hoje, i)
    const d = porDia.get(data)
    if (d) { livre += d.livre; total += d.total }
    pontos.push({ data, livre: livre / 100, total: total / 100 })
  }
  return pontos
}

export type LinhaDeOrcamento = { categoria_id: string; nome: string; orcado: number; realizado: number; pct: number }

/** Previsto x realizado do mês (competência; pago vale o valor pago). */
export function orcamentoDoMes(mes: string, orcamentos: Orcamento[], categorias: CategoriaDaSaude[], lancamentos: Lancamento[]): LinhaDeOrcamento[] {
  const nome = new Map(categorias.map((c) => [c.id, c.nome]))
  return orcamentos.map((o) => {
    const realizado = somar(lancamentos.filter((l) => l.categoria_id === o.categoria_id && noMes(l.competencia, mes) && l.aprovacao !== 'recusada').map(valorEfetivo))
    return { categoria_id: o.categoria_id, nome: nome.get(o.categoria_id) ?? '—', orcado: o.valor_mensal, realizado, pct: o.valor_mensal ? Math.round((realizado / o.valor_mensal) * 100) : 0 }
  }).sort((a, b) => b.pct - a.pct)
}

export type SituacaoDaFonte = { id: string; nome: string; financiador: string | null; saldo: number; recebido: number; previsto: number | null; aReceber: number | null; fim: string | null; diasParaAcabar: number | null }

export function fontesComDestino(fontes: FonteDaSaude[], saldos: Map<string, number>, lancamentos: Lancamento[], hoje: string): SituacaoDaFonte[] {
  return fontes.filter((f) => f.restrita && (f.ativa || (saldos.get(f.id) ?? 0) !== 0)).map((f) => {
    const recebido = somar(lancamentos.filter((l) => l.fonte_id === f.id && l.tipo === 'receita' && l.pago_em).map(valorEfetivo))
    const dias = f.fim ? Math.round((Date.parse(`${f.fim}T12:00:00Z`) - Date.parse(`${hoje}T12:00:00Z`)) / 86_400_000) : null
    return {
      id: f.id, nome: f.nome, financiador: f.financiador, saldo: saldos.get(f.id) ?? 0, recebido, previsto: f.valor_previsto,
      aReceber: f.valor_previsto !== null ? Math.max(0, Math.round((f.valor_previsto - recebido) * 100) / 100) : null, fim: f.fim, diasParaAcabar: dias,
    }
  })
}

/** De onde veio o dinheiro nos últimos 12 meses (por favorecido; sem favorecido, pela categoria). */
export function origensDasReceitas(lancamentos: Lancamento[], hoje: string, nomes: { favorecido: Map<string, string>; categoria: Map<string, string> }): { nome: string; valor: number; pct: number }[] {
  const desde = somarDias(hoje, -365)
  const recebidas = lancamentos.filter((l) => l.tipo === 'receita' && l.pago_em && l.pago_em > desde && l.pago_em <= hoje)
  const total = somar(recebidas.map(valorEfetivo))
  if (!total) return []
  const por = new Map<string, number>()
  for (const l of recebidas) {
    const chave = (l.favorecido_id && nomes.favorecido.get(l.favorecido_id)) || (l.categoria_id && nomes.categoria.get(l.categoria_id)) || 'Outras'
    por.set(chave, (por.get(chave) ?? 0) + Math.round(valorEfetivo(l) * 100))
  }
  return [...por].map(([nome, c]) => ({ nome, valor: c / 100, pct: Math.round((c / 100 / total) * 1000) / 10 })).sort((a, b) => b.valor - a.valor)
}

export type Alerta = { nivel: 'critico' | 'atencao'; texto: string; link?: string }

export function alertas(p: {
  hoje: string; folego: number | null; reserva: number; pontos: Ponto[]; orcamento: LinhaDeOrcamento[]; fontes: SituacaoDaFonte[]
  aPagarAtrasado: { n: number; valor: number }; aReceberAtrasado: { n: number; valor: number }; origens: { nome: string; pct: number }[]; livreHoje: number
}): Alerta[] {
  const r: Alerta[] = []
  if (p.livreHoje < 0) r.push({ nivel: 'critico', texto: `O caixa livre está negativo (${reais(p.livreHoje)}): dinheiro com destino pode estar pagando despesa da casa.` })
  const negativo = p.pontos.find((x) => x.livre < 0)
  if (negativo && p.livreHoje >= 0) r.push({ nivel: 'critico', texto: `Pela previsão, o caixa livre fica negativo em ${negativo.data.slice(8, 10)}/${negativo.data.slice(5, 7)}.`, link: '/financeiro' })
  if (p.folego !== null && p.folego < p.reserva) {
    r.push({ nivel: p.folego < p.reserva / 2 ? 'critico' : 'atencao', texto: `Fôlego de ${p.folego.toLocaleString('pt-BR', { maximumFractionDigits: 1 })} ${p.folego === 1 ? 'mês' : 'meses'}, abaixo da reserva mínima de ${p.reserva.toLocaleString('pt-BR')}.` })
  }
  if (p.aPagarAtrasado.n) r.push({ nivel: 'critico', texto: `${p.aPagarAtrasado.n} ${p.aPagarAtrasado.n === 1 ? 'conta atrasada' : 'contas atrasadas'} (${reais(p.aPagarAtrasado.valor)}).`, link: '/financeiro' })
  if (p.aReceberAtrasado.n) r.push({ nivel: 'atencao', texto: `${reais(p.aReceberAtrasado.valor)} a receber já vencido (${p.aReceberAtrasado.n}).`, link: '/financeiro?aba=receber' })
  for (const o of p.orcamento.filter((x) => x.pct > 100)) r.push({ nivel: o.pct >= 130 ? 'critico' : 'atencao', texto: `${o.nome}: ${o.pct}% do orçado no mês (${reais(o.realizado)} de ${reais(o.orcado)}).` })
  for (const f of p.fontes) {
    if (f.diasParaAcabar !== null && f.diasParaAcabar >= 0 && f.diasParaAcabar <= 60 && f.saldo > 0) {
      r.push({ nivel: f.diasParaAcabar <= 30 ? 'critico' : 'atencao', texto: `${f.nome} acaba em ${f.diasParaAcabar} dias com ${reais(f.saldo)} sem uso — sobra de convênio costuma ter de ser devolvida.` })
    }
    if (f.saldo < 0) r.push({ nivel: 'critico', texto: `${f.nome} está com saldo negativo (${reais(f.saldo)}): gastou-se mais do que entrou nessa fonte.` })
  }
  const maior = p.origens[0]
  if (maior && maior.pct >= 50 && p.origens.length > 1) r.push({ nivel: 'atencao', texto: `${maior.pct.toLocaleString('pt-BR')}% das receitas dos últimos 12 meses vieram de ${maior.nome}: dependência alta de uma origem só.` })
  return r.sort((a, b) => (a.nivel === b.nivel ? 0 : a.nivel === 'critico' ? -1 : 1))
}

