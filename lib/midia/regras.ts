/**
 * Como cada arquivo chega à Biblioteca: o que é puro (sem DOM, sem sharp) e
 * vale no navegador e no servidor. Decisões em ARQUITETURA.md §7.4.
 *
 * - Foto: JPEG sRGB, girada pelo EXIF, sem metadados (some o GPS), lado
 *   maior de 2048 px — o mesmo teto do envio às redes, que então não
 *   recomprime. PNG com transparência de verdade continua PNG. GIF e imagem
 *   animada ficam como estão. "Alta qualidade" (impressão) vai a 4096 px.
 * - Vídeo: MP4 H.264 + AAC, lado maior de 1920 px, até 30 fps, ~5 Mbps — o
 *   único formato aceito ao mesmo tempo por Instagram, Threads, X e pelo
 *   <video> do site.
 * - Documento e áudio: vão como estão.
 *
 * Conferência: npx tsx scripts/conferir-midia.ts
 */

export type PerfilDeFoto = 'padrao' | 'alta'

export const FOTO: Record<PerfilDeFoto, { lado: number; qualidade: number }> = {
  padrao: { lado: 2048, qualidade: 0.85 },
  alta: { lado: 4096, qualidade: 0.92 },
}

export const VIDEO = { lado: 1920, bitrate: 5_000_000, fpsMaximo: 30 }

/**
 * Foto que o navegador já conferiu só é recomprimida pelo servidor acima
 * disto (uma foto de 2048 px bem comprimida fica bem abaixo). A que chega sem
 * ter passado pelo preparo é conferida pelo servidor em qualquer tamanho.
 */
export const LIMIAR_DO_SERVIDOR: Record<PerfilDeFoto, number> = {
  padrao: 1.5 * 1024 * 1024,
  alta: 12 * 1024 * 1024,
}

/** Tipos de foto que o servidor abre e otimiza (sharp). GIF, SVG e HEIC ficam de fora. */
export const TIPOS_OTIMIZAVEIS = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/avif', 'image/tiff'])

/** A extensão de cada tipo de imagem, para o nome e o caminho do arquivo. */
export const EXTENSAO_DO_TIPO: Record<string, string> = {
  'image/jpeg': '.jpg', 'image/png': '.png', 'image/webp': '.webp', 'image/gif': '.gif', 'image/avif': '.avif', 'image/tiff': '.tif',
}

/** Acima disto o servidor não lê a foto inteira para otimizar: estouro de memória não se pega com try/catch. */
export const TETO_PARA_OTIMIZAR = 100 * 1024 * 1024

export type TipoFarejado = 'jpeg' | 'png' | 'gif' | 'webp' | 'heic' | 'avif' | 'mov' | 'mp4' | 'outro'

const ascii = (b: Uint8Array, i: number, n: number) => String.fromCharCode(...b.subarray(i, i + n))

/** O tipo pelo conteúdo (assinatura / marca `ftyp`), não pelo nome nem pelo que o navegador diz. */
export function farejarTipo(b: Uint8Array): TipoFarejado {
  if (b.length < 12) return 'outro'
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'jpeg'
  if (b[0] === 0x89 && ascii(b, 1, 3) === 'PNG') return 'png'
  if (ascii(b, 0, 4) === 'GIF8') return 'gif'
  if (ascii(b, 0, 4) === 'RIFF' && ascii(b, 8, 4) === 'WEBP') return 'webp'
  if (ascii(b, 4, 4) === 'ftyp') {
    const marca = ascii(b, 8, 4)
    if (['heic', 'heix', 'hevc', 'hevx', 'heim', 'heis'].includes(marca)) return 'heic'
    if (marca === 'avif' || marca === 'avis') return 'avif'
    if (marca === 'mif1' || marca === 'msf1') return ascii(b, 16, Math.min(32, b.length - 16)).includes('avif') ? 'avif' : 'heic'
    if (marca === 'qt  ') return 'mov'
    return 'mp4'
  }
  return 'outro'
}

/**
 * JPEG com metadado que pode levar localização ou dados pessoais, antes do
 * início da imagem: EXIF (APP1 "Exif", onde mora o GPS), XMP (APP1 da
 * Adobe, que também pode ter exif:GPS…) ou IPTC (APP13 "Photoshop 3.0").
 */
export function jpegTemMetadados(b: Uint8Array): boolean {
  let i = 2
  while (i + 4 < b.length && b[i] === 0xff) {
    const marca = b[i + 1]
    if (marca === 0xda) return false
    const tamanho = (b[i + 2] << 8) | b[i + 3]
    if (marca === 0xe1 && (ascii(b, i + 4, 4) === 'Exif' || ascii(b, i + 4, 20).startsWith('http://ns.adobe.com/'))) return true
    if (marca === 0xed && ascii(b, i + 4, 13) === 'Photoshop 3.0') return true
    i += 2 + tamanho
  }
  return false
}

