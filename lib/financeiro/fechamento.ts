/**
 * Fechamento do mês: o resumo (o "retrato" guardado ao fechar) e a
 * conferência (o que impede e o que é só aviso). Puro — dá para conferir com
 * tsx; quem busca os dados é lib/financeiro/fechamento-servidor.ts.
 */

import { efeitoNaConta, nomeDoMes, primeiroDia, somar, ultimoDia, type Lancamento } from './regras'
import { somarDias } from './avisos'
import { depreciacao } from '@/lib/patrimonio/regras'

export type ContaDoMes = { id: string; nome: string; tipo: string; fonte_id: string | null; saldo_inicial: number; saldo_inicial_em: string; ativa: boolean }
export type FonteDoMes = { id: string; nome: string; restrita: boolean }
export type CategoriaDoMes = { id: string; nome: string; tipo: 'despesa' | 'receita'; grupo: string | null; codigo_contabil: string | null }
export type LinhaDoExtratoDoMes = { conta_id: string; data: string; situacao: string; lancamento_id: string | null }
export type SaldoDoBanco = { conta_id: string; saldo: number; em: string }

export type Resumo = {
  mes: string
  caixa: { entradas: number; saidas: number; resultado: number }
  porCategoria: { id: string; nome: string; grupo: string | null; codigo: string | null; tipo: 'despesa' | 'receita'; caixa: number; competencia: number }[]
  porConta: { id: string; nome: string; inicio: number; entradas: number; saidas: number; fim: number; banco: { saldo: number; em: string; redacao: number } | null }[]
  porFonte: { id: string; nome: string; restrita: boolean; inicio: number; entradas: number; saidas: number; fim: number }[]
  voluntariado: { horas: number; pessoas: number; valorHora: number | null; valor: number | null }
  /** Do Patrimônio: depreciação do mês e bens recebidos em doação (valor de mercado). */
  patrimonio?: ResumoDoPatrimonio
  /** Do Estoque de materiais: movimento do mês pelo custo médio. */
  estoque?: ResumoDoEstoque
}

/** Uma linha de financeiro_estoque_do_mes (valores já com sinal: consumo e perdas positivos = saíram). */
export type LinhaDoEstoque = {
  codigo: string; nome: string; categoria: string; conta_contabil: string | null; unidade: string
  qtd_inicio: number; valor_inicio: number; compras: number; doacoes: number; outras_entradas: number; consumo: number; perdas: number; ajustes: number
  kits: number; qtd_fim: number; valor_fim: number
}
export type ResumoDoEstoque = {
  valorInicio: number; compras: number; doacoes: number; outrasEntradas: number; consumo: number; perdas: number; ajustes: number; valorFim: number
  linhas: LinhaDoEstoque[]
}

/**
 * O estoque no mês: saldo inicial + entradas − consumo − perdas ± ajustes =
 * saldo final. Montagem de kit só troca componente por kit (soma zero no
 * total). Itens sem saldo nem movimento no mês ficam de fora.
 */
export function resumoDoEstoque(linhas: LinhaDoEstoque[]): ResumoDoEstoque | undefined {
  const com = linhas.filter((l) => l.valor_inicio || l.qtd_inicio || l.compras || l.doacoes || l.outras_entradas || l.consumo || l.perdas || l.ajustes || l.kits || l.qtd_fim || l.valor_fim)
  if (!com.length) return undefined
  const soma = (f: (l: LinhaDoEstoque) => number) => Math.round(com.reduce((s, l) => s + Math.round(f(l) * 100), 0)) / 100
  return {
    valorInicio: soma((l) => l.valor_inicio), compras: soma((l) => l.compras), doacoes: soma((l) => l.doacoes), outrasEntradas: soma((l) => l.outras_entradas),
    consumo: soma((l) => l.consumo), perdas: soma((l) => l.perdas), ajustes: soma((l) => l.ajustes), valorFim: soma((l) => l.valor_fim),
    linhas: com,
  }
}

