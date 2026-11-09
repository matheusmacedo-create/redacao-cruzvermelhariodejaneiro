/**
 * As regras das campanhas do banco de contatos — sem rede, sem banco, para
 * poder ser testado e usado tanto no servidor quanto na tela.
 *
 * O e-mail é deliberadamente sóbrio: parece uma mensagem de assessoria, não
 * um boletim. Contato de imprensa que recebe peça cheia de banner trata como
 * propaganda, e o provedor também.
 */

/** A partir de quantas campanhas seguidas sem abertura o contato "não lê". */
export const LIMITE_SEM_LEITURA = 3

/** Teto de destinatários por campanha. Já não é um limite técnico: o envio
 * sai em fila, lote a lote (lib/imprensa/fila.ts), e não depende mais do
 * tempo de uma função. É um freio: release para mais gente do que isto quase
 * sempre é lista larga demais, e lista larga é o que faz jornalista bloquear
 * o remetente. Lista maior sai em mais de uma campanha. */
export const TETO_DE_DESTINATARIOS = 5000

/** Até quantos destinatários a tela espera o envio terminar e mostra o
 * resultado na hora (três lotes, poucos segundos). Acima disso, a campanha
 * entra na fila e a tela acompanha pela aba Campanhas. */
export const ENVIO_NA_HORA = 300

export type ContatoParaEnvio = {
  email: string | null
  emailStatus: string
  descadastradoEm: string | null
  /** O provedor devolveu em definitivo: o endereço está na supressão. */
  devolvidoEm?: string | null
}

export type MotivoDeFora = 'sem_email' | 'invalido' | 'descadastrado' | 'devolvido'

/**
 * Por que um contato fica fora do disparo — null quando pode receber.
 *
 * É a conta da TELA (quantos vão receber). Quem decide de verdade é o banco,
 * em enfileirar_campanha, com a mesma regra mais a tabela de supressão: se as
 * duas divergirem, vale a do banco, e a tela avisa quantos ficaram de fora.
 */
export function motivoDeFora(c: ContatoParaEnvio): MotivoDeFora | null {
  if (!c.email || !c.email.includes('@')) return 'sem_email'
  if (c.descadastradoEm) return 'descadastrado'
  if (c.devolvidoEm) return 'devolvido'
  if (c.emailStatus === 'invalido') return 'invalido'
  return null
}

export const naoLe = (enviosSemAbertura: number) => enviosSemAbertura >= LIMITE_SEM_LEITURA

export function primeiroNome(nome: string): string {
  return nome.trim().split(/\s+/)[0] ?? ''
}

/**
 * Troca {nome} pelo primeiro nome. Sem nome, some junto com a vírgula ou o
 * espaço da frente — "Olá, {nome}!" vira "Olá!", e não "Olá, !".
 */
export function personalizar(texto: string, nome: string): string {
  const primeiro = primeiroNome(nome)
  return primeiro
    ? texto.replace(/\{nome\}/gi, primeiro)
    : texto.replace(/[,\s]*\{nome\}/gi, '')
}

export function linkValido(url: string): boolean {
  if (!url.trim()) return true
  try {
    const u = new URL(url.trim())
    return u.protocol === 'https:' || u.protocol === 'http:'
  } catch {
    return false
  }
}

function escapar(texto: string): string {
  return texto
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

/** Blocos separados por linha em branco; quebra simples vira <br>. */
export function paragrafos(corpo: string): string[] {
  return corpo.replace(/\r\n/g, '\n').split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean)
}

const TINTA = '#1a202c'
const SUAVE = '#718096'
const VERMELHO = '#cc0000'
const LINHA = '#e2e8f0'

export type EmailDaCampanha = { assunto: string; html: string; texto: string }

