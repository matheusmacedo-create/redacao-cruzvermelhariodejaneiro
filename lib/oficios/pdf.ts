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

import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFImage, type PDFPage } from 'pdf-lib'
import { DADOS_DA_FILIAL } from '@/lib/site/juridico'
import { blocosDoCorpo, localEData, tituloDoOficio, type Documento } from './documento'
import { LOGO_PNG_BASE64 } from './logo'

// Padrão da correspondência oficial (Manual de Redação da Presidência) com a
// identidade da Cruz Vermelha: timbre com a logo da filial, fio vermelho,
// Times 12 com entrelinha de 1,5, recuo de parágrafo e rodapé institucional.
const A4 = { largura: 595.28, altura: 841.89 }
const MARGEM = { esq: 71, dir: 57, topo: 36, base: 104 }
const LARGURA_UTIL = A4.largura - MARGEM.esq - MARGEM.dir
const CORPO = 12
const ENTRELINHA = 17.5
const RECUO = 56
const VERMELHO = rgb(0.89, 0.133, 0.098)
const TINTA = rgb(0.1, 0.1, 0.1)
const CINZA = rgb(0.38, 0.38, 0.38)
const CINZA_CLARO = rgb(0.55, 0.55, 0.55)
const LOGO = { largura: 150, px: { l: 922, a: 376 }, inicioX: 0.045 }

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
type Fontes = { times: PDFFont; timesNegrito: PDFFont; helv: PDFFont; helvNegrito: PDFFont }

/** Linha justificada: o espaço que sobra se divide entre as palavras. */
function justificada(pagina: PDFPage, texto: string, x: number, y: number, largura: number, fonte: PDFFont, tamanho: number) {
  const palavras = texto.split(' ')
  if (palavras.length < 2) { pagina.drawText(texto, { x, y, size: tamanho, font: fonte, color: TINTA }); return }
  const ocupado = palavras.reduce((s, w) => s + fonte.widthOfTextAtSize(w, tamanho), 0)
  const vao = (largura - ocupado) / (palavras.length - 1)
  let px = x
  for (const w of palavras) { pagina.drawText(w, { x: px, y, size: tamanho, font: fonte, color: TINTA }); px += fonte.widthOfTextAtSize(w, tamanho) + vao }
}

/** Timbre: a logo da filial à esquerda, o setor e o site à direita, o fio vermelho embaixo. */
function timbre(pagina: PDFPage, f: Fontes, logo: PDFImage, setor: string | null) {
  const altura = LOGO.largura * LOGO.px.a / LOGO.px.l
  const topo = A4.altura - MARGEM.topo
  pagina.drawImage(logo, { x: MARGEM.esq - LOGO.largura * LOGO.inicioX, y: topo - altura, width: LOGO.largura, height: altura })
  const direita = A4.largura - MARGEM.dir
  const linhas: [string, PDFFont, number, ReturnType<typeof rgb>][] = [
    ...(setor ? [[limpar(f.helvNegrito, setor.toUpperCase()), f.helvNegrito, 8.5, TINTA] as [string, PDFFont, number, ReturnType<typeof rgb>]] : []),
    [limpar(f.helv, DADOS_DA_FILIAL.email), f.helv, 7.5, CINZA],
    [limpar(f.helv, DADOS_DA_FILIAL.telefone), f.helv, 7.5, CINZA],
  ]
  let y = topo - altura / 2 + (linhas.length * 11) / 2 - 8
  for (const [t, fonte, tam, cor] of linhas) {
    pagina.drawText(t, { x: direita - fonte.widthOfTextAtSize(t, tam), y, size: tam, font: fonte, color: cor })
    y -= 11
  }
  pagina.drawRectangle({ x: MARGEM.esq, y: topo - altura - 8, width: LARGURA_UTIL, height: 1.6, color: VERMELHO })
  return topo - altura - 8
}

