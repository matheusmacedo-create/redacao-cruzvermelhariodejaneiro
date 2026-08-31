/**
 * Traduz a proporção que o canal pede para uma medida que o gerador aceita.
 *
 * O modelo de imagem só aceita largura e altura múltiplas de 16, com a
 * proporção entre 1:3 e 3:1. A proporção vem do adapter do canal — 9:16 no
 * Stories, 4:5 no feed do Instagram, 1.91:1 no Facebook — para a imagem já
 * nascer no enquadramento certo, em vez de ser cortada depois e perder metade
 * do que foi pedido.
 */

/**
 * Orçamento de pixels, e não "lado maior".
 *
 * Com um lado fixo, um quadrado custaria quase o dobro de um 16:9 sem ninguém
 * pedir por isso. Fixando a ÁREA, toda proporção sai pelo mesmo preço e com a
 * mesma espera. 1.327.104 é a área de um 1536×864, que é nítido de sobra para
 * um post visto no celular.
 */
const ORCAMENTO_DE_PIXELS = 1536 * 864
const LADO_MINIMO = 256

const paraMultiploDe16 = (n: number) => Math.max(LADO_MINIMO, Math.round(n / 16) * 16)

export type MedidaDaImagem = { largura: number; altura: number }

export function proporcaoNumerica(rotulo: string): number {
  const m = /^([\d.]+):([\d.]+)$/.exec(rotulo.trim())
  if (!m) return 1
  const [, a, b] = m
  const razao = parseFloat(a) / parseFloat(b)
  return Number.isFinite(razao) && razao > 0 ? razao : 1
}

export function tamanhoParaProporcao(rotulo: string): MedidaDaImagem {
  // "livre" é o site: sem proporção obrigatória, o quadrado serve a tudo.
  const razao = rotulo === 'livre' ? 1 : proporcaoNumerica(rotulo)
  // Fora de 1:3–3:1 o gerador recusa. Melhor entregar o mais próximo que ele
  // aceita do que devolver um erro que ninguém sabe corrigir.
  const limitada = Math.min(3, Math.max(1 / 3, razao))

  const altura = Math.sqrt(ORCAMENTO_DE_PIXELS / limitada)
  return {
    largura: paraMultiploDe16(altura * limitada),
    altura: paraMultiploDe16(altura),
  }
}

export const medidaComoTexto = ({ largura, altura }: MedidaDaImagem) => `${largura}x${altura}`
