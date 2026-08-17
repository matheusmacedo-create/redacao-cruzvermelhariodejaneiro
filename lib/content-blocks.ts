export type InlineToken =
  | { type: 'text'; text: string }
  | { type: 'bold'; text: string }
  | { type: 'italic'; text: string }
  | { type: 'link'; text: string; href: string }

export type ContentBlock =
  | { type: 'text'; inline: InlineToken[] }
  | { type: 'heading'; inline: InlineToken[] }
  | { type: 'quote'; inline: InlineToken[] }
  | { type: 'list'; items: InlineToken[][] }
  | { type: 'image'; url: string; alt: string }
  | { type: 'video'; url: string; alt: string }
  | { type: 'audio'; url: string; alt: string }

const MEDIA_LINE = /^!\[(?:(video|audio):)?([^\]]*)\]\((\S+)\)$/
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

export function parseContentBlocks(body?: string | null): ContentBlock[] {
  if (!body) return []
  return body
    .split(/\n\n+/)
    .map((paragraph): ContentBlock | null => {
      const trimmed = paragraph.trim()
      if (!trimmed) return null

      const media = MEDIA_LINE.exec(trimmed)
      if (media) {
        const [, kind, alt, url] = media
        return { type: (kind as 'video' | 'audio' | undefined) || 'image', url, alt }
      }
      if (trimmed.startsWith('## ')) return { type: 'heading', inline: parseInline(trimmed.slice(3)) }
      if (trimmed.startsWith('> ')) return { type: 'quote', inline: parseInline(trimmed.slice(2)) }

      const lines = trimmed.split('\n')
      if (lines.every((line) => line.trim().startsWith('- '))) {
        return { type: 'list', items: lines.map((line) => parseInline(line.trim().slice(2))) }
      }
      return { type: 'text', inline: parseInline(trimmed) }
    })
    .filter((block): block is ContentBlock => block !== null)
}

export function mediaToken(kind: 'image' | 'video' | 'audio', url: string, alt: string) {
  const prefix = kind === 'image' ? '' : `${kind}:`
  return `![${prefix}${alt}](${url})`
}
