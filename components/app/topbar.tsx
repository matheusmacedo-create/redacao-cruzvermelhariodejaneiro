'use client'

import { useRef } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Menu as MenuDaBase } from '@base-ui/react/menu'
import { ChevronDown, ChevronRight, CircleHelp, Loader2, LogOut, Menu, Plus, Search } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { Avatar } from '@/components/ui/avatar'
import { privateAvatarUrl } from '@/lib/avatar-url'
import { ADMINISTRACAO, areaDoCaminho, type Grupo } from '@/lib/navegacao'
import { ehEquipeDaEscola, ehPapel, PAPEL } from '@/lib/permissoes'
import type { WorkspaceRole } from '@/lib/session'
import { ACOES_DE_CRIAR, useCriar } from './acoes-de-criar'
import { useShell } from './app-shell'
import { useAjuda } from './ajuda/ajuda'
import { Sino, type Notificacao } from './sino'

type Perfil = { full_name?: string | null; job_title?: string | null; initials?: string | null; color?: string | null; avatar_path?: string | null } | null

const popup = 'origin-[var(--transform-origin)] rounded-xl border border-border bg-popover text-popover-foreground shadow-lg outline-none transition-[opacity,transform] duration-150 data-[ending-style]:scale-95 data-[ending-style]:opacity-0 data-[starting-style]:scale-95 data-[starting-style]:opacity-0'
const itemDeMenu = 'flex min-h-10 cursor-default items-center gap-3 rounded-lg px-2.5 py-2 text-sm outline-none select-none data-[highlighted]:bg-accent data-[highlighted]:text-accent-foreground'
const botaoIcone = 'relative inline-flex size-10 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground data-[popup-open]:bg-muted data-[popup-open]:text-foreground'

/** Onde a pessoa está: grupo › área. A página continua com o título dela embaixo. */
function Migalhas({ grupos }: { grupos: Grupo[] }) {
  const pathname = usePathname()
  const achado = areaDoCaminho(pathname, grupos)
  if (!achado) return null
  const { grupo, area } = achado
  const Icone = area.icone
  const naRaiz = pathname === area.href
  return (
    <nav aria-label="Você está em" data-ajuda="shell.migalhas" className="flex min-w-0 items-center gap-1.5 text-sm">
      <span className="flex size-7 shrink-0 items-center justify-center rounded-md bg-primary/[0.08] text-primary"><Icone className="size-4" aria-hidden="true" /></span>
      {grupo.rotulo && <><span className="hidden truncate text-muted-foreground lg:inline">{grupo.rotulo}</span><ChevronRight className="hidden size-3.5 shrink-0 text-muted-foreground/60 lg:block" aria-hidden="true" /></>}
      {naRaiz
        ? <span className="truncate font-semibold" aria-current="page">{area.rotulo}</span>
        : <Link href={area.href} className="truncate font-semibold hover:text-primary">{area.rotulo}</Link>}
    </nav>
  )
}

function MenuCriar() {
  const { executar, pendente, erro, limparErro } = useCriar()
  return (
    <div className="relative" data-ajuda="shell.criar">
      <MenuDaBase.Root onOpenChange={(aberto) => { if (aberto) limparErro() }}>
        <MenuDaBase.Trigger render={<Button size="lg" className="h-10 gap-1.5 px-3 max-sm:w-10 max-sm:px-0" aria-label="Criar" disabled={pendente} />}>
          {pendente ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />}
          <span className="hidden sm:inline">{pendente ? 'Criando…' : 'Criar'}</span>
          <ChevronDown className="hidden size-3.5 opacity-80 sm:block" aria-hidden="true" />
        </MenuDaBase.Trigger>
        <MenuDaBase.Portal>
          <MenuDaBase.Positioner side="bottom" align="end" sideOffset={8} className="z-50">
            <MenuDaBase.Popup className={cn(popup, 'w-[min(20rem,calc(100vw-1rem))] p-1.5')}>
              {ACOES_DE_CRIAR.map((acao) => {
                const Icone = acao.icone
                const corpo = (
                  <>
                    <span className="flex size-8 shrink-0 items-center justify-center rounded-lg border border-border bg-background text-muted-foreground"><Icone className="size-4" aria-hidden="true" /></span>
                    <span className="min-w-0 flex-1"><span className="block font-medium">{acao.rotulo}</span><span className="block text-xs leading-snug text-muted-foreground">{acao.resumo}</span></span>
                  </>
                )
                return acao.href
                  ? <MenuDaBase.LinkItem key={acao.id} closeOnClick render={<Link href={acao.href} />} className={itemDeMenu}>{corpo}</MenuDaBase.LinkItem>
                  : <MenuDaBase.Item key={acao.id} onClick={() => executar(acao)} className={itemDeMenu}>{corpo}</MenuDaBase.Item>
              })}
            </MenuDaBase.Popup>
          </MenuDaBase.Positioner>
        </MenuDaBase.Portal>
      </MenuDaBase.Root>
      {erro && <p role="alert" className="absolute right-0 top-12 z-40 w-64 rounded-lg border border-destructive/30 bg-background px-3 py-2 text-xs text-destructive shadow-md">{erro}</p>}
    </div>
  )
}

