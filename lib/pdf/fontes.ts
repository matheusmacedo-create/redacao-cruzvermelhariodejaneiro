import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import fontkit from '@pdf-lib/fontkit'
import { StandardFonts, type PDFDocument, type PDFFont } from 'pdf-lib'

/**
 * As fontes da identidade nos PDFs (crachá, certificado). O Manual de
 * Identidade Institucional da CVB pede Franklin Gothic (Demi Cond no logotipo
 * e nos títulos, Book no texto); ela é paga, então usamos as equivalentes
 * livres (SIL OFL, licenças ao lado dos arquivos em lib/pdf/fontes):
 * - Libre Franklin: a Franklin Gothic redesenhada — a mesma do app;
 * - Barlow Condensed: o traço condensado da Demi Cond (nome e faixas);
 * - Great Vibes: a caligrafia do título do certificado do manual (p. 29).
 *
 * Os arquivos entram no pacote da Vercel por `outputFileTracingIncludes`
 * (next.config.mjs). Sem o arquivo, a peça sai com as fontes padrão do PDF —
 * feia, mas sai.
 */

const PASTA = join(process.cwd(), 'lib', 'pdf', 'fontes')

export const ARQUIVOS = {
  texto: 'LibreFranklin_400Regular.ttf',
  textoItalico: 'LibreFranklin_400Regular_Italic.ttf',
  destaque: 'LibreFranklin_600SemiBold.ttf',
  destaqueItalico: 'LibreFranklin_600SemiBold_Italic.ttf',
  negrito: 'LibreFranklin_700Bold.ttf',
  condensada: 'BarlowCondensed_600SemiBold.ttf',
  condensadaNegrito: 'BarlowCondensed_700Bold.ttf',
  caligrafia: 'GreatVibes_400Regular.ttf',
} as const

export type Estilo = keyof typeof ARQUIVOS
export type Fontes = Record<Estilo, PDFFont>

const RESERVA: Record<Estilo, StandardFonts> = {
  texto: StandardFonts.Helvetica,
  textoItalico: StandardFonts.HelveticaOblique,
  destaque: StandardFonts.HelveticaBold,
  destaqueItalico: StandardFonts.HelveticaBoldOblique,
  negrito: StandardFonts.HelveticaBold,
  condensada: StandardFonts.HelveticaBold,
  condensadaNegrito: StandardFonts.HelveticaBold,
  caligrafia: StandardFonts.TimesRomanItalic,
}

// Uma leitura do disco por instância; cada PDF embute a sua cópia (só os glifos usados).
const cache = new Map<Estilo, Promise<Uint8Array | null>>()
function bytes(estilo: Estilo): Promise<Uint8Array | null> {
  let p = cache.get(estilo)
  if (!p) {
    p = readFile(join(PASTA, ARQUIVOS[estilo])).then((b) => new Uint8Array(b), () => null)
    cache.set(estilo, p)
  }
  return p
}

/** Embute as fontes pedidas no documento. `subset` guarda só as letras usadas. */
export async function embutirFontes<E extends Estilo>(pdf: PDFDocument, estilos: readonly E[]): Promise<Pick<Fontes, E>> {
  pdf.registerFontkit(fontkit)
  const saida = {} as Pick<Fontes, E>
  for (const e of estilos) {
    const b = await bytes(e)
    // A caligrafia vai inteira: o recorte do pdf-lib perde glifos dela (saía só "ad" de "Certificado").
    saida[e] = b ? await pdf.embedFont(b, { subset: e !== 'caligrafia' }) : await pdf.embedFont(RESERVA[e])
  }
  return saida
}

/** Troca o que a fonte não desenha: travessões viram hífen, espaços especiais viram espaço, o resto "?". */
export function textoQueCabe(fonte: PDFFont, texto: string): string {
  const ok = new Set(fonte.getCharacterSet())
  let out = ''
  for (const ch of texto.normalize('NFC')) {
    if (ok.has(ch.codePointAt(0) as number)) out += ch
    else if (/[‐-―−]/.test(ch)) out += '-'
    else if (/[  ]/.test(ch)) out += ' '
    else out += '?'
  }
  return out
}
