/**
 * Contagem de texto por unidade de cada rede.
 *
 * `texto.length` mente em duas redes: o X conta URLs como 23 e pesa emoji e
 * ideogramas como 2; o Bluesky conta grafemas — "família" com emoji composto é
 * 1 grafema e vários code units. Um contador errado deixa passar texto que a
 * API recusa, ou barra texto que caberia.
 */

export type UnidadeDeTexto = 'caracteres' | 'ponderado_x' | 'grafemas'

const URL_PATTERN = /https?:\/\/\S+|www\.\S+/gi

/**
 * Peso de um code point na régua do X: as faixas latinas e de pontuação comum
 * pesam 1; todo o resto (CJK, emoji, símbolos) pesa 2. É a regra publicada da
 * própria rede, simplificada nos limites que importam aqui.
 */
function pesoDoCodePoint(cp: number): number {
  const leve =
    (cp >= 0x0000 && cp <= 0x10ff) ||
    (cp >= 0x2000 && cp <= 0x200d) ||
    (cp >= 0x2010 && cp <= 0x201f) ||
    (cp >= 0x2032 && cp <= 0x2037)
  return leve ? 1 : 2
}

function pesoDoTrecho(trecho: string): number {
  let total = 0
  for (const ch of trecho) total += pesoDoCodePoint(ch.codePointAt(0)!)
  return total
}

/** Contagem do X: URL vale 23, o resto é ponderado por code point. */
export function contarPonderadoX(texto: string): number {
  let total = 0
  let ultimo = 0
  URL_PATTERN.lastIndex = 0
  let m: RegExpExecArray | null
  while ((m = URL_PATTERN.exec(texto))) {
    total += pesoDoTrecho(texto.slice(ultimo, m.index)) + 23
    ultimo = m.index + m[0].length
  }
  total += pesoDoTrecho(texto.slice(ultimo))
  return total
}

/** Contagem do Bluesky: grafemas de verdade, não code units. */
export function contarGrafemas(texto: string): number {
  const seg = new Intl.Segmenter('pt', { granularity: 'grapheme' })
  let n = 0
  for (const _ of seg.segment(texto)) n++
  return n
}

export function contar(texto: string, unidade: UnidadeDeTexto): number {
  if (unidade === 'ponderado_x') return contarPonderadoX(texto)
  if (unidade === 'grafemas') return contarGrafemas(texto)
  return [...texto].length   // code points, não UTF-16 — emoji não conta dobrado
}
