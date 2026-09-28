/**
 * O "para que serve" de uma área é escrito inteiro (1 a 3 frases, às vezes
 * mais) para a Central, mas no painel "?" cabe uma frase: a primeira. Este
 * módulo corta o texto em "resumo" (o começo, até uns 220 caracteres) e
 * "detalhe" (o resto, atrás de "Ler mais"). Puro, conferido em
 * scripts/conferir-ajuda.ts.
 */

/** Tamanho mínimo do resumo (uma frase muito curta puxa a seguinte) e máximo (não passa disso, a não ser que a primeira frase já passe). */
const MINIMO = 70
const MAXIMO = 220

/** As frases de um texto: cortado depois de ". ", "! " ou "? " seguido de maiúscula, aspa ou número. */
export function frases(texto: string): string[] {
  return texto.split(/(?<=[.!?…])\s+(?=[A-ZÀ-Ú“"(0-9])/).map((f) => f.trim()).filter(Boolean)
}

/** O resumo (o começo, para o painel) e o detalhe (o resto, para "Ler mais"; vazio se coube tudo). */
export function resumoEDetalhe(texto: string): { resumo: string; detalhe: string } {
  const todas = frases(texto.trim())
  if (todas.length <= 1) return { resumo: texto.trim(), detalhe: '' }
  let resumo = todas[0]
  let n = 1
  while (n < todas.length && resumo.length < MINIMO && resumo.length + 1 + todas[n].length <= MAXIMO) {
    resumo = `${resumo} ${todas[n]}`
    n++
  }
  return { resumo, detalhe: todas.slice(n).join(' ') }
}
