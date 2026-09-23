/**
 * A mensagem de e-mail do correio dos setores, montada no formato que o
 * Gmail recebe (RFC 822 em base64url).
 *
 * Puro, sem rede: testável e à prova de três erros clássicos:
 *  - injeção de cabeçalho (quebra de linha num assunto ou nome vira um Bcc
 *    escondido) — todo valor de cabeçalho perde \r e \n;
 *  - acento no assunto chegando como "Ã§Ã£" — assunto e nome não-ASCII vão
 *    em encoded-word UTF-8, cortados em pedaços válidos;
 *  - assinatura que some no cliente sem HTML — a parte em texto também leva
 *    a assinatura, convertida.
 */

export type Endereco = { nome?: string; email: string }

const RE_EMAIL = /^[A-Za-z0-9._%+'-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/

export function emailValido(email: string): boolean {
  return RE_EMAIL.test(email.trim()) && !email.includes('..')
}

/** "a@x.org, B <b@y.org>; c@z.org" → endereços válidos + os inválidos, para avisar. */
export function lerDestinatarios(bruto: string): { validos: string[]; invalidos: string[] } {
  const validos: string[] = []
  const invalidos: string[] = []
  for (const parte of bruto.split(/[,;\n]+/).map((p) => p.trim()).filter(Boolean)) {
    const dentro = parte.match(/<([^>]+)>/)?.[1] ?? parte
    const email = dentro.trim().toLowerCase()
    if (emailValido(email)) { if (!validos.includes(email)) validos.push(email) } else invalidos.push(parte)
  }
  return { validos, invalidos }
}

const semQuebra = (s: string) => s.replace(/[\r\n]+/g, ' ').trim()
const ascii = (s: string) => /^[\x20-\x7E]*$/.test(s)

/** RFC 2047: encoded-words de até ~45 bytes, sem partir um caractere ao meio. */
export function codificarCabecalho(valor: string): string {
  const limpo = semQuebra(valor)
  if (ascii(limpo)) return limpo
  const palavras: string[] = []
  let pedaco: number[] = []
  for (const ch of limpo) {
    const bytes = [...Buffer.from(ch, 'utf8')]
    if (pedaco.length + bytes.length > 45) {
      palavras.push(`=?UTF-8?B?${Buffer.from(pedaco).toString('base64')}?=`)
      pedaco = []
    }
    pedaco.push(...bytes)
  }
  if (pedaco.length) palavras.push(`=?UTF-8?B?${Buffer.from(pedaco).toString('base64')}?=`)
  return palavras.join('\r\n ')
}

export function formatarEndereco(e: Endereco): string {
  const email = semQuebra(e.email)
  const nome = semQuebra(e.nome ?? '')
  if (!nome) return email
  if (ascii(nome)) return `"${nome.replace(/["\\]/g, '')}" <${email}>`
  return `${codificarCabecalho(nome)} <${email}>`
}

function base64Quebrado(texto: string): string {
  return (Buffer.from(texto, 'utf8').toString('base64').match(/.{1,76}/g) ?? []).join('\r\n')
}

function escapar(texto: string): string {
  return texto.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

/** Assinatura HTML → texto, para a parte em texto puro. */
export function htmlParaTexto(html: string): string {
  return html
    .replace(/<(br|\/p|\/div|\/tr|\/li|\/h\d)[^>]*>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

/** Texto escrito + assinatura fixa da caixa, nas duas versões. */
export function corpoComAssinatura(texto: string, assinaturaHtml: string): { html: string; texto: string } {
  const paragrafos = texto.replace(/\r\n/g, '\n').split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean)
  const miolo = paragrafos.map((p) => `<p style="margin:0 0 12px;">${escapar(p).replace(/\n/g, '<br>')}</p>`).join('\n')
  const assinatura = assinaturaHtml.trim()
  const html = `<div style="font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:1.5;color:#1a202c;">\n${miolo}\n${
    assinatura ? `<br><div class="gmail_signature">${assinatura}</div>\n` : ''}</div>`
  const textoAssinatura = assinatura ? htmlParaTexto(assinatura) : ''
  return { html, texto: [paragrafos.join('\n\n'), textoAssinatura ? `-- \n${textoAssinatura}` : ''].filter(Boolean).join('\n\n') }
}

export type MensagemDoCorreio = {
  de: Endereco
  para: string[]
  cc?: string[]
  responderPara?: string
  assunto: string
  texto: string
  html: string
  /** Fixo nos testes; aleatório no uso real. */
  fronteira?: string
}

/** A mensagem inteira, já em base64url — o campo `raw` da API do Gmail. */
export function montarMensagem(m: MensagemDoCorreio): { raw: string; bruto: string } {
  const fronteira = m.fronteira ?? `cvrj_${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`
  const cabecalhos = [
    `From: ${formatarEndereco(m.de)}`,
    `To: ${m.para.map(semQuebra).join(', ')}`,
    ...(m.cc?.length ? [`Cc: ${m.cc.map(semQuebra).join(', ')}`] : []),
    ...(m.responderPara?.trim() ? [`Reply-To: ${semQuebra(m.responderPara)}`] : []),
    `Subject: ${codificarCabecalho(m.assunto)}`,
    'MIME-Version: 1.0',
    `Content-Type: multipart/alternative; boundary="${fronteira}"`,
  ]
  const bruto = [
    ...cabecalhos,
    '',
    `--${fronteira}`,
    'Content-Type: text/plain; charset="UTF-8"',
    'Content-Transfer-Encoding: base64',
    '',
    base64Quebrado(m.texto),
    `--${fronteira}`,
    'Content-Type: text/html; charset="UTF-8"',
    'Content-Transfer-Encoding: base64',
    '',
    base64Quebrado(m.html),
    `--${fronteira}--`,
    '',
  ].join('\r\n')
  return { raw: Buffer.from(bruto, 'utf8').toString('base64url'), bruto }
}