export type BemDoFechamento = {
  id: string; plaqueta: string; nome: string; categoria: string; conta_contabil: string | null; origem: string; aquisicao_em: string | null
  valor: number | null; vida_util_meses: number | null; residual_pct: number; baixado_em: string | null
}
export type ResumoDoPatrimonio = {
  bens: number; valor: number; depreciacaoDoMes: number; acumulada: number; contabil: number
  doadosNoMes: { plaqueta: string; nome: string; valor: number }[]; baixadosNoMes: { plaqueta: string; nome: string; contabil: number }[]
  linhas: { plaqueta: string; nome: string; categoria: string; conta: string | null; origem: string; aquisicao: string | null; valor: number; noMes: number; acumulada: number; contabil: number; baixado: string | null }[]
}

/** A depreciação do mês por bem e no total, e as entradas e saídas de bens do mês. */
export function resumoDoPatrimonio(bens: BemDoFechamento[], mes: string): ResumoDoPatrimonio {
  const linhas: ResumoDoPatrimonio['linhas'] = []
  const noMesDe = (d: string | null) => Boolean(d && d.slice(0, 7) === mes)
  for (const b of bens) {
    if (b.aquisicao_em && b.aquisicao_em.slice(0, 7) > mes) continue
    if (b.baixado_em && b.baixado_em.slice(0, 7) < mes) continue
    const d = depreciacao({ valor: b.valor, aquisicao_em: b.aquisicao_em, vida_util_meses: b.vida_util_meses, residual_pct: b.residual_pct, baixado_em: b.baixado_em, origem: b.origem }, mes)
    const valor = b.valor ?? 0
    linhas.push({ plaqueta: b.plaqueta, nome: b.nome, categoria: b.categoria, conta: b.conta_contabil, origem: b.origem, aquisicao: b.aquisicao_em, valor,
      noMes: d?.noMes ?? 0, acumulada: d?.acumulada ?? 0, contabil: d?.contabil ?? valor, baixado: b.baixado_em })
  }
  const ativos = linhas.filter((l) => !l.baixado || noMesDe(l.baixado))
  const soma = (f: (l: (typeof linhas)[number]) => number) => Math.round(ativos.reduce((s, l) => s + Math.round(f(l) * 100), 0)) / 100
  return {
    bens: ativos.filter((l) => !l.baixado).length, valor: soma((l) => (l.baixado ? 0 : l.valor)), depreciacaoDoMes: soma((l) => l.noMes),
    acumulada: soma((l) => (l.baixado ? 0 : l.acumulada)), contabil: soma((l) => (l.baixado ? 0 : l.contabil)),
    doadosNoMes: bens.filter((b) => b.origem === 'doacao' && noMesDe(b.aquisicao_em)).map((b) => ({ plaqueta: b.plaqueta, nome: b.nome, valor: b.valor ?? 0 })),
    baixadosNoMes: linhas.filter((l) => noMesDe(l.baixado)).map((l) => ({ plaqueta: l.plaqueta, nome: l.nome, contabil: l.contabil })),
    linhas,
  }
}

const c = (n: number) => Math.round(n * 100)
const noMes = (d: string | null, mes: string) => Boolean(d && d >= primeiroDia(mes) && d <= ultimoDia(mes))
const pago = (l: Pick<Lancamento, 'valor' | 'valor_pago'>) => l.valor_pago ?? l.valor

/** Saldo de uma conta no fim do dia `ate` (saldo inicial vale a partir da própria data). */
function saldoDaConta(conta: ContaDoMes, lancamentos: Lancamento[], ate: string): number {
  if (conta.saldo_inicial_em > ate) return 0
  let t = c(conta.saldo_inicial)
  for (const l of lancamentos) if (l.pago_em && l.pago_em >= conta.saldo_inicial_em && l.pago_em <= ate) t += efeitoNaConta(l, conta.id)
  return t / 100
}

