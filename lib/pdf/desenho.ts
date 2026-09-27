import QRCode from 'qrcode'
import { clip, endPath, popGraphicsState, pushGraphicsState, rectangle, rgb, type PDFDocument, type PDFFont, type PDFImage, type PDFPage, type RGB } from 'pdf-lib'
import { textoQueCabe } from './fontes'

/** Peças de desenho comuns ao crachá e ao certificado. Medidas em pontos (1 mm = 2,835 pt). */

export const mm = (v: number) => v * 2.834645669

/** QR em vetor (imprime nítido em qualquer impressora), como nas etiquetas do Patrimônio. */
export function desenharQr(p: PDFPage, texto: string, x: number, y: number, lado: number, cor: RGB = rgb(0.12, 0.12, 0.12)) {
  const qr = QRCode.create(texto, { errorCorrectionLevel: 'M' })
  const n = qr.modules.size
  const m = lado / n
  for (let linha = 0; linha < n; linha++) {
    let inicio = -1
    for (let col = 0; col <= n; col++) {
      const escuro = col < n && qr.modules.get(linha, col)
      if (escuro && inicio < 0) inicio = col
      if (!escuro && inicio >= 0) {
        p.drawRectangle({ x: x + inicio * m, y: y + lado - (linha + 1) * m, width: (col - inicio) * m, height: m, color: cor })
        inicio = -1
      }
    }
  }
}

/** Quebra em linhas que cabem na largura. */
export function quebrar(fonte: PDFFont, texto: string, tamanho: number, largura: number): string[] {
  const linhas: string[] = []
  let linha = ''
  for (const w of textoQueCabe(fonte, texto).split(/\s+/).filter(Boolean)) {
    const tentativa = linha ? `${linha} ${w}` : w
    if (linha && fonte.widthOfTextAtSize(tentativa, tamanho) > largura) { linhas.push(linha); linha = w } else linha = tentativa
  }
  if (linha) linhas.push(linha)
  return linhas
}

/** O maior tamanho (até `tamanho`, não menos que `minimo`) em que o texto cabe numa linha. */
export function tamanhoQueCabe(fonte: PDFFont, texto: string, tamanho: number, largura: number, minimo = 5): number {
  let t = tamanho
  while (t > minimo && fonte.widthOfTextAtSize(texto, t) > largura) t -= 0.25
  return t
}

type Alinhamento = 'esquerda' | 'centro' | 'direita'

/** Escreve uma linha alinhada; encolhe até caber em `largura`. */
export function escrever(p: PDFPage, fonte: PDFFont, texto: string, o: { x: number; y: number; tamanho: number; largura?: number; alinhar?: Alinhamento; cor?: RGB }) {
  const t = textoQueCabe(fonte, texto)
  const tam = o.largura ? tamanhoQueCabe(fonte, t, o.tamanho, o.largura) : o.tamanho
  const w = fonte.widthOfTextAtSize(t, tam)
  const x = o.alinhar === 'centro' ? o.x - w / 2 : o.alinhar === 'direita' ? o.x - w : o.x
  p.drawText(t, { x, y: o.y, size: tam, font: fonte, color: o.cor ?? rgb(0.12, 0.12, 0.12) })
}

/** JPEG ou PNG (pelos primeiros bytes). Outro formato (WEBP), null. */
export async function embutirImagem(pdf: PDFDocument, bytes: Uint8Array | null): Promise<PDFImage | null> {
  if (!bytes || bytes.length < 8) return null
  try {
    if (bytes[0] === 0xff && bytes[1] === 0xd8) return await pdf.embedJpg(bytes)
    if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) return await pdf.embedPng(bytes)
  } catch { /* arquivo corrompido: quem chama desenha a alternativa */ }
  return null
}

/** Desenha a imagem cobrindo o retângulo (como object-fit: cover), recortando o que sobra. */
export function imagemCobrindo(p: PDFPage, img: PDFImage, x: number, y: number, w: number, h: number) {
  const escala = Math.max(w / img.width, h / img.height)
  const iw = img.width * escala, ih = img.height * escala
  p.pushOperators(pushGraphicsState(), rectangle(x, y, w, h), clip(), endPath())
  p.drawImage(img, { x: x + (w - iw) / 2, y: y + (h - ih) / 2, width: iw, height: ih })
  p.pushOperators(popGraphicsState())
}
