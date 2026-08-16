'use client'

import { useState } from 'react'
import { Search, Bell, Plus } from 'lucide-react'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { notifications } from '@/lib/data'
import { cn } from '@/lib/utils'

export function Topbar() {
  const [openNotif, setOpenNotif] = useState(false)
  const unread = notifications.filter((n) => n.unread).length

  return (
    <header className="sticky top-0 z-30 flex h-16 shrink-0 items-center gap-4 border-b border-border bg-background/90 px-6 backdrop-blur">
      <div className="relative flex-1 max-w-md">
        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <input
          type="search"
          placeholder="Buscar na CVRJ Redação…"
          className="h-9 w-full rounded-lg border border-border bg-muted/50 pl-9 pr-3 text-sm outline-none placeholder:text-muted-foreground focus:border-ring focus:bg-background focus:ring-2 focus:ring-ring/30"
        />
      </div>

      <div className="ml-auto flex items-center gap-2">
        <Button size="lg" render={<Link href="/pautas" />}>
          <Plus className="size-4" />
          Nova pauta
        </Button>

        <div className="relative">
          <button
            type="button"
            onClick={() => setOpenNotif((v) => !v)}
            className="relative inline-flex size-9 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            aria-label="Notificações"
          >
            <Bell className="size-[18px]" />
            {unread > 0 && (
              <span className="absolute right-1.5 top-1.5 size-2 rounded-full bg-primary ring-2 ring-background" />
            )}
          </button>

          {openNotif && (
            <>
              <div className="fixed inset-0 z-40" onClick={() => setOpenNotif(false)} />
              <div className="absolute right-0 top-11 z-50 w-80 overflow-hidden rounded-xl border border-border bg-popover shadow-lg">
                <div className="flex items-center justify-between border-b border-border px-4 py-3">
                  <p className="text-sm font-semibold">Notificações</p>
                  <span className="text-xs text-muted-foreground">{unread} não lidas</span>
                </div>
                <ul className="max-h-96 overflow-y-auto">
                  {notifications.map((n) => (
                    <li
                      key={n.id}
                      className={cn(
                        'flex gap-3 border-b border-border px-4 py-3 last:border-0',
                        n.unread && 'bg-accent/40',
                      )}
                    >
                      <span
                        className={cn(
                          'mt-1.5 size-2 shrink-0 rounded-full',
                          n.unread ? 'bg-primary' : 'bg-transparent',
                        )}
                      />
                      <div>
                        <p className="text-sm leading-snug text-foreground">{n.text}</p>
                        <p className="mt-0.5 text-xs text-muted-foreground">{n.time}</p>
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            </>
          )}
        </div>

        <span className="inline-flex size-9 items-center justify-center rounded-full bg-info text-xs font-semibold text-white">
          MA
        </span>
      </div>
    </header>
  )
}