/** PNG: pode ter transparência (tipo de cor 4/6 ou bloco tRNS)? É animado (APNG, bloco acTL)? */
export function pngInfo(b: Uint8Array): { podeTerAlfa: boolean; animado: boolean } {
  const tipoDeCor = b[25]
  let i = 8
  let trns = false
  let animado = false
  while (i + 8 <= b.length) {
    const tamanho = ((b[i] << 24) | (b[i + 1] << 16) | (b[i + 2] << 8) | b[i + 3]) >>> 0
    const nome = ascii(b, i + 4, 4)
    if (nome === 'tRNS') trns = true
    if (nome === 'acTL') animado = true
    if (nome === 'IDAT' || nome === 'IEND') break
    i += 12 + tamanho
  }
  return { podeTerAlfa: tipoDeCor === 4 || tipoDeCor === 6 || trns, animado }
}

/** WebP: VP8X traz as flags de animação (bit 1) e alfa (bit 4); VP8L pode ter alfa. */
export function webpInfo(b: Uint8Array): { podeTerAlfa: boolean; animado: boolean } {
  const bloco = ascii(b, 12, 4)
  if (bloco === 'VP8X') return { animado: Boolean(b[20] & 0x02), podeTerAlfa: Boolean(b[20] & 0x10) }
  return { animado: false, podeTerAlfa: bloco === 'VP8L' }
}

/** Reduz para o lado maior caber em `limite`, sem aumentar. Vídeo pede medidas pares. */
export function caber(largura: number, altura: number, limite: number, par = false): { largura: number; altura: number; reduziu: boolean } {
  const maior = Math.max(largura, altura)
  const arredondar = (n: number) => (par ? Math.max(2, Math.round(n / 2) * 2) : Math.max(1, Math.round(n)))
  if (maior <= limite) return { largura: par ? arredondar(largura) : largura, altura: par ? arredondar(altura) : altura, reduziu: false }
  const f = limite / maior
  return { largura: arredondar(largura * f), altura: arredondar(altura * f), reduziu: true }
}

/** "IMG_2043.HEIC" → "IMG_2043.jpg". Sem extensão, acrescenta. */
export function trocarExtensao(nome: string, extensao: string): string {
  const base = nome.replace(/\.[^./\\]{1,8}$/, '') || 'arquivo'
  return `${base}${extensao}`
}

export type SobreOVideo = { largura: number; altura: number; codec: string | null; fps: number; bitrate: number }

/**
 * Converter um vídeo? Só quando ganha alguma coisa: reduzir o tamanho da
 * tela, baixar o fps, sair de um codec que nem todo lugar toca (HEVC, VP9…)
 * ou cortar um bitrate bem acima do alvo.
 */
export function decidirVideo(v: SobreOVideo, alvo = VIDEO): { converter: boolean; largura: number; altura: number; fps: number | null; motivos: string[] } {
  const medida = caber(v.largura, v.altura, alvo.lado, true)
  const motivos: string[] = []
  if (medida.reduziu) motivos.push(`${v.largura}×${v.altura} → ${medida.largura}×${medida.altura}`)
  const fpsAlto = v.fps > alvo.fpsMaximo + 1
  if (fpsAlto) motivos.push(`${Math.round(v.fps)} → ${alvo.fpsMaximo} fps`)
  if (v.codec !== 'avc') motivos.push(`${v.codec ?? 'codec desconhecido'} → H.264`)
  if (v.bitrate > alvo.bitrate * 1.3) motivos.push(`${(v.bitrate / 1e6).toFixed(1)} → ${(alvo.bitrate / 1e6).toFixed(0)} Mbps`)
  return { converter: motivos.length > 0, largura: medida.largura, altura: medida.altura, fps: fpsAlto ? alvo.fpsMaximo : null, motivos }
}

/** 12 400 000 → "11,8 MB". */
export function tamanhoLegivel(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1).replace('.', ',')} MB`
  return `${(bytes / 1024 / 1024 / 1024).toFixed(2).replace('.', ',')} GB`
}

/** "11,8 MB → 1,1 MB (−91%)", ou null quando não economizou nada que valha dizer. */
export function textoDaEconomia(antes: number, depois: number): string | null {
  if (!(antes > 0) || depois >= antes * 0.95) return null
  return `${tamanhoLegivel(antes)} → ${tamanhoLegivel(depois)} (−${Math.round((1 - depois / antes) * 100)}%)`
}
