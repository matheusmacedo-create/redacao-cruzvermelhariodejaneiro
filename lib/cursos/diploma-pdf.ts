/**
 * O Diploma de Reconhecimento em PDF, no modelo do Manual de Identidade
 * Institucional da CVB (p. 29): A3 paisagem, moldura dourada com ornamentos
 * nos cantos, a logo no alto, "Diploma de Reconhecimento" em caligrafia, o
 * lema, o nome em destaque, o texto do reconhecimento, local e data à direita
 * e a assinatura da presidência. Além do modelo: o código e o QR que qualquer
 * pessoa confere em /diploma/<código>.
 *
 * Sai sozinho nos marcos de horas (100, 500, 1.000) ou quando a coordenação
 * concede (migração 20260929040000). A assinatura é tipográfica, como no
 * certificado (lib/cursos/certificado-pdf.ts).
 */

import { PDFDocument, rgb, type PDFPage } from 'pdf-lib'
import { embutirFontes } from '@/lib/pdf/fontes'
import { desenharQr, embutirImagem, escrever, paragrafoJustificado, quebrar, retanguloArredondado } from '@/lib/pdf/desenho'
import { PROPORCAO_DA_LOGO } from '@/lib/pdf/logo'
import { DADOS_DA_FILIAL } from '@/lib/site/juridico'
import { assinaturaDaFilial, dataPorExtenso } from './certificado-pdf'

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
}

/** O texto do reconhecimento, sem o nome (vai logo depois dele). */
export function textoDoDiploma(d: Pick<DadosDoDiploma, 'motivo' | 'marcoHoras' | 'texto'>): string {
  if (d.motivo === 'horas' && d.marcoHoras) {
    return `em reconhecimento às ${d.marcoHoras.toLocaleString('pt-BR')} horas de serviço voluntário dedicadas à missão humanitária da Cruz Vermelha Brasileira, com a dedicação que tanto dignifica a história desta Instituição perante o Movimento Internacional da Cruz Vermelha e do Crescente Vermelho.`
  }
  const motivo = (d.texto ?? '').trim().replace(/[.;\s]+$/, '')
  return `em agradecimento aos relevantes serviços prestados à Cruz Vermelha Brasileira${motivo ? `: ${motivo.charAt(0).toLowerCase()}${motivo.slice(1)}` : ''}.`
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
  const pdf = await PDFDocument.create()
  pdf.setTitle(`Diploma de Reconhecimento ${d.codigo} — ${d.nome}`)
  pdf.setAuthor(DADOS_DA_FILIAL.nome)
  pdf.setSubject(`Diploma de Reconhecimento de ${d.nome}. Verificação: ${d.urlDeVerificacao}`)
  pdf.setKeywords(['diploma', 'reconhecimento', d.codigo])
  pdf.setCreationDate(new Date(d.emitidoEm))
  const p = pdf.addPage([L, A])
  const f = await embutirFontes(pdf, ['texto', 'textoItalico', 'destaque', 'caligrafia'] as const)

  p.drawRectangle({ x: 0, y: 0, width: L, height: A, color: rgb(1, 1, 1) })
  moldura(p)

  // A logo numa caixa branca sobre a moldura (manual, p. 18).
  const logo = await embutirImagem(pdf, d.logo ?? null)
  const lw = 190, lh = lw / PROPORCAO_DA_LOGO
  p.drawRectangle({ x: (L - lw - 30) / 2, y: A - 22 - lh - 18, width: lw + 30, height: lh + 18, color: rgb(1, 1, 1) })
  if (logo) p.drawImage(logo, { x: (L - lw) / 2, y: A - 30 - lh, width: lw, height: lh })
  else escrever(p, f.destaque, 'CRUZ VERMELHA BRASILEIRA', { x: L / 2, y: A - 70, tamanho: 16, alinhar: 'centro' })

  escrever(p, f.caligrafia, 'Diploma de Reconhecimento', { x: L / 2, y: A - 236, tamanho: 92, alinhar: 'centro', cor: TINTA, largura: L - 260 })
  escrever(p, f.textoItalico, '“Aliviar e atenuar o sofrimento humano.”', { x: L - 190, y: A - 270, tamanho: 12, alinhar: 'direita', cor: CINZA })

  escrever(p, f.textoItalico, 'A Cruz Vermelha Brasileira – Filial do Estado do Rio de Janeiro confere este Diploma a', { x: L / 2, y: A - 330, tamanho: 18, alinhar: 'centro', largura: L - 300 })
  escrever(p, f.caligrafia, d.nome, { x: L / 2, y: A - 410, tamanho: 62, alinhar: 'centro', largura: L - 300 })
  let y = paragrafoJustificado(p, [{ texto: textoDoDiploma(d), fonte: f.textoItalico }], 150, A - 470, L - 300, 18, 27, TINTA)

  y -= 16
  escrever(p, f.textoItalico, 'O Poder da Humanidade', { x: L - 150, y, tamanho: 11, alinhar: 'direita', cor: CINZA })
  escrever(p, f.textoItalico, `Rio de Janeiro, ${dataPorExtenso(d.emitidoEm)}.`, { x: L - 150, y: y - 22, tamanho: 17, alinhar: 'direita' })

  // Assinatura, à esquerda como no modelo.
  const quem = assinaturaDaFilial()
  escrever(p, f.caligrafia, quem.nome, { x: 330, y: 150, tamanho: 30, alinhar: 'centro' })
  p.drawLine({ start: { x: 200, y: 140 }, end: { x: 460, y: 140 }, thickness: 0.6, color: CINZA })
  escrever(p, f.destaque, quem.cargo, { x: 330, y: 125, tamanho: 12, alinhar: 'centro' })

  // Verificação à direita, embaixo.
  const qr = 70
  desenharQr(p, d.urlDeVerificacao, L - 150 - qr, 96, qr, TINTA)
  escrever(p, f.destaque, `Código ${d.codigo}`, { x: L - 150 - qr - 14, y: 146, tamanho: 11, alinhar: 'direita' })
  quebrar(f.texto, `Confira em ${d.urlDeVerificacao}`, 9, 260)
    .forEach((linha, i) => escrever(p, f.texto, linha, { x: L - 150 - qr - 14, y: 130 - i * 12, tamanho: 9, alinhar: 'direita', cor: CINZA }))
  return pdf.save()
}
