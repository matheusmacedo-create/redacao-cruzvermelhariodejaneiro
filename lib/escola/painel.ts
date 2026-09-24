/**
 * As contas do painel da Escola a partir da cópia das transações. Puro.
 *
 * Regime de caixa, como o resto do Financeiro: o que foi RECEBIDO no mês é o
 * que foi pago no mês (paga_em), não o que foi cobrado. As taxas de
 * aprovação olham as cobranças CRIADAS no mês. Valores em centavos.
 */

import { contaComoRecebido, ehMetodo, ehSituacao, type Metodo, type Situacao } from './unicopag'

export type TransacaoDoPainel = {
  conta_id: string; hash: string; metodo: Metodo; status: string; situacao: Situacao; valor: number; parcelas: number | null
  cliente: string | null; documento: string | null; produto: string | null; origem: string | null
  criada_em: string; paga_em: string | null
}

const FUSO = 'America/Sao_Paulo'
const DIA = new Intl.DateTimeFormat('en-CA', { timeZone: FUSO, year: 'numeric', month: '2-digit', day: '2-digit' })

/** "2026-09-30T23:30:00-03:00" → "2026-09-30" (dia de Brasília, não o do UTC). */
export const diaDe = (iso: string) => DIA.format(new Date(iso))
export const mesDe = (iso: string) => diaDe(iso).slice(0, 7)

export const ehMes = (v: unknown): v is string => typeof v === 'string' && /^\d{4}-(0[1-9]|1[0-2])$/.test(v)

export function somarMeses(mes: string, n: number): string {
  const [a, m] = mes.split('-').map(Number)
  const t = a * 12 + (m - 1) + n
  return `${Math.floor(t / 12)}-${String((t % 12) + 1).padStart(2, '0')}`
}

/** Os n meses que terminam em `mes`, do mais antigo ao mais novo. */
export const mesesAte = (mes: string, n: number) => Array.from({ length: n }, (_, i) => somarMeses(mes, i - n + 1))

const NOMES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez']
export const mesCurto = (mes: string) => `${NOMES[Number(mes.slice(5, 7)) - 1]}/${mes.slice(2, 4)}`
export const mesPorExtenso = (mes: string) =>
  `${['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'][Number(mes.slice(5, 7)) - 1]} de ${mes.slice(0, 4)}`

