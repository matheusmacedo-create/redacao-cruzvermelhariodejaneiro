export type InlineToken =
  | { type: 'text'; text: string }
  | { type: 'bold'; text: string }
  | { type: 'italic'; text: string }
  | { type: 'link'; text: string; href: string }

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
const INLINE_PATTERN = /\*\*(.+?)\*\*|\*(.+?)\*|\[([^\]]+)\]\((\S+?)\)/g

export function parseInline(text: string): InlineToken[] {
  const tokens: InlineToken[] = []
  let lastIndex = 0
  let match: RegExpExecArray | null
  INLINE_PATTERN.lastIndex = 0
  while ((match = INLINE_PATTERN.exec(text))) {
    if (match.index > lastIndex) tokens.push({ type: 'text', text: text.slice(lastIndex, match.index) })
    if (match[1] !== undefined) tokens.push({ type: 'bold', text: match[1] })
    else if (match[2] !== undefined) tokens.push({ type: 'italic', text: match[2] })
    else if (match[3] !== undefined) tokens.push({ type: 'link', text: match[3], href: match[4] })
    lastIndex = INLINE_PATTERN.lastIndex
  }
  if (lastIndex < text.length) tokens.push({ type: 'text', text: text.slice(lastIndex) })
  return tokens
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

export function parseContentBlocks(body?: string | null): ContentBlock[] {
  if (!body) return []
  return normalizarQuebras(body)
    .split(/\n\n+/)
    .map((paragraph): ContentBlock | null => {
      const trimmed = paragraph.trim()
      if (!trimmed) return null

      const media = MEDIA_LINE.exec(trimmed)
      if (media) {
        const [, kind, alt, url, credito] = media
        return { type: (kind as 'video' | 'audio' | undefined) || 'image', url, alt, credito: credito || undefined }
      }
      if (trimmed.startsWith('## ')) return { type: 'heading', inline: parseInline(trimmed.slice(3)) }
      if (trimmed.startsWith('> ')) return { type: 'quote', inline: parseInline(trimmed.slice(2)) }

      const lines = trimmed.split('\n')
      if (lines.every((line) => line.trim().startsWith('- '))) {
        return { type: 'list', items: lines.map((line) => parseInline(line.trim().slice(2))) }
      }
      // Passo a passo numerado: a ordem é a informação, então vira <ol> e não
      // um parágrafo começando com "1.".
      if (lines.every((line) => /^\d+\.\s/.test(line.trim()))) {
        return {
          type: 'list',
          ordenada: true,
          items: lines.map((line) => parseInline(line.trim().replace(/^\d+\.\s+/, ''))),
        }
      }
      return { type: 'text', inline: parseInline(trimmed) }
    })
    .filter((block): block is ContentBlock => block !== null)
}

export function mediaToken(kind: 'image' | 'video' | 'audio', url: string, alt: string, credito?: string) {
  const prefix = kind === 'image' ? '' : `${kind}:`
  // ] fecharia a legenda e " fecharia o crédito antes da hora: o token
  // deixaria de ser reconhecido e a mídia sumiria da página.
  const legenda = alt.replace(/[\]\n]/g, ' ').trim()
  const credito2 = credito?.replace(/["\n]/g, ' ').trim()
  return `![${prefix}${legenda}](${url}${credito2 ? ` "${credito2}"` : ''})`
}
