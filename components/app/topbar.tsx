'use client'

import { Plus, LogOut, Menu } from 'lucide-react'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Avatar } from '@/components/ui/avatar'
import { privateAvatarUrl } from '@/lib/avatar-url'
import type { WorkspaceRole } from '@/lib/session'
import { useMobileNav } from './app-shell'
import { Sino, type Notificacao } from './sino'

export function Topbar({ role, profile, notifications, naoLidas }: { role: WorkspaceRole; profile: any; notifications: Notificacao[]; naoLidas: number }) {
  const { toggle } = useMobileNav()
  return (
    <header className="sticky top-0 z-30 flex min-h-14 shrink-0 items-center gap-2 border-b border-border bg-background/95 px-2 py-2 backdrop-blur-md [padding-top:max(0.5rem,env(safe-area-inset-top))] sm:min-h-16 sm:gap-4 sm:px-6">
      <button type="button" onClick={toggle} aria-label="Abrir menu" className="flex size-11 shrink-0 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground md:hidden">
        <Menu className="size-5" />
      </button>
      <span className="hidden min-w-0 items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm sm:flex"><span className="size-2 shrink-0 rounded-full bg-success"/><span className="truncate capitalize text-muted-foreground">{role}</span></span>
      <div className="ml-auto flex shrink-0 items-center gap-1 sm:gap-2">
        <Button size="lg" className="size-11 px-0 sm:w-auto sm:px-4" render={<Link href="/registrar" aria-label="Criar"/>}><Plus className="size-4"/><span className="hidden sm:inline">Criar</span></Button>
        <Sino notificacoes={notifications} naoLidas={naoLidas} />
        <Avatar initials={profile?.initials ?? '?'} color={profile?.color} src={privateAvatarUrl(profile?.avatar_path)} alt={profile?.full_name || 'Foto do perfil'} size="md" className="hidden size-9 sm:flex" />
        <form action="/auth/signout" method="post"><button type="submit" className="inline-flex size-11 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground" aria-label="Sair"><LogOut className="size-4"/></button></form>
      </div>
    </header>
  )
}