function MenuDaPessoa({ role, profile, grupos }: { role: WorkspaceRole; profile: Perfil; grupos: Grupo[] }) {
  const sair = useRef<HTMLFormElement>(null)
  const nome = profile?.full_name || 'Usuário'
  const conta = grupos.find((g) => g.id === ADMINISTRACAO.id)?.areas ?? []
  return (
    <>
      <MenuDaBase.Root>
        <MenuDaBase.Trigger data-ajuda="shell.conta" className="flex shrink-0 items-center rounded-full outline-none ring-offset-2 ring-offset-background focus-visible:ring-2 focus-visible:ring-ring/50 data-[popup-open]:ring-2 data-[popup-open]:ring-primary/30" aria-label={`Conta de ${nome}`}>
          <Avatar initials={profile?.initials ?? '?'} color={profile?.color ?? undefined} src={privateAvatarUrl(profile?.avatar_path)} alt="" size="sm" className="size-9" />
        </MenuDaBase.Trigger>
        <MenuDaBase.Portal>
          <MenuDaBase.Positioner side="bottom" align="end" sideOffset={8} className="z-50">
            <MenuDaBase.Popup className={cn(popup, 'w-64 p-1.5')}>
              <div className="flex items-center gap-3 px-2.5 pb-2.5 pt-1.5">
                <Avatar initials={profile?.initials ?? '?'} color={profile?.color ?? undefined} src={privateAvatarUrl(profile?.avatar_path)} alt="" size="md" />
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold">{nome}</p>
                  <p className="truncate text-xs text-muted-foreground">{profile?.job_title || 'Colaborador'}</p>
                  <p className="mt-1 inline-flex items-center gap-1.5 rounded-full bg-success/12 px-2 py-0.5 text-[11px] font-medium text-success"><span className="size-1.5 rounded-full bg-success" aria-hidden="true" />{ehPapel(role) ? PAPEL[role].rotulo : role}</p>
                </div>
              </div>
              <MenuDaBase.Separator className="my-1 h-px bg-border" />
              {conta.map((area) => {
                const Icone = area.icone
                return <MenuDaBase.LinkItem key={area.href} closeOnClick render={<Link href={area.href} />} className={itemDeMenu}><Icone className="size-4 text-muted-foreground" aria-hidden="true" />{area.rotulo}</MenuDaBase.LinkItem>
              })}
              <MenuDaBase.Separator className="my-1 h-px bg-border" />
              <MenuDaBase.Item onClick={() => sair.current?.requestSubmit()} className={cn(itemDeMenu, 'text-destructive data-[highlighted]:bg-destructive/10 data-[highlighted]:text-destructive')}>
                <LogOut className="size-4" aria-hidden="true" />Sair
              </MenuDaBase.Item>
            </MenuDaBase.Popup>
          </MenuDaBase.Positioner>
        </MenuDaBase.Portal>
      </MenuDaBase.Root>
      <form ref={sair} action="/auth/signout" method="post" className="hidden" />
    </>
  )
}

/** O "?" do topo: a ajuda da tela aberta (components/app/ajuda/painel.tsx). A tecla ? faz o mesmo. */
function BotaoDeAjuda() {
  const { painelAberto, alternarPainel, atalhoLigado } = useAjuda()
  return (
    <button type="button" onClick={alternarPainel} aria-label={atalhoLigado ? 'Ajuda (?)' : 'Ajuda'} title={atalhoLigado ? 'Ajuda (?)' : 'Ajuda'} aria-haspopup="dialog" aria-expanded={painelAberto} data-ajuda="shell.ajuda" className={cn(botaoIcone, painelAberto && 'bg-muted text-foreground')}>
      <CircleHelp className="size-[18px]" />
    </button>
  )
}

export function Topbar({ role, profile, notifications, naoLidas }: { role: WorkspaceRole; profile: Perfil; notifications: Notificacao[]; naoLidas: number }) {
  const { grupos, toggle, setBuscaAberta } = useShell()
  return (
    <header className="sticky top-0 z-30 flex min-h-14 shrink-0 items-center gap-2 border-b border-border bg-background/90 px-2 backdrop-blur-md [padding-top:env(safe-area-inset-top)] sm:gap-3 sm:px-5">
      <button type="button" onClick={toggle} aria-label="Abrir menu" data-ajuda="shell.abrir-menu" className="flex size-10 shrink-0 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground md:hidden">
        <Menu className="size-5" />
      </button>
      <Migalhas grupos={grupos} />
      <div className="ml-auto flex shrink-0 items-center gap-1 sm:gap-1.5">
        <button type="button" onClick={() => setBuscaAberta(true)} aria-label="Buscar (⌘K)" data-ajuda="shell.busca" className={cn(botaoIcone, 'md:hidden')}>
          <Search className="size-[18px]" />
        </button>
        {/* Criar registro, pauta, conteúdo… é da Redação: a equipe da escola não tem. */}
        {!ehEquipeDaEscola(role) && <MenuCriar />}
        <Sino notificacoes={notifications} naoLidas={naoLidas} />
        <BotaoDeAjuda />
        <MenuDaPessoa role={role} profile={profile} grupos={grupos} />
      </div>
    </header>
  )
}
