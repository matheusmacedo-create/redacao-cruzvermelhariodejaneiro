import { PDFDocument, rgb, type PDFFont, type PDFImage, type PDFPage } from 'pdf-lib'
import { DADOS_DA_FILIAL } from '@/lib/site/juridico'
import { embutirFontes } from './fontes'
import { embutirImagem } from './desenho'
import { logoOficial } from './logo'
import { A4, desenharTimbrado } from './timbrado'

/**
 * A folha A4 dos documentos da filial em PDF (recibo e termo de doação,
 * ordem de compra…), no papel timbrado do manual (lib/pdf/timbrado.ts):
 * título e código, parágrafos, tabela que continua na página seguinte,
 * assinaturas e a linha do documento com a página, acima do rodapé da filial.
 * Fontes da identidade (Libre Franklin), que desenham os acentos do português.
 */

export { A4 }
const M = 50
const VERMELHO = rgb(0.89, 0.133, 0.098)
const CINZA = rgb(0.35, 0.35, 0.35)
const LINHA = rgb(0.82, 0.82, 0.82)
export const reais = (n: number) => n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }).replace(/\s/g, ' ')
export const seguro = (s: string) => s.normalize('NFC').replace(/[^\x20-\x7E\u00A0-\u00FF\u2013\u2014\u2018\u2019\u201C\u201D\u2026\u2022]/g, '?')
export const dataPorExtenso = (d: string) => new Date(`${d}T12:00:00Z`).toLocaleDateString('pt-BR', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' })

type Fontes = { normal: PDFFont; negrito: PDFFont; destaque: PDFFont; condensada: PDFFont; logo: PDFImage | null }

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
/** Onde o conteúdo para: acima da linha do documento e do rodapé da filial. */
const FUNDO = 104

export class Folha {
  pagina: PDFPage
  y = 0
  constructor(private pdf: PDFDocument, private f: Fontes, private titulo: string, private codigo: string, private setor?: string) {
    this.pagina = this.nova()
  }
  /** Página nova no timbrado, com o título à esquerda e o código à direita; o conteúdo começa logo abaixo. */
  private nova(): PDFPage {
    const p = this.pdf.addPage([A4.l, A4.a])
    const { topo } = desenharTimbrado(p, { texto: this.f.normal, destaque: this.f.destaque, condensada: this.f.condensada }, this.f.logo, { setor: this.setor })
    const y = topo - 18
    p.drawText(seguro(this.titulo), { x: M, y, size: 15, font: this.f.condensada })
    const w = this.f.negrito.widthOfTextAtSize(this.codigo, 11)
    p.drawText(this.codigo, { x: A4.l - M - w, y, size: 11, font: this.f.negrito, color: VERMELHO })
    p.drawLine({ start: { x: M, y: y - 9 }, end: { x: A4.l - M, y: y - 9 }, thickness: 0.8, color: VERMELHO })
    this.y = y - 32
    return p
  }
  garantir(altura: number) {
    if (this.y - altura < FUNDO) this.pagina = this.nova()
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
      if (this.y - altura < FUNDO) { this.pagina = this.nova(); cabecalho() }
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
  /** A linha do documento (o que é e a página), acima do rodapé da filial, com um fio fino em cima. */
  rodapes(texto: string) {
    const paginas = this.pdf.getPages()
    paginas.forEach((p, i) => {
      p.drawLine({ start: { x: M, y: 90 }, end: { x: A4.l - M, y: 90 }, thickness: 0.5, color: LINHA })
      const t = seguro(texto)
      p.drawText(t, { x: M, y: 80, size: 7, font: this.f.normal, color: CINZA })
      const pag = `Página ${i + 1} de ${paginas.length}`
      p.drawText(pag, { x: A4.l - M - this.f.normal.widthOfTextAtSize(pag, 7), y: 80, size: 7, font: this.f.normal, color: CINZA })
    })
  }
}

export async function iniciar(titulo: string) {
  const pdf = await PDFDocument.create()
  pdf.setTitle(titulo)
  pdf.setAuthor(DADOS_DA_FILIAL.nome)
  const [fontes, logo] = await Promise.all([embutirFontes(pdf, ['texto', 'negrito', 'destaque', 'condensada'] as const), logoOficial()])
  return { pdf, f: { normal: fontes.texto, negrito: fontes.negrito, destaque: fontes.destaque, condensada: fontes.condensada, logo: await embutirImagem(pdf, logo) } }
}

