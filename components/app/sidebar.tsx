'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  LayoutDashboard,
  Inbox,
  ClipboardList,
  Images,
  FolderKanban,
  CalendarDays,
  CheckSquare,
  Users,
  Settings,
  UserCircle,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { BrandMark } from './brand-mark'

const main = [
  { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/caixa-de-entrada', label: 'Caixa de Entrada', icon: Inbox },
  { href: '/pautas', label: 'Pautas', icon: ClipboardList },
  { href: '/biblioteca', label: 'Biblioteca', icon: Images },
  { href: '/projetos', label: 'Projetos', icon: FolderKanban },
  { href: '/calendario', label: 'Calendário', icon: CalendarDays },
  { href: '/aprovacoes', label: 'Aprovações', icon: CheckSquare },
  { href: '/pessoas', label: 'Pessoas', icon: Users },
]

const admin = [
  { href: '/configuracoes', label: 'Configurações', icon: Settings },
  { href: '/perfil', label: 'Perfil', icon: UserCircle },
]

function NavItem({
  href,
  label,
  icon: Icon,
  badge,
  active,
}: {
  href: string
  label: string
  icon: typeof LayoutDashboard
  badge?: number
  active: boolean
}) {
  return (
    <Link
      href={href}
      className={cn(
        'group flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
        active
          ? 'bg-sidebar-accent text-sidebar-accent-foreground'
          : 'text-sidebar-foreground/80 hover:bg-sidebar-accent/60 hover:text-sidebar-foreground',
      )}
    >
      <Icon className={cn('size-[18px] shrink-0', active && 'text-primary')} strokeWidth={2} />
      <span className="flex-1 truncate">{label}</span>
      {badge ? (
        <span className="inline-flex min-w-5 items-center justify-center rounded-full bg-primary px-1.5 text-[11px] font-semibold text-primary-foreground">
          {badge}
        </span>
      ) : null}
    </Link>
  )
}

export function Sidebar({ profile }: { profile: any }) {
  const pathname = usePathname()
  const displayName = profile?.full_name || profile?.username || 'Usuário'
  const initials = profile?.initials || displayName.split(' ').map((part: string) => part[0]).join('').slice(0, 2).toUpperCase()
  const isActive = (href: string) =>
    href === '/dashboard' ? pathname === href : pathname.startsWith(href)

  return (
    <aside className="hidden w-64 shrink-0 flex-col border-r border-sidebar-border bg-sidebar md:flex">
      <div className="border-b border-sidebar-border px-5 py-4">
        <BrandMark className="w-full" />
      </div>

      <nav className="flex flex-1 flex-col gap-1 overflow-y-auto px-3 py-4">
        {main.map((item) => (
          <NavItem key={item.href} {...item} active={isActive(item.href)} />
        ))}

        <p className="px-3 pt-5 pb-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
          Administração
        </p>
        {admin.map((item) => (
          <NavItem key={item.href} {...item} active={isActive(item.href)} />
        ))}
      </nav>

      <div className="border-t border-sidebar-border p-3">
        <div className="flex items-center gap-3 rounded-lg px-2 py-1.5">
          <span className="inline-flex size-8 items-center justify-center rounded-full bg-info text-xs font-semibold text-white">
            {initials}
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium text-sidebar-foreground">{displayName}</p>
            <p className="truncate text-[11px] text-muted-foreground">{profile?.job_title || 'Colaborador'}</p>
          </div>
        </div>
      </div>
    </aside>
  )
}
