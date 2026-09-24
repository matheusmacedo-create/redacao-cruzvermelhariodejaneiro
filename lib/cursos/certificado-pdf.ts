/**
 * O certificado em PDF: A4 paisagem, com a cruz, o nome, o curso, a carga
 * horária, a data, a validade e o código de verificação com o endereço onde
 * qualquer pessoa confere a autenticidade.
 *
 * Fontes padrão do PDF (sem arquivo para carregar). Caractere que elas não
 * desenham vira "?" em vez de quebrar a geração.
 */

import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from 'pdf-lib'

const L = 841.89
const A = 595.28
const VERMELHO = rgb(0.89, 0.13, 0.1)
const TINTA = rgb(0.1, 0.12, 0.17)
const CINZA = rgb(0.4, 0.42, 0.47)

export type DadosDoCertificado = {
  nome: string
  curso: string
  cargaHoraria: number | null
  nota: number | null
  emitidoEm: string
  validoAte: string | null
  codigo: string
  urlDeVerificacao: string
}

function limpar(fonte: PDFFont, texto: string): string {
  const ok = new Set(fonte.getCharacterSet())
  let out = ''
  for (const ch of texto.normalize('NFC').replace(/[‐-―−]/g, '-').replace(/[  ]/g, ' ')) out += ok.has(ch.codePointAt(0) as number) ? ch : '?'
  return out
}

/** Escreve centralizado, reduzindo a fonte até caber na largura. */
function centro(p: PDFPage, fonte: PDFFont, texto: string, y: number, tamanho: number, cor = TINTA, largura = L - 160) {
  const t = limpar(fonte, texto)
  let tam = tamanho
  while (tam > 8 && fonte.widthOfTextAtSize(t, tam) > largura) tam -= 0.5
  p.drawText(t, { x: (L - fonte.widthOfTextAtSize(t, tam)) / 2, y, size: tam, font: fonte, color: cor })
}

/** Quebra um parágrafo em linhas centralizadas. Devolve o y abaixo da última. */
function paragrafo(p: PDFPage, fonte: PDFFont, texto: string, y: number, tamanho: number, largura: number, entrelinha: number) {
  const palavras = limpar(fonte, texto).split(/\s+/)
  let linha = ''
  for (const w of palavras) {
    const tentativa = linha ? `${linha} ${w}` : w
    if (fonte.widthOfTextAtSize(tentativa, tamanho) > largura && linha) {
      centro(p, fonte, linha, y, tamanho, TINTA, largura); y -= entrelinha; linha = w
    } else linha = tentativa
  }
  if (linha) { centro(p, fonte, linha, y, tamanho, TINTA, largura); y -= entrelinha }
  return y
}

export const dataPorExtenso = (iso: string) => new Intl.DateTimeFormat('pt-BR', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'America/Sao_Paulo' }).format(new Date(iso.length === 10 ? `${iso}T12:00:00Z` : iso))

export async function gerarPdfDoCertificado(d: DadosDoCertificado): Promise<Uint8Array> {
  const pdf = await PDFDocument.create()
  pdf.setTitle(`Certificado ${d.codigo} — ${d.curso}`)
  pdf.setAuthor('Cruz Vermelha Brasileira – Filial do Estado do Rio de Janeiro')
  pdf.setSubject(`Certificado de conclusão de ${d.nome}. Verificação: ${d.urlDeVerificacao}`)
  pdf.setKeywords(['certificado', d.codigo])
  pdf.setCreationDate(new Date(d.emitidoEm))
  const p = pdf.addPage([L, A])
  const serif = await pdf.embedFont(StandardFonts.TimesRoman)
  const serifB = await pdf.embedFont(StandardFonts.TimesRomanBold)
  const sans = await pdf.embedFont(StandardFonts.Helvetica)
  const sansB = await pdf.embedFont(StandardFonts.HelveticaBold)

  // Moldura: faixa vermelha à esquerda e fio fino em volta.
  p.drawRectangle({ x: 0, y: 0, width: 18, height: A, color: VERMELHO })
  p.drawRectangle({ x: 36, y: 28, width: L - 64, height: A - 56, borderColor: rgb(0.85, 0.86, 0.88), borderWidth: 0.8 })

  // A cruz.
  const cx = L / 2, cy = A - 92, t = 34, b = t * 0.34
  p.drawRectangle({ x: cx - b / 2, y: cy - t / 2, width: b, height: t, color: VERMELHO })
  p.drawRectangle({ x: cx - t / 2, y: cy - b / 2, width: t, height: b, color: VERMELHO })
  centro(p, sansB, 'CRUZ VERMELHA BRASILEIRA', A - 134, 10.5, CINZA)
  centro(p, sans, 'Filial do Estado do Rio de Janeiro', A - 148, 9.5, CINZA)

  centro(p, serifB, 'Certificado de Conclusão', A - 200, 30)
  centro(p, serif, 'Certificamos que', A - 240, 14, CINZA)
  centro(p, serifB, d.nome, A - 280, 28)
  p.drawLine({ start: { x: L / 2 - 180, y: A - 290 }, end: { x: L / 2 + 180, y: A - 290 }, thickness: 0.6, color: rgb(0.8, 0.8, 0.82) })

  const carga = d.cargaHoraria ? `, com carga horária de ${d.cargaHoraria.toLocaleString('pt-BR')} ${d.cargaHoraria === 1 ? 'hora' : 'horas'}` : ''
  const nota = d.nota !== null ? ` e aproveitamento de ${d.nota}%` : ''
  let y = paragrafo(p, serif, `concluiu o curso “${d.curso}” da Área do Voluntário da Cruz Vermelha Brasileira – Filial do Estado do Rio de Janeiro${carga}${nota}.`, A - 322, 15, L - 220, 21)
  y -= 6
  centro(p, serif, `Rio de Janeiro, ${dataPorExtenso(d.emitidoEm)}.`, y, 13, CINZA)
  if (d.validoAte) centro(p, sans, `Válido até ${dataPorExtenso(d.validoAte)}.`, y - 18, 10, CINZA)

  // Rodapé: código e onde conferir.
  centro(p, sansB, `Código de verificação: ${d.codigo}`, 70, 11)
  centro(p, sans, `Confira a autenticidade em ${d.urlDeVerificacao}`, 54, 9, CINZA)
  return pdf.save()
}
