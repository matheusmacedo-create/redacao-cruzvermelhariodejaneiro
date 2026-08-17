export type ContentBlock =
  | { type: 'text'; text: string }
  | { type: 'image'; url: string; alt: string }
  | { type: 'video'; url: string; alt: string }
  | { type: 'audio'; url: string; alt: string }

const MEDIA_LINE = /^!\[(?:(video|audio):)?([^\]]*)\]\((\S+)\)$/

export function parseContentBlocks(body?: string | null): ContentBlock[] {
  if (!body) return []
  return body
    .split(/\n\n+/)
    .map((paragraph) => {
      const trimmed = paragraph.trim()
      const match = MEDIA_LINE.exec(trimmed)
      if (match) {
        const [, kind, alt, url] = match
        return { type: (kind as 'video' | 'audio' | undefined) || 'image', url, alt } as ContentBlock
      }
      return { type: 'text', text: paragraph } as ContentBlock
    })
    .filter((block) => block.type !== 'text' || block.text.trim().length > 0)
}

export function mediaToken(kind: 'image' | 'video' | 'audio', url: string, alt: string) {
  const prefix = kind === 'image' ? '' : `${kind}:`
  return `![${prefix}${alt}](${url})`
}
