/**
 * A conta da janela de recorte, compartilhada entre o servidor e a tela.
 *
 * O corte é a maior janela da proporção alvo que cabe na imagem, centrada no
 * ponto focal (fx, fy em fração 0–1) — deslizando o quanto for preciso para
 * não sair da borda. Esta função é a ÚNICA dona dessa conta: o sharp corta
 * por ela no envio e o editor desenha por ela na tela. Duas cópias da mesma
 * conta é como a prévia mente.
 *
 * Módulo puro: sem sharp, sem 'server-only' — roda no navegador e na suíte.
 */

export type CaixaDeRecorte = { fx: number; fy: number; ratio: number }

export type JanelaDeRecorte = { left: number; top: number; w: number; h: number }

const fracao = (v: number) => Math.min(1, Math.max(0, v))

/**
 * Onde a janela cai numa imagem largura×altura. `null` significa "sem corte":
 * medidas inválidas ou imagem já na proporção alvo.
 */
export function janelaDeRecorte(largura: number, altura: number, caixa: CaixaDeRecorte): JanelaDeRecorte | null {
  if (!largura || !altura || !caixa.ratio) return null

  const proporcaoAtual = largura / altura
  if (Math.abs(proporcaoAtual - caixa.ratio) < 0.01) return null

  let w: number
  let h: number
  if (proporcaoAtual > caixa.ratio) {
    h = altura
    w = Math.round(altura * caixa.ratio)
  } else {
    w = largura
    h = Math.round(largura / caixa.ratio)
  }

  const left = Math.min(largura - w, Math.max(0, Math.round(fracao(caixa.fx) * largura - w / 2)))
  const top = Math.min(altura - h, Math.max(0, Math.round(fracao(caixa.fy) * altura - h / 2)))
  return { left, top, w, h }
}
