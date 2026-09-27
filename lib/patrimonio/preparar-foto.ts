'use client'

import { farejarTipo } from '@/lib/midia/regras'
import { ErroDaFoto, decodificar, exportar } from '@/lib/membro/preparar-foto'
import { LADO_MINIMO_DA_FOTO_DO_BEM, LIMITE_DA_FOTO_DO_BEM, QUALIDADE_DA_FOTO_DO_BEM, medidasNaSaida } from './fotos'

export { ErroDaFoto }

const HEIC = 'Este navegador não abre fotos HEIC do iPhone. No iPhone, escolha a foto pela galeria (ela vai em JPEG) ou, no computador, exporte a foto como JPEG.'

/**
 * Transforma a foto escolhida na que sobe: inteira (sem recorte), até 1600 px
 * no lado maior, JPEG. Abrir com createImageBitmap já gira pelo EXIF, e
 * redesenhar no canvas deixa GPS e demais metadados para trás.
 */
export async function prepararFotoDoBem(file: File): Promise<File> {
  const tipo = farejarTipo(new Uint8Array(await file.slice(0, 64).arrayBuffer()))
  if (!['jpeg', 'png', 'webp', 'heic', 'avif', 'gif'].includes(tipo)) throw new ErroDaFoto('Escolha uma foto (JPEG, PNG, WebP ou HEIC).')
  let imagem: ImageBitmap
  try {
    imagem = await decodificar(file)
  } catch {
    throw new ErroDaFoto(tipo === 'heic' ? HEIC : 'Não foi possível abrir esta foto. Tente outra, ou exporte como JPEG.')
  }
  try {
    if (Math.min(imagem.width, imagem.height) < LADO_MINIMO_DA_FOTO_DO_BEM) throw new ErroDaFoto(`Esta foto é pequena demais. Escolha uma com pelo menos ${LADO_MINIMO_DA_FOTO_DO_BEM} pixels.`)
    const { largura, altura } = medidasNaSaida(imagem.width, imagem.height)
    const canvas: OffscreenCanvas | HTMLCanvasElement = typeof OffscreenCanvas !== 'undefined'
      ? new OffscreenCanvas(largura, altura)
      : Object.assign(document.createElement('canvas'), { width: largura, height: altura })
    const ctx = canvas.getContext('2d') as CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D | null
    if (!ctx) throw new ErroDaFoto('Este navegador não conseguiu preparar a foto.')
    // Fundo branco sob o que for transparente: JPEG não tem alfa.
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, largura, altura)
    ctx.imageSmoothingEnabled = true
    ctx.imageSmoothingQuality = 'high'
    ctx.drawImage(imagem, 0, 0, largura, altura)
    let blob = await exportar(canvas, QUALIDADE_DA_FOTO_DO_BEM)
    if (blob.size > LIMITE_DA_FOTO_DO_BEM) blob = await exportar(canvas, 0.65)
    if (blob.size > LIMITE_DA_FOTO_DO_BEM) throw new ErroDaFoto('Não foi possível deixar esta foto leve o bastante. Tente outra.')
    return new File([blob], 'foto.jpg', { type: 'image/jpeg' })
  } finally {
    imagem.close()
  }
}

/** Prepara e envia uma foto para o bem. Devolve a mensagem de erro, ou null. */
export async function enviarFotoDoBem(bemId: string, file: File): Promise<string | null> {
  try {
    const foto = await prepararFotoDoBem(file)
    const corpo = new FormData()
    corpo.append('bem', bemId)
    corpo.append('foto', foto)
    const r = await fetch('/api/patrimonio/fotos', { method: 'POST', body: corpo })
    const dados = await r.json().catch(() => ({})) as { error?: string }
    return r.ok ? null : dados.error ?? 'A foto não foi salva.'
  } catch (causa) {
    return causa instanceof ErroDaFoto ? causa.message : 'A foto não foi salva. Tente de novo.'
  }
}
