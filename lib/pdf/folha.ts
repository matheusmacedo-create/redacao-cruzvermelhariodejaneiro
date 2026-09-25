import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from 'pdf-lib'
import { DADOS_DA_FILIAL } from '@/lib/site/juridico'

/**
 * A folha A4 dos documentos da filial em PDF (recibo e termo de doação,
 * ordem de compra…): cabeçalho com a cruz e os dados da filial, parágrafos,
 * tabela que continua na página seguinte, assinaturas e rodapé numerado.
 * Fonte padrão do PDF (Helvetica), que desenha os acentos do português.
 */

export const A4 = { l: 595.28, a: 841.89 }
const M = 50
const VERMELHO = rgb(0.8, 0, 0)
const CINZA = rgb(0.35, 0.35, 0.35)
const LINHA = rgb(0.82, 0.82, 0.82)
export const reais = (n: number) => n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }).replace(/\s/g, ' ')
export const seguro = (s: string) => s.normalize('NFC').replace(/[^\x20-\x7E\u00A0-\u00FF\u2013\u2014\u2018\u2019\u201C\u201D\u2026\u2022]/g, '?')
export const dataPorExtenso = (d: string) => new Date(`${d}T12:00:00Z`).toLocaleDateString('pt-BR', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' })

type Fontes = { normal: PDFFont; negrito: PDFFont }

/** Quebra o texto em linhas que cabem na largura. */
export function quebrar(texto: string, fonte: PDFFont, tamanho: number, largura: number): string[] {
  const linhas: string[] = []
  for (const paragrafo of seguro(texto).split('\n')) {
    let atual = ''
    for (const w of paragrafo.split(/\s+/).filter(Boolean)) {
      const tenta = atual ? `${atual} ${w}` : w
      if (fonte.widthOfTextAtSize(tenta, tamanho) <= largura) atual = tenta
      else { if (atual) linhas.push(atual); atual = w }
    }
    linhas.push(atual)
  }
  return linhas
}

/** Um documento que vai descendo pela página e abre outra quando acaba o espaço. */
export class Folha {
  pagina: PDFPage
  y: number
  constructor(private pdf: PDFDocument, private f: Fontes, private titulo: string, private codigo: string) {
    this.pagina = this.nova()
    this.y = A4.a - 150
  }
  private nova(): PDFPage {
    const p = this.pdf.addPage([A4.l, A4.a])
    const topo = A4.a - M
    // A cruz vermelha e a filial.
    p.drawRectangle({ x: M + 8, y: topo - 30, width: 10, height: 30, color: VERMELHO })
    p.drawRectangle({ x: M, y: topo - 20, width: 26, height: 10, color: VERMELHO })
    p.drawText(seguro(DADOS_DA_FILIAL.nome), { x: M + 38, y: topo - 10, size: 10.5, font: this.f.negrito })
    p.drawText(seguro(`CNPJ ${DADOS_DA_FILIAL.cnpj} · ${DADOS_DA_FILIAL.endereco}`), { x: M + 38, y: topo - 23, size: 7.5, font: this.f.normal, color: CINZA })
    p.drawText(seguro(`${DADOS_DA_FILIAL.email} · ${DADOS_DA_FILIAL.telefone}`), { x: M + 38, y: topo - 33, size: 7.5, font: this.f.normal, color: CINZA })
    p.drawLine({ start: { x: M, y: topo - 44 }, end: { x: A4.l - M, y: topo - 44 }, thickness: 1, color: VERMELHO })
    p.drawText(seguro(this.titulo), { x: M, y: topo - 68, size: 14, font: this.f.negrito })
    const w = this.f.negrito.widthOfTextAtSize(this.codigo, 12)
    p.drawText(this.codigo, { x: A4.l - M - w, y: topo - 67, size: 12, font: this.f.negrito, color: VERMELHO })
    return p
  }
  garantir(altura: number) {
    if (this.y - altura < M + 30) { this.pagina = this.nova(); this.y = A4.a - 150 }
  }
  paragrafo(texto: string, tamanho = 10, negrito = false, entre = 4) {
    const fonte = negrito ? this.f.negrito : this.f.normal
    for (const l of quebrar(texto, fonte, tamanho, A4.l - 2 * M)) {
      this.garantir(tamanho + 4)
      this.pagina.drawText(l, { x: M, y: this.y, size: tamanho, font: fonte })
      this.y -= tamanho + 4
    }
    this.y -= entre
  }
  /** Tabela simples: colunas com largura e alinhamento; repete o cabeçalho em cada página. */
  tabela(colunas: { titulo: string; largura: number; direita?: boolean }[], linhas: string[][], rodape?: string[]) {
    const cabecalho = () => {
      this.garantir(22)
      this.pagina.drawRectangle({ x: M, y: this.y - 5, width: A4.l - 2 * M, height: 17, color: rgb(0.95, 0.95, 0.95) })
      let x = M + 4
      for (const c of colunas) {
        const t = seguro(c.titulo)
        const w = this.f.negrito.widthOfTextAtSize(t, 8)
        this.pagina.drawText(t, { x: c.direita ? x + c.largura - 8 - w : x, y: this.y, size: 8, font: this.f.negrito, color: CINZA })
        x += c.largura
      }
      this.y -= 18
    }
    cabecalho()
    const desenhar = (celulas: string[], fonte: PDFFont) => {
      const quebradas = celulas.map((t, i) => quebrar(t, fonte, 9, colunas[i].largura - 10))
      const altura = Math.max(...quebradas.map((q) => q.length)) * 12 + 4
      if (this.y - altura < M + 30) { this.pagina = this.nova(); this.y = A4.a - 150; cabecalho() }
      let x = M + 4
      quebradas.forEach((q, i) => {
        const c = colunas[i]
        q.forEach((l, k) => {
          const w = fonte.widthOfTextAtSize(l, 9)
          this.pagina.drawText(l, { x: c.direita ? x + c.largura - 8 - w : x, y: this.y - k * 12, size: 9, font: fonte })
        })
        x += c.largura
      })
      this.y -= altura
      this.pagina.drawLine({ start: { x: M, y: this.y + 8 }, end: { x: A4.l - M, y: this.y + 8 }, thickness: 0.5, color: LINHA })
    }
    for (const l of linhas) desenhar(l, this.f.normal)
    if (rodape) desenhar(rodape, this.f.negrito)
    this.y -= 10
  }
  assinaturas(nomes: { linha1: string; linha2?: string }[]) {
    this.garantir(90)
    this.y -= 40
    const largura = Math.min(250, (A4.l - 2 * M - 30 * (nomes.length - 1)) / nomes.length)
    nomes.forEach((n, i) => {
      const x = M + i * (largura + 30)
      this.pagina.drawLine({ start: { x, y: this.y }, end: { x: x + largura, y: this.y }, thickness: 0.8, color: rgb(0, 0, 0) })
      this.pagina.drawText(quebrar(n.linha1, this.f.normal, 8.5, largura)[0] ?? '', { x, y: this.y - 12, size: 8.5, font: this.f.normal })
      if (n.linha2) this.pagina.drawText(quebrar(n.linha2, this.f.normal, 7.5, largura)[0] ?? '', { x, y: this.y - 23, size: 7.5, font: this.f.normal, color: CINZA })
    })
    this.y -= 40
  }
  rodapes(texto: string) {
    const paginas = this.pdf.getPages()
    paginas.forEach((p, i) => {
      const t = seguro(`${texto} · página ${i + 1} de ${paginas.length}`)
      p.drawText(t, { x: M, y: M - 18, size: 7, font: this.f.normal, color: CINZA })
    })
  }
}

export async function iniciar(titulo: string) {
  const pdf = await PDFDocument.create()
  pdf.setTitle(titulo)
  pdf.setAuthor(DADOS_DA_FILIAL.nome)
  return { pdf, f: { normal: await pdf.embedFont(StandardFonts.Helvetica), negrito: await pdf.embedFont(StandardFonts.HelveticaBold) } }
}

