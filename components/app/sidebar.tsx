'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  CalendarDays, CheckSquare, FolderKanban, History, Images, Inbox, LayoutDashboard, ListChecks, Mail, MessageCircle, Settings, Share2, TrendingUp, UserCircle, Users, X,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { BrandMark } from './brand-mark'
import { Avatar } from '@/components/ui/avatar'
import { privateAvatarUrl } from '@/lib/avatar-url'
import { useMobileNav } from './app-shell'

const sections = [
  {
    label: 'Trabalho',
    items: [
      { href: '/pautas', label: 'Pautas', icon: ListChecks },
      { href: '/projetos', label: 'Projetos', icon: FolderKanban },
      { href: '/redes', label: 'Publicações', icon: Share2 },
      // Logo depois de Publicações porque é de lá que a edição sai: a
      // newsletter é um destino do pacote, não uma ferramenta à parte.
      { href: '/newsletter', label: 'Central de e-mail', icon: Mail },
      { href: '/calendario', label: 'Calendário', icon: CalendarDays },
      { href: '/biblioteca', label: 'Biblioteca', icon: Images },
    ],
  },
  {
    label: 'Operação',
    items: [
      { href: '/aprovacoes', label: 'Aprovações', icon: CheckSquare },
      { href: '/caixa-de-entrada', label: 'Caixa de entrada', icon: Inbox },
    ],
  },
  {
    label: 'Análise',
    items: [
      { href: '/impacto', label: 'Impacto', icon: TrendingUp },
      { href: '/registro', label: 'Registro', icon: History },
    ],
  },
  {
    label: 'Equipe',
    items: [
      { href: '/mensagens', label: 'Mensagens', icon: MessageCircle },
      { href: '/pessoas', label: 'Pessoas', icon: Users },
    ],
  },
]

const admin = [
  { href: '/configuracoes', label: 'Configurações', icon: Settings },
  { href: '/perfil', label: 'Perfil', icon: UserCircle },
]

function NavItem({ href, label, icon: Icon, active }: { href: string; label: string; icon: typeof LayoutDashboard; active: boolean }) {
  return (
    <Link
      href={href}
      className={cn(
        'group flex min-h-11 items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors md:min-h-0 md:py-2',
        active
          ? 'bg-sidebar-accent text-sidebar-accent-foreground'
          : 'text-sidebar-foreground/80 hover:bg-sidebar-accent/60 hover:text-sidebar-foreground',
      )}
    >
      <Icon className={cn('size-[18px] shrink-0', active && 'text-primary')} strokeWidth={2} />
      <span className="flex-1 truncate">{label}</span>
    </Link>
  )
}

type BuildInfo = { sha: string | null; message: string | null; renderedAt: string }

function SidebarContent({ profile, buildInfo, onNavigate }: { profile: any; buildInfo?: BuildInfo; onNavigate?: () => void }) {
  const pathname = usePathname()
  const displayName = profile?.full_name || profile?.username || 'Usuário'
  const initials = profile?.initials || displayName.split(' ').map((part: string) => part[0]).join('').slice(0, 2).toUpperCase()
  const isActive = (href: string) => href === '/dashboard' ? pathname === href : pathname.startsWith(href)
  const showBuildInfo = buildInfo && profile?.username === 'matheus.macedo'

  return (
    <>
      <nav className="flex flex-1 flex-col overflow-y-auto px-3 py-4" onClick={onNavigate}>
        <NavItem href="/dashboard" label="Visão geral" icon={LayoutDashboard} active={isActive('/dashboard')} />

        {sections.map((section) => (
          <div key={section.label} className="mt-5 first:mt-0">
            <p className="px-3 pb-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{section.label}</p>
            <div className="flex flex-col gap-1">
              {section.items.map((item) => <NavItem key={item.href} {...item} active={isActive(item.href)} />)}
            </div>
          </div>
        ))}

        <div className="mt-5">
          <p className="px-3 pb-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Administração</p>
          <div className="flex flex-col gap-1">
            {admin.map((item) => <NavItem key={item.href} {...item} active={isActive(item.href)} />)}
          </div>
        </div>
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
      <aside className="hidden w-64 shrink-0 flex-col border-r border-sidebar-border bg-sidebar md:flex" aria-label="Navegação principal">
        <div className="border-b border-sidebar-border bg-white px-5 py-5">
          <BrandMark className="w-full" compact />
        </div>
        <SidebarContent profile={profile} buildInfo={buildInfo} />
      </aside>

      {open && (
        <div className="fixed inset-0 z-50 md:hidden" role="dialog" aria-modal="true" aria-label="Menu de navegação">
          <button type="button" className="absolute inset-0 bg-foreground/45 backdrop-blur-[2px]" aria-label="Fechar menu" onClick={close} />
          <aside className="relative flex h-full w-80 max-w-[88vw] flex-col bg-sidebar shadow-2xl [padding-top:env(safe-area-inset-top)]">
            <div className="flex items-start justify-between border-b border-sidebar-border bg-white px-5 py-4">
              <BrandMark className="w-full" compact />
              <button type="button" onClick={close} aria-label="Fechar menu" className="ml-2 flex size-11 shrink-0 items-center justify-center rounded-lg text-sidebar-foreground/70 hover:bg-sidebar-accent">
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
