'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  LayoutDashboard,
  Inbox,
  MessageCircle,
  ClipboardList,
  Images,
  FolderKanban,
  CalendarDays,
  CheckSquare,
  Megaphone,
  Users,
  Settings,
  UserCircle,
  X,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { BrandMark } from './brand-mark'
import { Avatar } from '@/components/ui/avatar'
import { privateAvatarUrl } from '@/lib/avatar-url'
import { useMobileNav } from './app-shell'

const main = [
  { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/caixa-de-entrada', label: 'Caixa de Entrada', icon: Inbox },
  { href: '/mensagens', label: 'Mensagens', icon: MessageCircle },
  { href: '/pautas', label: 'Pautas', icon: ClipboardList },
  { href: '/biblioteca', label: 'Biblioteca', icon: Images },
  { href: '/projetos', label: 'Projetos', icon: FolderKanban },
  { href: '/calendario', label: 'Calendário', icon: CalendarDays },
  { href: '/publicacoes', label: 'Publicações', icon: Megaphone },
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

type BuildInfo = { sha: string | null; message: string | null; renderedAt: string }

function SidebarContent({ profile, buildInfo, onNavigate }: { profile: any; buildInfo?: BuildInfo; onNavigate?: () => void }) {
  const pathname = usePathname()
  const displayName = profile?.full_name || profile?.username || 'Usuário'
  const initials = profile?.initials || displayName.split(' ').map((part: string) => part[0]).join('').slice(0, 2).toUpperCase()
  const isActive = (href: string) =>
    href === '/dashboard' ? pathname === href : pathname.startsWith(href)
  const showBuildInfo = buildInfo && profile?.username === 'matheus.macedo'

  return (
    <>
      <nav className="flex flex-1 flex-col gap-1 overflow-y-auto px-3 py-4" onClick={onNavigate}>
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

      <div className="border-t border-sidebar-border p-3 [padding-bottom:max(0.75rem,env(safe-area-inset-bottom))]">
        <div className="flex items-center gap-3 rounded-lg px-2 py-1.5">
          <Avatar initials={initials} color={profile?.color} src={privateAvatarUrl(profile?.avatar_path)} alt={displayName} size="sm" />
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium text-sidebar-foreground">{displayName}</p>
            <p className="truncate text-[11px] text-muted-foreground">{profile?.job_title || 'Colaborador'}</p>
          </div>
        </div>
        {showBuildInfo && (
          <div className="mt-2 rounded-lg bg-sidebar-accent/40 px-2 py-1.5 text-[10px] leading-relaxed text-muted-foreground">
            <p>Build {buildInfo!.sha || 'local'}{buildInfo!.message ? ` — ${buildInfo!.message}` : ''}</p>
            <p>Visto em {new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'medium' }).format(new Date(buildInfo!.renderedAt))}</p>
          </div>
        )}
      </div>
    </>
  )
}

export function Sidebar({ profile, buildInfo }: { profile: any; buildInfo?: BuildInfo }) {
  const { open, close } = useMobileNav()

  return (
    <>
      {/* Desktop sidebar */}
      <aside className="hidden w-64 shrink-0 flex-col border-r border-sidebar-border bg-sidebar md:flex">
        <div className="border-b border-sidebar-border px-5 py-4">
          <BrandMark className="w-full" />
        </div>
        <SidebarContent profile={profile} buildInfo={buildInfo} />
      </aside>

      {/* Mobile drawer */}
      {open && (
        <div className="fixed inset-0 z-50 md:hidden" role="dialog" aria-modal="true" aria-label="Menu de navegação">
          <button type="button" className="absolute inset-0 bg-foreground/40" aria-label="Fechar menu" onClick={close} />
          <aside className="relative flex h-full w-72 max-w-[85vw] flex-col bg-sidebar shadow-xl [padding-top:env(safe-area-inset-top)]">
            <div className="flex items-center justify-between border-b border-sidebar-border px-5 py-4">
              <BrandMark className="w-full" />
              <button type="button" onClick={close} aria-label="Fechar menu" className="ml-2 flex size-9 shrink-0 items-center justify-center rounded-lg text-sidebar-foreground/70 hover:bg-sidebar-accent">
                <X className="size-5" />
              </button>
            </div>
            <SidebarContent profile={profile} buildInfo={buildInfo} onNavigate={close} />
          </aside>
        </div>
      )}
    </>
  )
}
