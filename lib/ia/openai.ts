import 'server-only'
import { tamanhoParaProporcao, medidaComoTexto } from '@/lib/ia/tamanho'

/**
 * O conector da OpenAI: gerar imagem e adaptar legenda.
 *
 * Mesma forma do conector do Upload-Post — chave lida do ambiente, erro com
 * status, segredo raspado da mensagem. A chave NUNCA pode ganhar o prefixo
 * NEXT_PUBLIC_: ela é cobrada por uso, e no navegador vira gasto de quem
 * achar.
 *
 * Os nomes dos modelos vêm do ambiente porque a OpenAI os renomeia e aposenta
 * com frequência. Trocar um nome não pode exigir deploy — e um nome que não
 * existe precisa falhar dizendo isso, não com um 400 opaco.
 */

const BASE = 'https://api.openai.com/v1'

export const MODELO_DE_IMAGEM_PADRAO = 'gpt-image-2'
export const MODELO_DE_TEXTO_PADRAO = 'gpt-5-mini'

export class IaError extends Error {
  constructor(message: string, public status: number) {
    super(message)
    this.name = 'IaError'
  }
}

export function chaveDaIa(): string {
  const chave = process.env.OPENAI_API_KEY?.trim()
  if (!chave) {
    throw new IaError(
      'Falta a variável OPENAI_API_KEY. Cadastre a chave nas variáveis de ambiente da Vercel — nunca com o prefixo NEXT_PUBLIC_.',
      0,
    )
  }
  return chave
}

export const iaConfigurada = () => Boolean(process.env.OPENAI_API_KEY?.trim())
export const modeloDeImagem = () => process.env.OPENAI_IMAGE_MODEL?.trim() || MODELO_DE_IMAGEM_PADRAO
export const modeloDeTexto = () => process.env.OPENAI_TEXT_MODEL?.trim() || MODELO_DE_TEXTO_PADRAO

/** Teto mensal de imagens por espaço. Imagem gerada custa dinheiro a cada
 *  clique; sem teto, um engano em laço vira fatura. */
export function tetoMensalDeImagens(): number {
  const bruto = Number(process.env.OPENAI_IMAGE_LIMITE_MENSAL)
  return Number.isFinite(bruto) && bruto > 0 ? Math.floor(bruto) : 60
}

/** Tira a chave de qualquer mensagem que vá parar no banco ou na tela. */
export function semChave(texto: string): string {
  const chave = process.env.OPENAI_API_KEY
  return chave && chave.length >= 8 ? texto.split(chave).join('«oculto»') : texto
}

async function chamar<T>(caminho: string, corpo: unknown, timeoutMs: number): Promise<T> {
  const chave = chaveDaIa()
  const controle = new AbortController()
  const relogio = setTimeout(() => controle.abort(), timeoutMs)
  let res: Response
  try {
    res = await fetch(`${BASE}${caminho}`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${chave}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(corpo),
      signal: controle.signal,
    })
  } catch (causa) {
    const motivo = causa instanceof Error && causa.name === 'AbortError'
      ? 'A OpenAI demorou demais para responder.'
      : semChave(causa instanceof Error ? causa.message : String(causa))
    throw new IaError(motivo, 0)
  } finally {
    clearTimeout(relogio)
  }

  // Lê como texto primeiro: nem toda recusa vem da OpenAI. Um proxy de rede
  // ou um WAF no caminho responde em texto puro, e um JSON.parse silencioso
  // trocaria esse motivo — que diz exatamente o que fazer — por "recusou a
  // chamada". Foi o que aconteceu no primeiro teste.
  const bruto = await res.text()
  let dados: unknown = null
  try { dados = bruto ? JSON.parse(bruto) : null } catch { dados = null }

  if (!res.ok) {
    const daApi = (dados as { error?: { message?: string } })?.error?.message
    const motivo = daApi || bruto.trim().slice(0, 300) || 'A OpenAI recusou a chamada.'
    // 404 num endpoint que existe quase sempre é nome de modelo aposentado —
    // dizer isso poupa a caçada.
    const dica = res.status === 404
      ? ' Confira o nome do modelo em /api/admin/ia-check: a OpenAI aposenta nomes com frequência.'
      : res.status === 401 ? ' Confira OPENAI_API_KEY.'
      : res.status === 429 ? ' Cota ou limite de uso atingido no painel da OpenAI.'
      : !daApi ? ' A resposta não veio da OpenAI: há algo na rede entre o servidor e api.openai.com.'
      : ''
    throw new IaError(`${semChave(motivo)}${dica}`, res.status)
  }
  return dados as T
}

