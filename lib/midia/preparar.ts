'use client'

import { FOTO, VIDEO, caber, decidirVideo, farejarTipo, jpegTemExif, pngInfo, trocarExtensao, webpInfo, type PerfilDeFoto, type TipoFarejado } from './regras'

/**
 * Prepara, no navegador, o arquivo que vai para a Biblioteca: é aqui que ele
 * fica leve, antes de subir (regras em lib/midia/regras.ts).
 *
 * - Foto: canvas nativo, sem biblioteca. Abrir com createImageBitmap já
 *   aplica a orientação do EXIF, e exportar do canvas grava só os pixels —
 *   GPS e demais metadados ficam para trás. HEIC abre onde o navegador sabe
 *   abrir (Safari); nos outros, a mensagem pede JPEG.
 * - Vídeo: mediabunny (WebCodecs), carregada só quando o arquivo é vídeo.
 *   Sem codificador H.264 no navegador, só troca o contêiner (tira a
 *   localização) — e, se nem isso der, vai o original.
 * - Qualquer falha que não seja do usuário: vai o original. O servidor
 *   ainda confere tipo, tamanho e espaço, e recomprime foto grande.
 */

export type Preparado = {
  arquivo: File
  original: { nome: string; tamanho: number; tipo: string }
  otimizado: boolean
  /** O que foi feito (ou por que não), em português, para a tela. */
  motivo: string
}

export type OpcoesDePreparo = {
  /** 'alta': foto até 4096 px e vídeo original — para impressão ou edição. */
  perfil?: PerfilDeFoto
  /** Fração de 0 a 1, só para vídeo (a foto é rápida). */
  aoProgredir?: (fracao: number) => void
  sinal?: AbortSignal
}

const TIPO_DO_ARQUIVO: Partial<Record<TipoFarejado, string>> = {
  jpeg: 'image/jpeg', png: 'image/png', gif: 'image/gif', webp: 'image/webp', heic: 'image/heic', avif: 'image/avif', mov: 'video/quicktime', mp4: 'video/mp4',
}

export async function prepararParaBiblioteca(file: File, opcoes: OpcoesDePreparo = {}): Promise<Preparado> {
  const original = { nome: file.name, tamanho: file.size, tipo: file.type }
  const manter = (motivo: string): Preparado => ({ arquivo: file, original, otimizado: false, motivo })
  const cabeca = new Uint8Array(await file.slice(0, 512 * 1024).arrayBuffer())
  const tipo = farejarTipo(cabeca)
  try {
    if (tipo === 'gif') return manter('GIF fica como está (pode ser animado).')
    if (tipo === 'jpeg' || tipo === 'png' || tipo === 'webp' || tipo === 'heic' || tipo === 'avif') {
      return await prepararFoto(file, tipo, cabeca, opcoes.perfil ?? 'padrao', original, manter)
    }
    if (tipo === 'mov' || (tipo === 'mp4' && file.type.startsWith('video/'))) {
      if (opcoes.perfil === 'alta') return manter('Vídeo guardado como veio (alta qualidade).')
      return await prepararVideo(file, opcoes, original, manter)
    }
    return manter('Documento ou áudio: vai como está.')
  } catch (erro) {
    if (opcoes.sinal?.aborted) throw erro
    if (tipo === 'heic') throw new Error('Este navegador não abre fotos HEIC do iPhone. Envie pelo próprio iPhone ou exporte a foto como JPEG.')
    console.warn('[midia] preparo falhou, vai o original:', erro)
    // Arquivo com o tipo que a Biblioteca aceita segue como veio; o servidor recomprime foto grande.
    return manter('Não foi possível otimizar aqui; vai o original.')
  }
}

// ---------------------------------------------------------------- foto

async function prepararFoto(
  file: File, tipo: TipoFarejado, cabeca: Uint8Array, perfil: PerfilDeFoto,
  original: Preparado['original'], manter: (m: string) => Preparado,
): Promise<Preparado> {
  const png = tipo === 'png' ? pngInfo(cabeca) : null
  const webp = tipo === 'webp' ? webpInfo(cabeca) : null
  if (png?.animado || webp?.animado) return manter('Imagem animada fica como está.')

  const { lado, qualidade } = FOTO[perfil]
  const imagem = await decodificar(file)
  const medida = caber(imagem.width, imagem.height, lado)
  const canvas = novoCanvas(medida.largura, medida.altura)
  const ctx = canvas.getContext('2d') as CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D | null
  if (!ctx) { imagem.close(); throw new Error('Canvas indisponível.') }
  ctx.imageSmoothingEnabled = true
  ctx.imageSmoothingQuality = 'high'
  ctx.drawImage(imagem, 0, 0, medida.largura, medida.altura)
  imagem.close()

  const transparente = Boolean(png?.podeTerAlfa || webp?.podeTerAlfa) && temTransparencia(ctx, medida.largura, medida.altura)
  let saida: Blob
  if (transparente) {
    // PNG e não WebP: Instagram, Threads e LinkedIn não aceitam WebP.
    saida = await exportar(canvas, 'image/png')
  } else {
    // Fundo branco sob o que era "transparente" mas opaco na prática (captura de tela RGBA).
    if (png || webp) {
      ctx.globalCompositeOperation = 'destination-over'
      ctx.fillStyle = '#ffffff'
      ctx.fillRect(0, 0, medida.largura, medida.altura)
    }
    saida = await exportar(canvas, 'image/jpeg', tipo === 'png' ? Math.max(qualidade, 0.9) : qualidade)
  }

  // Nunca piorar: se não reduziu, não havia metadado a tirar e o formato já
  // serve, o original (menor) fica. Com EXIF, a versão nova vale mesmo maior —
  // é o GPS que sai.
  const temExif = tipo === 'jpeg' && jpegTemExif(cabeca)
  const formatoServe = tipo === 'jpeg' || (tipo === 'png' && transparente)
  if (!medida.reduziu && !temExif && formatoServe && saida.size >= file.size * 0.95) return manter('A foto já estava leve.')

  const extensao = saida.type === 'image/png' ? '.png' : '.jpg'
  const arquivo = new File([saida], trocarExtensao(file.name, extensao), { type: saida.type, lastModified: file.lastModified })
  const partes = [`${medida.largura}×${medida.altura}`, saida.type === 'image/png' ? 'PNG' : 'JPEG']
  if (temExif) partes.push('sem localização')
  return { arquivo, original, otimizado: true, motivo: partes.join(', ') }
}

