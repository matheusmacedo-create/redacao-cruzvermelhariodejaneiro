'use client'

import { useState } from 'react'
import Link from 'next/link'
import { ImageIcon, Video, Music, FileText, Search } from 'lucide-react'
import { Card } from '@/components/ui/card'
import { FileStatusBadge } from '@/components/ui/status-badge'
import { files, getPerson, type MediaFile } from '@/lib/data'
import { cn } from '@/lib/utils'

const kindIcon = { foto: ImageIcon, video: Video, audio: Music, documento: FileText }

const kindFilters: { label: string; value: 'todos' | MediaFile['kind'] }[] = [
  { label: 'Todos', value: 'todos' },
  { label: 'Fotos', value: 'foto' },
  { label: 'Vídeos', value: 'video' },
  { label: 'Áudios', value: 'audio' },
  { label: 'Documentos', value: 'documento' },
]

const statusFilters: { label: string; value: 'todos' | MediaFile['status'] }[] = [
  { label: 'Qualquer status', value: 'todos' },
  { label: 'Autorizados', value: 'autorizado' },
  { label: 'Pendentes', value: 'pendente' },
  { label: 'Não utilizar', value: 'nao-utilizar' },
]

export function LibraryView() {
  const [kind, setKind] = useState<'todos' | MediaFile['kind']>('todos')
  const [status, setStatus] = useState<'todos' | MediaFile['status']>('todos')
  const [query, setQuery] = useState('')

  const list = files.filter((f) => {
    if (kind !== 'todos' && f.kind !== kind) return false
    if (status !== 'todos' && f.status !== status) return false
    if (query && !`${f.name} ${f.tags.join(' ')} ${f.event ?? ''}`.toLowerCase().includes(query.toLowerCase()))
      return false
    return true
  })

  return (
    <div>
      <div className="mb-5 flex flex-col gap-3">
        <div className="relative max-w-md">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscar por nome, tag ou evento…"
            className="h-10 w-full rounded-lg border border-border bg-background pl-9 pr-3 text-sm outline-none focus:border-ring focus:ring-2 focus:ring-ring/30"
          />
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex flex-wrap gap-1.5">
            {kindFilters.map((f) => (
              <button
                key={f.value}
                type="button"
                onClick={() => setKind(f.value)}
                className={cn(
                  'rounded-lg px-3 py-1.5 text-sm font-medium transition-colors',
                  kind === f.value
                    ? 'bg-foreground text-background'
                    : 'bg-muted text-muted-foreground hover:text-foreground',
                )}
              >
                {f.label}
              </button>
            ))}
          </div>
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value as typeof status)}
            className="ml-auto h-9 rounded-lg border border-border bg-background px-3 text-sm outline-none focus:border-ring"
          >
            {statusFilters.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      <p className="mb-3 text-xs text-muted-foreground">{list.length} arquivo(s)</p>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
        {list.map((f) => {
          const Icon = kindIcon[f.kind]
          const person = getPerson(f.authorId)
          return (
            <Link key={f.id} href={`/biblioteca/${f.id}`}>
              <Card className="overflow-hidden transition-shadow hover:shadow-md">
                <div
                  className="flex aspect-[4/3] items-center justify-center"
                  style={{ backgroundColor: f.bg }}
                >
                  <Icon className="size-8 text-white/70" />
                </div>
                <div className="p-3">
                  <p className="truncate text-sm font-medium">{f.name}</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {person?.name.split(' ')[0]} · {f.date}
                  </p>
                  <div className="mt-2">
                    <FileStatusBadge status={f.status} />
                  </div>
                </div>
              </Card>
            </Link>
          )
        })}
      </div>

      {list.length === 0 && (
        <Card className="flex flex-col items-center gap-1 py-16 text-center">
          <p className="text-sm font-medium">Nenhum arquivo encontrado.</p>
          <p className="text-sm text-muted-foreground">Ajuste os filtros ou a busca.</p>
        </Card>
      )}
    </div>
  )
}
