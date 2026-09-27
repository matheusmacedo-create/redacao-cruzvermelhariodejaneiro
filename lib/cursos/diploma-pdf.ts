/**
 * O Diploma de Reconhecimento em PDF, no modelo do Manual de Identidade
 * Institucional da CVB (p. 29): A3 paisagem, moldura dourada com ornamentos
 * nos cantos, a logo no alto, "Diploma de Reconhecimento" em caligrafia, o
 * lema, o nome em destaque, o texto do reconhecimento, local e data à direita
 * e as assinaturas: a presidência e, se a filial escolher, a vice-presidência
 * e a coordenação do Voluntariado (até três, lib/cursos/assinaturas.ts).
 * Além do modelo: o código e o QR que qualquer pessoa confere em
 * /diploma/<código>, pequenos no rodapé para não disputar espaço com as
 * assinaturas.
 *
 * Sai sozinho nos marcos de horas (100, 500, 1.000) ou quando a coordenação
 * concede (migração 20260929040000). As assinaturas são tipográficas, como no
 * certificado (lib/cursos/certificado-pdf.ts).
 */

import { PDFDocument, rgb, type PDFImage, type PDFPage } from 'pdf-lib'
import { embutirFontes, type Fontes } from '@/lib/pdf/fontes'
import { desenharQr, embutirImagem, escrever, paragrafoJustificado, quebrar, retanguloArredondado } from '@/lib/pdf/desenho'
import { PROPORCAO_DA_LOGO } from '@/lib/pdf/logo'
import { DADOS_DA_FILIAL } from '@/lib/site/juridico'
import { dataPorExtenso } from './certificado-pdf'
import { textoDoDiploma } from './diploma-texto'
import { assinaturaDaPresidencia, centrosDasAssinaturas, type Assinatura } from './assinaturas'

export { textoDoDiploma }

const L = 1190.55 // A3 paisagem
const A = 841.89
const OURO = rgb(0.69, 0.55, 0.3)
const OURO_CLARO = rgb(0.86, 0.78, 0.6)
const TINTA = rgb(0.13, 0.12, 0.11)
const CINZA = rgb(0.4, 0.38, 0.36)

export type DadosDoDiploma = {
  nome: string
  motivo: 'horas' | 'coordenacao'
  marcoHoras: number | null
  texto: string | null
  emitidoEm: string
  codigo: string
  urlDeVerificacao: string
  logo?: Uint8Array | null
  /** De uma a três (assinaturasDoDiploma); sem a lista, só a presidência. */
  assinaturas?: Assinatura[]
}

/** Um ornamento de canto: volutas que se abrem para dentro da página. `sx`/`sy` espelham para cada canto. */
function cantoneira(p: PDFPage, x: number, y: number, sx: 1 | -1, sy: 1 | -1) {
  const pts = (d: string) => d.replace(/(-?\d+(?:\.\d+)?) (-?\d+(?:\.\d+)?)/g, (_, a: string, b: string) => `${Number(a) * sx} ${Number(b) * sy}`)
  const tracos = [
    'M 0 0 C 30 0 60 6 86 22 C 104 33 112 52 100 62 C 90 70 76 62 80 50 C 83 42 93 43 94 50',
    'M 0 0 C 0 30 6 60 22 86 C 33 104 52 112 62 100 C 70 90 62 76 50 80 C 42 83 43 93 50 94',
    'M 14 14 C 34 22 48 34 56 52 M 14 14 C 22 34 34 48 52 56',
    'M 0 10 C 40 12 70 20 92 36 M 10 0 C 12 40 20 70 36 92',
  ]
  for (const d of tracos) p.drawSvgPath(pts(d), { x, y, borderColor: OURO, borderWidth: 1.6 })
  p.drawCircle({ x: x + 30 * sx, y: y - 30 * sy, size: 4, color: OURO })
}

function moldura(p: PDFPage) {
  p.drawSvgPath(retanguloArredondado(L - 72, A - 72, 10), { x: 36, y: A - 36, borderColor: OURO, borderWidth: 3 })
  p.drawSvgPath(retanguloArredondado(L - 96, A - 96, 8), { x: 48, y: A - 48, borderColor: OURO_CLARO, borderWidth: 1 })
  const m = 58
  cantoneira(p, m, A - m, 1, 1)
  cantoneira(p, L - m, A - m, -1, 1)
  cantoneira(p, m, m, 1, -1)
  cantoneira(p, L - m, m, -1, -1)
}

export async function gerarPdfDoDiploma(d: DadosDoDiploma): Promise<Uint8Array> {
  return gerarPdfDeDiplomas([d], {
    titulo: `Diploma de Reconhecimento ${d.codigo} — ${d.nome}`,
    assunto: `Diploma de Reconhecimento de ${d.nome}. Verificação: ${d.urlDeVerificacao}`,
    palavras: ['diploma', 'reconhecimento', d.codigo],
    data: new Date(d.emitidoEm),
  })
}

/**
 * Vários diplomas num PDF só, uma página A3 cada (a área de Diplomas, para a
 * cerimônia). As fontes e a logo entram uma vez só no arquivo: juntar PDFs
 * avulsos repetiria cerca de 300 kB de fonte por diploma.
 */
