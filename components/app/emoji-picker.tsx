'use client'

import { useEffect, useRef, useState } from 'react'
import { Search } from 'lucide-react'
import { EMOJI_CATEGORIES } from '@/lib/emoji-data'
import { cn } from '@/lib/utils'

export function EmojiPicker({ onSelect, onClose }: { onSelect: (emoji: string) => void; onClose: () => void }) {
  const [query, setQuery] = useState('')
  const [activeCategory, setActiveCategory] = useState(EMOJI_CATEGORIES[0].id)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (ref.current && !ref.current.contains(event.target as Node)) onClose()
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [onClose])

  const filtered = query.trim()
    ? EMOJI_CATEGORIES.flatMap((category) => category.emojis).filter((emoji) => emoji.name.includes(query.trim().toLowerCase()))
    : EMOJI_CATEGORIES.find((category) => category.id === activeCategory)?.emojis ?? []

  return (
    <div ref={ref} className="absolute left-0 top-11 z-40 w-72 rounded-lg border border-border bg-background shadow-lg" role="dialog" aria-label="Escolher emoji">
      <div className="border-b border-border p-2">
        <div className="relative">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <input
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscar emoji…"
            className="h-8 w-full rounded-md border border-border bg-background pl-8 pr-2 text-sm outline-none focus:border-ring focus:ring-2 focus:ring-ring/30"
          />
        </div>
      </div>

      {!query.trim() && (
        <div className="flex gap-1 overflow-x-auto border-b border-border p-1.5">
          {EMOJI_CATEGORIES.map((category) => (
            <button
              key={category.id}
              type="button"
              onClick={() => setActiveCategory(category.id)}
              className={cn('shrink-0 rounded-md px-2 py-1 text-xs font-medium', activeCategory === category.id ? 'bg-muted text-foreground' : 'text-muted-foreground hover:bg-muted')}
            >
              {category.label}
            </button>
          ))}
        </div>
      )}

      <div className="grid max-h-56 grid-cols-8 gap-0.5 overflow-y-auto p-2">
        {filtered.map((emoji) => (
          <button
            key={emoji.char}
            type="button"
            title={emoji.name}
            aria-label={emoji.name}
            onClick={() => onSelect(emoji.char)}
            className="flex size-8 items-center justify-center rounded-md text-lg hover:bg-muted"
          >
            {emoji.char}
          </button>
        ))}
        {!filtered.length && <p className="col-span-8 py-4 text-center text-xs text-muted-foreground">Nenhum emoji encontrado.</p>}
      </div>
    </div>
  )
}
