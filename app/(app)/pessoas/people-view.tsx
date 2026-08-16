'use client'

import { useState } from 'react'
import { Mail } from 'lucide-react'
import { Card } from '@/components/ui/card'
import { Avatar } from '@/components/ui/avatar'
import { people, type Person } from '@/lib/data'
import { cn } from '@/lib/utils'

const categories: (Person['category'] | 'Todos')[] = [
  'Todos',
  'Equipe',
  'Voluntários',
  'Especialistas',
  'Entrevistados',
  'Parceiros',
]

export function PeopleView() {
  const [cat, setCat] = useState<(typeof categories)[number]>('Todos')
  const list = people.filter((p) => cat === 'Todos' || p.category === cat)

  return (
    <div>
      <div className="mb-5 flex flex-wrap gap-1.5">
        {categories.map((c) => (
          <button
            key={c}
            type="button"
            onClick={() => setCat(c)}
            className={cn(
              'rounded-lg px-3 py-1.5 text-sm font-medium transition-colors',
              cat === c
                ? 'bg-foreground text-background'
                : 'bg-muted text-muted-foreground hover:text-foreground',
            )}
          >
            {c}
          </button>
        ))}
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {list.map((p) => (
          <Card key={p.id} className="flex flex-col p-5">
            <div className="flex items-center gap-3">
              <Avatar initials={p.initials} color={p.color} size="lg" />
              <div className="min-w-0">
                <h3 className="truncate font-semibold">{p.name}</h3>
                <p className="truncate text-sm text-muted-foreground">{p.role}</p>
              </div>
            </div>

            <div className="mt-3 flex flex-wrap items-center gap-1.5">
              <span className="rounded-md bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
                {p.coordenacao}
              </span>
              <span className="rounded-md border border-border px-2 py-0.5 text-xs text-muted-foreground">
                {p.category}
              </span>
            </div>

            <div className="mt-3 flex flex-wrap gap-1.5">
              {p.specialties.map((s) => (
                <span key={s} className="rounded-md bg-muted px-2 py-0.5 text-xs text-muted-foreground">
                  {s}
                </span>
              ))}
            </div>

            {p.stats && (
              <div className="mt-4 grid grid-cols-3 gap-2 border-t border-border pt-3 text-center">
                <Stat value={p.stats.pautas} label="Pautas" />
                <Stat value={p.stats.entrevistas} label="Entrevistas" />
                <Stat value={p.stats.acoes} label="Ações" />
              </div>
            )}

            <a
              href={`mailto:${p.email}`}
              className="mt-4 inline-flex items-center gap-1.5 text-sm font-medium text-primary hover:underline"
            >
              <Mail className="size-3.5" />
              {p.email}
            </a>
          </Card>
        ))}
      </div>
    </div>
  )
}

function Stat({ value, label }: { value: number; label: string }) {
  return (
    <div>
      <p className="text-lg font-bold tabular-nums">{value}</p>
      <p className="text-[11px] text-muted-foreground">{label}</p>
    </div>
  )
}