/** A cruz, bem clara, no canto de baixo: a marca d'água da identidade. */
function cruzAoFundo(pagina: PDFPage) {
  const lado = 170
  const braco = lado * 0.34
  const x = A4.largura - MARGEM.dir - lado + 20
  const y = MARGEM.base + 6
  pagina.drawRectangle({ x: x + (lado - braco) / 2, y, width: braco, height: lado, color: VERMELHO, opacity: 0.045 })
  pagina.drawRectangle({ x, y: y + (lado - braco) / 2, width: lado, height: braco, color: VERMELHO, opacity: 0.045 })
}

export async function gerarPdfDoOficio(d: DadosDoPdf): Promise<Uint8Array> {
  const pdf = await PDFDocument.create({ updateMetadata: false })
  const f: Fontes = {
    times: await pdf.embedFont(StandardFonts.TimesRoman),
    timesNegrito: await pdf.embedFont(StandardFonts.TimesRomanBold),
    helv: await pdf.embedFont(StandardFonts.Helvetica),
    helvNegrito: await pdf.embedFont(StandardFonts.HelveticaBold),
  }
  const { times, timesNegrito, helv, helvNegrito } = f
  const logo = await pdf.embedPng(Buffer.from(LOGO_PNG_BASE64, 'base64'))
  const { doc } = d
  const titulo = tituloDoOficio(doc.numero, null)

  const paginas: PDFPage[] = []
  const novaPagina = (): Cursor => {
    const pagina = pdf.addPage([A4.largura, A4.altura])
    paginas.push(pagina)
    cruzAoFundo(pagina)
    const fio = timbre(pagina, f, logo, doc.setor)
    return { pagina, y: fio - 34 }
  }

  let c = novaPagina()
  const garantir = (altura: number) => { if (c.y - altura < MARGEM.base) c = novaPagina() }
  const espaco = (n: number) => { c.y -= n }
  const texto = (t: string, x: number, o: { fonte?: PDFFont; tamanho?: number; cor?: ReturnType<typeof rgb> } = {}) =>
    c.pagina.drawText(t, { x, y: c.y, size: o.tamanho ?? CORPO, font: o.fonte ?? times, color: o.cor ?? TINTA })

  // Número à esquerda, local e data à direita, na mesma linha.
  const data = limpar(times, localEData(doc.local, doc.data))
  texto(limpar(helvNegrito, titulo.toUpperCase()), MARGEM.esq, { fonte: helvNegrito, tamanho: 11.5 })
  texto(data, A4.largura - MARGEM.dir - times.widthOfTextAtSize(data, CORPO), {})
  espaco(ENTRELINHA * 2.2)

  // Destinatário: o nome em negrito, o resto como veio (cargo, órgão, endereço).
  const dest = doc.destinatario
  const linhasDoDestino: [string, PDFFont][] = [
    ...(dest.nome ? [[dest.nome, timesNegrito] as [string, PDFFont]] : []),
    ...[dest.cargo, dest.orgao, ...(dest.endereco ?? '').split('\n')].filter((x): x is string => Boolean(x && x.trim())).map((x) => [x, times] as [string, PDFFont]),
  ]
  for (const [l, fonte] of linhasDoDestino) {
    for (const q of quebrar(fonte, CORPO, limpar(fonte, l.trim()), LARGURA_UTIL)) { garantir(15); texto(q, MARGEM.esq, { fonte }); espaco(15) }
  }
  if (linhasDoDestino.length) espaco(ENTRELINHA * 0.9)

  // Assunto em negrito, com recuo pendente depois do rótulo.
  const rotulo = 'Assunto: '
  const xAssunto = MARGEM.esq + timesNegrito.widthOfTextAtSize(rotulo, CORPO)
  const assunto = quebrar(timesNegrito, CORPO, limpar(timesNegrito, doc.assunto), LARGURA_UTIL - (xAssunto - MARGEM.esq))
  garantir(ENTRELINHA)
  texto(rotulo, MARGEM.esq, { fonte: timesNegrito })
  assunto.forEach((q, i) => { if (i) garantir(ENTRELINHA); texto(q, xAssunto, { fonte: timesNegrito }); espaco(ENTRELINHA) })
  espaco(ENTRELINHA * 0.9)

  if (doc.vocativo) { garantir(ENTRELINHA); texto(limpar(times, doc.vocativo), MARGEM.esq + RECUO); espaco(ENTRELINHA * 1.4) }

  // O corpo: parágrafos justificados com recuo, títulos de seção e listas.
  for (const b of blocosDoCorpo(doc.corpo)) {
    if (b.tipo === 'titulo') {
      espaco(ENTRELINHA * 0.35)
      const linhas = quebrar(timesNegrito, CORPO, limpar(timesNegrito, b.texto), LARGURA_UTIL)
      garantir(ENTRELINHA * (linhas.length + 2)) // o título não fica sozinho no pé da página
      for (const q of linhas) { texto(q, MARGEM.esq, { fonte: timesNegrito }); espaco(ENTRELINHA) }
      espaco(ENTRELINHA * 0.25)
    } else if (b.tipo === 'paragrafo') {
      const linhas = quebrar(times, CORPO, limpar(times, b.texto), LARGURA_UTIL, RECUO)
      linhas.forEach((q, i) => {
        garantir(ENTRELINHA)
        const x = MARGEM.esq + (i === 0 ? RECUO : 0)
        if (i === linhas.length - 1) texto(q, x)
        else justificada(c.pagina, q, x, c.y, LARGURA_UTIL - (i === 0 ? RECUO : 0), times, CORPO)
        espaco(ENTRELINHA)
      })
      espaco(ENTRELINHA * 0.45)
    } else {
      const xMarca = MARGEM.esq + 22
      for (const item of b.itens) {
        const marca = item.marcador ?? '•'
        const xTexto = xMarca + Math.max(14, times.widthOfTextAtSize(marca, CORPO) + 6)
        const linhas = quebrar(times, CORPO, limpar(times, item.texto), A4.largura - MARGEM.dir - xTexto)
        linhas.forEach((q, i) => {
          garantir(ENTRELINHA)
          if (i === 0) texto(marca, xMarca, { cor: item.marcador ? TINTA : VERMELHO })
          texto(q, xTexto)
          espaco(ENTRELINHA)
        })
        espaco(2)
      }
      espaco(ENTRELINHA * 0.4)
    }
  }
  if (doc.fecho) { espaco(ENTRELINHA * 0.4); garantir(ENTRELINHA); texto(limpar(times, doc.fecho), MARGEM.esq + RECUO); espaco(ENTRELINHA) }

  // Assinaturas: espaço em branco em cima de cada nome, onde entra o selo
  // visual do gov.br. Uma assinatura fica centrada; mais de uma, duas por linha.
  espaco(ENTRELINHA * 0.6)
  const porLinha = doc.assinantes.length === 1 ? 1 : 2
  const col = LARGURA_UTIL / porLinha
  for (let i = 0; i < doc.assinantes.length; i += porLinha) {
    garantir(130)
    const topoBloco = c.y
    let fundo = topoBloco
    for (const [k, a] of doc.assinantes.slice(i, i + porLinha).entries()) {
      const cx = MARGEM.esq + k * col + col / 2
      const yLinha = topoBloco - 62
      const meia = Math.min(120, col / 2 - 10)
      c.pagina.drawLine({ start: { x: cx - meia, y: yLinha }, end: { x: cx + meia, y: yLinha }, thickness: 0.6, color: TINTA })
      const nome = limpar(timesNegrito, a.nome)
      c.pagina.drawText(nome, { x: cx - timesNegrito.widthOfTextAtSize(nome, 11.5) / 2, y: yLinha - 14, size: 11.5, font: timesNegrito, color: TINTA })
      let y = yLinha - 28
      // CPF mascarado do cadastro da Equipe: identifica quem assina sem expor o número inteiro.
      if (a.cpf) {
        const cpf = limpar(helv, `CPF ${a.cpf}`)
        c.pagina.drawText(cpf, { x: cx - helv.widthOfTextAtSize(cpf, 8.5) / 2, y, size: 8.5, font: helv, color: CINZA })
        y -= 12
      }
      const funcao = [a.cargo, a.setor].filter(Boolean).join(' · ')
      for (const q of funcao ? quebrar(times, 10.5, limpar(times, funcao), col - 16) : []) {
        c.pagina.drawText(q, { x: cx - times.widthOfTextAtSize(q, 10.5) / 2, y, size: 10.5, font: times, color: CINZA })
        y -= 13
      }
      fundo = Math.min(fundo, y)
    }
    c.y = fundo - 16
  }
  garantir(12)
  const nota = limpar(helv, d.modo === 'govbr'
    ? 'Documento assinado eletronicamente com assinatura gov.br, nos termos da Lei nº 14.063/2020.'
    : 'Documento assinado eletronicamente no Palácio Virtual da Cruz Vermelha RJ, nos termos da Lei nº 14.063/2020.')
  texto(nota, MARGEM.esq + (LARGURA_UTIL - helv.widthOfTextAtSize(nota, 7.5)) / 2, { fonte: helv, tamanho: 7.5, cor: CINZA })

  // Rodapé em todas as páginas: a filial (razão social, CNPJ, endereço), o
  // código do documento e onde conferir.
  const url = `${d.urlBase.replace(/\/+$/, '')}/verificar/${d.codigoVerificacao}`
  const filial = limpar(helvNegrito, `${DADOS_DA_FILIAL.nome}  ·  CNPJ ${DADOS_DA_FILIAL.cnpj}`)
  const endereco = limpar(helv, DADOS_DA_FILIAL.endereco)
  paginas.forEach((pagina, i) => {
    const y = 74
    pagina.drawRectangle({ x: MARGEM.esq, y: y + 12, width: LARGURA_UTIL, height: 0.8, color: VERMELHO })
    pagina.drawText(filial, { x: MARGEM.esq, y, size: 7.5, font: helvNegrito, color: TINTA })
    pagina.drawText(endereco, { x: MARGEM.esq, y: y - 10, size: 7.5, font: helv, color: CINZA })
    pagina.drawText(limpar(helv, `${titulo} · Hash do documento (SHA-256): ${d.hashDocumento}`), { x: MARGEM.esq, y: y - 28, size: 6.3, font: helv, color: CINZA_CLARO })
    pagina.drawText(limpar(helv, `A autenticidade deste documento pode ser conferida em ${url}`), { x: MARGEM.esq, y: y - 37, size: 6.3, font: helv, color: CINZA_CLARO })
    const pag = `Página ${i + 1} de ${paginas.length}`
    pagina.drawText(pag, { x: A4.largura - MARGEM.dir - helv.widthOfTextAtSize(pag, 7), y: y - 37, size: 7, font: helv, color: CINZA })
  })

  // Metadados fixos: o mesmo ofício dá sempre o mesmo arquivo.
  const quando = new Date(d.emitidoEm)
  pdf.setTitle(limpar(helv, `${titulo} – ${doc.assunto}`).slice(0, 300))
  pdf.setAuthor(limpar(helv, DADOS_DA_FILIAL.nome))
  pdf.setSubject(`SHA-256 do documento: ${d.hashDocumento}`)
  pdf.setKeywords([`oficio:${doc.numero ?? ''}`, `sha256:${d.hashDocumento}`, `verificacao:${d.codigoVerificacao}`])
  pdf.setProducer('Palácio Virtual – Cruz Vermelha RJ')
  pdf.setCreator('Palácio Virtual – Cruz Vermelha RJ')
  pdf.setCreationDate(quando)
  pdf.setModificationDate(quando)
  pdf.setLanguage('pt-BR')
  return pdf.save({ useObjectStreams: false })
}
