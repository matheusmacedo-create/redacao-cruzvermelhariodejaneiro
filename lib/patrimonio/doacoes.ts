/**
 * Regras das Doações em espécie (itens doados), sem banco nem rede — dá
 * para conferir com tsx. O banco (doacao_*) confere tudo de novo.
 */

import { lerValor } from './regras'
import { lerQuantidade } from './estoque'

export const BENEFICIARIOS = {
  familia: 'Família', pessoa: 'Pessoa', instituicao: 'Instituição (ONG, escola, igreja…)', abrigo: 'Abrigo ou ponto de apoio', acao: 'Ação da própria Cruz Vermelha',
} as const
export type TipoDeBeneficiario = keyof typeof BENEFICIARIOS
export const ehTipoDeBeneficiario = (t: unknown): t is TipoDeBeneficiario => typeof t === 'string' && Object.hasOwn(BENEFICIARIOS, t)

/** Dígitos verificadores de CPF e CNPJ (o banco só confere o tamanho). */
export function documentoValido(doc: string): boolean {
  const d = doc.replace(/\D/g, '')
  if (d.length === 11) {
    if (/^(\d)\1{10}$/.test(d)) return false
    const dv = (n: number) => { let s = 0; for (let i = 0; i < n; i++) s += Number(d[i]) * (n + 1 - i); const r = (s * 10) % 11; return r === 10 ? 0 : r }
    return dv(9) === Number(d[9]) && dv(10) === Number(d[10])
  }
  if (d.length === 14) {
    if (/^(\d)\1{13}$/.test(d)) return false
    const dv = (n: number) => { const pesos = n === 12 ? [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2] : [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]; const s = pesos.reduce((t, p, i) => t + p * Number(d[i]), 0); const r = s % 11; return r < 2 ? 0 : 11 - r }
    return dv(12) === Number(d[12]) && dv(13) === Number(d[13])
  }
  return false
}

/** Formatado por inteiro (para o próprio doador, no recibo). */
export function documentoFormatado(d: string | null): string {
  if (!d) return ''
  if (d.length === 11) return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}`
  if (d.length === 14) return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8, 12)}-${d.slice(12)}`
  return d
}

export type LinhaRecebida =
  | { tipo: 'material'; item_id: string; novo?: { nome: string; categoria_id: string; unidade: string; controla_validade: boolean }; quantidade: string; valor_unitario: string; lote: string; validade: string }
  | { tipo: 'bem'; nome: string; categoria_id: string; marca: string; modelo: string; numero_serie: string; estado: string; quantidade: string; valor_unitario: string }

const ehUuid = (v: unknown) => typeof v === 'string' && /^[0-9a-f-]{36}$/.test(v)

/** Confere e normaliza as linhas de um recebimento; devolve o que vai ao banco e os erros (com o número da linha). */
export function lerLinhasRecebidas(linhas: LinhaRecebida[]): { itens: Record<string, unknown>[]; erros: string[]; total: number } {
  const erros: string[] = []
  const itens: Record<string, unknown>[] = []
  let total = 0
  if (!linhas.length) erros.push('Inclua ao menos um item doado.')
  if (linhas.length > 200) erros.push('No máximo 200 itens por recibo.')
  linhas.forEach((l, k) => {
    const n = `Linha ${k + 1}: `
    const q = lerQuantidade(l.quantidade)
    const v = lerValor(l.valor_unitario)
    if (v === null || Number.isNaN(v)) erros.push(`${n}informe o valor de mercado de cada um (ITG 2002).`)
    if (l.tipo === 'material') {
      if (q === null || Number.isNaN(q) || q <= 0) erros.push(`${n}informe a quantidade.`)
      if (!ehUuid(l.item_id) && !(l.novo && l.novo.nome.trim().length >= 2 && ehUuid(l.novo.categoria_id))) erros.push(`${n}escolha o material (ou dê nome e categoria ao novo).`)
      if (l.validade && !/^\d{4}-\d{2}-\d{2}$/.test(l.validade)) erros.push(`${n}validade inválida.`)
      itens.push({
        tipo: 'material', item_id: ehUuid(l.item_id) ? l.item_id : '', quantidade: q, valor_unitario: v, lote: l.lote.trim().slice(0, 60), validade: l.validade,
        ...(!ehUuid(l.item_id) && l.novo ? { novo: { nome: l.novo.nome.trim().slice(0, 160), categoria_id: l.novo.categoria_id, unidade: l.novo.unidade || 'un', controla_validade: l.novo.controla_validade } } : {}),
      })
      if (q && v) total += Math.round(q * v * 100)
    } else {
      if (q === null || Number.isNaN(q) || q < 1 || q > 50 || !Number.isInteger(q)) erros.push(`${n}bens: de 1 a 50 unidades (cada uma ganha plaqueta).`)
      if (l.nome.trim().length < 2) erros.push(`${n}dê um nome ao bem.`)
      if (!ehUuid(l.categoria_id)) erros.push(`${n}escolha a categoria do bem.`)
      itens.push({
        tipo: 'bem', nome: l.nome.trim().slice(0, 160), categoria_id: l.categoria_id, marca: l.marca.trim().slice(0, 80), modelo: l.modelo.trim().slice(0, 80),
        numero_serie: l.numero_serie.trim().slice(0, 80), estado: l.estado || 'bom', quantidade: q, valor_unitario: v,
      })
      if (q && v) total += Math.round(q * v * 100)
    }
  })
  return { itens, erros, total: total / 100 }
}

