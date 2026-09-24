import 'server-only'

import sharp from 'sharp'
import { LARGURAS } from './regras'

export type VersaoDaImagem = { largura: number; altura: number; bytes: Buffer }

/**
 * As versões para a web de uma imagem do acervo: WebP em 480, 960 e 1600 px de largura (nunca
 * maior que o original; imagem menor sai numa versão só, do tamanho dela). A orientação da câmera
 * é aplicada e os metadados ficam de fora — inclusive o GPS, que não pode ir para página pública.
 */
export async function versoesDaImagem(original: Buffer): Promise<{ largura: number; altura: number; versoes: VersaoDaImagem[] }> {
  const meta = await sharp(original, { limitInputPixels: 120_000_000 }).metadata()
  if (!meta.width || !meta.height) throw new Error('Não consegui ler as dimensões da imagem.')
  // Orientações 5 a 8 giram 90°: largura e altura trocam depois de aplicar.
  const deitada = (meta.orientation ?? 1) >= 5
  const largura = deitada ? meta.height : meta.width
  const altura = deitada ? meta.width : meta.height
  const alvos = [...new Set(LARGURAS.map((w) => Math.min(w, largura)))]
  const versoes: VersaoDaImagem[] = []
  for (const alvo of alvos) {
    const { data, info } = await sharp(original, { limitInputPixels: 120_000_000 })
      .rotate()
      .resize({ width: alvo, withoutEnlargement: true })
      .webp({ quality: 80, effort: 4 })
      .toBuffer({ resolveWithObject: true })
    versoes.push({ largura: info.width, altura: info.height, bytes: data })
  }
  return { largura, altura, versoes }
}
