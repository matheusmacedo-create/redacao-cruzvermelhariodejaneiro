/**
 * O certificado em PDF, no modelo oficial do Manual de Identidade
 * Institucional da CVB (p. 29): A4 paisagem, fundo marfim com textura de
 * segurança, moldura dupla em marrom com fio pontilhado, a logo numa caixa
 * branca sobre a moldura, "Certificado" em caligrafia, o nome em itálico, o
 * texto com o curso em destaque, local e data à direita e a assinatura da
 * presidência com o ornamento embaixo.
 *
 * Além do modelo: o código e o QR de verificação (qualquer pessoa confere em
 * /certificado/<código>), a validade e o aproveitamento.
 *
 * A assinatura é tipográfica (o nome em caligrafia, como no modelo), não a
 * imagem da assinatura. Quem assina vem da lista oficial da filial
 * (lib/equipe.ts: a Presidência).
 */

import { PDFDocument, rgb, type PDFFont, type PDFPage } from 'pdf-lib'
import { embutirFontes, textoQueCabe } from '@/lib/pdf/fontes'
import { desenharQr, embutirImagem, escrever, quebrar } from '@/lib/pdf/desenho'
import { PROPORCAO_DA_LOGO } from '@/lib/pdf/logo'
import { SETORES } from '@/lib/equipe'
import { DADOS_DA_FILIAL } from '@/lib/site/juridico'

const L = 841.89
const A = 595.28
const MARROM = rgb(0.58, 0.4, 0.27)
const MARROM_CLARO = rgb(0.9, 0.85, 0.79)
const FUNDO = rgb(0.988, 0.978, 0.962)
const TINTA = rgb(0.13, 0.12, 0.11)
const CINZA = rgb(0.4, 0.38, 0.36)

export type DadosDoCertificado = {
  nome: string
  curso: string
  cargaHoraria: number | null
  nota: number | null
  emitidoEm: string
  validoAte: string | null
  codigo: string
  urlDeVerificacao: string
  /** PNG da logo oficial. Sem ela, o nome da instituição em texto (o certificado sai do mesmo jeito). */
  logo?: Uint8Array | null
}

export const dataPorExtenso = (iso: string) => new Intl.DateTimeFormat('pt-BR', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'America/Sao_Paulo' }).format(new Date(iso.length === 10 ? `${iso}T12:00:00Z` : iso))

/** Quem assina: a Presidência da lista oficial da filial. */
export function assinaturaDaFilial(): { nome: string; cargo: string } {
  const presidente = SETORES.flatMap((s) => s.pessoas).find((p) => p.cargo === 'Presidente')
  return presidente ? { nome: presidente.nome, cargo: 'Presidente' } : { nome: DADOS_DA_FILIAL.nome, cargo: 'Presidência' }
}

/** Retângulo de cantos arredondados em SVG (y para baixo, a partir do canto de cima). */
function retanguloArredondado(w: number, h: number, r: number): string {
  return `M ${r} 0 H ${w - r} Q ${w} 0 ${w} ${r} V ${h - r} Q ${w} ${h} ${w - r} ${h} H ${r} Q 0 ${h} 0 ${h - r} V ${r} Q 0 0 ${r} 0 Z`
}

/** A textura de segurança do fundo: ondas finas cruzadas, como no papel do modelo. */
function textura(p: PDFPage) {
  for (let i = 0; i < 26; i++) {
    const base = 30 + i * 21
    const amp = 9 + (i % 4) * 3
    const fase = i * 0.55
    let d = ''
    for (let x = 0; x <= L; x += 12) {
      const y = base + Math.sin(x / 38 + fase) * amp + Math.sin(x / 91 - fase) * amp * 0.6
      d += `${x === 0 ? 'M' : 'L'} ${x.toFixed(1)} ${y.toFixed(1)} `
    }
    p.drawSvgPath(d, { x: 0, y: A, borderColor: MARROM_CLARO, borderWidth: 0.35, borderOpacity: 0.55 })
  }
}

/** A moldura dupla com o fio pontilhado entre as duas linhas. */
function moldura(p: PDFPage) {
  const linhas: [number, number, number, number[] | undefined][] = [[26, 1.6, 26, undefined], [31, 0.8, 22, [0.8, 2.6]], [36, 0.7, 18, undefined]]
  for (const [m, espessura, raio, tracejado] of linhas) {
    p.drawSvgPath(retanguloArredondado(L - 2 * m, A - 2 * m, raio), { x: m, y: A - m, borderColor: MARROM, borderWidth: espessura, borderDashArray: tracejado })
  }
}

/** O ornamento do pé, em curvas simétricas. */
function ornamento(p: PDFPage, cx: number, y: number) {
  const lado = 'M 0 0 C 14 -10 30 -10 38 -2 C 44 4 40 12 32 10 C 26 8 28 1 34 2 M 38 -2 C 52 -12 72 -8 86 0 C 74 -3 60 -2 50 4'
  p.drawSvgPath(lado, { x: cx + 4, y, borderColor: MARROM, borderWidth: 1.1 })
  // O espelho: o mesmo traço com x invertido.
  const espelho = lado.replace(/(-?\d+(?:\.\d+)?) (-?\d+(?:\.\d+)?)/g, (_, x: string, yy: string) => `${-Number(x)} ${yy}`)
  p.drawSvgPath(espelho, { x: cx - 4, y, borderColor: MARROM, borderWidth: 1.1 })
  p.drawCircle({ x: cx, y: y - 1, size: 2.4, color: MARROM })
}

