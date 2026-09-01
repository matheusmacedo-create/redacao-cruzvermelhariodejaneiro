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

/**
 * O modelo que ESCREVE matéria é outro que o que adapta legenda.
 *
 * Legenda é reescrita curta e cabe ao mini, que é rápido e quase de graça.
 * Matéria completa de uma página, com contexto e estrutura, no mini sai rasa
 * — foi o retorno de quem usou. Escrever é o trabalho caro que justifica o
 * modelo cheio, e raciocinar faz parte dele: o esforço aqui é próprio, não o
 * "minimal" global das legendas.
 */
export const MODELO_DE_ESCRITA_PADRAO = 'gpt-5'
export const modeloDeEscrita = () => process.env.OPENAI_WRITER_MODEL?.trim() || MODELO_DE_ESCRITA_PADRAO
export function esforcoDeEscrita(): string {
  const bruto = process.env.OPENAI_WRITER_EFFORT
  return bruto === undefined ? 'medium' : bruto.trim()
}

/**
 * Quanto raciocínio pedir ao modelo de texto.
 *
 * A família GPT-5 raciocina por padrão, e a primeira chamada real levou 13,6
 * segundos para adaptar uma frase — esforço gasto à toa. Adaptar legenda é
 * reescrita curta com instrução clara, que é exatamente o caso em que o
 * "minimal" existe: quase nenhum token de raciocínio, resposta rápida.
 *
 * Os valores aceitos dependem do modelo. Por isso a chamada tem recuo: se a
 * OpenAI recusar o parâmetro, ela se refaz sem ele em vez de quebrar. Deixar
 * a variável vazia desliga o envio.
 */
export function esforcoDeRaciocinio(): string {
  const bruto = process.env.OPENAI_REASONING_EFFORT
  return bruto === undefined ? 'minimal' : bruto.trim()
}

/**
 * Teto de tokens da resposta de texto.
 *
 * Com modelo que raciocina, os tokens de raciocínio contam aqui dentro: um
 * teto baixo devolve resposta vazia em vez de resposta curta. 1500 é folgado
 * para uma legenda e ainda impede uma resposta desgovernada.
 */
const TETO_DE_TOKENS = 1500

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

/**
 * Chama com os ajustes de custo e, se a OpenAI recusar por causa deles, refaz
 * a chamada sem eles.
 *
 * Existe porque os valores de `reasoning_effort` são dependentes do modelo, e
 * a lista muda a cada família nova. Sem o recuo, escolher um valor que o
 * modelo configurado não aceita derrubaria a adaptação de legenda inteira —
 * trocar uma otimização por uma funcionalidade quebrada é um mau negócio.
 *
 * O recuo é estreito de propósito: só acontece em 400 cujo motivo cita um dos
 * campos opcionais. Erro de chave, de cota ou de modelo continua subindo.
 */
async function chamarComRecuo<T>(
  caminho: string,
  corpo: Record<string, unknown>,
  opcionais: Record<string, unknown>,
  timeoutMs: number,
): Promise<{ dados: T; recuou: boolean }> {
  const chaves = Object.keys(opcionais)
  if (!chaves.length) return { dados: await chamar<T>(caminho, corpo, timeoutMs), recuou: false }

  try {
    return { dados: await chamar<T>(caminho, { ...corpo, ...opcionais }, timeoutMs), recuou: false }
  } catch (causa) {
    const recusaDoCampo = causa instanceof IaError
      && causa.status === 400
      && chaves.some((chave) => causa.message.includes(chave))
    if (!recusaDoCampo) throw causa
    console.warn('[ia] a OpenAI recusou', chaves.join(', '), '— refazendo sem esses campos:', causa.message)
    return { dados: await chamar<T>(caminho, corpo, timeoutMs), recuou: true }
  }
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
  choices?: { message?: { content?: string }; finish_reason?: string }[]
  usage?: {
    prompt_tokens?: number
    completion_tokens?: number
    completion_tokens_details?: { reasoning_tokens?: number }
  }
}

/**
 * O que a chamada custou, para o custo ser visível em vez de suposto.
 *
 * `raciocinio` é o número que motivou esta otimização: era ele que consumia
 * os segundos e os tokens numa tarefa que não precisa pensar.
 */
export type MedidaDaChamada = {
  esforco: string
  /** A OpenAI recusou os ajustes e a chamada foi refeita sem eles. */
  recuou: boolean
  entrada: number
  saida: number
  raciocinio: number
  segundos: number
}

function medir(dados: RespostaDeTexto, esforco: string, recuou: boolean, comecou: number): MedidaDaChamada {
  return {
    esforco: recuou ? '(recusado pelo modelo)' : esforco || '(padrão do modelo)',
    recuou,
    entrada: dados.usage?.prompt_tokens ?? 0,
    saida: dados.usage?.completion_tokens ?? 0,
    raciocinio: dados.usage?.completion_tokens_details?.reasoning_tokens ?? 0,
    segundos: Math.round((Date.now() - comecou) / 100) / 10,
  }
}

