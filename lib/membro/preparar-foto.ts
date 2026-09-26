'use client'

import { farejarTipo } from '@/lib/midia/regras'
import { LADO_DA_FOTO, LIMITE_DA_FOTO, QUALIDADE_DA_FOTO, recorteQuadrado } from './foto'

/**
 * Transforma a foto escolhida no retrato que sobe: quadrado recortado ao
 * centro, até 512×512, JPEG. Tudo no navegador, com canvas (o mesmo caminho
 * de lib/midia/preparar.ts): abrir com createImageBitmap já gira pelo EXIF, e
 * redesenhar no canvas deixa GPS e demais metadados para trás.
 */

export class ErroDaFoto extends Error {}

const HEIC = 'Este navegador não abre fotos HEIC do iPhone. No iPhone, escolha a foto pela galeria (ela vai em JPEG) ou, no computador, exporte a foto como JPEG.'

export async function prepararFotoDePerfil(file: File): Promise<File> {
  const cabeca = new Uint8Array(await file.slice(0, 64).arrayBuffer())
  const tipo = farejarTipo(cabeca)
  if (!['jpeg', 'png', 'webp', 'heic', 'avif', 'gif'].includes(tipo)) throw new ErroDaFoto('Escolha uma foto (JPEG, PNG, WebP ou HEIC).')

  let imagem: ImageBitmap
  try {
    imagem = await decodificar(file)
  } catch {
    throw new ErroDaFoto(tipo === 'heic' ? HEIC : 'Não foi possível abrir esta foto. Tente outra, ou exporte como JPEG.')
  }
  try {
    const { x, y, lado } = recorteQuadrado(imagem.width, imagem.height)
    if (lado < 64) throw new ErroDaFoto('Esta foto é pequena demais. Escolha uma com pelo menos 64 pixels de lado.')
    // Não aumenta foto pequena: esticar só piora.
    const saida = Math.min(lado, LADO_DA_FOTO)
    const canvas = novoCanvas(saida)
    const ctx = canvas.getContext('2d') as CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D | null
    if (!ctx) throw new ErroDaFoto('Este navegador não conseguiu preparar a foto.')
    // Fundo branco sob o que for transparente: JPEG não tem alfa.
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, saida, saida)
    ctx.imageSmoothingEnabled = true
    ctx.imageSmoothingQuality = 'high'
    ctx.drawImage(imagem, x, y, lado, lado, 0, 0, saida, saida)
    let blob = await exportar(canvas, QUALIDADE_DA_FOTO)
    // Foto com muito detalhe (grama, tecido): uma segunda tentativa mais leve antes de desistir.
    if (blob.size > LIMITE_DA_FOTO) blob = await exportar(canvas, 0.7)
    if (blob.size > LIMITE_DA_FOTO) throw new ErroDaFoto('Não foi possível deixar esta foto leve o bastante. Tente outra.')
    return new File([blob], 'foto.jpg', { type: 'image/jpeg' })
  } finally {
    imagem.close()
  }
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

function novoCanvas(lado: number): OffscreenCanvas | HTMLCanvasElement {
  if (typeof OffscreenCanvas !== 'undefined') return new OffscreenCanvas(lado, lado)
  const c = document.createElement('canvas')
  c.width = lado
  c.height = lado
  return c
}

function exportar(canvas: OffscreenCanvas | HTMLCanvasElement, quality: number): Promise<Blob> {
  if ('convertToBlob' in canvas) return canvas.convertToBlob({ type: 'image/jpeg', quality })
  return new Promise((ok, falha) => canvas.toBlob((b) => (b ? ok(b) : falha(new ErroDaFoto('Não foi possível gerar a foto.'))), 'image/jpeg', quality))
}
