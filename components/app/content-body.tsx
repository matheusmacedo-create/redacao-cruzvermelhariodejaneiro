import { parseContentBlocks } from '@/lib/content-blocks'

export function ContentBody({ body, emptyLabel = 'Conteúdo sem texto.' }: { body?: string | null; emptyLabel?: string }) {
  const blocks = parseContentBlocks(body)
  if (!blocks.length) return <p className="text-muted-foreground">{emptyLabel}</p>
  return (
    <>
      {blocks.map((block, index) => {
        if (block.type === 'image') return <img key={index} src={block.url} alt={block.alt} className="my-4 w-full rounded-lg border border-border object-cover" />
        if (block.type === 'video') return <video key={index} src={block.url} controls className="my-4 w-full rounded-lg border border-border" />
        if (block.type === 'audio') return <audio key={index} src={block.url} controls className="my-4 w-full" />
        return <p key={index}>{block.text}</p>
      })}
    </>
  )
}
