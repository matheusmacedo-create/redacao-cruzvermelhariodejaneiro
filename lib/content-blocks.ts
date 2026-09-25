/**
 * Negrito e itálico carregam os filhos já lidos (`children`): é o que deixa
 * `**[texto](url)**` virar um link dentro do negrito, em vez de sair como
 * Markdown cru. `text` continua sendo o texto puro do trecho, para quem só
 * precisa contar palavras ou montar um resumo.
 */
export type InlineToken =
  | { type: 'text'; text: string }
  | { type: 'bold'; text: string; children: InlineToken[] }
  | { type: 'italic'; text: string; children: InlineToken[] }
  | { type: 'link'; text: string; href: string; children: InlineToken[] }

export type ContentBlock =
  | { type: 'text'; inline: InlineToken[] }
  | { type: 'heading'; inline: InlineToken[] }
  | { type: 'quote'; inline: InlineToken[] }
  | { type: 'list'; items: InlineToken[][]; ordenada?: boolean }
  | { type: 'image'; url: string; alt: string; credito?: string }
  | { type: 'video'; url: string; alt: string; credito?: string }
  | { type: 'audio'; url: string; alt: string; credito?: string }

// O trecho entre aspas no fim é o crédito da foto, na sintaxe de título do
// Markdown: ![legenda](url "Foto: Fulano"). É opcional — linha sem ele segue
// valendo, que é como está todo o conteúdo já escrito.
const MEDIA_LINE = /^!\[(?:(video|audio):)?([^\]]*)\]\((\S+?)(?:\s+"([^"]*)")?\)$/
// A mesma sintaxe no meio de uma linha: a foto colada logo depois de uma frase,
// sem linha em branco entre as duas, também é foto.
const MEDIA_NO_MEIO = /!\[(?:(video|audio):)?([^\]]*)\]\((\S+?)(?:\s+"([^"]*)")?\)/g

// Negrito pode atravessar quebra de linha (o parágrafo é o limite); o endereço
// do link aceita um nível de parênteses (os da Wikipédia, por exemplo).
// Grupos: 1 negrito e itálico juntos (***…***), 2 negrito, 3 itálico, 4-5 link.
const INLINE_PATTERN = /\*\*\*([\s\S]+?)\*\*\*|\*\*([\s\S]+?)\*\*|\*([^*\n]+?)\*|\[([^\]]+)\]\(((?:[^()\s]|\([^()\s]*\))+)\)/g
const PROFUNDIDADE_MAXIMA = 4

/** O texto puro de uma sequência de trechos (o link vale pelo texto dele). */
export function textoDosTrechos(tokens: InlineToken[]): string {
  return tokens.map((t) => t.text).join('')
}

function lerInline(text: string, profundidade: number): InlineToken[] {
  if (profundidade > PROFUNDIDADE_MAXIMA) return text ? [{ type: 'text', text }] : []
  const tokens: InlineToken[] = []
  const padrao = new RegExp(INLINE_PATTERN.source, 'g')
  let lastIndex = 0
  let match: RegExpExecArray | null
  while ((match = padrao.exec(text))) {
    if (match.index > lastIndex) tokens.push({ type: 'text', text: text.slice(lastIndex, match.index) })
    if (match[1] !== undefined) {
      const dentro = lerInline(match[1], profundidade + 1)
      const italico: InlineToken = { type: 'italic', text: textoDosTrechos(dentro), children: dentro }
      tokens.push({ type: 'bold', text: italico.text, children: [italico] })
    } else if (match[2] !== undefined) {
      const children = lerInline(match[2], profundidade + 1)
      tokens.push({ type: 'bold', text: textoDosTrechos(children), children })
    } else if (match[3] !== undefined) {
      const children = lerInline(match[3], profundidade + 1)
      tokens.push({ type: 'italic', text: textoDosTrechos(children), children })
    } else if (match[4] !== undefined) {
      // O texto do link pode ter negrito e itálico; link dentro de link não existe.
      const children = lerInline(match[4], profundidade + 1).flatMap((c) => (c.type === 'link' ? c.children : [c]))
      tokens.push({ type: 'link', text: textoDosTrechos(children), href: match[5], children })
    }
    lastIndex = padrao.lastIndex
  }
  if (lastIndex < text.length) tokens.push({ type: 'text', text: text.slice(lastIndex) })
  return tokens
}

export function parseInline(text: string): InlineToken[] {
  return lerInline(text, 0)
}

/**
 * Lê uma linha de mídia isolada — o editor precisa dela para saber a legenda e
 * o crédito de cada foto sem reimplementar a sintaxe do token.
 */
