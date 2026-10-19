import 'server-only'

import sharp from 'sharp'
import { farejarTipo } from '@/lib/midia/regras'

/**
 * A foto do visitante que chegou pelo WhatsApp (lib/whatsapp/portaria.ts), antes de ir ao Blob privado. A tela da
 * portaria já tira a foto reduzida no navegador; a do celular chega inteira, e aqui ela passa pela mesma garantia:
 *
 *  - só abre o que o conteúdo confirma ser foto (JPEG, PNG ou WebP): um "JPEG" que por dentro é SVG, HEIC ou PDF
 *    não chega ao sharp;
 *  - teto de pixels na entrada, contra a bomba de descompressão (um arquivo pequeno que diz ter 50.000 × 50.000 px);
 *  - girada pelo EXIF (a foto de celular deitada fica em pé), no máximo 1024 px no maior lado, sem aumentar;
 *  - JPEG ~80, sem metadado nenhum: o sharp não copia EXIF, XMP, IPTC nem o GPS sem que se peça.
 *
 * Nunca lança: null quando a imagem não serve ou não abre (quem chama diz que a foto não entrou).
 */

export const LADO_DA_FOTO_DO_VISITANTE = 1024
export const QUALIDADE_DA_FOTO_DO_VISITANTE = 80
/** O mesmo teto da otimização das fotos da Biblioteca (lib/midia/otimizar-imagem.ts): cobre a câmera de qualquer celular. */
export const PIXELS_DA_FOTO_DO_VISITANTE = 120_000_000

const ABRE = new Set(['jpeg', 'png', 'webp'])

export async function normalizarFotoDoVisitante(entrada: Uint8Array): Promise<Buffer | null> {
  if (!ABRE.has(farejarTipo(entrada))) return null
  try {
    const saida = await sharp(entrada, { limitInputPixels: PIXELS_DA_FOTO_DO_VISITANTE, autoOrient: true })
      .resize({ width: LADO_DA_FOTO_DO_VISITANTE, height: LADO_DA_FOTO_DO_VISITANTE, fit: 'inside', withoutEnlargement: true })
      // PNG ou WebP com transparência: o fundo vira branco (o JPEG não tem canal alfa).
      .flatten({ background: '#ffffff' })
      .jpeg({ quality: QUALIDADE_DA_FOTO_DO_VISITANTE, mozjpeg: true })
      .toBuffer()
    return saida.length ? saida : null
  } catch {
    return null
  }
}
