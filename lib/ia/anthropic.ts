import 'server-only'
import Anthropic from '@anthropic-ai/sdk'
import { IaError } from '@/lib/ia/openai'

/**
 * O conector da Anthropic: melhorar o texto da matéria com o Claude.
 *
 * Mesma forma do conector da OpenAI — chave lida do ambiente, erro com status
 * e dica, segredo raspado de qualquer mensagem. A chave NUNCA ganha o prefixo
 * NEXT_PUBLIC_.
 *
 * A chave entra por ANTHROPIC_API_KEY (o nome que o SDK lê sozinho) ou por
 * CLAUDE_API — aceitar os dois evita que o nome da variável derrube a
 * funcionalidade. O modelo vem do ambiente pelo mesmo motivo dos da OpenAI:
 * trocar um nome não pode exigir mudança de código.
 */

export const MODELO_CLAUDE_PADRAO = 'claude-opus-5'

function chaveDoClaude(): string | undefined {
  return process.env.ANTHROPIC_API_KEY?.trim() || process.env.CLAUDE_API?.trim() || undefined
}

export const claudeConfigurado = () => Boolean(chaveDoClaude())
export const modeloDoClaude = () => process.env.ANTHROPIC_TEXT_MODEL?.trim() || MODELO_CLAUDE_PADRAO

/**
 * Quanto esforço pedir ao Claude na ESCRITA da matéria.
 *
 * O esforço é o preço do raciocínio: 'high' é o padrão do modelo e o que
 * sustenta a qualidade que a redação cobrou; baixar para 'medium' corta
 * custo quando a fatura pedir. A variável existe para essa decisão ser da
 * instituição, sem deploy. Valor fora da lista cai no padrão em vez de
 * derrubar a chamada.
 */
const ESFORCOS_VALIDOS = new Set(['low', 'medium', 'high', 'xhigh', 'max'])
export function esforcoDoClaude(): 'low' | 'medium' | 'high' | 'xhigh' | 'max' {
  const bruto = process.env.ANTHROPIC_EFFORT?.trim().toLowerCase()
  return bruto && ESFORCOS_VALIDOS.has(bruto) ? (bruto as ReturnType<typeof esforcoDoClaude>) : 'high'
}

/** Tira a chave de qualquer mensagem que vá parar no banco ou na tela. */
export function semChaveDoClaude(texto: string): string {
  let limpo = texto
  for (const chave of [process.env.ANTHROPIC_API_KEY, process.env.CLAUDE_API]) {
    if (chave && chave.trim().length >= 8) limpo = limpo.split(chave.trim()).join('«oculto»')
  }
  return limpo
}

export type MedidaDoClaude = {
  modelo: string
  entrada: number
  saida: number
  segundos: number
}

/**
 * Reescreve um texto com o Claude.
 *
 * Sem parâmetro de raciocínio: nesta família ele é adaptativo por padrão e o
 * modelo decide quanto pensar. O recuo de segurança (`fallbacks`) fica ligado:
 * se o modelo recusar o pedido por engano de classificação, a própria API
 * refaz noutro modelo em vez de devolver a recusa à redação.
 */