/** "Mil duzentos e trinta reais e cinquenta centavos" — para o recibo. */
export function valorPorExtenso(valor: number): string {
  const centavos = Math.round(valor * 100)
  const reais = Math.floor(centavos / 100)
  const cent = centavos % 100
  const u = ['', 'um', 'dois', 'três', 'quatro', 'cinco', 'seis', 'sete', 'oito', 'nove', 'dez', 'onze', 'doze', 'treze', 'quatorze', 'quinze', 'dezesseis', 'dezessete', 'dezoito', 'dezenove']
  const d = ['', '', 'vinte', 'trinta', 'quarenta', 'cinquenta', 'sessenta', 'setenta', 'oitenta', 'noventa']
  const c = ['', 'cento', 'duzentos', 'trezentos', 'quatrocentos', 'quinhentos', 'seiscentos', 'setecentos', 'oitocentos', 'novecentos']
  const ate999 = (n: number): string => {
    if (n === 0) return ''
    if (n === 100) return 'cem'
    const partes: string[] = []
    if (n >= 100) partes.push(c[Math.floor(n / 100)])
    const r = n % 100
    if (r >= 20) { partes.push(d[Math.floor(r / 10)]); if (r % 10) partes.push(u[r % 10]) } else if (r) partes.push(u[r])
    return partes.join(' e ')
  }
  const grupos = [
    { valor: Math.floor(reais / 1_000_000_000) % 1000, um: 'um bilhão', varios: 'bilhões' },
    { valor: Math.floor(reais / 1_000_000) % 1000, um: 'um milhão', varios: 'milhões' },
    { valor: Math.floor(reais / 1000) % 1000, um: 'mil', varios: 'mil' },
    { valor: reais % 1000, um: 'um', varios: '' },
  ]
  const ditos = grupos.filter((g) => g.valor).map((g, i, a) => {
    const texto = g.valor === 1 ? g.um : `${ate999(g.valor)}${g.varios ? ` ${g.varios}` : ''}`
    return { texto, ultimo: i === a.length - 1, valor: g.valor }
  })
  let r = ''
  ditos.forEach((g, i) => {
    if (i === 0) r = g.texto
    // "e" antes do último grupo quando ele é < 100 ou centena redonda (mil e quinhentos, mil e vinte).
    else r += (g.ultimo && (g.valor < 100 || g.valor % 100 === 0) ? ' e ' : ', ') + g.texto
  })
  const milhoes = reais >= 1_000_000 && reais % 1_000_000 === 0
  const textoReais = reais ? `${r}${milhoes ? ' de' : ''} ${reais === 1 ? 'real' : 'reais'}` : ''
  const textoCent = cent ? `${ate999(cent)} ${cent === 1 ? 'centavo' : 'centavos'}` : ''
  if (!textoReais && !textoCent) return 'zero real'
  return [textoReais, textoCent].filter(Boolean).join(' e ')
}
