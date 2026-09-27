/**
 * A caixa de entrada do E-mail do setor: o que é puro (sem rede), para ler
 * o que a API do Gmail devolve e decidir o que cada setor vê. Conferido por
 * scripts/conferir-caixa-de-entrada.ts.
 *
 * A conta Google é uma só (a dona dos endereços dos setores). Cada setor só
 * vê o que foi PARA o endereço dele ou saiu DELE — a busca no Gmail já vem
 * presa ao endereço (consultaDaPasta), e cada mensagem é conferida de novo
 * (envolveOEndereco) antes de aparecer.
 */

export type Pasta = 'entrada' | 'enviados' | 'todas'
export const PASTAS: Record<Pasta, string> = { entrada: 'Caixa de entrada', enviados: 'Enviados', todas: 'Todas' }
export const ehPasta = (v: unknown): v is Pasta => v === 'entrada' || v === 'enviados' || v === 'todas'

export type EnderecoLido = { nome: string; email: string }
/** `parte` é o partId da árvore MIME: o id do anexo no Gmail muda a cada leitura, a parte não. */
export type AnexoLido = { id: string; parte: string; nome: string; tipo: string; tamanho: number; cid: string | null; embutido: boolean }
export type MensagemLida = {
  id: string
  threadId: string
  de: EnderecoLido | null
  para: EnderecoLido[]
  cc: EnderecoLido[]
  assunto: string
  data: string | null
  resumo: string
  naoLida: boolean
  html: string | null
  texto: string | null
  anexos: AnexoLido[]
  /** Message-ID e References, para a resposta cair na mesma conversa em qualquer cliente. */
  idDaMensagem: string
  referencias: string
}

/** O que a API do Gmail devolve (só o que usamos). */
export type ParteDoGmail = {
  partId?: string
  mimeType?: string
  filename?: string
  headers?: { name: string; value: string }[]
  body?: { attachmentId?: string; size?: number; data?: string }
  parts?: ParteDoGmail[]
}
export type MensagemDoGmail = { id: string; threadId: string; labelIds?: string[]; snippet?: string; internalDate?: string; payload?: ParteDoGmail }

export function cabecalho(parte: ParteDoGmail | undefined, nome: string): string {
  const alvo = nome.toLowerCase()
  return parte?.headers?.find((h) => h.name.toLowerCase() === alvo)?.value ?? ''
}

/** Decodifica cabeçalhos em encoded-word (=?UTF-8?B?...?= / =?ISO-8859-1?Q?...?=). A API costuma já devolver decodificado. */
export function decodificarPalavras(valor: string): string {
  return valor.replace(/=\?([^?]+)\?([BbQq])\?([^?]*)\?=(\s+(?==\?))?/g, (_t, charset: string, modo: string, dado: string) => {
    try {
      const bytes = modo.toUpperCase() === 'B'
        ? Buffer.from(dado, 'base64')
        : Buffer.from(dado.replace(/_/g, ' ').replace(/=([0-9A-Fa-f]{2})/g, (_m, h: string) => String.fromCharCode(parseInt(h, 16))), 'latin1')
      return new TextDecoder(charset.toLowerCase()).decode(bytes)
    } catch {
      return dado
    }
  })
}

