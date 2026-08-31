import 'server-only'

/**
 * O conector do Resend: entregar e-mail.
 *
 * Mesma forma dos conectores do Upload-Post e da OpenAI — chave lida do
 * ambiente, erro com status, segredo raspado da mensagem. RESEND_API_KEY nunca
 * pode ganhar o prefixo NEXT_PUBLIC_: quem tem a chave envia e-mail em nome da
 * Cruz Vermelha, e um remetente humanitário sequestrado é um estrago que não
 * se desfaz com um deploy.
 */

const BASE = 'https://api.resend.com'

/** Quantos endereços cabem numa chamada de lote do Resend. */
export const TAMANHO_DO_LOTE = 100

export class EmailError extends Error {
  constructor(message: string, public status: number) {
    super(message)
    this.name = 'EmailError'
  }
}

export function chaveDoResend(): string {
  const chave = process.env.RESEND_API_KEY?.trim()
  if (!chave) {
    throw new EmailError(
      'Falta a variável RESEND_API_KEY. Cadastre a chave nas variáveis de ambiente da Vercel — nunca com o prefixo NEXT_PUBLIC_.',
      0,
    )
  }
  return chave
}

export const emailConfigurado = () => Boolean(process.env.RESEND_API_KEY?.trim())

/**
 * O remetente. Precisa ser de um domínio verificado no Resend, senão toda
 * chamada volta 403 — é o erro nº 1 de quem começa.
 *
 * O padrão é o SUBDOMÍNIO noticias., não a raiz, e isso é deliberado nos dois
 * sentidos:
 *
 *  - É o que está verificado no Resend. Para o Resend, "cruzvermelhariodejaneiro.org"
 *    e "noticias.cruzvermelhariodejaneiro.org" são domínios diferentes: chave
 *    DKIM própria, verificação própria. Remetente na raiz com só o subdomínio
 *    verificado volta 403 em toda tentativa — foi exatamente o que aconteceu
 *    aqui, e o sintoma foi inscrição gravada sem convite chegando.
 *
 *  - É a prática recomendada para envio em massa. A raiz já tem o e-mail
 *    corporativo da Hostinger; separar a newsletter num subdomínio faz com que
 *    uma remessa mal recebida não arraste junto a reputação do endereço que a
 *    instituição usa para falar com hospital, cartório e doador.
 *
 * O leitor continua reconhecendo a origem: o nome do domínio institucional
 * está inteiro dentro do endereço.
 */
export const REMETENTE_PADRAO = 'Cruz Vermelha RJ <noticias@noticias.cruzvermelhariodejaneiro.org>'

export function remetente(): string {
  return process.env.NEWSLETTER_REMETENTE?.trim() || REMETENTE_PADRAO
}

/**
 * Para onde vão as respostas.
 *
 * Newsletter sem endereço de resposta que funcione é falta de educação com
 * quem quer falar com a instituição — e "no-reply" é justamente o padrão que
 * os provedores usam como sinal de remessa em massa.
 */
export function respostaPara(): string | undefined {
  return process.env.NEWSLETTER_RESPONDER_PARA?.trim() || undefined
}

/** Raspa a chave de qualquer texto antes de ele virar mensagem de erro ou log. */
export function semChave(texto: string): string {
  const chave = process.env.RESEND_API_KEY?.trim()
  const limpo = texto.replace(/re_[A-Za-z0-9_-]{10,}/g, 're_***')
  return chave ? limpo.split(chave).join('***') : limpo
}

async function chamar<T>(caminho: string, corpo: unknown, timeoutMs = 20_000): Promise<T> {
  const chave = chaveDoResend()
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
      ? 'O Resend demorou demais para responder.'
      : semChave(causa instanceof Error ? causa.message : String(causa))
    throw new EmailError(motivo, 0)
  } finally {
    clearTimeout(relogio)
  }

  // Texto primeiro, como no conector da OpenAI: recusa de proxy ou de WAF vem
  // em texto puro, e um JSON.parse silencioso trocaria o motivo real por uma
  // mensagem genérica.
  const bruto = await res.text()
  let dados: unknown = null
  try { dados = bruto ? JSON.parse(bruto) : null } catch { dados = null }

  if (!res.ok) {
    const daApi = (dados as { message?: string; error?: string })?.message
      ?? (dados as { error?: string })?.error
    const motivo = daApi || bruto.trim().slice(0, 300) || 'O Resend recusou a chamada.'
    const dica = res.status === 401 || res.status === 403
      ? ` Confira RESEND_API_KEY e se o domínio de "${remetente()}" está verificado no painel do Resend. Atenção ao subdomínio: para o Resend, "dominio.org" e "sub.dominio.org" são domínios distintos, e verificar um não verifica o outro. /api/admin/newsletter-check lista o que está verificado na conta.`
      : res.status === 422 ? ' O Resend considerou a mensagem inválida: confira o formato do remetente ("Nome <caixa@dominio>").'
      : res.status === 429 ? ' Limite de envio atingido no plano do Resend.'
      : !daApi ? ' A resposta não veio do Resend: há algo na rede entre o servidor e api.resend.com.'
      : ''
    throw new EmailError(`${semChave(motivo)}${dica}`, res.status)
  }
  return dados as T
}

