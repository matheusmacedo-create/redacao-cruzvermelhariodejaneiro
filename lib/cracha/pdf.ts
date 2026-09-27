import { PDFDocument, clip, endPath, popGraphicsState, pushGraphicsState, rectangle, rgb, type PDFPage } from 'pdf-lib'
import { embutirFontes, type Fontes } from '@/lib/pdf/fontes'
import { desenharQr, embutirImagem, escrever, imagemCobrindo, mm, quebrar } from '@/lib/pdf/desenho'
import { PROPORCAO_DA_LOGO } from '@/lib/pdf/logo'
import { DADOS_DA_FILIAL } from '@/lib/site/juridico'
import type { Cracha } from './regras'

/**
 * O crachá funcional para imprimir (Manual de Identidade Institucional da
 * CVB, p. 28): duas páginas no tamanho de cartão (54 × 85,6 mm, em pé) —
 * frente e verso — para a gráfica ou para imprimir, recortar e plastificar.
 * Mesmo desenho do crachá na tela (components/cracha/cracha.tsx).
 */

const L = mm(54)
const A = mm(85.6)
const VERMELHO = rgb(227 / 255, 34 / 255, 25 / 255)
const CINZA = rgb(0.23, 0.23, 0.23)
const CINZA_FAIXA = rgb(0.37, 0.38, 0.38)
const BRANCO = rgb(1, 1, 1)

/** y a partir do topo, em mm (o PDF conta de baixo para cima). */
const topo = (v: number) => A - mm(v)

export type DadosDoPdfDoCracha = Pick<Cracha, 'nomeDeDestaque' | 'nomeCompleto' | 'funcao' | 'setor' | 'faixa' | 'cpf' | 'desde' | 'fatorRh' | 'origem'> & {
  urlDeVerificacao: string
  foto: Uint8Array | null
  logo: Uint8Array | null
}

/** Sem foto (ou foto em formato que o PDF não embute): a silhueta do modelo do manual. */
function silhueta(p: PDFPage, x: number, y: number, w: number, h: number) {
  p.drawRectangle({ x, y, width: w, height: h, color: rgb(0.93, 0.93, 0.93) })
  p.pushOperators(pushGraphicsState(), rectangle(x, y, w, h), clip(), endPath())
  p.drawCircle({ x: x + w / 2, y: y + h * 0.61, size: w * 0.225, color: rgb(0.17, 0.17, 0.17) })
  p.drawEllipse({ x: x + w / 2, y: y, xScale: w * 0.4, yScale: h * 0.34, color: rgb(0.17, 0.17, 0.17) })
  p.pushOperators(popGraphicsState())
}

function pagina(pdf: PDFDocument): PDFPage {
  const p = pdf.addPage([L, A])
  p.drawRectangle({ x: 0, y: 0, width: L, height: A, color: BRANCO })
  return p
}

function campo(p: PDFPage, f: Pick<Fontes, 'texto' | 'condensadaNegrito'>, rotulo: string, valor: string, x: number, y: number, w: number) {
  escrever(p, f.condensadaNegrito, rotulo, { x: x + mm(0.3), y: topo(y), tamanho: 7 })
  p.drawRectangle({ x, y: topo(y + 5.3), width: w, height: mm(4.2), borderColor: rgb(0.6, 0.6, 0.6), borderWidth: 0.5, color: BRANCO })
  escrever(p, f.texto, valor, { x: x + mm(1.5), y: topo(y + 4.2), tamanho: 7.2, largura: w - mm(3) })
}