/**
 * Saldo de cada fonte no fim de `ate`: o saldo inicial das contas (na fonte
 * padrão da conta; sem fonte padrão, na livre) mais o que entrou e saiu com
 * aquela fonte. Transferência não muda o saldo da fonte.
 */
export function saldosPorFonte(contas: ContaDoMes[], lancamentos: Lancamento[], ate: string, livreId: string): Map<string, number> {
  const r = new Map<string, number>()
  const inicioDe = new Map(contas.map((k) => [k.id, k.saldo_inicial_em]))
  const soma = (fonte: string, v: number) => r.set(fonte, (r.get(fonte) ?? 0) + v)
  for (const k of contas) if (k.saldo_inicial_em <= ate) soma(k.fonte_id ?? livreId, c(k.saldo_inicial))
  for (const l of lancamentos) {
    if (!l.pago_em || l.pago_em > ate || l.tipo === 'transferencia') continue
    if (l.pago_em < (inicioDe.get(l.conta_id) ?? '0000')) continue
    soma(l.fonte_id, (l.tipo === 'receita' ? 1 : -1) * c(pago(l)))
  }
  for (const [k, v] of r) r.set(k, v / 100)
  return r
}

/**
 * O resumo do mês. `lancamentos` precisa ter tudo o que foi pago até o fim do
 * mês (para os saldos) e tudo da competência do mês (para o regime de
 * competência).
 */
export function resumoDoMes(p: {
  mes: string; contas: ContaDoMes[]; fontes: FonteDoMes[]; categorias: CategoriaDoMes[]; lancamentos: Lancamento[]
  saldosDoBanco: SaldoDoBanco[]; horas: { horas: number; pessoas: number }; valorHora: number | null
}): Resumo {
  const { mes } = p
  const fim = ultimoDia(mes)
  const vespera = somarDias(primeiroDia(mes), -1)
  const pagosNoMes = p.lancamentos.filter((l) => noMes(l.pago_em, mes))
  const entradas = somar(pagosNoMes.filter((l) => l.tipo === 'receita').map(pago))
  const saidas = somar(pagosNoMes.filter((l) => l.tipo === 'despesa').map(pago))

  const porCategoria = p.categorias.map((k) => ({
    id: k.id, nome: k.nome, grupo: k.grupo, codigo: k.codigo_contabil, tipo: k.tipo,
    caixa: somar(pagosNoMes.filter((l) => l.categoria_id === k.id).map(pago)),
    competencia: somar(p.lancamentos.filter((l) => l.categoria_id === k.id && noMes(l.competencia, mes) && l.aprovacao !== 'recusada').map((l) => (l.pago_em ? pago(l) : l.valor))),
  })).filter((k) => k.caixa || k.competencia)

  const porConta = p.contas.filter((k) => k.ativa || pagosNoMes.some((l) => l.conta_id === k.id || l.conta_destino_id === k.id)).map((k) => {
    const efeitos = pagosNoMes.map((l) => efeitoNaConta(l, k.id))
    const banco = p.saldosDoBanco.filter((s) => s.conta_id === k.id && s.em <= fim && s.em >= primeiroDia(mes)).sort((a, b) => b.em.localeCompare(a.em))[0]
    return {
      id: k.id, nome: k.nome, inicio: saldoDaConta(k, p.lancamentos, vespera),
      entradas: efeitos.filter((e) => e > 0).reduce((s, e) => s + e, 0) / 100, saidas: -efeitos.filter((e) => e < 0).reduce((s, e) => s + e, 0) / 100,
      fim: saldoDaConta(k, p.lancamentos, fim),
      // O saldo do OFX é do dia em que o arquivo foi gerado: compara naquele dia.
      banco: banco ? { saldo: banco.saldo, em: banco.em, redacao: saldoDaConta(k, p.lancamentos, banco.em) } : null,
    }
  })

  const livre = p.fontes.find((f) => !f.restrita)?.id ?? ''
  const antes = saldosPorFonte(p.contas, p.lancamentos, vespera, livre)
  const depois = saldosPorFonte(p.contas, p.lancamentos, fim, livre)
  const porFonte = p.fontes.map((f) => ({
    id: f.id, nome: f.nome, restrita: f.restrita, inicio: antes.get(f.id) ?? 0, fim: depois.get(f.id) ?? 0,
    entradas: somar(pagosNoMes.filter((l) => l.fonte_id === f.id && l.tipo === 'receita').map(pago)),
    saidas: somar(pagosNoMes.filter((l) => l.fonte_id === f.id && l.tipo === 'despesa').map(pago)),
  })).filter((f) => f.inicio || f.fim || f.entradas || f.saidas)

  const valor = p.valorHora !== null ? Math.round(p.horas.horas * p.valorHora * 100) / 100 : null
  return {
    mes, caixa: { entradas, saidas, resultado: Math.round((entradas - saidas) * 100) / 100 },
    porCategoria, porConta, porFonte, voluntariado: { horas: p.horas.horas, pessoas: p.horas.pessoas, valorHora: p.valorHora, valor },
  }
}

