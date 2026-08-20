'use client'

import { useState } from 'react'
import { Search, Bell, Plus, ChevronsUpDown, LogOut, Menu } from 'lucide-react'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { Avatar } from '@/components/ui/avatar'
import { privateAvatarUrl } from '@/lib/avatar-url'
import type { WorkspaceRole } from '@/lib/session'
import { useMobileNav } from './app-shell'

type Notification = { id: string; title: string; message: string; link: string | null; read_at: string | null; created_at: string }

export function Topbar({ workspace, role, profile, notifications }: { workspace: { name: string; kind: 'demo' | 'production' }; role: WorkspaceRole; profile: any; notifications: Notification[] }) {
  const [openNotif, setOpenNotif] = useState(false)
  const { toggle } = useMobileNav()
  const unread = notifications.filter((notification) => !notification.read_at).length
  return (
    <header className="sticky top-0 z-30 flex h-14 shrink-0 items-center gap-2 border-b border-border bg-background/90 px-3 backdrop-blur [padding-top:env(safe-area-inset-top)] sm:h-16 sm:gap-4 sm:px-6">
      <button type="button" onClick={toggle} aria-label="Abrir menu" className="flex size-9 shrink-0 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground md:hidden">
        <Menu className="size-5" />
      </button>
      <Link href="/espacos" className="flex min-w-0 items-center gap-1.5 rounded-lg border border-border px-2 py-2 text-sm transition-colors hover:bg-muted sm:gap-2 sm:px-3"><span className={cn('size-2 shrink-0 rounded-full', workspace.kind === 'demo' ? 'bg-warning' : 'bg-success')}/><span className="truncate font-medium">{workspace.name}</span><span className="hidden rounded bg-muted px-1.5 py-0.5 text-[10px] capitalize text-muted-foreground sm:inline">{role}</span><ChevronsUpDown className="size-3.5 shrink-0 text-muted-foreground"/></Link>
      <div className="relative hidden max-w-md flex-1 md:block"><Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"/><input type="search" placeholder="Buscar na Redação Cruz Vermelha Brasileira Rio de Janeiro…" className="h-9 w-full rounded-lg border border-border bg-muted/50 pl-9 pr-3 text-sm outline-none placeholder:text-muted-foreground focus:border-ring focus:bg-background focus:ring-2 focus:ring-ring/30"/></div>
      <div className="ml-auto flex shrink-0 items-center gap-1 sm:gap-2">
        <Button size="lg" render={<Link href="/registrar" aria-label="Nova pauta"/>}><Plus className="size-4"/><span className="hidden sm:inline">Nova pauta</span></Button>
        <div className="relative"><button type="button" onClick={() => setOpenNotif((value) => !value)} className="relative inline-flex size-9 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground" aria-label={`Notificações${unread ? `, ${unread} não lidas` : ''}`}><Bell className="size-[18px]"/>{unread > 0 && <span className="absolute right-1 top-0.5 inline-flex min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-bold text-primary-foreground">{unread}</span>}</button>{openNotif && <><button className="fixed inset-0 z-40" onClick={() => setOpenNotif(false)} aria-label="Fechar notificações"/><div className="fixed left-2 right-2 top-14 z-50 overflow-hidden rounded-xl border border-border bg-popover shadow-lg sm:absolute sm:left-auto sm:right-0 sm:top-11 sm:w-80"><div className="border-b border-border px-4 py-3 text-sm font-semibold">Notificações</div>{notifications.length ? <ul className="max-h-[70vh] overflow-y-auto">{notifications.map((notification) => <li key={notification.id} className={cn('border-b border-border text-sm last:border-0', !notification.read_at && 'bg-accent/40')}><Link href={notification.link || '/aprovacoes'} onClick={() => setOpenNotif(false)} className="block px-4 py-3 hover:bg-muted"><p className="font-medium">{notification.title}</p><p className="mt-0.5 text-muted-foreground">{notification.message}</p><p className="mt-1 text-xs text-muted-foreground">{new Intl.DateTimeFormat('pt-BR',{dateStyle:'short',timeStyle:'short'}).format(new Date(notification.created_at))}</p></Link></li>)}</ul> : <p className="px-4 py-6 text-center text-sm text-muted-foreground">Nenhuma notificação.</p>}</div></>}</div>
        <Avatar initials={profile?.initials ?? '?'} color={profile?.color} src={privateAvatarUrl(profile?.avatar_path)} alt={profile?.full_name || 'Foto do perfil'} size="md" className="size-9" />
        <form action="/auth/signout" method="post"><button type="submit" className="inline-flex size-9 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground" aria-label="Sair"><LogOut className="size-4"/></button></form>
      </div>
    </header>
  )
}
