import QRCode from 'qrcode'
import { PDFDocument, StandardFonts, rgb, type PDFPage } from 'pdf-lib'

/**
 * Folha de etiquetas A4 (3 colunas × 8 linhas, como as folhas adesivas
 * comuns; também serve papel comum e fita). Cada etiqueta: o QR que abre o
 * bem no Redação, a cruz, "Patrimônio", a plaqueta em destaque e o nome.
 * O QR é desenhado em vetor — imprime nítido em qualquer impressora.
 */

const A4 = { l: 595.28, a: 841.89 }
const COLUNAS = 3, LINHAS = 8, MARGEM_X = 14, MARGEM_Y = 28
const VERMELHO = rgb(0.8, 0, 0)

function desenharQr(pagina: PDFPage, texto: string, x: number, y: number, lado: number) {
  const qr = QRCode.create(texto, { errorCorrectionLevel: 'M' })
  const n = qr.modules.size
  const m = lado / n
  for (let linha = 0; linha < n; linha++) {
    let inicio = -1
    for (let col = 0; col <= n; col++) {
      const escuro = col < n && qr.modules.get(linha, col)
      if (escuro && inicio < 0) inicio = col
      if (!escuro && inicio >= 0) {
        pagina.drawRectangle({ x: x + inicio * m, y: y + lado - (linha + 1) * m, width: (col - inicio) * m, height: m, color: rgb(0, 0, 0) })
        inicio = -1
      }
    }
  }
}

/** Corta o texto para caber na largura, com reticências. */
function caber(texto: string, largura: number, medir: (s: string) => number): string {
  if (medir(texto) <= largura) return texto
  let s = texto
  while (s.length > 1 && medir(`${s}…`) > largura) s = s.slice(0, -1)
  return `${s.trimEnd()}…`
}

/** Troca o que a fonte padrão do PDF não desenha (fora do Windows-1252). */
const seguro = (s: string) => s.normalize('NFC').replace(/[^\x20-\x7E -ÿ–—‘’“”…•]/g, '?')

export async function folhaDeEtiquetas(bens: { plaqueta: string; nome: string; url: string }[], organizacao = 'CRUZ VERMELHA RJ'): Promise<Uint8Array> {
  const pdf = await PDFDocument.create()
  pdf.setTitle('Etiquetas de patrimônio')
  const normal = await pdf.embedFont(StandardFonts.Helvetica)
  const negrito = await pdf.embedFont(StandardFonts.HelveticaBold)
  const lw = (A4.l - 2 * MARGEM_X) / COLUNAS
  const lh = (A4.a - 2 * MARGEM_Y) / LINHAS
  let pagina: PDFPage | null = null
  bens.forEach((b, i) => {
    const pos = i % (COLUNAS * LINHAS)
    if (pos === 0) pagina = pdf.addPage([A4.l, A4.a])
    const p = pagina!
    const col = pos % COLUNAS, lin = Math.floor(pos / COLUNAS)
    const x = MARGEM_X + col * lw, y = A4.a - MARGEM_Y - (lin + 1) * lh
    // Guia de corte, bem clara.
    p.drawRectangle({ x: x + 2, y: y + 2, width: lw - 4, height: lh - 4, borderColor: rgb(0.85, 0.85, 0.85), borderWidth: 0.5 })
    const lado = lh - 16
    desenharQr(p, b.url, x + 8, y + 8, lado)
    const tx = x + 8 + lado + 8
    const larg = lw - (tx - x) - 8
    // A cruz.
    const cy = y + lh - 20
    p.drawRectangle({ x: tx + 3, y: cy - 1, width: 4, height: 12, color: VERMELHO })
    p.drawRectangle({ x: tx, y: cy + 3, width: 10, height: 4, color: VERMELHO })
    p.drawText(caber(seguro(organizacao), larg - 14, (s) => normal.widthOfTextAtSize(s, 5.5)), { x: tx + 14, y: cy + 3, size: 5.5, font: normal, color: rgb(0.3, 0.3, 0.3) })
    p.drawText('PATRIMÔNIO', { x: tx, y: cy - 14, size: 6.5, font: negrito, color: VERMELHO })
    p.drawText(caber(seguro(b.plaqueta), larg, (s) => negrito.widthOfTextAtSize(s, 13)), { x: tx, y: cy - 31, size: 13, font: negrito, color: rgb(0, 0, 0) })
    const palavras = seguro(b.nome).split(/\s+/)
    const linhas: string[] = []
    let atual = ''
    for (const w of palavras) {
      const tenta = atual ? `${atual} ${w}` : w
      if (normal.widthOfTextAtSize(tenta, 7) <= larg) atual = tenta
      else { if (atual) linhas.push(atual); atual = w }
      if (linhas.length === 2) break
    }
    if (atual && linhas.length < 2) linhas.push(atual)
    linhas.slice(0, 2).forEach((l, k) => p.drawText(caber(l, larg, (s) => normal.widthOfTextAtSize(s, 7)), { x: tx, y: cy - 44 - k * 9, size: 7, font: normal, color: rgb(0.2, 0.2, 0.2) }))
  })
  if (!bens.length) pdf.addPage([A4.l, A4.a])
  return pdf.save()
}
