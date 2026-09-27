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

/** Retângulo de cantos arredondados em SVG (y para baixo, a partir do canto de cima). */
export function retanguloArredondado(w: number, h: number, r: number): string {
  return `M ${r} 0 H ${w - r} Q ${w} 0 ${w} ${r} V ${h - r} Q ${w} ${h} ${w - r} ${h} H ${r} Q 0 ${h} 0 ${h - r} V ${r} Q 0 0 ${r} 0 Z`
}

export type Trecho = { texto: string; fonte: PDFFont }

/** Parágrafo justificado com trechos em fontes diferentes (o curso em destaque). A última linha fica à esquerda. */
export function paragrafoJustificado(p: PDFPage, trechos: Trecho[], x: number, y: number, largura: number, tamanho: number, entrelinha: number, cor: RGB = rgb(0.13, 0.12, 0.11)): number {
  // Pontuação no começo de um trecho ("…Voluntários, ministrado") cola na palavra anterior, sem espaço.
  const palavras: { w: string; f: PDFFont; colada?: { w: string; f: PDFFont } }[] = []
  for (const t of trechos) {
    for (const w of textoQueCabe(t.fonte, t.texto).split(/\s+/).filter(Boolean)) {
      const pont = /^[,.;:!?)]+/.exec(w)
      const anterior = palavras[palavras.length - 1]
      if (pont && anterior && !anterior.colada) {
        anterior.colada = { w: pont[0], f: t.fonte }
        if (w.length > pont[0].length) palavras.push({ w: w.slice(pont[0].length), f: t.fonte })
      } else palavras.push({ w, f: t.fonte })
    }
  }
  const larguraDaPalavra = (q: (typeof palavras)[number]) => q.f.widthOfTextAtSize(q.w, tamanho) + (q.colada ? q.colada.f.widthOfTextAtSize(q.colada.w, tamanho) : 0)
  const espaco = trechos[0].fonte.widthOfTextAtSize(' ', tamanho)
  let linha: typeof palavras = []
  const larguraDe = (ps: typeof palavras) => ps.reduce((s, q) => s + larguraDaPalavra(q), 0) + espaco * Math.max(0, ps.length - 1)
  const desenhar = (ps: typeof palavras, justificar: boolean) => {
    const sobra = largura - larguraDe(ps)
    const extra = justificar && ps.length > 1 ? sobra / (ps.length - 1) : 0
    let cx = x
    for (const q of ps) {
      p.drawText(q.w, { x: cx, y, size: tamanho, font: q.f, color: cor })
      if (q.colada) p.drawText(q.colada.w, { x: cx + q.f.widthOfTextAtSize(q.w, tamanho), y, size: tamanho, font: q.colada.f, color: cor })
      cx += larguraDaPalavra(q) + espaco + extra
    }
    y -= entrelinha
  }
  for (const q of palavras) {
    if (linha.length && larguraDe([...linha, q]) > largura) { desenhar(linha, true); linha = [q] } else linha.push(q)
  }
  if (linha.length) desenhar(linha, false)
  return y
}
