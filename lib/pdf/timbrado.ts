import { rgb, type PDFFont, type PDFImage, type PDFPage } from 'pdf-lib'
import { LINHAS_DO_DECRETO, linhasDoRodape } from './timbrado-texto'

/**
 * O papel timbrado A4 da filial, no desenho do Manual de Identidade
 * Institucional da CVB (p. 24):
 *  - margens de 14 mm dos lados e 17 mm no alto, com a cruz da logo medindo 17 mm;
 *  - "Reconhecida como Utilidade Pública Internacional – Decreto nº 9.620,
 *    de 13/06/1912" no alto, à direita (Franklin Book 8);
 *  - o setor centrado, em Franklin Demi Cond 18;
 *  - o rodapé centrado (Franklin Book 8), a 10 mm da borda de baixo.
 *
 * Usado pelo ofício (lib/oficios/pdf.ts) e pelas folhas da filial
 * (lib/pdf/folha.ts: recibos e termos do Patrimônio, ordem e relatório de
 * Compras). As fontes são as equivalentes livres de lib/pdf/fontes.ts.
 * Desenha sempre igual para as mesmas entradas: o PDF do ofício precisa sair
 * idêntico byte a byte.
 */

export const MM = 72 / 25.4
export const A4 = { l: 595.28, a: 841.89 }

export const TIMBRADO = {
  lateral: 14 * MM,
  /** Do alto da página ao alto da cruz. */
  topo: 17 * MM,
  alturaDaCruz: 17 * MM,
  /** Da borda de baixo à última linha do rodapé. */
  base: 10 * MM,
}

// Onde a cruz está dentro de public/images/logo-cvrj.png (1844 × 752 px): começa a 83 px da esquerda,
// vai de 102 a 573 px na altura. A logo embutida do ofício (922 × 376) é a mesma imagem, reduzida.
const CRUZ = { x: 83 / 1844, topo: 102 / 752, altura: 471 / 752 }
/** Onde acaba o desenho da logo (o pé de "RIO DE JANEIRO"). */
const FIM_DO_DESENHO = 645 / 752
const PROPORCAO = 1844 / 752

const TINTA = rgb(0.13, 0.12, 0.11)
const CINZA = rgb(0.36, 0.36, 0.36)

export type FontesDoTimbrado = { texto: PDFFont; condensada: PDFFont; destaque: PDFFont }

/** Troca o que a fonte não desenha por "?" (a fonte da identidade cobre o português). */
function cabe(fonte: PDFFont, texto: string): string {
  const ok = new Set(fonte.getCharacterSet())
  return [...texto.normalize('NFC')].map((c) => (ok.has(c.codePointAt(0) as number) ? c : /[‐-―−]/.test(c) ? '-' : '?')).join('')
}

/**
 * Desenha o timbrado na página e devolve a faixa livre para o conteúdo:
 * `topo` (logo abaixo da logo, ou do setor) e `base` (logo acima do rodapé).
 * Sem a imagem da logo, escreve o nome no lugar.
 */
export function desenharTimbrado(p: PDFPage, f: FontesDoTimbrado, logo: PDFImage | null, o: { setor?: string | null } = {}): { topo: number; base: number } {
  const { l, a } = { l: p.getWidth(), a: p.getHeight() }
  const altoDaCruz = a - TIMBRADO.topo

  // A logo: a cruz com 17 mm, a 14 mm da esquerda e a 17 mm do alto.
  const altura = TIMBRADO.alturaDaCruz / CRUZ.altura
  const largura = altura * PROPORCAO
  if (logo) {
    p.drawImage(logo, { x: TIMBRADO.lateral - CRUZ.x * largura, y: altoDaCruz + CRUZ.topo * altura - altura, width: largura, height: altura })
  } else {
    p.drawText('CRUZ VERMELHA BRASILEIRA', { x: TIMBRADO.lateral, y: altoDaCruz - 20, size: 20, font: f.condensada, color: TINTA })
  }

  // O decreto, no alto à direita.
  LINHAS_DO_DECRETO.forEach((linha, i) => {
    const t = cabe(f.texto, linha)
    p.drawText(t, { x: l - TIMBRADO.lateral - f.texto.widthOfTextAtSize(t, 8), y: altoDaCruz - 8 - i * 9.6, size: 8, font: f.texto, color: CINZA })
  })

  // O setor, centrado logo abaixo da logo.
  const fimDaLogo = altoDaCruz + (CRUZ.topo - FIM_DO_DESENHO) * altura
  let topo = fimDaLogo - 14
  if (o.setor?.trim()) {
    const t = cabe(f.condensada, o.setor.trim().toUpperCase())
    const tamanho = Math.min(18, (18 * (l - 2 * TIMBRADO.lateral - 120)) / Math.max(1, f.condensada.widthOfTextAtSize(t, 18)))
    p.drawText(t, { x: (l - f.condensada.widthOfTextAtSize(t, tamanho)) / 2, y: fimDaLogo - 14, size: tamanho, font: f.condensada, color: TINTA })
    topo = fimDaLogo - 34
  }

  // O rodapé centrado, com a última linha a 10 mm da borda.
  const linhas = linhasDoRodape()
  linhas.forEach((linha, i) => {
    const fonte = i === 0 ? f.destaque : f.texto
    const t = cabe(fonte, linha)
    const y = TIMBRADO.base + (linhas.length - 1 - i) * 9.6
    p.drawText(t, { x: (l - fonte.widthOfTextAtSize(t, 8)) / 2, y, size: 8, font: fonte, color: i === 0 ? TINTA : CINZA })
  })

  return { topo, base: TIMBRADO.base + linhas.length * 9.6 + 4 }
}
