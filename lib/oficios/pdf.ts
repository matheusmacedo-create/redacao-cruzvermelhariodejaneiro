/**
 * O PDF do ofício, para assinar no gov.br (ou em qualquer assinador PAdES).
 *
 * Gerado a partir do conteúdo canônico — o mesmo texto cujo SHA-256 foi
 * registrado na emissão — e com esse código impresso no rodapé de cada
 * página e gravado nos metadados. Sai sempre igual, byte a byte, para o
 * mesmo ofício: sem data de geração, sem identificador aleatório. É isso que
 * permite reconhecer depois, no PDF assinado que volta, o arquivo original.
 *
 * Fontes padrão do PDF (Times e Helvetica): sem arquivo de fonte para
 * carregar no servidor. Elas cobrem o português; um caractere fora da tabela
 * delas vira "?" em vez de quebrar a geração.
 */

import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from 'pdf-lib'
import { localEData, paragrafos, tituloDoOficio, type Documento } from './documento'

const A4 = { largura: 595.28, altura: 841.89 }
const MARGEM = { esq: 70, dir: 56, topo: 60, base: 72 }
const LARGURA_UTIL = A4.largura - MARGEM.esq - MARGEM.dir
const CORPO = 11.5
const ENTRELINHA = 16
const RECUO = 40
const VERMELHO = rgb(0.89, 0.13, 0.1)
const CINZA = rgb(0.35, 0.35, 0.35)

export type DadosDoPdf = {
  doc: Documento
  hashDocumento: string
  codigoVerificacao: string
  urlBase: string
  /** Instante da emissão: vira a data de criação do PDF (fixa, não "agora"). */
  emitidoEm: string
  /** Como vão assinar, para a instrução ao pé do bloco de assinaturas. */
  modo: 'senha' | 'govbr'
}

/** Troca o que as fontes padrão não desenham por equivalentes ou "?". */
function limpar(fonte: PDFFont, texto: string): string {
  const suportados = new Set(fonte.getCharacterSet())
  const trocas: Record<string, string> = { '‑': '-', '−': '-', ' ': ' ', ' ': ' ', ' ': ' ', '​': '', '\t': '    ' }
  let out = ''
  for (const ch of texto.normalize('NFC')) {
    const t = trocas[ch] ?? ch
    for (const c of t) out += suportados.has(c.codePointAt(0) as number) ? c : '?'
  }
  return out
}

/** Quebra um texto em linhas que caibam na largura. */
function quebrar(fonte: PDFFont, tamanho: number, texto: string, largura: number, recuoPrimeira = 0): string[] {
  const palavras = texto.split(/\s+/).filter(Boolean)
  const linhas: string[] = []
  let atual = ''
  for (const p of palavras) {
    const limite = largura - (linhas.length === 0 ? recuoPrimeira : 0)
    const teste = atual ? `${atual} ${p}` : p
    if (fonte.widthOfTextAtSize(teste, tamanho) <= limite || !atual) {
      atual = teste
      // Palavra sozinha maior que a linha: corta à força.
      while (fonte.widthOfTextAtSize(atual, tamanho) > limite && atual.length > 1) {
        let corte = atual.length - 1
        while (corte > 1 && fonte.widthOfTextAtSize(atual.slice(0, corte), tamanho) > limite) corte--
        linhas.push(atual.slice(0, corte))
        atual = atual.slice(corte)
      }
    } else {
      linhas.push(atual)
      atual = p
    }
  }
  if (atual) linhas.push(atual)
  return linhas
}

type Cursor = { pagina: PDFPage; y: number }