export function parseMediaLine(linha: string): { tipo: 'image' | 'video' | 'audio'; url: string; alt: string; credito: string } | null {
  const m = MEDIA_LINE.exec(linha.trim())
  if (!m) return null
  return { tipo: (m[1] as 'video' | 'audio') || 'image', url: m[3], alt: m[2], credito: m[4] ?? '' }
}

/**
 * Texto colado do Word, do Docs ou do WhatsApp chega com quebra de linha do
 * Windows (\r\n). Sem isto, o separador de parágrafo vira \r\n\r\n, nenhuma
 * divisão acontece e a matéria inteira sai como um parágrafo só — foto,
 * intertítulo e citação viram texto cru no meio da página.
 */
export function normalizarQuebras(texto: string): string {
  return texto.replace(/\r\n?/g, '\n')
}

/**
 * Endereço que só existe dentro da Redação: rota /api/…, arquivo do
 * armazenamento privado ou máquina de desenvolvimento. Numa página pública,
 * no e-mail ou num post, um link desses leva a um erro (ou expõe o caminho do
 * arquivo) — quem renderiza mostra só o texto.
 */
export function hrefInterno(href: string): boolean {
  const bruto = href.trim()
  if (/^\/api(\/|\?|$)/i.test(bruto)) return true
  let url: URL
  try { url = new URL(bruto) } catch { return false }
  const host = url.hostname.toLowerCase()
  if (host === 'localhost' || host === '127.0.0.1' || host === '0.0.0.0' || host.endsWith('.localhost')) return true
  if (host.endsWith('.blob.vercel-storage.com')) return true
  if (/^\/api\/private-blob/i.test(url.pathname)) return true
  return (host === 'redacao.cruzvermelhariodejaneiro.org' || host.endsWith('.vercel.app')) && /^\/api(\/|$)/i.test(url.pathname)
}

/**
 * O caminho no armazenamento de uma mídia privada, a partir do endereço que o
 * editor grava (`/api/private-blob?pathname=…`, relativo ou absoluto) ou do
 * endereço direto do armazenamento. Nulo quando não é arquivo privado.
 */
export function caminhoDoBlobPrivado(url: string): string | null {
  const bruto = url.trim()
  let u: URL
  try { u = new URL(bruto, 'https://redacao.invalido') } catch { return null }
  if (/\/api\/private-blob\/?$/i.test(u.pathname)) return u.searchParams.get('pathname') || null
  if (u.hostname.toLowerCase().endsWith('.blob.vercel-storage.com')) {
    try { return decodeURIComponent(u.pathname.replace(/^\/+/, '')) || null } catch { return null }
  }
  return null
}

// Linha em branco é a que só tem espaço — inclusive o não separável e os de
// largura zero que vêm colados de editores web.
const LINHA_EM_BRANCO = /^[\s​-‍⁠﻿]*$/
const TITULO = /^#{1,6}[ \t ]+(.*?)(?:[ \t]+#+)?[ \t]*$/
const CITACAO = /^>[ \t ]+(.*)$/
const ITEM = /^-[ \t ]+(.*)$/
const NUMERADO = /^\d+\.[ \t ]+(.*)$/

type BlocoDeMidia = Extract<ContentBlock, { type: 'image' | 'video' | 'audio' }>
type Pedaco = { tipo: 'midia'; bloco: BlocoDeMidia } | { tipo: 'linha'; texto: string }

function blocoDeMidia(m: RegExpExecArray): BlocoDeMidia {
  const [, kind, alt, url, credito] = m
  return { type: (kind as 'video' | 'audio' | undefined) || 'image', url, alt, credito: credito || undefined }
}

/** Separa a mídia do texto em volta dela, onde quer que ela esteja na linha. */
function pedacosDaLinha(linha: string): Pedaco[] {
  const inteira = MEDIA_LINE.exec(linha.trim())
  if (inteira) return [{ tipo: 'midia', bloco: blocoDeMidia(inteira) }]
  const pedacos: Pedaco[] = []
  const padrao = new RegExp(MEDIA_NO_MEIO.source, 'g')
  let antes = 0
  let m: RegExpExecArray | null
  while ((m = padrao.exec(linha))) {
    const texto = linha.slice(antes, m.index)
    if (texto.trim()) pedacos.push({ tipo: 'linha', texto })
    pedacos.push({ tipo: 'midia', bloco: blocoDeMidia(m) })
    antes = padrao.lastIndex
  }
  const resto = linha.slice(antes)
  if (resto.trim() || !pedacos.length) pedacos.push({ tipo: 'linha', texto: resto })
  return pedacos
}

