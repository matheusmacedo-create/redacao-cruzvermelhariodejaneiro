'use client'

import { farejarTipo } from '@/lib/midia/regras'
import { decodificar, exportar } from '@/lib/membro/preparar-foto'

/**
 * O documento escolhido no celular vira o que sobe: foto reduzida a 2000 px no
 * maior lado, em JPEG, redesenhada no canvas (o EXIF, com GPS, fica para
 * trás); PDF vai como está, até 20 MB. HEIC do iPhone não abre no navegador:
 * a pessoa escolhe pela galeria (vai em JPEG) ou exporta.
 */

export class ErroDoDocumento extends Error {}

const LADO_MAXIMO = 2000
const PDF_MAXIMO = 20 * 1024 * 1024
const HEIC = 'Este navegador não abre fotos HEIC do iPhone. Escolha a foto pela galeria (ela vai em JPEG) ou exporte como JPEG.'

export async function prepararDocumento(file: File): Promise<File> {
  const cabeca = new Uint8Array(await file.slice(0, 64).arrayBuffer())
  const tipo = file.type === 'application/pdf' || String.fromCharCode(...cabeca.slice(0, 5)) === '%PDF-' ? 'pdf' : farejarTipo(cabeca)
  if (tipo === 'pdf') {
    if (file.size > PDF_MAXIMO) throw new ErroDoDocumento('O PDF passa de 20 MB. Exporte de novo ou tire uma foto do documento.')
    return file.type === 'application/pdf' ? file : new File([file], file.name || 'documento.pdf', { type: 'application/pdf' })
  }
  if (!['jpeg', 'png', 'webp', 'heic', 'avif', 'gif'].includes(tipo)) throw new ErroDoDocumento('Envie uma foto (JPG, PNG ou WebP) ou um PDF.')
  let imagem: ImageBitmap
  try {
    imagem = await decodificar(file)
  } catch {
    throw new ErroDoDocumento(tipo === 'heic' ? HEIC : 'Não foi possível abrir esta foto. Tente outra, ou exporte como JPEG.')
  }
  try {
    const escala = Math.min(1, LADO_MAXIMO / Math.max(imagem.width, imagem.height))
    const largura = Math.max(1, Math.round(imagem.width * escala))
    const altura = Math.max(1, Math.round(imagem.height * escala))
    if (Math.max(largura, altura) < 400) throw new ErroDoDocumento('Esta foto é pequena demais para ler o documento. Tire outra, mais perto.')
    const canvas = typeof OffscreenCanvas !== 'undefined' ? new OffscreenCanvas(largura, altura) : Object.assign(document.createElement('canvas'), { width: largura, height: altura })
    const ctx = canvas.getContext('2d') as CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D | null
    if (!ctx) throw new ErroDoDocumento('Este navegador não conseguiu preparar a foto.')
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, largura, altura)
    ctx.imageSmoothingEnabled = true
    ctx.imageSmoothingQuality = 'high'
    ctx.drawImage(imagem, 0, 0, largura, altura)
    const blob = await exportar(canvas, 0.9)
    return new File([blob], 'documento.jpg', { type: 'image/jpeg' })
  } finally {
    imagem.close()
  }
}
