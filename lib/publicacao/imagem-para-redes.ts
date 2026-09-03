import 'server-only'
import sharp from 'sharp'

/**
 * Conforma a imagem aos tetos da rede mais exigente do envio.
 *
 * Cada rede tem um limite de arquivo que a documentação do conector lista e a
 * Biblioteca não conhece: o Bluesky recusa acima de 1MB, o X acima de 5MB, o
 * Threads reamostra além de 1440px. Mandar o original e receber a recusa
 * depois é a pior ordem — aqui a imagem é redimensionada e recomprimida ANTES
 * do envio. O original da Biblioteca não muda; o que viaja é uma cópia.
 */

/** O teto do envio é o mais apertado entre as redes dele. */
export function tetoDaImagem(redes: string[]): { maxBytes: number; maxLado: number } {
  // Folga sob os 5MB do X; Facebook/Instagram/LinkedIn aceitam mais.
  let maxBytes = 4_500_000
  let maxLado = 2048
  // Bluesky: 1MB por imagem — o limite mais duro entre as redes atendidas.
  if (redes.includes('bluesky')) maxBytes = Math.min(maxBytes, 950_000)
  // Threads: acima de 1440px o servidor deles reamostra de qualquer jeito.
  if (redes.includes('threads')) maxLado = Math.min(maxLado, 1440)
  return { maxBytes, maxLado }
}

const nomeJpeg = (nome: string) => `${nome.replace(/\.[a-z0-9]+$/i, '') || 'imagem'}.jpg`

/**
 * Dentro do teto, o arquivo passa intocado. Fora dele, desce o lado maior e a
 * qualidade até caber — qualidade 60 ainda é boa para foto de rede social, e
 * recusa por tamanho é pior. GIF fica de fora: recomprimir mataria a animação.
 */
export async function conformarImagem(arquivo: File, redes: string[]): Promise<File> {
  if (!arquivo.type.startsWith('image/') || arquivo.type === 'image/gif') return arquivo

  const { maxBytes, maxLado } = tetoDaImagem(redes)
  const bytes = Buffer.from(await arquivo.arrayBuffer())
  const meta = await sharp(bytes, { failOn: 'none' }).metadata().catch(() => null)
  if (!meta) return arquivo

  const lado = Math.max(meta.width ?? 0, meta.height ?? 0)
  if (bytes.length <= maxBytes && lado <= maxLado) return arquivo

  for (const qualidade of [88, 80, 70, 60]) {
    // rotate() aplica a orientação do EXIF antes de recomprimir — sem isso a
    // foto de celular deitada sairia de lado depois que o EXIF se perde.
    const saida = await sharp(bytes, { failOn: 'none' })
      .rotate()
      .resize({ width: maxLado, height: maxLado, fit: 'inside', withoutEnlargement: true })
      .jpeg({ quality: qualidade, mozjpeg: true })
      .toBuffer()
    if (saida.length <= maxBytes) {
      return new File([new Uint8Array(saida)], nomeJpeg(arquivo.name), { type: 'image/jpeg' })
    }
  }

  // Último recurso: um lado bem menor. 1080px cobre o feed de qualquer rede.
  const minima = await sharp(bytes, { failOn: 'none' })
    .rotate()
    .resize({ width: 1080, height: 1080, fit: 'inside', withoutEnlargement: true })
    .jpeg({ quality: 60, mozjpeg: true })
    .toBuffer()
  return new File([new Uint8Array(minima)], nomeJpeg(arquivo.name), { type: 'image/jpeg' })
}
