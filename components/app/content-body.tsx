import { parseContentBlocks, type InlineToken } from '@/lib/content-blocks'

function renderInline(tokens: InlineToken[]) {
  return tokens.map((token, index) => {
    if (token.type === 'bold') return <strong key={index}>{token.text}</strong>
    if (token.type === 'italic') return <em key={index}>{token.text}</em>
    if (token.type === 'link') return <a key={index} href={token.href} target="_blank" rel="noreferrer" className="text-primary underline underline-offset-2">{token.text}</a>
    return token.text
  })
}

export function ContentBody({ body, emptyLabel = 'Conteúdo sem texto.' }: { body?: string | null; emptyLabel?: string }) {
  const blocks = parseContentBlocks(body)
  if (!blocks.length) return <p className="text-muted-foreground">{emptyLabel}</p>
  return (
    <>
      {blocks.map((block, index) => {
        if (block.type === 'image') return <img key={index} src={block.url} alt={block.alt} className="my-4 w-full rounded-lg border border-border object-cover" />
        if (block.type === 'video') return <video key={index} src={block.url} controls className="my-4 w-full rounded-lg border border-border" />
        if (block.type === 'audio') return <audio key={index} src={block.url} controls className="my-4 w-full" />
        if (block.type === 'heading') return <h2 key={index} className="mt-6 font-serif text-xl font-bold">{renderInline(block.inline)}</h2>
        if (block.type === 'quote') return <blockquote key={index} className="my-4 border-l-2 border-primary pl-4 italic text-muted-foreground">{renderInline(block.inline)}</blockquote>
        if (block.type === 'list') return <ul key={index} className="my-3 list-disc pl-5">{block.items.map((item, itemIndex) => <li key={itemIndex}>{renderInline(item)}</li>)}</ul>
        return <p key={index}>{renderInline(block.inline)}</p>
      })}
    </>
  )
}