export async function gerarPdfDeDiplomas(
  lista: DadosDoDiploma[],
  meta: { titulo: string; assunto?: string; palavras?: string[]; data?: Date } = { titulo: `Diplomas de Reconhecimento (${lista.length})` },
): Promise<Uint8Array> {
  const pdf = await PDFDocument.create()
  pdf.setTitle(meta.titulo)
  pdf.setAuthor(DADOS_DA_FILIAL.nome)
  if (meta.assunto) pdf.setSubject(meta.assunto)
  pdf.setKeywords(meta.palavras ?? ['diploma', 'reconhecimento'])
  pdf.setCreationDate(meta.data ?? new Date())
  const f = await embutirFontes(pdf, ['texto', 'textoItalico', 'destaque', 'caligrafia'] as const)
  const logo = await embutirImagem(pdf, lista[0]?.logo ?? null)
  for (const d of lista) desenharDiploma(pdf.addPage([L, A]), f, logo, d)
  return pdf.save()
}

type FontesDoDiploma = Pick<Fontes, 'texto' | 'textoItalico' | 'destaque' | 'caligrafia'>

function desenharDiploma(p: PDFPage, f: FontesDoDiploma, logo: PDFImage | null, d: DadosDoDiploma) {
  p.drawRectangle({ x: 0, y: 0, width: L, height: A, color: rgb(1, 1, 1) })
  moldura(p)

  // A logo numa caixa branca sobre a moldura (manual, p. 18).
  const lw = 190, lh = lw / PROPORCAO_DA_LOGO
  p.drawRectangle({ x: (L - lw - 30) / 2, y: A - 22 - lh - 18, width: lw + 30, height: lh + 18, color: rgb(1, 1, 1) })
  if (logo) p.drawImage(logo, { x: (L - lw) / 2, y: A - 30 - lh, width: lw, height: lh })
  else escrever(p, f.destaque, 'CRUZ VERMELHA BRASILEIRA', { x: L / 2, y: A - 70, tamanho: 16, alinhar: 'centro' })

  escrever(p, f.caligrafia, 'Diploma de Reconhecimento', { x: L / 2, y: A - 236, tamanho: 92, alinhar: 'centro', cor: TINTA, largura: L - 260 })
  escrever(p, f.textoItalico, '“Aliviar e atenuar o sofrimento humano.”', { x: L - 190, y: A - 270, tamanho: 12, alinhar: 'direita', cor: CINZA })

  // Um pouco mais alto que no modelo: sobra lugar para até três assinaturas mesmo com o texto mais longo (600 letras).
  escrever(p, f.textoItalico, 'A Cruz Vermelha Brasileira – Filial do Estado do Rio de Janeiro confere este Diploma a', { x: L / 2, y: A - 322, tamanho: 18, alinhar: 'centro', largura: L - 300 })
  escrever(p, f.caligrafia, d.nome, { x: L / 2, y: A - 398, tamanho: 62, alinhar: 'centro', largura: L - 300 })
  // O texto da coordenação vai até 600 letras: longo, ele desce um ponto ou dois para a data não encostar nas assinaturas.
  const texto = textoDoDiploma(d)
  const [tamanho, entrelinha] = ([[18, 27], [17, 25], [16, 23], [15, 21], [14, 19.5], [13, 18], [12, 16.5]] as const).find(([t, e]) => (quebrar(f.textoItalico, texto, t, L - 300).length - 1) * e <= 150) ?? [12, 16.5]
  let y = paragrafoJustificado(p, [{ texto, fonte: f.textoItalico }], 150, A - 452, L - 300, tamanho, entrelinha, TINTA)

  y -= 12
  escrever(p, f.textoItalico, 'O Poder da Humanidade', { x: L - 150, y, tamanho: 11, alinhar: 'direita', cor: CINZA })
  escrever(p, f.textoItalico, `Rio de Janeiro, ${dataPorExtenso(d.emitidoEm)}.`, { x: L - 150, y: y - 22, tamanho: 17, alinhar: 'direita' })

  // Assinaturas: uma só fica à esquerda, como no modelo; duas ou três se distribuem entre as cantoneiras.
  const assinaturas = d.assinaturas?.length ? d.assinaturas.slice(0, 3) : [assinaturaDaPresidencia()]
  const centros = assinaturas.length === 1 ? [330] : centrosDasAssinaturas(assinaturas.length, 170, L - 170)
  const linha = assinaturas.length === 3 ? 230 : 260
  // Com o texto mais longo, a data desce: a fileira de assinaturas desce junto (até onde o rodapé deixa).
  const base = Math.max(146, Math.min(158, y - 22 - 42))
  assinaturas.forEach((a, i) => {
    const x = centros[i]
    escrever(p, f.caligrafia, a.nome, { x, y: base, tamanho: 30, alinhar: 'centro', largura: linha - 10 })
    p.drawLine({ start: { x: x - linha / 2, y: base - 10 }, end: { x: x + linha / 2, y: base - 10 }, thickness: 0.6, color: CINZA })
    escrever(p, f.destaque, a.cargo, { x, y: base - 25, tamanho: 12, alinhar: 'centro', largura: linha })
  })

  // Verificação: pequena e centrada no rodapé, entre as cantoneiras — o QR à esquerda, o código e o endereço ao lado.
  const qr = 44 // cerca de 1,5 cm impresso: o celular ainda lê
  const endereco = `Confira a autenticidade em ${d.urlDeVerificacao}`
  const larguraDoTexto = Math.max(f.destaque.widthOfTextAtSize(`Código ${d.codigo}`, 8.5), f.texto.widthOfTextAtSize(endereco, 7.5))
  const x0 = (L - (qr + 10 + larguraDoTexto)) / 2
  desenharQr(p, d.urlDeVerificacao, x0, 62, qr, rgb(0.25, 0.24, 0.23))
  escrever(p, f.destaque, `Código ${d.codigo}`, { x: x0 + qr + 10, y: 88, tamanho: 8.5, cor: CINZA })
  escrever(p, f.texto, endereco, { x: x0 + qr + 10, y: 75, tamanho: 7.5, cor: CINZA })
}