export const reaisDeCentavos = (c: number) => (c / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

const recebidaNoMes = (t: TransacaoDoPainel, mes: string) => contaComoRecebido(t.situacao) && t.paga_em !== null && mesDe(t.paga_em) === mes
const criadaNoMes = (t: TransacaoDoPainel, mes: string) => mesDe(t.criada_em) === mes

export type Fatia = { chave: string; valor: number; quantidade: number }

function agrupar(ts: TransacaoDoPainel[], chave: (t: TransacaoDoPainel) => string): Fatia[] {
  const m = new Map<string, Fatia>()
  for (const t of ts) {
    const k = chave(t)
    const f = m.get(k) ?? { chave: k, valor: 0, quantidade: 0 }
    f.valor += t.valor
    f.quantidade += 1
    m.set(k, f)
  }
  return [...m.values()].sort((a, b) => b.valor - a.valor || a.chave.localeCompare(b.chave, 'pt-BR'))
}

/** As maiores fatias e o resto somado em "Outros" (nunca mais que `max` linhas). */
export function comOutros(fatias: Fatia[], max: number): Fatia[] {
  if (fatias.length <= max) return fatias
  const resto = fatias.slice(max - 1)
  return [...fatias.slice(0, max - 1), { chave: 'Outros', valor: resto.reduce((s, f) => s + f.valor, 0), quantidade: resto.reduce((s, f) => s + f.quantidade, 0) }]
}

export type ResumoDoMes = {
  mes: string
  recebido: number; pagamentos: number; ticketMedio: number
  aguardando: number; cobrancasAbertas: number
  devolvido: number; devolucoes: number
  emDisputa: number
  /** Das cobranças criadas no mês que já têm desfecho, quantas foram pagas (null sem nenhuma). */
  aprovacao: number | null
  porMetodo: Fatia[]; porProduto: Fatia[]; porConta: Fatia[]; porOrigem: Fatia[]
}

export function resumoDoMes(ts: TransacaoDoPainel[], mes: string): ResumoDoMes {
  const pagas = ts.filter((t) => recebidaNoMes(t, mes))
  const criadas = ts.filter((t) => criadaNoMes(t, mes))
  const abertas = criadas.filter((t) => t.situacao === 'pendente')
  // Estorno e chargeback contam no mês em que a cobrança nasceu: a API não dá a data da devolução.
  const devolvidas = criadas.filter((t) => t.situacao === 'estornado' || t.situacao === 'contestado')
  const decididas = criadas.filter((t) => t.situacao !== 'pendente')
  const recebido = pagas.reduce((s, t) => s + t.valor, 0)
  return {
    mes,
    recebido, pagamentos: pagas.length, ticketMedio: pagas.length ? Math.round(recebido / pagas.length) : 0,
    aguardando: abertas.reduce((s, t) => s + t.valor, 0), cobrancasAbertas: abertas.length,
    devolvido: devolvidas.reduce((s, t) => s + t.valor, 0), devolucoes: devolvidas.length,
    emDisputa: ts.filter((t) => t.situacao === 'em_disputa').length,
    aprovacao: decididas.length ? decididas.filter((t) => contaComoRecebido(t.situacao) || t.situacao === 'estornado' || t.situacao === 'contestado').length / decididas.length : null,
    porMetodo: agrupar(pagas, (t) => t.metodo),
    porProduto: agrupar(pagas, (t) => t.produto ?? 'Sem descrição'),
    porConta: agrupar(pagas, (t) => t.conta_id),
    porOrigem: agrupar(pagas, (t) => t.origem ?? 'Direto / sem origem'),
  }
}

export type PontoMensal = { mes: string; recebido: number; porConta: Record<string, number> }

/** Recebido por mês (e por conta), para o gráfico dos últimos meses. */
export function serieMensal(ts: TransacaoDoPainel[], meses: string[]): PontoMensal[] {
  const pontos = new Map(meses.map((m) => [m, { mes: m, recebido: 0, porConta: {} as Record<string, number> }]))
  for (const t of ts) {
    if (!contaComoRecebido(t.situacao) || !t.paga_em) continue
    const p = pontos.get(mesDe(t.paga_em))
    if (!p) continue
    p.recebido += t.valor
    p.porConta[t.conta_id] = (p.porConta[t.conta_id] ?? 0) + t.valor
  }
  return meses.map((m) => pontos.get(m)!)
}

/** Variação contra o mês anterior, em fração (0,25 = +25%); null se o anterior foi zero. */
export const variacao = (atual: number, anterior: number) => (anterior > 0 ? (atual - anterior) / anterior : null)

export type FiltroDeTransacoes = { conta?: string; situacao?: Situacao | ''; metodo?: Metodo | ''; q?: string }

const semAcento = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()

export function filtrarTransacoes(ts: TransacaoDoPainel[], f: FiltroDeTransacoes): TransacaoDoPainel[] {
  const q = semAcento((f.q ?? '').trim())
  return ts.filter((t) =>
    (!f.conta || t.conta_id === f.conta) &&
    (!f.situacao || t.situacao === f.situacao) &&
    (!f.metodo || t.metodo === f.metodo) &&
    (!q || semAcento([t.cliente, t.produto, t.hash, t.origem, t.documento].filter(Boolean).join(' ')).includes(q)))
}

/** As transações de um mês: criadas nele ou pagas nele (uma cobrança de agosto paga em setembro aparece nos dois). */
export const transacoesDoMes = (ts: TransacaoDoPainel[], mes: string) => ts.filter((t) => criadaNoMes(t, mes) || (t.paga_em !== null && mesDe(t.paga_em) === mes))

/** Lê os filtros da URL da tela de transações (e do CSV). */
export function lerFiltro(p: Record<string, string | undefined>, hoje: string): FiltroDeTransacoes & { mes: string } {
  return {
    mes: ehMes(p.mes) && p.mes <= hoje ? p.mes : hoje,
    conta: p.conta && /^[0-9a-f-]{36}$/.test(p.conta) ? p.conta : '',
    situacao: ehSituacao(p.situacao) ? p.situacao : '',
    metodo: ehMetodo(p.metodo) ? p.metodo : '',
    q: (p.q ?? '').slice(0, 80),
  }
}