/** "Ana <ana@x.org>, "Silva, B" <b@y.org>, c@z.org" → lista, com vírgula dentro de aspas respeitada. */
export function lerEnderecos(valor: string): EnderecoLido[] {
  const saida: EnderecoLido[] = []
  let atual = ''
  let aspas = false
  let angulo = false
  const fechar = () => {
    const t = atual.trim()
    atual = ''
    if (!t) return
    const m = t.match(/^(.*?)<([^>]+)>\s*$/)
    const email = (m ? m[2] : t).trim().toLowerCase()
    const nome = decodificarPalavras((m ? m[1] : '').trim().replace(/^"(.*)"$/, '$1').replace(/\\"/g, '"')).trim()
    if (/^[^\s@]+@[^\s@]+$/.test(email)) saida.push({ nome, email })
  }
  for (const ch of valor) {
    if (ch === '"' && !angulo) aspas = !aspas
    else if (ch === '<' && !aspas) angulo = true
    else if (ch === '>' && !aspas) angulo = false
    if ((ch === ',' || ch === ';') && !aspas && !angulo) { fechar(); continue }
    atual += ch
  }
  fechar()
  return saida
}

/**
 * O endereço do setor está nesta mensagem? Foi para ele (Para, Cc,
 * Delivered-To, X-Original-To) ou saiu dele (De). É a trava de verdade: a
 * busca do Gmail ajuda, mas cada mensagem mostrada passa por aqui.
 */
export function envolveOEndereco(parte: ParteDoGmail | undefined, email: string): boolean {
  const alvo = email.trim().toLowerCase()
  if (!alvo) return false
  for (const nome of ['From', 'To', 'Cc', 'Delivered-To', 'X-Original-To', 'Envelope-To']) {
    const valores = (parte?.headers ?? []).filter((h) => h.name.toLowerCase() === nome.toLowerCase()).map((h) => h.value)
    if (valores.some((v) => lerEnderecos(v).some((e) => e.email === alvo))) return true
  }
  return false
}

/** Tira da busca da pessoa tudo o que poderia soltar a trava do endereço: parênteses, chaves, aspas e OR/AND. */
export function limparBusca(busca: string): string {
  return busca
    .replace(/[(){}\[\]"'\\]/g, ' ')
    .split(/\s+/)
    .filter((p) => p && !/^(or|and)$/i.test(p) && !/^[|&]+$/.test(p))
    .join(' ')
    .slice(0, 200)
}

/**
 * A busca no Gmail de uma pasta do setor. O filtro do endereço vai entre
 * parênteses e sempre em AND com o resto; a busca da pessoa entra limpa.
 */
export function consultaDaPasta(email: string, pasta: Pasta, busca = ''): string {
  const e = email.trim().toLowerCase().replace(/[^a-z0-9._%+@-]/g, '')
  const paraOEndereco = `(to:${e} OR cc:${e} OR deliveredto:${e})`
  const base = pasta === 'entrada' ? `${paraOEndereco} in:inbox`
    : pasta === 'enviados' ? `from:${e} in:sent`
      : `(to:${e} OR cc:${e} OR deliveredto:${e} OR from:${e}) -in:trash -in:spam`
  const extra = limparBusca(busca)
  return extra ? `${base} ${extra}` : base
}

function base64url(dado: string): Buffer {
  return Buffer.from(dado.replace(/-/g, '+').replace(/_/g, '/'), 'base64')
}

/** O corpo de uma parte, no charset dela (a API já desfaz o quoted-printable/base64 do e-mail, mas não o charset). */
export function textoDaParte(parte: ParteDoGmail): string {
  const dado = parte.body?.data
  if (!dado) return ''
  const charset = cabecalho(parte, 'Content-Type').match(/charset="?([^";\s]+)"?/i)?.[1]?.toLowerCase() ?? 'utf-8'
  const bytes = base64url(dado)
  try {
    return new TextDecoder(charset === 'utf8' ? 'utf-8' : charset).decode(bytes)
  } catch {
    return new TextDecoder('utf-8').decode(bytes)
  }
}

/** Anda pela árvore MIME: o primeiro HTML, o primeiro texto e os anexos (com o Content-ID das imagens embutidas). */
export function partesDaMensagem(raiz: ParteDoGmail | undefined): { html: string | null; texto: string | null; anexos: AnexoLido[] } {
  let html: string | null = null
  let texto: string | null = null
  const anexos: AnexoLido[] = []
  const visitar = (p: ParteDoGmail | undefined) => {
    if (!p) return
    const tipo = (p.mimeType ?? '').toLowerCase()
    const disposicao = cabecalho(p, 'Content-Disposition').toLowerCase()
    const ehAnexo = Boolean(p.body?.attachmentId) || Boolean(p.filename) || disposicao.startsWith('attachment')
    if (p.parts?.length) { p.parts.forEach(visitar); return }
    if (ehAnexo && p.body?.attachmentId) {
      const cid = cabecalho(p, 'Content-ID').replace(/^<|>$/g, '').trim() || null
      anexos.push({
        id: p.body.attachmentId,
        parte: p.partId ?? '',
        nome: decodificarPalavras(p.filename || cid || 'anexo').slice(0, 180),
        tipo: tipo || 'application/octet-stream',
        tamanho: Number(p.body.size ?? 0),
        cid,
        embutido: Boolean(cid) && !disposicao.startsWith('attachment') && tipo.startsWith('image/'),
      })
      return
    }
    if (tipo === 'text/html' && html === null) html = textoDaParte(p)
    else if (tipo === 'text/plain' && texto === null) texto = textoDaParte(p)
  }
  visitar(raiz)
  return { html, texto, anexos }
}

/** Uma mensagem da API (format=full ou metadata) no formato da tela. */
export function lerMensagem(m: MensagemDoGmail): MensagemLida {
  const p = m.payload
  const { html, texto, anexos } = p?.parts || p?.body?.data ? partesDaMensagem(p) : { html: null, texto: null, anexos: [] }
  const quando = cabecalho(p, 'Date')
  const data = m.internalDate ? new Date(Number(m.internalDate)).toISOString() : quando && !Number.isNaN(Date.parse(quando)) ? new Date(quando).toISOString() : null
  return {
    id: m.id,
    threadId: m.threadId,
    de: lerEnderecos(cabecalho(p, 'From'))[0] ?? null,
    para: lerEnderecos(cabecalho(p, 'To')),
    cc: lerEnderecos(cabecalho(p, 'Cc')),
    assunto: decodificarPalavras(cabecalho(p, 'Subject')).trim() || '(sem assunto)',
    data,
    resumo: decodificarEntidades(m.snippet ?? ''),
    naoLida: (m.labelIds ?? []).includes('UNREAD'),
    html,
    texto,
    anexos,
    idDaMensagem: cabecalho(p, 'Message-ID') || cabecalho(p, 'Message-Id'),
    referencias: cabecalho(p, 'References'),
  }
}

/** O resumo do Gmail vem com entidades HTML (&#39;, &quot;…). */
export function decodificarEntidades(s: string): string {
  return s.replace(/&#(\d+);/g, (_m, n: string) => String.fromCodePoint(Number(n)))
    .replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&')
}

/** "Re: " uma vez só (e "Enc: " para encaminhar), como os clientes de e-mail fazem. */
export function assuntoDaResposta(assunto: string, modo: 'responder' | 'encaminhar'): string {
  const limpo = assunto.trim() || '(sem assunto)'
  if (modo === 'responder') return /^(re|res)\s*:/i.test(limpo) ? limpo : `Re: ${limpo}`
  return /^(enc|fwd?|tr)\s*:/i.test(limpo) ? limpo : `Enc: ${limpo}`
}

/**
 * Para quem vai a resposta: o remetente (ou o Reply-To dele); em "responder a
 * todos", também os outros de Para e Cc — nunca o próprio endereço do setor.
 */
export function destinatariosDaResposta(m: { de: EnderecoLido | null; para: EnderecoLido[]; cc: EnderecoLido[]; responderPara?: EnderecoLido[] }, email: string, todos: boolean): { para: string[]; cc: string[] } {
  const eu = email.trim().toLowerCase()
  const saiuDaqui = m.de?.email === eu
  // Resposta a uma mensagem que o próprio setor mandou vai para quem a recebeu.
  const principais = saiuDaqui ? m.para : (m.responderPara?.length ? m.responderPara : m.de ? [m.de] : [])
  const para = [...new Set(principais.map((e) => e.email).filter((e) => e !== eu))]
  if (!todos) return { para, cc: [] }
  const outros = saiuDaqui ? m.cc : [...m.para, ...m.cc]
  const cc = [...new Set(outros.map((e) => e.email).filter((e) => e !== eu && !para.includes(e)))]
  return { para, cc }
}

/** Os cabeçalhos que prendem a resposta à conversa (RFC 5322). */
export function cabecalhosDaResposta(m: { idDaMensagem: string; referencias: string }): { emRespostaA: string; referencias: string } | null {
  const id = m.idDaMensagem.trim()
  if (!id) return null
  const refs = `${m.referencias.trim()} ${id}`.trim().split(/\s+/).slice(-20).join(' ')
  return { emRespostaA: id, referencias: refs }
}

const quandoCitado = new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short', timeZone: 'America/Sao_Paulo' })

/** O texto citado ao responder ou encaminhar, em texto e em HTML. */
export function citacao(m: MensagemLida, modo: 'responder' | 'encaminhar'): { texto: string; html: string } {
  const quem = m.de ? (m.de.nome ? `${m.de.nome} <${m.de.email}>` : m.de.email) : 'alguém'
  const data = m.data ? quandoCitado.format(new Date(m.data)) : ''
  const original = m.texto?.trim() || (m.html ? textoDeHtml(m.html) : '')
  const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
  if (modo === 'encaminhar') {
    const cab = ['---------- Mensagem encaminhada ----------', `De: ${quem}`, data ? `Data: ${data}` : '', `Assunto: ${m.assunto}`,
      m.para.length ? `Para: ${m.para.map((e) => e.email).join(', ')}` : ''].filter(Boolean)
    return {
      texto: `${cab.join('\n')}\n\n${original}`,
      html: `<div class="gmail_quote"><p>${cab.map(esc).join('<br>')}</p>${m.html ?? `<p>${esc(original).replace(/\n/g, '<br>')}</p>`}</div>`,
    }
  }
  const linha = `Em ${data || 'data desconhecida'}, ${quem} escreveu:`
  return {
    texto: `${linha}\n${original.split('\n').map((l) => `> ${l}`).join('\n')}`,
    html: `<div class="gmail_quote"><p>${esc(linha)}</p><blockquote style="margin:0 0 0 .8ex;border-left:1px solid #ccc;padding-left:1ex">${m.html ?? esc(original).replace(/\n/g, '<br>')}</blockquote></div>`,
  }
}

/** HTML → texto simples (para citar uma mensagem que só veio em HTML). */
export function textoDeHtml(html: string): string {
  return decodificarEntidades(html
    .replace(/<(script|style|head)[\s\S]*?<\/\1>/gi, '')
    .replace(/<(br|\/p|\/div|\/tr|\/li|\/h\d)[^>]*>/gi, '\n')
    .replace(/<[^>]+>/g, ''))
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

/**
 * O documento que vai no quadro de leitura. O quadro já é sandbox sem
 * script; aqui ainda: scripts e iframes saem, imagens embutidas (cid:) viram
 * o endereço do anexo, links abrem em nova aba, e uma CSP não deixa o e-mail
 * carregar nada além de imagem, estilo e fonte.
 */
export function documentoDeLeitura(m: Pick<MensagemLida, 'html' | 'texto' | 'anexos'>, urlDoAnexo: (a: AnexoLido) => string): string {
  const cid = new Map(m.anexos.filter((a) => a.cid).map((a) => [a.cid!.toLowerCase(), urlDoAnexo(a)]))
  let corpo: string
  if (m.html) {
    corpo = m.html
      .replace(/<(script|iframe|object|embed|frame|frameset|applet)\b[\s\S]*?(<\/\1>|\/>|$)/gi, '')
      .replace(/<(script|iframe|object|embed|meta|base|link\b(?![^>]*stylesheet))[^>]*>/gi, '')
      .replace(/\son[a-z]+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, '')
      .replace(/(src|href)\s*=\s*(["'])\s*javascript:[^"']*\2/gi, '$1=$2#$2')
      .replace(/(["'(])cid:([^"')\s>]+)/gi, (t, antes: string, id: string) => {
        const url = cid.get(id.toLowerCase())
        return url ? `${antes}${url}` : t
      })
  } else {
    const esc = (m.texto ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    corpo = `<div style="white-space:pre-wrap;font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:1.5">${
      esc.replace(/(https?:\/\/[^\s<]+)/g, '<a href="$1">$1</a>')}</div>`
  }
  const csp = "default-src 'none'; img-src 'self' https: http: data:; style-src 'unsafe-inline' https:; font-src https: data:"
  return `<!doctype html><html><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="${csp}"><meta name="referrer" content="no-referrer"><base target="_blank"><style>body{margin:0;padding:4px 2px;font-family:Arial,Helvetica,sans-serif;font-size:14px;color:#1a202c;word-wrap:break-word;overflow-wrap:anywhere}img{max-width:100%;height:auto}blockquote{margin:0 0 0 .8ex;border-left:1px solid #ccc;padding-left:1ex;color:#555}</style></head><body>${corpo}</body></html>`
}

/** Acha uma parte da árvore MIME pelo partId. */
export function parteDaMensagem(raiz: ParteDoGmail | undefined, partId: string): ParteDoGmail | null {
  if (!raiz) return null
  if (raiz.partId === partId) return raiz
  for (const p of raiz.parts ?? []) { const achada = parteDaMensagem(p, partId); if (achada) return achada }
  return null
}

/** Só imagem comum e PDF abrem no navegador; o resto baixa (um HTML anexado nunca roda no endereço do Palácio). */
export const abreNoNavegador = (tipo: string) => /^(image\/(png|jpe?g|gif|webp)|application\/pdf)$/i.test(tipo)

/** Tamanho legível de um anexo. */
export function tamanhoLegivel(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1).replace('.', ',')} MB`
}
