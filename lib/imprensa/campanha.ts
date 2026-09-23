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

/** Teto de destinatários por campanha: o envio acontece dentro de uma função
 * da Vercel (60 s), em lotes de 100 com pausa entre eles para respeitar o
 * limite de chamadas do Resend. Acima disso, a função pode morrer no meio.
 * Lista maior sai em mais de uma campanha. */
export const TETO_DE_DESTINATARIOS = 1000

export type ContatoParaEnvio = {
  email: string | null
  emailStatus: string
  descadastradoEm: string | null
}

export type MotivoDeFora = 'sem_email' | 'invalido' | 'descadastrado'

/** Por que um contato fica fora do disparo — null quando pode receber. */
export function motivoDeFora(c: ContatoParaEnvio): MotivoDeFora | null {
  if (!c.email || !c.email.includes('@')) return 'sem_email'
  if (c.descadastradoEm) return 'descadastrado'
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
  urlDoPixel: string
  urlDeSaida: string
}): EmailDaCampanha {
  const corpo = personalizar(dados.corpo, dados.nome)
  const assunto = personalizar(dados.assunto, dados.nome)
  const blocos = paragrafos(corpo)
  const link = dados.linkUrl?.trim() ?? ''
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
