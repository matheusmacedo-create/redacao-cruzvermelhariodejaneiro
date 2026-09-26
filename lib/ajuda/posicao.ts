/**
 * Onde o balão do tour fica em relação ao elemento destacado. Módulo puro
 * (medidas entram, posição sai), conferido com script (npx tsx).
 *
 * No computador o balão encosta no alvo, do lado pedido e, se não couber, do
 * primeiro lado que couber. No celular (tela estreita) ele vira uma folha
 * presa embaixo — ou em cima, quando o alvo está na metade de baixo —, como
 * nos tours de apps: um balão de 340 px ao lado de um botão não cabe em 390 px.
 */

export type Lado = 'top' | 'bottom' | 'left' | 'right'
export type Retangulo = { top: number; left: number; width: number; height: number }
export type Tamanho = { width: number; height: number }

export type Posicao =
  | { modo: 'ancorado'; lado: Lado; top: number; left: number }
  /** Sem alvo: no meio da tela, com o fundo todo escurecido. */
  | { modo: 'centro' }
  /** Tela estreita, ou alvo grande demais para ter um lado livre: preso à borda. */
  | { modo: 'embaixo' | 'em-cima' }

/** Abaixo disso o balão vira folha presa à borda. */
export const LARGURA_DE_CELULAR = 640

const ORDEM: Lado[] = ['bottom', 'top', 'right', 'left']

export function posicionarBalao({ alvo, balao, tela, preferido, margem = 12, distancia = 14 }: {
  alvo: Retangulo | null
  balao: Tamanho
  tela: Tamanho
  preferido?: Lado
  margem?: number
  distancia?: number
}): Posicao {
  if (!alvo) return { modo: 'centro' }
  // Conta só a parte do alvo que está na tela. E o alvo que passa do fim dela
  // (a prova inteira, o formulário do perfil) conta pelo começo, que é do que
  // o passo fala: a folha só vai para cima se couber acima dele. Pelo meio, ela
  // subia e cobria justo o começo (com a faixa do e-mail no alto, até o meio da
  // parte visível passava da metade da tela).
  const topoVisivel = Math.max(alvo.top, 0)
  const meioVisivel = (topoVisivel + Math.min(alvo.top + alvo.height, tela.height)) / 2
  const passaDoFim = alvo.top + alvo.height > tela.height
  const folhaEmCima = passaDoFim ? topoVisivel >= margem + balao.height + distancia : meioVisivel > tela.height * 0.55
  if (tela.width < LARGURA_DE_CELULAR) return { modo: folhaEmCima ? 'em-cima' : 'embaixo' }

  const lados = preferido ? [preferido, ...ORDEM.filter((l) => l !== preferido)] : ORDEM
  for (const lado of lados) {
    let top: number
    let left: number
    if (lado === 'bottom' || lado === 'top') {
      top = lado === 'bottom' ? alvo.top + alvo.height + distancia : alvo.top - distancia - balao.height
      if (top < margem || top + balao.height > tela.height - margem) continue
      left = limitar(alvo.left + alvo.width / 2 - balao.width / 2, margem, tela.width - margem - balao.width)
    } else {
      left = lado === 'right' ? alvo.left + alvo.width + distancia : alvo.left - distancia - balao.width
      if (left < margem || left + balao.width > tela.width - margem) continue
      top = limitar(meioVisivel - balao.height / 2, margem, tela.height - margem - balao.height)
    }
    return { modo: 'ancorado', lado, top, left }
  }
  return { modo: folhaEmCima ? 'em-cima' : 'embaixo' }
}

/**
 * O recorte iluminado: o alvo com uma folga, cortado pela tela (um quadro
 * maior que a tela seria um recorte do tamanho da tela inteira, sem fundo
 * escuro nenhum).
 */
export function recorte(alvo: Retangulo, tela: Tamanho, folga = 6): Retangulo {
  const top = Math.max(alvo.top - folga, 4)
  const left = Math.max(alvo.left - folga, 4)
  const bottom = Math.min(alvo.top + alvo.height + folga, tela.height - 4)
  const right = Math.min(alvo.left + alvo.width + folga, tela.width - 4)
  return { top, left, width: Math.max(right - left, 0), height: Math.max(bottom - top, 0) }
}

/** O alvo está na tela o bastante para ser apontado? (menu do celular fechado fica fora, à esquerda). */
export function estaNaTela(alvo: Retangulo, tela: Tamanho): boolean {
  if (alvo.width <= 0 || alvo.height <= 0) return false
  return alvo.left + alvo.width > 0 && alvo.left < tela.width
}

function limitar(valor: number, minimo: number, maximo: number): number {
  return Math.min(Math.max(valor, minimo), Math.max(minimo, maximo))
}