export async function gerarPdfDoOficio(d: DadosDoPdf): Promise<Uint8Array> {
  const pdf = await PDFDocument.create({ updateMetadata: false })
  const times = await pdf.embedFont(StandardFonts.TimesRoman)
  const timesNegrito = await pdf.embedFont(StandardFonts.TimesRomanBold)
  const helv = await pdf.embedFont(StandardFonts.Helvetica)
  const helvNegrito = await pdf.embedFont(StandardFonts.HelveticaBold)
  const { doc } = d
  const titulo = tituloDoOficio(doc.numero, null)

  const paginas: PDFPage[] = []
  const novaPagina = (): Cursor => {
    const pagina = pdf.addPage([A4.largura, A4.altura])
    paginas.push(pagina)
    // Timbre: a cruz e o nome do emitente, com o fio vermelho embaixo.
    const topo = A4.altura - MARGEM.topo
    pagina.drawRectangle({ x: MARGEM.esq + 7, y: topo - 26, width: 8, height: 24, color: VERMELHO })
    pagina.drawRectangle({ x: MARGEM.esq, y: topo - 18, width: 22, height: 8, color: VERMELHO })
    pagina.drawText(limpar(helvNegrito, (doc.emitente || 'Cruz Vermelha Brasileira').toUpperCase()), { x: MARGEM.esq + 32, y: topo - 12, size: 9.5, font: helvNegrito, maxWidth: LARGURA_UTIL - 32 })
    if (doc.setor) pagina.drawText(limpar(helv, doc.setor), { x: MARGEM.esq + 32, y: topo - 24, size: 8.5, font: helv, color: CINZA })
    pagina.drawLine({ start: { x: MARGEM.esq, y: topo - 34 }, end: { x: A4.largura - MARGEM.dir, y: topo - 34 }, thickness: 1.2, color: VERMELHO })
    return { pagina, y: topo - 58 }
  }

  let c = novaPagina()
  const garantir = (altura: number) => { if (c.y - altura < MARGEM.base) c = novaPagina() }
  const linha = (texto: string, o: { fonte?: PDFFont; tamanho?: number; x?: number; cor?: ReturnType<typeof rgb> } = {}) => {
    const fonte = o.fonte ?? times
    const tamanho = o.tamanho ?? CORPO
    garantir(ENTRELINHA)
    c.pagina.drawText(limpar(fonte, texto), { x: o.x ?? MARGEM.esq, y: c.y, size: tamanho, font: fonte, color: o.cor ?? rgb(0.08, 0.08, 0.08) })
    c.y -= ENTRELINHA
  }
  const espaco = (n: number) => { c.y -= n }

  // Número à esquerda, local e data à direita, na mesma linha.
  const data = localEData(doc.local, doc.data)
  c.pagina.drawText(limpar(helvNegrito, titulo), { x: MARGEM.esq, y: c.y, size: 11, font: helvNegrito })
  const larguraData = times.widthOfTextAtSize(limpar(times, data), CORPO)
  c.pagina.drawText(limpar(times, data), { x: A4.largura - MARGEM.dir - larguraData, y: c.y, size: CORPO, font: times })
  c.y -= ENTRELINHA * 2

  const dest = doc.destinatario
  for (const l of [dest.nome, dest.cargo, dest.orgao, ...(dest.endereco ?? '').split('\n')].filter((x): x is string => Boolean(x && x.trim()))) {
    for (const q of quebrar(times, CORPO, limpar(times, l.trim()), LARGURA_UTIL)) linha(q)
  }
  espaco(ENTRELINHA * 0.8)

  const assunto = quebrar(times, CORPO, limpar(times, doc.assunto), LARGURA_UTIL - timesNegrito.widthOfTextAtSize('Assunto: ', CORPO))
  garantir(ENTRELINHA)
  c.pagina.drawText('Assunto: ', { x: MARGEM.esq, y: c.y, size: CORPO, font: timesNegrito })
  const xAssunto = MARGEM.esq + timesNegrito.widthOfTextAtSize('Assunto: ', CORPO)
  assunto.forEach((q, i) => { if (i) garantir(ENTRELINHA); c.pagina.drawText(q, { x: xAssunto, y: c.y, size: CORPO, font: times }); c.y -= ENTRELINHA })
  espaco(ENTRELINHA * 0.8)

  if (doc.vocativo) { linha(doc.vocativo); espaco(ENTRELINHA * 0.4) }

  // Parágrafos justificados, com recuo na primeira linha.
  for (const p of paragrafos(doc.corpo)) {
    const linhas = quebrar(times, CORPO, limpar(times, p), LARGURA_UTIL, RECUO)
    linhas.forEach((q, i) => {
      garantir(ENTRELINHA)
      const x = MARGEM.esq + (i === 0 ? RECUO : 0)
      const disponivel = LARGURA_UTIL - (i === 0 ? RECUO : 0)
      const palavras = q.split(' ')
      const ultima = i === linhas.length - 1
      if (ultima || palavras.length < 2) {
        c.pagina.drawText(q, { x, y: c.y, size: CORPO, font: times })
      } else {
        const larguraPalavras = palavras.reduce((s, w) => s + times.widthOfTextAtSize(w, CORPO), 0)
        const vao = (disponivel - larguraPalavras) / (palavras.length - 1)
        let px = x
        for (const w of palavras) { c.pagina.drawText(w, { x: px, y: c.y, size: CORPO, font: times }); px += times.widthOfTextAtSize(w, CORPO) + vao }
      }
      c.y -= ENTRELINHA
    })
    espaco(ENTRELINHA * 0.45)
  }
  if (doc.fecho) { espaco(ENTRELINHA * 0.4); linha(doc.fecho) }

  // Assinaturas: espaço em branco em cima de cada nome, onde o carimbo
  // visual do gov.br pode ser posicionado. Duas por linha.
  espaco(ENTRELINHA)
  const col = LARGURA_UTIL / 2
  for (let i = 0; i < doc.assinantes.length; i += 2) {
    garantir(96)
    const topoBloco = c.y
    for (const [k, a] of doc.assinantes.slice(i, i + 2).entries()) {
      const cx = MARGEM.esq + k * col + col / 2
      const yLinha = topoBloco - 50
      c.pagina.drawLine({ start: { x: cx - 100, y: yLinha }, end: { x: cx + 100, y: yLinha }, thickness: 0.6, color: rgb(0.2, 0.2, 0.2) })
      const nome = limpar(timesNegrito, a.nome)
      c.pagina.drawText(nome, { x: cx - timesNegrito.widthOfTextAtSize(nome, 10.5) / 2, y: yLinha - 13, size: 10.5, font: timesNegrito })
      if (a.cargo) {
        const cargo = limpar(times, a.cargo)
        c.pagina.drawText(cargo, { x: cx - times.widthOfTextAtSize(cargo, 10) / 2, y: yLinha - 26, size: 10, font: times, color: CINZA })
      }
    }
    c.y = topoBloco - 96
  }
  garantir(ENTRELINHA)
  linha(d.modo === 'govbr'
    ? 'Documento assinado eletronicamente por meio da plataforma gov.br (Lei nº 14.063/2020).'
    : 'Documento assinado eletronicamente no sistema Redação (Lei nº 14.063/2020).', { fonte: helv, tamanho: 8, cor: CINZA })

  // Rodapé em todas as páginas: o código do documento e onde conferir.
  const url = `${d.urlBase.replace(/\/+$/, '')}/verificar/${d.codigoVerificacao}`
  paginas.forEach((pagina, i) => {
    const y = MARGEM.base - 30
    pagina.drawLine({ start: { x: MARGEM.esq, y: y + 12 }, end: { x: A4.largura - MARGEM.dir, y: y + 12 }, thickness: 0.4, color: rgb(0.7, 0.7, 0.7) })
    pagina.drawText(limpar(helv, `${titulo} · Código do documento (SHA-256): ${d.hashDocumento}`), { x: MARGEM.esq, y, size: 6.5, font: helv, color: CINZA })
    pagina.drawText(limpar(helv, `Confira a autenticidade em ${url}`), { x: MARGEM.esq, y: y - 9, size: 6.5, font: helv, color: CINZA })
    const pag = `Página ${i + 1} de ${paginas.length}`
    pagina.drawText(pag, { x: A4.largura - MARGEM.dir - helv.widthOfTextAtSize(pag, 6.5), y: y - 9, size: 6.5, font: helv, color: CINZA })
  })

  // Metadados fixos: o mesmo ofício dá sempre o mesmo arquivo.
  const quando = new Date(d.emitidoEm)
  pdf.setTitle(limpar(helv, `${titulo} – ${doc.assunto}`).slice(0, 300))
  pdf.setAuthor(limpar(helv, doc.emitente || 'Cruz Vermelha Brasileira'))
  pdf.setSubject(`SHA-256 do documento: ${d.hashDocumento}`)
  pdf.setKeywords([`oficio:${doc.numero ?? ''}`, `sha256:${d.hashDocumento}`, `verificacao:${d.codigoVerificacao}`])
  pdf.setProducer('Redação – Cruz Vermelha RJ')
  pdf.setCreator('Redação – Cruz Vermelha RJ')
  pdf.setCreationDate(quando)
  pdf.setModificationDate(quando)
  pdf.setLanguage('pt-BR')
  return pdf.save({ useObjectStreams: false })
}
