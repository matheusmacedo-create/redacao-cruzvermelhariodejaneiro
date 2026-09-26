import 'server-only'

import sharp from 'sharp'
import { FOTO, trocarExtensao, type PerfilDeFoto } from './regras'

/**
 * A mesma otimização de foto do navegador (lib/midia/preparar.ts), no
 * servidor — para o que chega à Biblioteca sem passar por ele: imagens da
 * IA (PNG), capas do Cérebro, fotos dos envios da equipe e a foto grande que
 * escapou do preparo no upload.
 *
 * JPEG sRGB (mozjpeg), girado pelo EXIF, sem metadados (o GPS sai), lado
 * maior do perfil sem aumentar. PNG com transparência de verdade continua
 * PNG (paleta). GIF, imagem animada e HEIC (o sharp daqui não decodifica
 * HEVC) voltam como estão, com `mudou: false`.
 */

export type PerfilDoServidor = PerfilDeFoto | 'arte'

export type ImagemOtimizada = {
  bytes: Buffer
  tipo: string
  extensao: string
  largura: number | null
  altura: number | null
  /** false: devolveu o original (e `motivo` diz por quê). */
  mudou: boolean
  motivo: string
}

const LIMITE_DE_PIXELS = 120_000_000
/** Tipos que o sharp daqui abre e que valem a pena otimizar. */
export const TIPOS_OTIMIZAVEIS = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/avif', 'image/tiff'])

const EXTENSAO: Record<string, string> = { 'image/jpeg': '.jpg', 'image/png': '.png', 'image/webp': '.webp', 'image/gif': '.gif', 'image/avif': '.avif', 'image/tiff': '.tif' }

/**
 * `arte`: imagem com texto (as da IA, cards com o vermelho da marca):
 * qualidade maior e sem subamostragem de cor, senão o texto vermelho borra.
 */
export async function otimizarImagem(entrada: Buffer, tipo: string, perfil: PerfilDoServidor = 'padrao'): Promise<ImagemOtimizada> {
  const manter = (motivo: string): ImagemOtimizada => ({ bytes: entrada, tipo, extensao: EXTENSAO[tipo] ?? '', largura: null, altura: null, mudou: false, motivo })
  if (!TIPOS_OTIMIZAVEIS.has(tipo)) return manter('tipo que não se otimiza')

  const meta = await sharp(entrada, { limitInputPixels: LIMITE_DE_PIXELS }).metadata()
  if (meta.format === 'heif' && meta.compression === 'hevc') return manter('HEIC: o servidor não abre')
  if ((meta.pages ?? 1) > 1) return manter('imagem animada')
  if (!meta.width || !meta.height) return manter('sem medidas')

  const lado = perfil === 'arte' ? FOTO.padrao.lado : FOTO[perfil].lado
  const base = () => sharp(entrada, { limitInputPixels: LIMITE_DE_PIXELS, autoOrient: true })
    .resize({ width: lado, height: lado, fit: 'inside', withoutEnlargement: true })

  // Transparência de verdade (não só o canal alfa de uma captura de tela opaca).
  const transparente = Boolean(meta.hasAlpha) && !(await sharp(entrada, { limitInputPixels: LIMITE_DE_PIXELS }).stats()).isOpaque
  const saida = transparente
    ? await base().png({ palette: true, quality: 90, compressionLevel: 9, effort: 7 }).toBuffer({ resolveWithObject: true })
    : await base().flatten({ background: '#ffffff' }).jpeg(
      perfil === 'arte' ? { quality: 88, mozjpeg: true, chromaSubsampling: '4:4:4' }
        : perfil === 'alta' ? { quality: 90, mozjpeg: true }
          : { quality: 82, mozjpeg: true },
    ).toBuffer({ resolveWithObject: true })
  const tipoFinal = transparente ? 'image/png' : 'image/jpeg'

  // Nunca piorar: sem redução, sem metadado a tirar, no mesmo formato e sem
  // ganho, fica o original. Com metadado (GPS), a versão nova vale mesmo maior.
  const reduziu = saida.info.width < (meta.autoOrient?.width ?? meta.width) || saida.info.height < (meta.autoOrient?.height ?? meta.height)
  const temMetadado = Boolean(meta.exif || meta.xmp || meta.iptc) || (meta.orientation ?? 1) > 1
  if (!reduziu && !temMetadado && tipoFinal === tipo && saida.data.length >= entrada.length * 0.95) return manter('já estava leve')

  return {
    bytes: saida.data, tipo: tipoFinal, extensao: EXTENSAO[tipoFinal], largura: saida.info.width, altura: saida.info.height, mudou: true,
    motivo: `${saida.info.width}×${saida.info.height} ${transparente ? 'PNG' : 'JPEG'}`,
  }
}

/** O nome com a extensão do tipo final ("capa.png" → "capa.jpg"). */
export const nomeFinal = (nome: string, imagem: ImagemOtimizada) => (imagem.mudou && imagem.extensao ? trocarExtensao(nome, imagem.extensao) : nome)