export async function reescreverComClaude(pedido: {
  system: string
  texto: string
}): Promise<{ texto: string; medida: MedidaDoClaude }> {
  const chave = chaveDoClaude()
  if (!chave) {
    throw new IaError(
      'Falta a chave da Anthropic. Cadastre ANTHROPIC_API_KEY nas variáveis de ambiente da Vercel — nunca com o prefixo NEXT_PUBLIC_ — e republique.',
      0,
    )
  }

  const cliente = new Anthropic({ apiKey: chave, timeout: 120_000, maxRetries: 1 })
  const comecou = Date.now()
  let resposta: Anthropic.Beta.BetaMessage
  try {
    resposta = await cliente.beta.messages.create({
      model: modeloDoClaude(),
      max_tokens: 16_000,
      output_config: { effort: esforcoDoClaude() },
      system: pedido.system,
      messages: [{ role: 'user', content: pedido.texto }],
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
    })
  } catch (causa) {
    throw traduzirErro(causa)
  }

  if (resposta.stop_reason === 'refusal') {
    const detalhe = resposta.stop_details?.explanation
    throw new IaError(
      `O Claude recusou este texto${detalhe ? `: ${semChaveDoClaude(detalhe)}` : '.'}`,
      502,
    )
  }

  const texto = resposta.content
    .filter((bloco): bloco is Anthropic.Beta.BetaTextBlock => bloco.type === 'text')
    .map((bloco) => bloco.text)
    .join('')
    .trim()

  if (!texto) {
    throw new IaError(
      resposta.stop_reason === 'max_tokens'
        ? 'A resposta estourou o teto de tokens antes do texto. Tente com uma matéria menor.'
        : 'O Claude respondeu sem texto.',
      502,
    )
  }

  return {
    texto: texto.replace(/^["“']|["”']$/g, '').trim(),
    medida: {
      modelo: resposta.model,
      entrada: resposta.usage.input_tokens,
      saida: resposta.usage.output_tokens,
      segundos: Math.round((Date.now() - comecou) / 100) / 10,
    },
  }
}

/** Uma imagem pronta para o modelo ver. */
export type ImagemParaVer = { b64: string; mediaType: 'image/jpeg' | 'image/png' | 'image/webp' | 'image/gif' }

/**
 * Manda as fotos DE VERDADE para o Claude e devolve o texto da resposta.
 * Uma chamada só para todas: mais barato e as legendas saem coerentes
 * entre si.
 */
export async function verImagensComClaude(pedido: {
  system: string
  texto: string
  imagens: ImagemParaVer[]
}): Promise<{ texto: string; medida: MedidaDoClaude }> {
  const chave = chaveDoClaude()
  if (!chave) {
    throw new IaError(
      'Falta a chave da Anthropic. Cadastre ANTHROPIC_API_KEY nas variáveis de ambiente da Vercel e republique.',
      0,
    )
  }

  const cliente = new Anthropic({ apiKey: chave, timeout: 120_000, maxRetries: 1 })
  const comecou = Date.now()
  let resposta: Anthropic.Beta.BetaMessage
  try {
    resposta = await cliente.beta.messages.create({
      model: modeloDoClaude(),
      // Legenda é descrição factual curta: esforço baixo entrega o mesmo por
      // uma fração dos tokens de raciocínio, e 1500 de teto sobra.
      max_tokens: 1_500,
      output_config: { effort: 'low' },
      system: pedido.system,
      messages: [{
        role: 'user',
        content: [
          ...pedido.imagens.map((im) => ({
            type: 'image' as const,
            source: { type: 'base64' as const, media_type: im.mediaType, data: im.b64 },
          })),
          { type: 'text' as const, text: pedido.texto },
        ],
      }],
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
    })
  } catch (causa) {
    throw traduzirErro(causa)
  }

  if (resposta.stop_reason === 'refusal') {
    throw new IaError('O Claude recusou estas imagens.', 502)
  }

  const texto = resposta.content
    .filter((bloco): bloco is Anthropic.Beta.BetaTextBlock => bloco.type === 'text')
    .map((bloco) => bloco.text)
    .join('')
    .trim()
  if (!texto) throw new IaError('O Claude respondeu sem texto.', 502)

  return {
    texto,
    medida: {
      modelo: resposta.model,
      entrada: resposta.usage.input_tokens,
      saida: resposta.usage.output_tokens,
      segundos: Math.round((Date.now() - comecou) / 100) / 10,
    },
  }
}

/** Erro do SDK vira IaError com status e a dica que poupa a caçada. */
function traduzirErro(causa: unknown): IaError {
  if (causa instanceof Anthropic.AuthenticationError) {
    return new IaError('A Anthropic recusou a chave. Confira ANTHROPIC_API_KEY — chave revogada precisa ser trocada na Vercel e republicada.', 401)
  }
  if (causa instanceof Anthropic.NotFoundError) {
    return new IaError(`O modelo "${modeloDoClaude()}" não existe nesta conta. Confira ANTHROPIC_TEXT_MODEL na Vercel.`, 404)
  }
  if (causa instanceof Anthropic.RateLimitError) {
    return new IaError('Limite de uso da Anthropic atingido. Espere um pouco ou confira a cota no console.anthropic.com.', 429)
  }
  if (causa instanceof Anthropic.APIConnectionTimeoutError) {
    return new IaError('A Anthropic demorou demais para responder.', 0)
  }
  if (causa instanceof Anthropic.APIError) {
    return new IaError(semChaveDoClaude(causa.message), typeof causa.status === 'number' ? causa.status : 0)
  }
  return new IaError(semChaveDoClaude(causa instanceof Error ? causa.message : String(causa)), 0)
}
