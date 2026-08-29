import 'server-only'
import sharp from 'sharp'

/**
 * Recorte de imagem por destino.
 *
 * A intenção é leve: um ponto focal (fx, fy em fração 0–1) e a proporção alvo
 * do canal. O corte é a maior janela daquela proporção que cabe na imagem,
 * centrada no ponto focal — deslizando o quanto for preciso para não sair da
 * borda. O original nunca muda.
 */
export type CaixaDeRecorte = { fx: number; fy: number; ratio: number }

export async function recortar(bytes: Buffer, caixa: CaixaDeRecorte): Promise<Buffer<ArrayBufferLike>> {
  const imagem = sharp(bytes, { failOn: 'none' })
  const meta = await imagem.metadata()
  const largura = meta.width ?? 0
  const altura = meta.height ?? 0
  if (!largura || !altura || !caixa.ratio) return bytes

  const proporcaoAtual = largura / altura
  if (Math.abs(proporcaoAtual - caixa.ratio) < 0.01) return bytes

  let w: number
  let h: number
  if (proporcaoAtual > caixa.ratio) {
    h = altura
    w = Math.round(altura * caixa.ratio)
  } else {
    w = largura
    h = Math.round(largura / caixa.ratio)
  }

  const fx = Math.min(1, Math.max(0, caixa.fx))
  const fy = Math.min(1, Math.max(0, caixa.fy))
  const left = Math.min(largura - w, Math.max(0, Math.round(fx * largura - w / 2)))
  const top = Math.min(altura - h, Math.max(0, Math.round(fy * altura - h / 2)))

  return imagem.extract({ left, top, width: w, height: h }).toBuffer()
}

/** Proporção numérica a partir do rótulo do adapter ('4:5' → 0.8). */
export function proporcaoDoRotulo(rotulo: string): number | null {
  const m = /^([\d.]+):([\d.]+)$/.exec(rotulo)
  if (!m) return null
  const a = parseFloat(m[1]); const b = parseFloat(m[2])
  return b ? a / b : null
}