export type Item = { id: string; rotulo: string; ok: boolean; bloqueia: boolean; detalhe?: string; link?: string }

/**
 * O que conferir antes de fechar. `bloqueia` = o banco também recusa
 * (ordem, mês acabado, extrato por conciliar); o resto é aviso aceito por
 * escrito.
 */
export function conferencia(p: {
  mes: string; hoje: string; fechadoAte: string | null; resumo: Resumo; contas: ContaDoMes[]; lancamentos: Lancamento[]
  extrato: LinhaDoExtratoDoMes[]; comComprovante: Set<string>
}): Item[] {
  const { mes } = p
  const fim = ultimoDia(mes)
  const itens: Item[] = []
  const proximo = p.fechadoAte ? somarDias(p.fechadoAte, 1).slice(0, 7) : null
  itens.push({
    id: 'ordem', bloqueia: true, ok: !proximo || proximo === mes,
    rotulo: 'Os meses fecham em ordem', detalhe: proximo && proximo !== mes ? `O próximo a fechar é ${nomeDoMes(proximo)}.` : undefined,
  })
  const podeEm = somarDias(fim, 1)
  itens.push({ id: 'acabou', bloqueia: true, ok: fim < p.hoje, rotulo: 'O mês já acabou', detalhe: fim < p.hoje ? undefined : `Dá para fechar a partir de ${podeEm.slice(8, 10)}/${podeEm.slice(5, 7)}.` })
  const pendentes = p.extrato.filter((e) => e.situacao === 'pendente' && noMes(e.data, mes))
  itens.push({
    id: 'extrato', bloqueia: true, ok: !pendentes.length, rotulo: 'Extrato do mês todo conciliado',
    detalhe: pendentes.length ? `${pendentes.length} ${pendentes.length === 1 ? 'linha' : 'linhas'} por conciliar.` : undefined, link: '/financeiro/conciliacao',
  })
  const pagosNoMes = p.lancamentos.filter((l) => noMes(l.pago_em, mes))
  const contasComExtrato = new Set(p.extrato.filter((e) => noMes(e.data, mes)).map((e) => e.conta_id))
  const semExtrato = p.contas.filter((k) => k.tipo !== 'caixa' && !contasComExtrato.has(k.id) && pagosNoMes.some((l) => l.conta_id === k.id || l.conta_destino_id === k.id))
  itens.push({
    id: 'extrato_importado', bloqueia: false, ok: !semExtrato.length, rotulo: 'Extrato importado de cada conta com movimento',
    detalhe: semExtrato.length ? `Sem extrato do mês: ${semExtrato.map((k) => k.nome).join(', ')}.` : undefined, link: '/financeiro/conciliacao',
  })
  const conciliados = new Set(p.extrato.filter((e) => e.lancamento_id).map((e) => e.lancamento_id))
  const naoConciliados = pagosNoMes.filter((l) => contasComExtrato.has(l.conta_id) && l.tipo !== 'transferencia' && !conciliados.has(l.id))
  itens.push({
    id: 'conciliados', bloqueia: false, ok: !naoConciliados.length, rotulo: 'Todo pagamento do mês aparece no extrato',
    detalhe: naoConciliados.length ? `${naoConciliados.length} pago${naoConciliados.length === 1 ? '' : 's'} no Palácio Virtual sem linha no extrato: ${naoConciliados.slice(0, 3).map((l) => l.descricao).join(', ')}${naoConciliados.length > 3 ? '…' : ''}` : undefined,
  })
  const semComprovante = pagosNoMes.filter((l) => l.tipo !== 'transferencia' && !p.comComprovante.has(l.id))
  itens.push({
    id: 'comprovantes', bloqueia: false, ok: !semComprovante.length, rotulo: 'Todo pagamento e recebimento com comprovante',
    detalhe: semComprovante.length ? `${semComprovante.length} sem comprovante: ${semComprovante.slice(0, 3).map((l) => l.descricao).join(', ')}${semComprovante.length > 3 ? '…' : ''}` : undefined,
    link: '/financeiro?aba=mes',
  })
  const vencidas = p.lancamentos.filter((l) => l.tipo === 'despesa' && !l.pago_em && l.aprovacao !== 'recusada' && noMes(l.vencimento, mes))
  itens.push({
    id: 'em_aberto', bloqueia: false, ok: !vencidas.length, rotulo: 'Nenhuma conta do mês ficou sem pagar',
    detalhe: vencidas.length ? `${vencidas.length} vencida${vencidas.length === 1 ? '' : 's'} no mês e em aberto (seguem para o mês seguinte).` : undefined, link: '/financeiro',
  })
  const bancoDiferente = p.resumo.porConta.filter((k) => k.banco && Math.abs(k.banco.saldo - k.banco.redacao) >= 0.01)
  itens.push({
    id: 'saldo', bloqueia: false, ok: !bancoDiferente.length, rotulo: 'Saldo bate com o do banco',
    detalhe: bancoDiferente.length
      ? bancoDiferente.map((k) => `${k.nome} em ${k.banco!.em.slice(8, 10)}/${k.banco!.em.slice(5, 7)}: banco ${k.banco!.saldo.toFixed(2).replace('.', ',')}, Palácio Virtual ${k.banco!.redacao.toFixed(2).replace('.', ',')}`).join('; ')
      : p.resumo.porConta.some((k) => k.banco) ? undefined : 'Sem saldo de banco no mês (vem do OFX) para comparar.',
  })
  const v = p.resumo.voluntariado
  itens.push({
    id: 'voluntariado', bloqueia: false, ok: !v.horas || v.valorHora !== null, rotulo: 'Valor da hora voluntária definido (ITG 2002)',
    detalhe: v.horas && v.valorHora === null ? `${v.horas} horas no mês sem valor de referência.` : undefined,
  })
  return itens
}

// ---------------------------------------------------------------- planilhas

/** CSV para o Excel brasileiro: ";" e vírgula decimal; número vai como número, texto é protegido contra fórmula. */
export function csv(cabecalho: string[], linhas: (string | number | null | undefined)[][]): string {
  const celula = (v: string | number | null | undefined) => {
    if (typeof v === 'number') return v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2, useGrouping: false })
    let s = v === null || v === undefined ? '' : String(v)
    if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`
    return /[";\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
  }
  return '﻿' + [cabecalho, ...linhas].map((l) => l.map(celula).join(';')).join('\r\n')
}

/** Nome de arquivo seguro: "Conta de luz (1/3)" → "conta-de-luz-1-3". */
export function nomeDeArquivo(s: string, max = 50): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, max) || 'arquivo'
}
