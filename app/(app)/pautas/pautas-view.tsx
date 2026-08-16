'use client'

import { useState } from 'react'
import Link from 'next/link'
import { MessageSquare, Paperclip, LayoutGrid, List } from 'lucide-react'
import { Card } from '@/components/ui/card'
import { Avatar } from '@/components/ui/avatar'
import { StatusBadge, PriorityBadge } from '@/components/ui/status-badge'
import {
  pautas,
  getPerson,
  getProject,
  PAUTA_STATUS_ORDER,
  PAUTA_STATUS_LABEL,
  type Pauta,
} from '@/lib/data'
import { cn } from '@/lib/utils'

function PautaCard({ pauta }: { pauta: Pauta }) {
  const person = getPerson(pauta.responsibleId)
  const project = getProject(pauta.projectId)
  return (
    <Link href={`/pautas/${pauta.id}`}>
      <Card className="p-3.5 transition-shadow hover:shadow-md">
        <div className="mb-2 flex items-center justify-between gap-2">
          <span className="flex items-center gap-1.5 text-xs font-medium text-primary">
            <span>{project?.emoji}</span>
            {pauta.type}
          </span>
          <PriorityBadge priority={pauta.priority} />
        </div>
        <p className="text-sm font-medium leading-snug text-pretty">{pauta.title}</p>
        <p className="mt-1.5 text-xs text-muted-foreground">{pauta.coordenacao}</p>

        <div className="mt-3 flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            <Avatar initials={person?.initials ?? '?'} color={person?.color} size="xs" />
            <span className="text-xs text-muted-foreground">Prazo {pauta.deadline}</span>
          </div>
          <div className="flex items-center gap-2.5 text-xs text-muted-foreground">
            <span className="flex items-center gap-1">
              <Paperclip className="size-3" />
              {pauta.files}
            </span>
            <span className="flex items-center gap-1">
              <MessageSquare className="size-3" />
              {pauta.comments}
            </span>
          </div>
        </div>
      </Card>
    </Link>
  )
}

export function PautasView() {
  const [view, setView] = useState<'kanban' | 'lista'>('kanban')

  return (
    <div>
      <div className="mb-4 flex items-center gap-1 rounded-lg border border-border bg-muted/50 p-0.5 w-fit">
        <button
          type="button"
          onClick={() => setView('kanban')}
          className={cn(
            'inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors',
            view === 'kanban'
              ? 'bg-background text-foreground shadow-sm'
              : 'text-muted-foreground hover:text-foreground',
          )}
        >
          <LayoutGrid className="size-4" />
          Kanban
        </button>
        <button
          type="button"
          onClick={() => setView('lista')}
          className={cn(
            'inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors',
            view === 'lista'
              ? 'bg-background text-foreground shadow-sm'
              : 'text-muted-foreground hover:text-foreground',
          )}
        >
          <List className="size-4" />
          Lista
        </button>
      </div>

      {view === 'kanban' ? (
        <div className="flex gap-4 overflow-x-auto pb-4">
          {PAUTA_STATUS_ORDER.map((status) => {
            const items = pautas.filter((p) => p.status === status)
            return (
              <div key={status} className="flex w-72 shrink-0 flex-col">
                <div className="mb-3 flex items-center justify-between px-1">
                  <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                    {PAUTA_STATUS_LABEL[status]}
                  </span>
                  <span className="inline-flex min-w-5 items-center justify-center rounded-full bg-muted px-1.5 text-xs font-semibold text-muted-foreground">
                    {items.length}
                  </span>
                </div>
                <div className="flex flex-col gap-2.5">
                  {items.map((p) => (
                    <PautaCard key={p.id} pauta={p} />
                  ))}
                  {items.length === 0 && (
                    <div className="rounded-lg border border-dashed border-border py-8 text-center text-xs text-muted-foreground">
                      Sem pautas
                    </div>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      ) : (
        <Card className="overflow-hidden">
          <div className="hidden grid-cols-[1fr_140px_120px_100px_110px] gap-4 border-b border-border bg-muted/40 px-4 py-2.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground md:grid">
            <span>Pauta</span>
            <span>Responsável</span>
            <span>Status</span>
            <span>Prioridade</span>
            <span className="text-right">Prazo</span>
          </div>
          <div className="divide-y divide-border">
            {pautas.map((p) => {
              const person = getPerson(p.responsibleId)
              return (
                <Link
                  key={p.id}
                  href={`/pautas/${p.id}`}
                  className="grid grid-cols-1 gap-2 px-4 py-3 transition-colors hover:bg-muted/40 md:grid-cols-[1fr_140px_120px_100px_110px] md:items-center md:gap-4"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{p.title}</p>
                    <p className="text-xs text-muted-foreground">
                      {p.type} · {p.coordenacao}
                    </p>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <Avatar initials={person?.initials ?? '?'} color={person?.color} size="xs" />
                    <span className="truncate text-sm text-muted-foreground">
                      {person?.name.split(' ')[0]}
                    </span>
                  </div>
                  <StatusBadge status={p.status} />
                  <PriorityBadge priority={p.priority} />
                  <span className="text-sm text-muted-foreground md:text-right">{p.deadline}</span>
                </Link>
              )
            })}
          </div>
        </Card>
      )}
    </div>
  )
}