type Trecho = { texto: string; fonte: PDFFont }

/** Parágrafo justificado com trechos em fontes diferentes (o curso em destaque). A última linha fica à esquerda. */
function paragrafoJustificado(p: PDFPage, trechos: Trecho[], x: number, y: number, largura: number, tamanho: number, entrelinha: number): number {
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
      p.drawText(q.w, { x: cx, y, size: tamanho, font: q.f, color: TINTA })
      if (q.colada) p.drawText(q.colada.w, { x: cx + q.f.widthOfTextAtSize(q.w, tamanho), y, size: tamanho, font: q.colada.f, color: TINTA })
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

export async function gerarPdfDoCertificado(d: DadosDoCertificado): Promise<Uint8Array> {
  const pdf = await PDFDocument.create()
  pdf.setTitle(`Certificado ${d.codigo} — ${d.curso}`)
  pdf.setAuthor(DADOS_DA_FILIAL.nome)
  pdf.setSubject(`Certificado de conclusão de ${d.nome}. Verificação: ${d.urlDeVerificacao}`)
  pdf.setKeywords(['certificado', d.codigo])
  pdf.setCreationDate(new Date(d.emitidoEm))
  const p = pdf.addPage([L, A])
  const f = await embutirFontes(pdf, ['texto', 'textoItalico', 'destaque', 'destaqueItalico', 'negrito', 'caligrafia'] as const)

  p.drawRectangle({ x: 0, y: 0, width: L, height: A, color: FUNDO })
  textura(p)
  moldura(p)

  // A logo numa caixa branca sobre a moldura (manual, p. 18: sobre fundo que compromete a leitura, caixa branca).
  const logo = await embutirImagem(pdf, d.logo ?? null)
  const lw = 150, lh = lw / PROPORCAO_DA_LOGO
  p.drawRectangle({ x: (L - lw - 24) / 2, y: A - 18 - lh - 14, width: lw + 24, height: lh + 14, color: rgb(1, 1, 1) })
  if (logo) p.drawImage(logo, { x: (L - lw) / 2, y: A - 25 - lh, width: lw, height: lh })
  else escrever(p, f.negrito, 'CRUZ VERMELHA BRASILEIRA', { x: L / 2, y: A - 60, tamanho: 13, alinhar: 'centro' })

  escrever(p, f.caligrafia, 'Certificado', { x: L / 2, y: A - 176, tamanho: 66, alinhar: 'centro', cor: TINTA })
  escrever(p, f.texto, 'Certificamos que', { x: L / 2, y: A - 212, tamanho: 12.5, alinhar: 'centro', cor: CINZA })
  escrever(p, f.destaqueItalico, d.nome, { x: L / 2, y: A - 252, tamanho: 30, alinhar: 'centro', largura: L - 240 })

  const carga = d.cargaHoraria ? `, com carga horária de ${d.cargaHoraria.toLocaleString('pt-BR')} ${d.cargaHoraria === 1 ? 'hora' : 'horas'}` : ''
  const nota = d.nota !== null ? ` e aproveitamento de ${d.nota}%` : ''
  let y = paragrafoJustificado(p, [
    { texto: 'concluiu o curso', fonte: f.texto },
    { texto: d.curso, fonte: f.negrito },
    { texto: `, ministrado pela Cruz Vermelha Brasileira – Filial do Estado do Rio de Janeiro na Área do Voluntário${carga}${nota}.`, fonte: f.texto },
  ], 118, A - 292, L - 236, 13, 19.5)

  y -= 8
  escrever(p, f.textoItalico, `Rio de Janeiro, ${dataPorExtenso(d.emitidoEm)}.`, { x: L - 118, y, tamanho: 12.5, alinhar: 'direita' })
  if (d.validoAte) escrever(p, f.texto, `Válido até ${dataPorExtenso(d.validoAte)}.`, { x: L - 118, y: y - 16, tamanho: 9.5, alinhar: 'direita', cor: CINZA })

  // Assinatura (tipográfica, como no modelo) e o ornamento do pé.
  const quem = assinaturaDaFilial()
  escrever(p, f.caligrafia, quem.nome, { x: L / 2, y: 126, tamanho: 24, alinhar: 'centro' })
  p.drawLine({ start: { x: L / 2 - 110, y: 118 }, end: { x: L / 2 + 110, y: 118 }, thickness: 0.5, color: CINZA })
  escrever(p, f.destaque, quem.cargo, { x: L / 2, y: 106, tamanho: 9.5, alinhar: 'centro' })
  escrever(p, f.texto, 'Cruz Vermelha Brasileira – Filial do Estado do Rio de Janeiro', { x: L / 2, y: 94, tamanho: 8, alinhar: 'centro', cor: CINZA })
  ornamento(p, L / 2, 66)

  // Verificação: o código à esquerda, o QR à direita, dentro da moldura.
  escrever(p, f.destaque, `Código de verificação: ${d.codigo}`, { x: 60, y: 70, tamanho: 9 })
  quebrar(f.texto, `Confira a autenticidade em ${d.urlDeVerificacao}`, 7.5, 230)
    .forEach((linha, i) => escrever(p, f.texto, linha, { x: 60, y: 58 - i * 10, tamanho: 7.5, cor: CINZA }))
  desenharQr(p, d.urlDeVerificacao, L - 60 - 56, 48, 56, TINTA)
  return pdf.save()
}