export function emailDaCampanha(dados: {
  assunto: string
  corpo: string
  nome: string
  linkUrl?: string
  linkRotulo?: string
  /** O endereço rastreado que leva ao link (registra o clique). Ausente = o link direto. */
  urlDoClique?: string
  urlDoPixel: string
  urlDeSaida: string
}): EmailDaCampanha {
  const corpo = personalizar(dados.corpo, dados.nome)
  const assunto = personalizar(dados.assunto, dados.nome)
  const blocos = paragrafos(corpo)
  const link = dados.linkUrl?.trim() ? (dados.urlDoClique || dados.linkUrl.trim()) : ''
  const rotulo = dados.linkRotulo?.trim() || 'Saiba mais'

  const miolo = blocos
    .map((p) => `<p style="margin:0 0 16px;">${escapar(p).replace(/\n/g, '<br>')}</p>`)
    .join('\n')
  const acao = link
    ? `<p style="margin:8px 0 24px;"><a href="${escapar(link)}" style="color:${VERMELHO};font-weight:bold;">${escapar(rotulo)}</a></p>`
    : ''

  const html = `<!doctype html>
<html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light"><title>${escapar(assunto)}</title></head>
<body style="margin:0;padding:0;background:#ffffff;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td align="center" style="padding:24px 12px;">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="width:600px;max-width:100%;">
<tr><td style="font-family:Arial,Helvetica,sans-serif;color:${TINTA};font-size:15px;line-height:1.6;">
${miolo}
${acao}
</td></tr>
<tr><td style="padding-top:20px;border-top:1px solid ${LINHA};font-family:Arial,Helvetica,sans-serif;color:${SUAVE};font-size:12px;line-height:1.6;">
<p style="margin:0 0 6px;">Assessoria de Comunicação — Cruz Vermelha Brasileira, Filial do Estado do Rio de Janeiro</p>
<p style="margin:0;">Não quer mais receber nossos comunicados? <a href="${escapar(dados.urlDeSaida)}" style="color:${SUAVE};">Sair da lista</a>.</p>
</td></tr>
</table>
</td></tr></table>
<img src="${escapar(dados.urlDoPixel)}" width="1" height="1" alt="" style="display:block;width:1px;height:1px;border:0;">
</body></html>`

  const texto = [
    ...blocos,
    ...(link ? [`${rotulo}: ${link}`] : []),
    '',
    '--',
    'Assessoria de Comunicação — Cruz Vermelha Brasileira, Filial do Estado do Rio de Janeiro',
    `Não quer mais receber nossos comunicados? ${dados.urlDeSaida}`,
  ].join('\n\n').replace(/\n{3,}/g, '\n\n')

  return { assunto, html, texto }
}

// ---------------------------------------------------------------- agendamento

/** Margem mínima: abaixo disto o relógio (de minuto em minuto) já enviaria na
 * hora, e "agendar" seria só um "enviar" que parece outra coisa. */
export const ANTECEDENCIA_MINIMA_MS = 2 * 60_000
export const DIAS_DE_AGENDAMENTO = 90

/**
 * Lê o horário pedido para a campanha. Vazio = sai agora (quando: null).
 *
 * O campo da tela (datetime-local) manda "2026-11-10T09:00", sem fuso, e a
 * tela promete horário de Brasília. O servidor roda em UTC: ler direto
 * adiantaria todo agendamento em três horas. Aqui a promessa é cumprida, como
 * em Publicações (deBrasilia, app/actions/pacotes.ts). O Brasil não tem
 * horário de verão desde 2019, então -03:00 vale o ano inteiro.
 */
export function lerAgendamento(bruto: string, agora: Date = new Date()): { quando: string | null } | { erro: string } {
  const valor = bruto.trim()
  if (!valor) return { quando: null }
  const semFuso = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?$/.test(valor)
  const quando = new Date(semFuso ? `${valor}${valor.length === 16 ? ':00' : ''}-03:00` : valor)
  if (Number.isNaN(quando.getTime())) return { erro: 'A data do agendamento não é válida.' }
  if (quando.getTime() < agora.getTime() + ANTECEDENCIA_MINIMA_MS) {
    return { erro: 'Esse horário já passou ou está em cima da hora. Para enviar já, escolha "Agora".' }
  }
  if (quando.getTime() > agora.getTime() + DIAS_DE_AGENDAMENTO * 86_400_000) {
    return { erro: `O agendamento vai até ${DIAS_DE_AGENDAMENTO} dias à frente.` }
  }
  return { quando: quando.toISOString() }
}

/** "2026-11-10T09:00" (o valor do campo) → "10/11/2026 às 09:00", para a tela confirmar. */
export function agendamentoParaLer(valorDoCampo: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}:\d{2})/.exec(valorDoCampo.trim())
  return m ? `${m[3]}/${m[2]}/${m[1]} às ${m[4]}` : ''
}