export type Mensagem = {
  para: string
  assunto: string
  html: string
  texto: string
  /**
   * O link de saída em UM CLIQUE — o de máquina, que responde a POST.
   *
   * Não é enfeite: desde 2024 o Gmail e o Yahoo EXIGEM os cabeçalhos
   * List-Unsubscribe e List-Unsubscribe-Post de quem envia em volume, e quem
   * não manda vai para spam por decisão do provedor, sem aviso. Por isso o
   * campo é obrigatório neste tipo, e não opcional: esquecer dele não pode ser
   * possível.
   *
   * É o de UM CLIQUE, não o link visível do rodapé: o provedor faz POST aqui e
   * exige que a pessoa saia sem mais nenhuma tela.
   */
  urlDeSaidaEmUmClique: string
  /**
   * Quando entregar, em ISO 8601. Ausente = agora.
   *
   * O agendamento é do Resend, não nosso: guardar a mensagem para enviar
   * depois exigiria um processo vivo, que uma função sem estado não tem. Sem
   * isto, um destino agendado sairia na hora — e e-mail enviado não volta.
   */
  agendarPara?: string
}

function corpoDaMensagem(m: Mensagem) {
  return {
    from: remetente(),
    to: [m.para],
    subject: m.assunto,
    html: m.html,
    text: m.texto,
    ...(respostaPara() ? { reply_to: respostaPara() } : {}),
    ...(m.agendarPara ? { scheduled_at: m.agendarPara } : {}),
    headers: {
      'List-Unsubscribe': `<${m.urlDeSaidaEmUmClique}>`,
      'List-Unsubscribe-Post': 'List=One-Click',
    },
  }
}

/** Envia uma mensagem. Usado pela confirmação de inscrição. */
export async function enviarEmail(m: Mensagem): Promise<{ id: string }> {
  const dados = await chamar<{ id?: string }>('/emails', corpoDaMensagem(m))
  return { id: dados.id ?? '' }
}

/**
 * Envia até 100 mensagens numa chamada.
 *
 * Uma chamada por destinatário faria uma remessa de mil pessoas virar mil
 * chamadas HTTP — que não cabem no tempo de uma função da Vercel e ainda
 * esbarram no limite de requisições do Resend.
 */
export async function enviarLote(mensagens: Mensagem[]): Promise<{ enviados: number }> {
  if (!mensagens.length) return { enviados: 0 }
  if (mensagens.length > TAMANHO_DO_LOTE) {
    throw new EmailError(`Lote de ${mensagens.length} mensagens excede o limite de ${TAMANHO_DO_LOTE} do Resend.`, 0)
  }
  const dados = await chamar<{ data?: unknown[] }>('/emails/batch', mensagens.map(corpoDaMensagem))
  return { enviados: dados.data?.length ?? mensagens.length }
}

/** Divide uma lista em lotes do tamanho que o Resend aceita. */
export function emLotes<T>(itens: T[], tamanho = TAMANHO_DO_LOTE): T[][] {
  const lotes: T[][] = []
  for (let i = 0; i < itens.length; i += tamanho) lotes.push(itens.slice(i, i + tamanho))
  return lotes
}

/** Diagnóstico: os domínios verificados na conta. Não envia nada. */
export async function dominiosVerificados(): Promise<{ nome: string; estado: string }[]> {
  const chave = chaveDoResend()
  const res = await fetch(`${BASE}/domains`, { headers: { Authorization: `Bearer ${chave}` } })
  const bruto = await res.text()
  let dados: unknown = null
  try { dados = bruto ? JSON.parse(bruto) : null } catch { dados = null }
  if (!res.ok) {
    const daApi = (dados as { message?: string })?.message
    throw new EmailError(semChave(daApi || bruto.trim().slice(0, 300) || 'Não foi possível listar os domínios.'), res.status)
  }
  const lista = (dados as { data?: { name?: string; status?: string }[] })?.data ?? []
  return lista.map((d) => ({ nome: d.name ?? '', estado: d.status ?? '' }))
}
