'use client'

import { useState } from 'react'
import { Search, Bell, Plus, ChevronsUpDown, LogOut } from 'lucide-react'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { notifications } from '@/lib/data'
import { cn } from '@/lib/utils'
import type { WorkspaceRole } from '@/lib/session'

export function Topbar({ workspace, role, profile }: { workspace: { name: string; kind: 'demo' | 'production' }; role: WorkspaceRole; profile: any }) {
  const [openNotif, setOpenNotif] = useState(false)
  const unread = notifications.filter((n) => n.unread).length
  return (
    <header className="sticky top-0 z-30 flex h-16 shrink-0 items-center gap-4 border-b border-border bg-background/90 px-6 backdrop-blur">
      <Link href="/espacos" className="flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm transition-colors hover:bg-muted"><span className={cn('size-2 rounded-full', workspace.kind === 'demo' ? 'bg-warning' : 'bg-success')}/><span className="font-medium">{workspace.name}</span><span className="hidden rounded bg-muted px-1.5 py-0.5 text-[10px] capitalize text-muted-foreground sm:inline">{role}</span><ChevronsUpDown className="size-3.5 text-muted-foreground"/></Link>
      <div className="relative hidden max-w-md flex-1 md:block"><Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"/><input type="search" placeholder="Buscar na CVRJ Redação…" className="h-9 w-full rounded-lg border border-border bg-muted/50 pl-9 pr-3 text-sm outline-none placeholder:text-muted-foreground focus:border-ring focus:bg-background focus:ring-2 focus:ring-ring/30"/></div>
      <div className="ml-auto flex items-center gap-2">
        <Button size="lg" render={<Link href="/registrar"/>}><Plus className="size-4"/>Nova pauta</Button>
        <div className="relative"><button type="button" onClick={() => setOpenNotif((value) => !value)} className="relative inline-flex size-9 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground" aria-label="Notificações"><Bell className="size-[18px]"/>{unread > 0 && <span className="absolute right-1.5 top-1.5 size-2 rounded-full bg-primary ring-2 ring-background"/>}</button>{openNotif && <><button className="fixed inset-0 z-40" onClick={() => setOpenNotif(false)} aria-label="Fechar notificações"/><div className="absolute right-0 top-11 z-50 w-80 overflow-hidden rounded-xl border border-border bg-popover shadow-lg"><div className="border-b border-border px-4 py-3 text-sm font-semibold">Notificações</div><ul>{notifications.slice(0,4).map((notification) => <li key={notification.id} className={cn('border-b border-border px-4 py-3 text-sm last:border-0', notification.unread && 'bg-accent/40')}><p>{notification.text}</p><p className="mt-1 text-xs text-muted-foreground">{notification.time}</p></li>)}</ul></div></>}</div>
        <span title={profile?.full_name} className="inline-flex size-9 items-center justify-center rounded-full bg-info text-xs font-semibold text-info-foreground">{profile?.initials ?? '?'}</span>
        <form action="/auth/signout" method="post"><button type="submit" className="inline-flex size-9 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground" aria-label="Sair"><LogOut className="size-4"/></button></form>
      </div>
    </header>
  )
}
