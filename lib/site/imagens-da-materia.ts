import 'server-only'

import sharp from 'sharp'

/**
 * As versões para a web das fotos de uma matéria.
 *
 * As capas iam para o site como vieram da Biblioteca — PNG de 1,3 a 2,6 MB,
 * sem medidas —, e a página levava 15 s para mostrar a foto no celular. Agora
 * cada foto sai em duas formas:
 *
 *  - um JPEG de até 1600 px de largura (mozjpeg, qualidade 82): é o arquivo
 *    canônico da foto, o do og:image, o do índice e o que a newsletter usa;
 *  - WebP em 480, 960 e 1600 px, para o `srcset` da página.
 *
 * Nunca aumenta a foto, aplica a orientação da câmera e deixa os metadados de
 * fora (inclusive o GPS, que não pode ir para página pública). GIF e SVG não
 * passam por aqui: vão como estão. Mesma foto, mesma saída — publicar de novo
 * regrava os mesmos arquivos com os mesmos nomes.
 */

export const LARGURA_DO_JPEG = 1600
export const LARGURAS_WEBP = [480, 960, 1600] as const
const LIMITE_DE_PIXELS = 120_000_000
const OPCOES = { limitInputPixels: LIMITE_DE_PIXELS } as const

export type VersaoDaFoto = { largura: number; altura: number; bytes: Buffer }
export type FotoDaMateria = { jpeg: VersaoDaFoto; webp: VersaoDaFoto[] }

/** Os tipos que ganham as versões para a web. GIF (animação) e SVG (vetor) vão como estão. */
export const TIPOS_PROCESSADOS = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/avif', 'image/tiff', 'image/heic', 'image/heif'])
/** Os que o navegador mostra do jeito que estão, se o processamento falhar. */
export const TIPOS_QUE_O_NAVEGADOR_MOSTRA = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/avif', 'image/gif', 'image/svg+xml'])

export async function processarFotoDaMateria(original: Buffer): Promise<FotoDaMateria> {
  const meta = await sharp(original, OPCOES).metadata()
  if (!meta.width || !meta.height) throw new Error('Não consegui ler as dimensões da imagem.')
  // Orientações 5 a 8 giram 90°: largura e altura trocam depois de aplicar.
  const largura = (meta.orientation ?? 1) >= 5 ? meta.height : meta.width

  const jpeg = await sharp(original, OPCOES)
    .rotate()
    .resize({ width: Math.min(LARGURA_DO_JPEG, largura), withoutEnlargement: true })
    // Transparência vira branco, o fundo da página: JPEG não tem canal alfa.
    .flatten({ background: '#ffffff' })
    .jpeg({ quality: 82, mozjpeg: true })
    .toBuffer({ resolveWithObject: true })

  const webp: VersaoDaFoto[] = []
  for (const alvo of [...new Set(LARGURAS_WEBP.map((w) => Math.min(w, largura)))]) {
    const { data, info } = await sharp(original, OPCOES)
      .rotate()
      .resize({ width: alvo, withoutEnlargement: true })
      .webp({ quality: 80, effort: 4 })
      .toBuffer({ resolveWithObject: true })
    webp.push({ largura: info.width, altura: info.height, bytes: data })
  }
  return { jpeg: { largura: jpeg.info.width, altura: jpeg.info.height, bytes: jpeg.data }, webp }
}

/** Largura e altura de uma imagem que vai como está (GIF, SVG). Nulo se não der para ler. */
export async function medidasDaImagem(bytes: Buffer): Promise<{ largura: number; altura: number } | null> {
  try {
    const meta = await sharp(bytes, { ...OPCOES, animated: false }).metadata()
    const altura = meta.pageHeight ?? meta.height
    if (!meta.width || !altura) return null
    const deitada = (meta.orientation ?? 1) >= 5
    return deitada ? { largura: altura, altura: meta.width } : { largura: meta.width, altura }
  } catch {
    return null
  }
}