async function decodificar(file: Blob): Promise<ImageBitmap> {
  try {
    return await createImageBitmap(file, { imageOrientation: 'from-image' })
  } catch (erro) {
    // Navegador que não conhece a opção recusa com TypeError; o padrão dele já respeita o EXIF.
    if (!(erro instanceof TypeError)) throw erro
  }
  return createImageBitmap(file)
}

function novoCanvas(largura: number, altura: number): OffscreenCanvas | HTMLCanvasElement {
  if (typeof OffscreenCanvas !== 'undefined') return new OffscreenCanvas(largura, altura)
  const c = document.createElement('canvas')
  c.width = largura
  c.height = altura
  return c
}

function exportar(canvas: OffscreenCanvas | HTMLCanvasElement, type: string, quality?: number): Promise<Blob> {
  if ('convertToBlob' in canvas) return canvas.convertToBlob({ type, quality })
  return new Promise((ok, falha) => canvas.toBlob((b) => (b ? ok(b) : falha(new Error('Não foi possível gerar a imagem.'))), type, quality))
}

function temTransparencia(ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D, largura: number, altura: number): boolean {
  const { data } = ctx.getImageData(0, 0, largura, altura)
  for (let i = 3; i < data.length; i += 4) if (data[i] < 255) return true
  return false
}

// ---------------------------------------------------------------- vídeo

async function prepararVideo(file: File, opcoes: OpcoesDePreparo, original: Preparado['original'], manter: (m: string) => Preparado): Promise<Preparado> {
  const mb = await import('mediabunny')
  const input = new mb.Input({ source: new mb.BlobSource(file), formats: [mb.MP4, mb.QTFF] })
  try {
    const video = await input.getPrimaryVideoTrack()
    if (!video) return manter('Arquivo sem trilha de vídeo; vai como está.')
    const [largura, altura, codec, stats] = await Promise.all([video.getDisplayWidth(), video.getDisplayHeight(), video.getCodec(), video.computePacketStats(240)])
    const decisao = decidirVideo({ largura, altura, codec, fps: stats.averagePacketRate, bitrate: stats.averageBitrate })

    const podeConverter = decisao.converter && typeof VideoEncoder !== 'undefined'
      && await video.canDecode()
      && await mb.canEncodeVideo('avc', { width: decisao.largura, height: decisao.altura, bitrate: VIDEO.bitrate })

    const output = new mb.Output({ format: new mb.Mp4OutputFormat({ fastStart: 'in-memory' }), target: new mb.BufferTarget() })
    const conversao = await mb.Conversion.init({
      input, output, tracks: 'primary', showWarnings: false,
      video: podeConverter
        ? {
            codec: 'avc', bitrate: VIDEO.bitrate,
            // Só um lado: o outro segue a proporção (e já com a rotação aplicada).
            ...(decisao.largura !== largura || decisao.altura !== altura ? (largura >= altura ? { width: decisao.largura } : { height: decisao.altura }) : {}),
            ...(decisao.fps ? { frameRate: decisao.fps } : {}),
          }
        : {},
      audio: { codec: 'aac' },
      // Só a data: a localização (©xyz no MP4 do Android) não passa.
      tags: (t) => (t.date ? { date: t.date } : {}),
    })
    // Trilha jogada fora (vídeo sem imagem, ou mudo) não serve: vai o original.
    if (!conversao.isValid || conversao.discardedTracks.length) return manter('Este navegador não converte este vídeo; vai o original.')

    conversao.onProgress = (p) => opcoes.aoProgredir?.(p)
    const cancelar = () => { void conversao.cancel() }
    opcoes.sinal?.addEventListener('abort', cancelar, { once: true })
    try {
      await conversao.execute()
    } finally {
      opcoes.sinal?.removeEventListener('abort', cancelar)
    }
    const bytes = output.target.buffer
    if (!bytes) return manter('A conversão não gerou arquivo; vai o original.')
    // Trocar só o contêiner às vezes cresce um pouco; se crescer muito, fica o original.
    if (!podeConverter && bytes.byteLength > file.size * 1.05) return manter('Vai o original (o navegador não reduz este vídeo).')
    const arquivo = new File([bytes], trocarExtensao(file.name, '.mp4'), { type: 'video/mp4', lastModified: file.lastModified })
    return {
      arquivo, original, otimizado: true,
      motivo: podeConverter ? `MP4 H.264 ${decisao.largura}×${decisao.altura}` : decisao.converter ? 'MP4, sem localização (o navegador não reduz este vídeo)' : 'MP4, sem localização',
    }
  } finally {
    input.dispose()
  }
}

/** O tipo MIME que o navegador deveria ter dito, pelo conteúdo (o iPhone às vezes manda vazio). */
export async function tipoPeloConteudo(file: File): Promise<string | null> {
  const cabeca = new Uint8Array(await file.slice(0, 64).arrayBuffer())
  return TIPO_DO_ARQUIVO[farejarTipo(cabeca)] ?? null
}