/** Os ajustes de custo, só quando há esforço configurado. */
function ajustesDeCusto(): Record<string, unknown> {
  const esforco = esforcoDeRaciocinio()
  return esforco ? { reasoning_effort: esforco, max_completion_tokens: TETO_DE_TOKENS } : {}
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
}): Promise<{ texto: string; medida: MedidaDaChamada }> {
  const regras = [
    `Limite rígido: ${pedido.limite} caracteres. Não ultrapasse.`,
    pedido.dobra ? `O leitor só vê os primeiros ${pedido.dobra} caracteres antes do "ver mais": ponha o essencial antes disso.` : '',
    pedido.maxHashtags ? `No máximo ${pedido.maxHashtags} hashtags.` : 'Sem hashtags, a menos que já existam no texto.',
  ].filter(Boolean).join('\n')

  const comecou = Date.now()
  const { dados, recuou } = await chamarComRecuo<RespostaDeTexto>('/chat/completions', {
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
  }, ajustesDeCusto(), 60_000)

  const texto = dados.choices?.[0]?.message?.content?.trim()
  if (!texto) {
    // Resposta vazia com finish_reason "length" quer dizer que o raciocínio
    // comeu o teto de tokens. Dizer isso poupa procurar no lugar errado.
    const porTeto = dados.choices?.[0]?.finish_reason === 'length'
    throw new IaError(
      porTeto
        ? `A resposta veio vazia porque o modelo gastou o teto de ${TETO_DE_TOKENS} tokens raciocinando. Baixe OPENAI_REASONING_EFFORT ou deixe-a vazia.`
        : 'A OpenAI respondeu sem texto.',
      502,
    )
  }
  // Modelo às vezes devolve o texto entre aspas mesmo pedindo que não.
  return {
    texto: semRotuloDoCanal(texto.replace(/^["“']|["”']$/g, '').trim(), pedido.canal, pedido.formato),
    medida: medir(dados, esforcoDeRaciocinio(), recuou, comecou),
  }
}

/**
 * Reescreve o texto de uma matéria inteira.
 *
 * Separado de `adaptarTexto` porque o contrato é outro: lá é legenda curta
 * com teto apertado; aqui é a matéria completa, e o teto de 1500 tokens
 * devolveria texto amputado. As instruções vêm prontas de fora
 * (lib/ia/formatos.ts) — o mesmo pedido serve a qualquer provedor.
 */
const TETO_DA_MATERIA = 12_000

export async function reescreverComGpt(pedido: {
  system: string
  texto: string
}): Promise<{ texto: string; medida: MedidaDaChamada }> {
  const esforco = esforcoDeEscrita()
  const comecou = Date.now()
  const { dados, recuou } = await chamarComRecuo<RespostaDeTexto>('/chat/completions', {
    model: modeloDeEscrita(),
    messages: [
      { role: 'system', content: pedido.system },
      { role: 'user', content: pedido.texto },
    ],
  }, {
    ...(esforco ? { reasoning_effort: esforco } : {}),
    max_completion_tokens: TETO_DA_MATERIA,
  }, 120_000)

  const texto = dados.choices?.[0]?.message?.content?.trim()
  if (!texto) {
    const porTeto = dados.choices?.[0]?.finish_reason === 'length'
    throw new IaError(
      porTeto
        ? `A resposta veio vazia porque o modelo gastou o teto de ${TETO_DA_MATERIA} tokens raciocinando. Baixe OPENAI_WRITER_EFFORT ou deixe-a vazia.`
        : 'A OpenAI respondeu sem texto.',
      502,
    )
  }
  return {
    texto: texto.replace(/^["“']|["”']$/g, '').trim(),
    medida: medir(dados, esforco, recuou, comecou),
  }
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
  const { dados } = await chamarComRecuo<RespostaDeTexto>('/chat/completions', {
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
  }, ajustesDeCusto(), 60_000)

  const bruto = dados.choices?.[0]?.message?.content?.trim() ?? ''
  // Mesma armadilha da adaptação: com esforço alto, o raciocínio pode gastar o
  // teto e devolver vazio. Sem isto, a tela diria "tente de novo" para um
  // problema que tentar de novo não resolve.
  if (!bruto && dados.choices?.[0]?.finish_reason === 'length') {
    throw new IaError(
      `As ideias vieram vazias porque o modelo gastou o teto de ${TETO_DE_TOKENS} tokens raciocinando. Baixe OPENAI_REASONING_EFFORT ou deixe-a vazia.`,
      502,
    )
  }
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
