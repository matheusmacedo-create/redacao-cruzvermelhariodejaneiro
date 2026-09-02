import 'server-only'
import sharp from 'sharp'
import { janelaDeRecorte, type CaixaDeRecorte } from '@/lib/publicacao/janela-de-recorte'

/**
 * Recorte de imagem por destino.
 *
 * A intenção é leve: um ponto focal (fx, fy em fração 0–1) e a proporção alvo
 * do canal. A conta de ONDE a janela cai mora em janela-de-recorte.ts — a
 * mesma que o editor usa para desenhar a prévia. Aqui só se aplica o corte.
 * O original nunca muda.
 */
export type { CaixaDeRecorte }

export async function recortar(bytes: Buffer, caixa: CaixaDeRecorte): Promise<Buffer<ArrayBufferLike>> {
  const imagem = sharp(bytes, { failOn: 'none' })
  const meta = await imagem.metadata()
  const janela = janelaDeRecorte(meta.width ?? 0, meta.height ?? 0, caixa)
  if (!janela) return bytes
  return imagem.extract({ left: janela.left, top: janela.top, width: janela.w, height: janela.h }).toBuffer()
}

/** Proporção numérica a partir do rótulo do adapter ('4:5' → 0.8). */
export function proporcaoDoRotulo(rotulo: string): number | null {
  const m = /^([\d.]+):([\d.]+)$/.exec(rotulo)
  if (!m) return null
  const a = parseFloat(m[1]); const b = parseFloat(m[2])
  return b ? a / b : null
}