// ---------------------------------------------------------------- imagem

export type ImagemGerada = { bytes: Buffer; contentType: string; largura: number; altura: number }

type RespostaDeImagem = { data?: { b64_json?: string }[] }

/**
 * Gera uma imagem no enquadramento que o canal pede.
 *
 * O modelo devolve sempre base64 — não existe resposta por URL para esta
 * família — e sempre PNG, mesmo quando outro formato é pedido.
 */
export async function gerarImagem(pedido: {
  prompt: string
  proporcao: string
  qualidade?: 'low' | 'medium' | 'high'
}): Promise<ImagemGerada> {
  const medida = tamanhoParaProporcao(pedido.proporcao)
  const dados = await chamar<RespostaDeImagem>('/images/generations', {
    model: modeloDeImagem(),
    prompt: pedido.prompt,
    size: medidaComoTexto(medida),
    quality: pedido.qualidade ?? 'medium',
    n: 1,
  }, 180_000)

  const b64 = dados.data?.[0]?.b64_json
  if (!b64) throw new IaError('A OpenAI respondeu sem imagem.', 502)
  return {
    bytes: Buffer.from(b64, 'base64'),
    contentType: 'image/png',
    largura: medida.largura,
    altura: medida.altura,
  }
}

// ---------------------------------------------------------------- texto

type RespostaDeTexto = {
  choices?: { message?: { content?: string } }[]
}

/**
 * Adapta um texto ao contrato de um canal.
 *
 * O modelo recebe o limite e a unidade que o adapter declara — não um número
 * escrito à mão aqui. A conferência final continua sendo a nossa: a resposta
 * volta como sugestão para alguém aceitar, nunca gravada direto na variante.
 */