/**
 * Um trecho entre linhas em branco vira um ou mais blocos.
 *
 * O trecho pode misturar linhas: uma frase com a foto logo abaixo, um
 * intertítulo no meio de parágrafos, uma citação entre dois textos. Antes o
 * trecho inteiro virava um bloco só, do tipo da primeira linha — e o resto
 * saía cru na página, com `![…](/api/private-blob…)` e `## ` à mostra (foi o
 * que aconteceu na matéria do desfile de 7 de Setembro). Agora cada linha de
 * mídia, intertítulo ou citação vira o seu bloco onde estiver; linhas de texto
 * seguidas continuam juntas num parágrafo, e itens seguidos, numa lista.
 */
function blocosDoTrecho(linhas: string[]): ContentBlock[] {
  // Trecho que é só lista continua sendo a mesma lista de antes: itens
  // seguidos se juntam numa lista só. Passo a passo numerado vira <ol>, porque
  // a ordem é a informação — e não um parágrafo começando com "1.".
  const blocos: ContentBlock[] = []
  let tipoAtual: 'texto' | 'citacao' | 'item' | 'numerado' | null = null
  let atual: string[] = []

  const fechar = () => {
    if (atual.length) {
      if (tipoAtual === 'texto') blocos.push({ type: 'text', inline: parseInline(atual.join('\n')) })
      else if (tipoAtual === 'citacao') blocos.push({ type: 'quote', inline: parseInline(atual.join('\n')) })
      else if (tipoAtual === 'item') blocos.push({ type: 'list', items: atual.map((i) => parseInline(i)) })
      else if (tipoAtual === 'numerado') blocos.push({ type: 'list', ordenada: true, items: atual.map((i) => parseInline(i)) })
    }
    atual = []
    tipoAtual = null
  }

  for (const linha of linhas) {
    for (const pedaco of pedacosDaLinha(linha)) {
      if (pedaco.tipo === 'midia') { fechar(); blocos.push(pedaco.bloco); continue }
      const bruto = pedaco.texto
      const t = bruto.trim()
      if (!t) continue
      const titulo = TITULO.exec(t)
      if (titulo) {
        fechar()
        if (titulo[1].trim()) blocos.push({ type: 'heading', inline: parseInline(titulo[1].trim()) })
        continue
      }
      const citacao = CITACAO.exec(t)
      if (citacao) {
        if (tipoAtual !== 'citacao') fechar()
        tipoAtual = 'citacao'
        if (citacao[1].trim()) atual.push(citacao[1].trim())
        continue
      }
      const item = ITEM.exec(t)
      if (item) {
        if (tipoAtual !== 'item') fechar()
        tipoAtual = 'item'
        atual.push(item[1])
        continue
      }
      const numerado = NUMERADO.exec(t)
      if (numerado) {
        if (tipoAtual !== 'numerado') fechar()
        tipoAtual = 'numerado'
        atual.push(numerado[1])
        continue
      }
      // Linha de texto logo depois de uma citação continua a citação (como no
      // Markdown); recuada depois de um item, continua o item.
      if (tipoAtual === 'citacao') { atual.push(t); continue }
      if ((tipoAtual === 'item' || tipoAtual === 'numerado') && /^[ \t]/.test(bruto)) {
        atual[atual.length - 1] = `${atual[atual.length - 1]} ${t}`
        continue
      }
      if (tipoAtual !== 'texto') fechar()
      tipoAtual = 'texto'
      atual.push(t)
    }
  }
  fechar()
  return blocos
}

export function parseContentBlocks(body?: string | null): ContentBlock[] {
  if (!body) return []
  const blocos: ContentBlock[] = []
  let trecho: string[] = []
  const fechar = () => {
    if (trecho.length) blocos.push(...blocosDoTrecho(trecho))
    trecho = []
  }
  for (const linha of normalizarQuebras(body).split('\n')) {
    if (LINHA_EM_BRANCO.test(linha)) fechar()
    else trecho.push(linha)
  }
  fechar()
  return blocos
}

export function mediaToken(kind: 'image' | 'video' | 'audio', url: string, alt: string, credito?: string) {
  const prefix = kind === 'image' ? '' : `${kind}:`
  // ] fecharia a legenda e " fecharia o crédito antes da hora: o token
  // deixaria de ser reconhecido e a mídia sumiria da página.
  const legenda = alt.replace(/[\]\n]/g, ' ').trim()
  const credito2 = credito?.replace(/["\n]/g, ' ').trim()
  return `![${prefix}${legenda}](${url}${credito2 ? ` "${credito2}"` : ''})`
}