/** O menor valor que o campo aceita: agora, no relógio de Brasília, mais a margem. */
export function minimoDoAgendamento(agora: Date = new Date()): string {
  return new Date(agora.getTime() + ANTECEDENCIA_MINIMA_MS + 60_000 - 3 * 3_600_000).toISOString().slice(0, 16)
}

// ---------------------------------------------------------------- fila

/** Quantas vezes a fila repete um lote que o Resend não confirmou. */
export const TENTATIVAS_A_MAIS = 2

/**
 * Lote que o Resend não confirmou: vale tentar de novo?
 *
 * Vale quando a falha é de momento — rede ou tempo esgotado (status 0), o
 * mesmo pedido ainda em andamento (409), limite de chamadas por segundo (429)
 * ou erro do lado deles (5xx). Repetir é seguro porque o lote vai com chave de
 * idempotência. Não vale quando a resposta seria a mesma: pedido inválido,
 * chave ou domínio recusados, e a cota do plano (também 429, mas esperar
 * segundos não devolve cota).
 */
export function valeTentarDeNovo(status: number, mensagem: string, tentativa: number): boolean {
  if (tentativa >= TENTATIVAS_A_MAIS) return false
  if (status === 429) return !/quota/i.test(mensagem)
  return status === 0 || status === 409 || status >= 500
}

/** A falha deixa dúvida se a mensagem saiu? Só então o aviso "pode ter saído". */
export const podeTerSaido = (status: number) => status === 0 || status === 409 || status >= 500

// ---------------------------------------------------------------- números

export type NumerosDeCampanhas = {
  enviados: number
  aberturasUnicas: number
  aberturasTotais: number
  cliquesUnicos: number
  cliquesTotais: number
  descadastros: number
  falhas: number
  /** Devolução definitiva avisada pelo provedor depois do envio. */
  devolucoes: number
  /** Quem marcou como spam. O Gmail não avisa: o número real é maior. */
  denuncias: number
}

const pct = (parte: number, todo: number) => (todo ? Math.round((parte / todo) * 1000) / 10 : 0)

/** As taxas do painel, a partir da soma das campanhas do período. */
export function taxas(n: NumerosDeCampanhas) {
  return {
    abertura: pct(n.aberturasUnicas, n.enviados),
    cliques: pct(n.cliquesUnicos, n.enviados),
    // Dos que abriram, quantos clicaram — mede o texto, não a lista.
    cliquesSobreAberturas: pct(n.cliquesUnicos, n.aberturasUnicas),
    descadastro: pct(n.descadastros, n.enviados),
    falha: pct(n.falhas, n.enviados + n.falhas),
    devolucao: pct(n.devolucoes, n.enviados),
    denuncia: pct(n.denuncias, n.enviados),
    mediaDeAberturas: n.aberturasUnicas ? Math.round((n.aberturasTotais / n.aberturasUnicas) * 10) / 10 : 0,
  }
}

/** Acima disto os provedores passam a desconfiar do remetente: 4% de
 * devoluções é o teto que o Resend recomenda; 0,3% de denúncias é o limite do
 * Gmail e do Yahoo para quem envia em volume. */
export const LIMITE_DE_DEVOLUCAO = 4
export const LIMITE_DE_DENUNCIA = 0.3
/** Com menos envios do que isto, uma devolução sozinha já passaria do limite. */
const MINIMO_PARA_ALERTAR = 50

/** O aviso do painel quando a lista está machucando a entrega — ou null. */
export function alertaDeEntrega(n: NumerosDeCampanhas): string | null {
  if (n.enviados < MINIMO_PARA_ALERTAR) return null
  const t = taxas(n)
  const br = (v: number) => String(v).replace('.', ',')
  if (t.denuncia > LIMITE_DE_DENUNCIA) {
    return `Denúncias de spam em ${br(t.denuncia)}% dos envios do período (o limite dos provedores é ${br(LIMITE_DE_DENUNCIA)}%). Reduza a lista para quem cobre o assunto antes do próximo envio.`
  }
  if (t.devolucao > LIMITE_DE_DEVOLUCAO) {
    return `Devoluções em ${br(t.devolucao)}% dos envios do período (o recomendado é até ${br(LIMITE_DE_DEVOLUCAO)}%). Verifique os e-mails da lista antes do próximo envio.`
  }
  return null
}