export async function adaptarTexto(pedido: {
  texto: string
  canal: string
  formato: string
  limite: number
  dobra?: number
  maxHashtags?: number
  instituicao?: string
}): Promise<string> {
  const regras = [
    `Limite rígido: ${pedido.limite} caracteres. Não ultrapasse.`,
    pedido.dobra ? `O leitor só vê os primeiros ${pedido.dobra} caracteres antes do "ver mais": ponha o essencial antes disso.` : '',
    pedido.maxHashtags ? `No máximo ${pedido.maxHashtags} hashtags.` : 'Sem hashtags, a menos que já existam no texto.',
  ].filter(Boolean).join('\n')

  const dados = await chamar<RespostaDeTexto>('/chat/completions', {
    model: modeloDeTexto(),
    messages: [
      {
        role: 'system',
        content: [
          `Você adapta textos institucionais da ${pedido.instituicao ?? 'Cruz Vermelha Brasileira — Rio de Janeiro'} para redes sociais.`,
          'Escreva em português do Brasil, em tom institucional, sóbrio e humano — é uma organização humanitária, não uma marca de varejo.',
          'Não invente fato, número, data, nome nem citação que não esteja no texto recebido. Se faltar informação, escreva menos.',
          'Não use emoji em excesso: no máximo um, e só se couber ao assunto.',
          'Responda apenas com o texto final, sem aspas em volta e sem comentários.',
          'A primeira palavra da resposta é a primeira palavra do post: não comece com o nome da rede, com o formato, com rótulo nem com prefixo nenhum.',
        ].join(' '),
      },
      {
        role: 'user',
        content: `Adapte o texto abaixo para ${pedido.canal} (${pedido.formato}).\n\n${regras}\n\n---\n${pedido.texto}`,
      },
    ],
  }, 60_000)

  const texto = dados.choices?.[0]?.message?.content?.trim()
  if (!texto) throw new IaError('A OpenAI respondeu sem texto.', 502)
  // Modelo às vezes devolve o texto entre aspas mesmo pedindo que não.
  return semRotuloDoCanal(texto.replace(/^["“']|["”']$/g, '').trim(), pedido.canal, pedido.formato)
}

/**
 * Tira o rótulo do canal que o modelo às vezes cola na frente da legenda.
 *
 * Pedimos "adapte para Facebook (Feed)" e a resposta volta como
 * "Facebook (Feed) — Participantes devem…". A instrução no sistema pede que
 * não, e mesmo assim acontece; foi o diagnóstico com ?testar=1 que mostrou.
 *
 * O corte é preciso de propósito: só sai o prefixo que repete EXATAMENTE o
 * canal e o formato que mandamos, seguido de travessão ou dois-pontos. Uma
 * legenda que comece legitimamente com a palavra "Instagram" continua
 * inteira.
 */
export function semRotuloDoCanal(texto: string, canal: string, formato: string): string {
  const escapar = (t: string) => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const rotulo = new RegExp(
    `^\\s*${escapar(canal)}\\s*(?:\\(\\s*${escapar(formato)}\\s*\\))?\\s*[—–\\-:]\\s*`,
    'i',
  )
  return texto.replace(rotulo, '').trim()
}

/**
 * Pede ao modelo três ideias de imagem para uma matéria.
 *
 * Complementa — não substitui — os modelos de pedido locais: aqueles são
 * instantâneos e de graça, este custa uma chamada e enxerga o texto inteiro.
 * As mesmas proibições vão no pedido, porque uma ideia que peça o emblema ou
 * uma pessoa é uma ideia que não serve.
 */
export async function sugerirBriefings(pedido: {
  titulo: string
  texto: string
  proibicoes: string
}): Promise<string[]> {
  const dados = await chamar<RespostaDeTexto>('/chat/completions', {
    model: modeloDeTexto(),
    messages: [
      {
        role: 'system',
        content: [
          'Você propõe ideias de imagem para acompanhar publicações de uma organização humanitária.',
          'Cada ideia é um parágrafo único, em português do Brasil, descrevendo a cena, o enquadramento, a luz e a paleta.',
          'Nunca proponha pessoas, rostos, o emblema da cruz vermelha, cruzes, símbolos humanitários ou texto dentro da imagem.',
          'Responda com exatamente três linhas, uma ideia por linha, sem numeração, sem título e sem comentário.',
        ].join(' '),
      },
      {
        role: 'user',
        content: `Matéria: ${pedido.titulo}\n\n${pedido.texto.slice(0, 4000)}\n\n`
          + `Cada ideia deve terminar com estas restrições, literalmente: "${pedido.proibicoes}"`,
      },
    ],
  }, 60_000)

  const bruto = dados.choices?.[0]?.message?.content?.trim() ?? ''
  return bruto
    .split('\n')
    .map((l) => l.replace(/^\s*[-*\d.)\s]+/, '').trim())
    .filter((l) => l.length > 40)
    .slice(0, 3)
}

// ---------------------------------------------------------------- diagnóstico

export async function modelosDisponiveis(): Promise<string[]> {
  const chave = chaveDaIa()
  const res = await fetch(`${BASE}/models`, { headers: { Authorization: `Bearer ${chave}` } })
  const bruto = await res.text()
  let dados: unknown = null
  try { dados = bruto ? JSON.parse(bruto) : null } catch { dados = null }
  if (!res.ok) {
    const daApi = (dados as { error?: { message?: string } })?.error?.message
    throw new IaError(semChave(daApi || bruto.trim().slice(0, 300) || 'Não foi possível listar os modelos.'), res.status)
  }
  return ((dados as { data?: { id?: string }[] })?.data ?? [])
    .map((m) => m.id ?? '')
    .filter(Boolean)
    .sort()
}