export async function gerarPdfDoCracha(d: DadosDoPdfDoCracha): Promise<Uint8Array> {
  const pdf = await PDFDocument.create()
  pdf.setTitle(`Crachá funcional — ${d.nomeCompleto}`)
  pdf.setAuthor(DADOS_DA_FILIAL.nome)
  pdf.setSubject(`Crachá funcional. Verificação: ${d.urlDeVerificacao}`)
  const f = await embutirFontes(pdf, ['texto', 'negrito', 'condensada', 'condensadaNegrito'] as const)
  const logo = await embutirImagem(pdf, d.logo)
  const foto = await embutirImagem(pdf, d.foto)

  // ---------------------------------------------------------------- frente
  const frente = pagina(pdf)
  if (logo) {
    const w = mm(44)
    frente.drawImage(logo, { x: (L - w) / 2, y: topo(4.5) - w / PROPORCAO_DA_LOGO, width: w, height: w / PROPORCAO_DA_LOGO })
  } else {
    escrever(frente, f.condensadaNegrito, 'CRUZ VERMELHA BRASILEIRA', { x: L / 2, y: topo(14), tamanho: 12, alinhar: 'centro', largura: L - mm(8) })
  }
  const fx = (L - mm(25)) / 2, fy = topo(56.5), fw = mm(25), fh = mm(31.5)
  if (foto) imagemCobrindo(frente, foto, fx, fy, fw, fh)
  else silhueta(frente, fx, fy, fw, fh)

  frente.drawRectangle({ x: 0, y: topo(69.5), width: L, height: mm(9.5), color: VERMELHO })
  escrever(frente, f.condensadaNegrito, d.nomeDeDestaque.toUpperCase(), { x: L / 2, y: topo(66.6), tamanho: 17, alinhar: 'centro', largura: L - mm(6), cor: BRANCO })

  const funcao = [d.funcao, d.setor].filter(Boolean).join(' · ').toUpperCase()
  quebrar(f.condensadaNegrito, funcao, 9, L - mm(8)).slice(0, 2)
    .forEach((linha, i) => escrever(frente, f.condensadaNegrito, linha, { x: L / 2, y: topo(73.8 + i * 3.4), tamanho: 9, alinhar: 'centro' }))
  escrever(frente, f.texto, 'Filial do Estado do Rio de Janeiro', { x: L / 2, y: topo(81.6), tamanho: 5, alinhar: 'centro', cor: CINZA })
  escrever(frente, f.texto, `CNPJ ${DADOS_DA_FILIAL.cnpj}`, { x: L / 2, y: topo(83.8), tamanho: 5, alinhar: 'centro', cor: CINZA })

  // ---------------------------------------------------------------- verso
  const verso = pagina(pdf)
  escrever(verso, f.texto, 'CRACHÁ FUNCIONAL', { x: mm(3), y: topo(6.2), tamanho: 7.5 })
  quebrar(f.texto, 'Aponte a câmera para o código e confira se o crachá é válido.', 4.8, mm(31))
    .forEach((linha, i) => escrever(verso, f.texto, linha, { x: mm(3), y: topo(9 + i * 2), tamanho: 4.8, cor: CINZA }))
  desenharQr(verso, d.urlDeVerificacao, L - mm(3) - mm(13), topo(16), mm(13))

  campo(verso, f, 'Nome completo:', d.nomeCompleto, mm(3), 19.5, L - mm(6))
  campo(verso, f, 'CPF:', d.cpf ?? 'Não informado', mm(3), 27.3, L - mm(6))
  const meio = (L - mm(6) - mm(2)) / 2
  campo(verso, f, d.origem === 'voluntario' ? 'Desde:' : 'Admissão:', d.desde ?? '—', mm(3), 35.1, meio)
  campo(verso, f, 'Fator RH:', d.fatorRh ?? 'Não informado', mm(3) + meio + mm(2), 35.1, meio)

  verso.drawRectangle({ x: mm(2), y: topo(49), width: L - mm(4), height: mm(6.4), borderColor: VERMELHO, borderWidth: 1.1 })
  escrever(verso, f.condensadaNegrito, d.faixa, { x: L / 2, y: topo(47.2), tamanho: 12.5, alinhar: 'centro', largura: L - mm(7) })
  verso.drawRectangle({ x: 0, y: topo(53.6), width: L, height: mm(3.4), color: CINZA_FAIXA })
  escrever(verso, f.texto, 'VÁLIDO EM TODO O TERRITÓRIO NACIONAL', { x: L / 2, y: topo(52.4), tamanho: 5.2, alinhar: 'centro', cor: BRANCO })

  let y = 56.2
  for (const linha of quebrar(f.texto, 'UTILIDADE PÚBLICA INTERNACIONAL — Decreto Federal nº 9.620, de 13/06/1912. Este documento pertence à CVB; em caso de extravio, favor enviar para:', 4.4, L - mm(6))) {
    escrever(verso, f.texto, linha, { x: mm(3), y: topo(y), tamanho: 4.4 }); y += 1.85
  }
  const blocoTopo = y - 0.6
  const contato = [DADOS_DA_FILIAL.endereco, `${DADOS_DA_FILIAL.telefone} · ${DADOS_DA_FILIAL.email}`].flatMap((t) => quebrar(f.texto, t, 4.6, L - mm(8)))
  const blocoAltura = 3.2 + 2.1 + contato.length * 2.1 + 1.4
  verso.drawRectangle({ x: 0, y: topo(blocoTopo + blocoAltura), width: L, height: mm(blocoAltura), color: VERMELHO })
  escrever(verso, f.condensadaNegrito, 'CRUZ VERMELHA BRASILEIRA', { x: mm(4), y: topo(blocoTopo + 3), tamanho: 6.8, cor: BRANCO })
  escrever(verso, f.texto, 'Filial do Estado do Rio de Janeiro', { x: mm(4), y: topo(blocoTopo + 5.1), tamanho: 4.6, cor: BRANCO })
  contato.forEach((linha, i) => escrever(verso, f.texto, linha, { x: mm(4), y: topo(blocoTopo + 7.2 + i * 2.1), tamanho: 4.6, cor: BRANCO }))

  const aviso = quebrar(f.texto, 'Este crachá é a identificação oficial do(a) colaborador(a) da Cruz Vermelha Brasileira, de uso pessoal e intransferível. A instituição credencia o portador como pertencente aos seus quadros e solicita às autoridades civis e militares que o reconheçam como tal.', 3.9, L - mm(6))
  aviso.forEach((linha, i) => escrever(verso, f.texto, linha, { x: mm(3), y: topo(85.6 - 1.6 - (aviso.length - 1 - i) * 1.65), tamanho: 3.9, cor: CINZA }))

  return pdf.save()
}
