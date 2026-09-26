'use client'

import { useState } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Tooltip } from '@base-ui/react/tooltip'
import { ChevronDown, PanelLeftClose, PanelLeftOpen, Search, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { ADMINISTRACAO, areaDoCaminho, ehDaArea, type Area, type Contador, type Grupo } from '@/lib/navegacao'
import { useShell } from './app-shell'
import { useChatAoVivo } from '@/components/app/chat/ao-vivo'
// Os grupos que a pessoa fechou ficam num cookie, para o servidor desenhar igual (o nome mora fora deste módulo do cliente).
import { COOKIE_DOS_GRUPOS } from './cookies-do-menu'

type BuildInfo = { sha: string | null; message: string | null; renderedAt: string }
export type Contadores = Partial<Record<Contador, number>>

/** O emblema sozinho, para a sidebar recolhida. Mesmas proporções do logo. */
function Emblema({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 30 30" className={className} aria-hidden="true">
      <path d="M10 0h10v10h10v10H20v10H10V20H0V10h10z" fill="rgb(227 34 25)" />
    </svg>
  )
}

function Marca({ recolhida }: { recolhida: boolean }) {
  if (recolhida) {
    return (
      <Link href="/dashboard" aria-label="Início — Redação Cruz Vermelha Brasileira Rio de Janeiro" className="flex size-9 items-center justify-center rounded-lg hover:bg-black/[0.04]">
        <Emblema className="size-5" />
      </Link>
    )
  }
  return (
    <Link href="/dashboard" className="block min-w-0 rounded-lg px-1 py-1" aria-label="Início — Redação Cruz Vermelha Brasileira Rio de Janeiro">
      {/* O PNG tem fundo branco; o multiply deixa o branco com a cor da sidebar. */}
      <Image src="/images/logo-cvrj.png" alt="" width={1844} height={752} priority sizes="150px" className="h-auto w-[150px] mix-blend-multiply" />
      <span className="mt-1 block pl-[3px] text-[10.5px] font-semibold tracking-[0.02em] text-muted-foreground">Redação · Central de Comunicação</span>
    </Link>
  )
}

function Numero({ n }: { n?: number }) {
  if (!n) return null
  return <span className="ml-auto inline-flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full bg-primary px-1.5 text-[11px] font-semibold tabular-nums text-primary-foreground">{n > 99 ? '99+' : n}</span>
}

function ItemDoMenu({ area, ativo, recolhida, contadores }: { area: Area; ativo: boolean; recolhida: boolean; contadores: Contadores }) {
  const Icone = area.icone
  const n = area.contador ? contadores[area.contador] : undefined
  const classe = cn(
    'group relative flex items-center rounded-lg text-[13.5px] font-medium outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring/50',
    recolhida ? 'size-9 justify-center' : 'min-h-11 gap-2.5 px-2.5 md:min-h-8',
    ativo
      ? 'bg-sidebar-accent text-foreground shadow-xs ring-1 ring-black/[0.06]'
      : 'text-sidebar-foreground/85 hover:bg-black/[0.045] hover:text-foreground',
  )
  const conteudo = (
    <>
      <Icone className={cn('size-[17px] shrink-0', ativo ? 'text-primary' : 'text-muted-foreground group-hover:text-foreground')} strokeWidth={2} aria-hidden="true" />
      {recolhida
        ? n ? <span className="absolute right-1 top-1 size-2 rounded-full bg-primary ring-2 ring-sidebar" aria-hidden="true" /> : null
        : <><span className="min-w-0 flex-1 truncate">{area.rotulo}</span><Numero n={n} /></>}
    </>
  )
  const rotuloAcessivel = n ? `${area.rotulo}, ${n} pendente${n === 1 ? '' : 's'}` : undefined

  // A linha de Aprovações é um passo das boas-vindas (lib/ajuda/conteudo/geral.ts).
  if (!recolhida) {
    return <Link href={area.href} aria-current={ativo ? 'page' : undefined} aria-label={rotuloAcessivel} data-ajuda={area.href === '/aprovacoes' ? 'shell.aprovacoes' : undefined} className={classe}>{conteudo}</Link>
  }
  return (
    <Tooltip.Root>
      <Tooltip.Trigger delay={150} render={<Link href={area.href} aria-current={ativo ? 'page' : undefined} aria-label={rotuloAcessivel ?? area.rotulo} data-ajuda={area.href === '/aprovacoes' ? 'shell.aprovacoes' : undefined} className={classe} />}>
        {conteudo}
      </Tooltip.Trigger>
      <Tooltip.Portal>
        <Tooltip.Positioner side="right" sideOffset={10}>
          <Tooltip.Popup className="rounded-md bg-foreground px-2 py-1 text-xs font-medium text-background shadow-md transition-opacity data-[ending-style]:opacity-0 data-[starting-style]:opacity-0">
            {area.rotulo}{n ? ` · ${n}` : ''}
          </Tooltip.Popup>
        </Tooltip.Positioner>
      </Tooltip.Portal>
    </Tooltip.Root>
  )
}

function Navegacao({ grupos, recolhida, contadores, fechadosIniciais, onNavigate, rotulo = 'Áreas', className, principal = false }: {
  grupos: Grupo[]
  recolhida: boolean
  contadores: Contadores
  fechadosIniciais: string[]
  onNavigate?: () => void
  rotulo?: string
  className?: string
  /** A do computador: é ela que o tour de boas-vindas aponta como "o menu". */
  principal?: boolean
}) {
  const pathname = usePathname()
  const [fechados, setFechados] = useState<string[]>(fechadosIniciais)
  // A mesma regra das migalhas: prefixo mais longo, e /registrar ou /conteudos acendem Pautas.
  const ativo = areaDoCaminho(pathname, grupos)?.area.href

  function alternar(id: string) {
    setFechados((atual) => {
      const novo = atual.includes(id) ? atual.filter((g) => g !== id) : [...atual, id]
      document.cookie = `${COOKIE_DOS_GRUPOS}=${encodeURIComponent(novo.join(','))}; path=/; max-age=31536000; samesite=lax`
      return novo
    })
  }

  return (
    <nav className={cn('flex flex-col', recolhida ? 'items-center gap-1' : '', className)} aria-label={rotulo} onClick={onNavigate} data-ajuda={principal ? 'shell.menu' : undefined}>
      {grupos.map((g) => ({ ...g, areas: g.areas.filter((a) => !a.foraDoMenu) })).filter((g) => g.areas.length).map((grupo, i) => {
        // O grupo da tela aberta nunca fica fechado: senão a pessoa perde onde está.
        const temAtivo = grupo.areas.some((a) => a.href === ativo)
        const aberto = recolhida || !grupo.rotulo || temAtivo || !fechados.includes(grupo.id)
        return (
          <div key={grupo.id} className={cn(recolhida ? 'flex flex-col items-center gap-1' : i > 0 && 'mt-4')}>
            {recolhida
              ? i > 0 && <span className="my-1.5 h-px w-6 bg-sidebar-border" aria-hidden="true" />
              : grupo.rotulo && (
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); if (!temAtivo) alternar(grupo.id) }}
                  aria-expanded={aberto}
                  className="group/grupo mb-1 flex w-full items-center gap-1 rounded-md px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground hover:text-foreground"
                >
                  {grupo.rotulo}
                  <ChevronDown className={cn('size-3 opacity-0 transition-[transform,opacity] group-hover/grupo:opacity-100 group-focus-visible/grupo:opacity-100', !aberto && '-rotate-90 opacity-100')} aria-hidden="true" />
                </button>
              )}
            {aberto && (
              <div className={cn('flex flex-col', recolhida ? 'items-center gap-1' : 'gap-0.5')}>
                {grupo.areas.map((area) => <ItemDoMenu key={area.href} area={area} ativo={area.href === ativo} recolhida={recolhida} contadores={contadores} />)}
              </div>
            )}
          </div>
        )
      })}
    </nav>
  )
}

function BotaoDeBusca({ recolhida }: { recolhida: boolean }) {
  const { setBuscaAberta } = useShell()
  if (recolhida) {
    return (
      <button type="button" onClick={() => setBuscaAberta(true)} aria-label="Buscar (⌘K)" title="Buscar (⌘K)" data-ajuda="shell.busca" className="flex size-9 items-center justify-center rounded-lg text-muted-foreground hover:bg-black/[0.045] hover:text-foreground">
        <Search className="size-[17px]" />
      </button>
    )
  }
  return (
    <button type="button" onClick={() => setBuscaAberta(true)} data-ajuda="shell.busca" className="flex h-9 w-full items-center gap-2 rounded-lg border border-sidebar-border bg-background/70 px-2.5 text-sm text-muted-foreground shadow-xs transition-colors hover:border-border hover:bg-background hover:text-foreground">
      <Search className="size-4 shrink-0" aria-hidden="true" />
      <span className="flex-1 text-left">Buscar…</span>
      <kbd className="rounded border border-border bg-muted px-1.5 font-sans text-[10.5px] font-medium">⌘K</kbd>
    </button>
  )
}

export function Sidebar({ contadores: doServidor, fechadosIniciais, profile, buildInfo }: {
  contadores: Contadores
  fechadosIniciais: string[]
  profile: { username?: string | null } | null
  buildInfo?: BuildInfo
}) {
  const { grupos, open, close, recolhida, alternarRecolhida } = useShell()
  // O número do Chat muda ao vivo (mensagem chegando, conversa lida), sem esperar a página recarregar.
  const chat = useChatAoVivo()
  const contadores = chat ? { ...doServidor, chat: chat.naoLidas } : doServidor
  const pathname = usePathname()
  // A administração sai do meio do trabalho: no pé fica só Configurações; Usuários
  // e permissões e Meu perfil estão no menu da conta (topo) e na busca. No
  // celular, a gaveta tem espaço e mostra o grupo inteiro.
  const trabalho = grupos.filter((g) => g.id !== ADMINISTRACAO.id)
  const admin = grupos.find((g) => g.id === ADMINISTRACAO.id)
  const configuracoes = admin?.areas.find((a) => a.href === '/configuracoes')
  const doCelular = [...trabalho, ...(admin ? [admin] : [])]
  const mostrarBuild = buildInfo && profile?.username === 'matheus.macedo'

  return (
    <Tooltip.Provider>
      <aside
        className={cn('hidden shrink-0 flex-col transition-[width] duration-200 ease-out md:flex', recolhida ? 'w-[60px]' : 'w-[248px]')}
        aria-label="Navegação principal"
      >
        <div className={cn('flex shrink-0 flex-col gap-3 pb-3 pt-4', recolhida ? 'items-center px-2' : 'px-3')}>
          <Marca recolhida={recolhida} />
          <BotaoDeBusca recolhida={recolhida} />
        </div>
        <Navegacao grupos={trabalho} recolhida={recolhida} contadores={contadores} fechadosIniciais={fechadosIniciais} principal className={cn('flex-1 overflow-y-auto overscroll-contain pb-3', recolhida ? 'px-2' : 'px-3')} />
        <div className={cn('shrink-0 border-t border-sidebar-border py-2', recolhida ? 'flex flex-col items-center gap-1 px-2' : 'px-3')}>
          <div className={cn('flex gap-1', recolhida ? 'flex-col items-center' : 'items-center')}>
            {configuracoes && (
              <div className={cn(!recolhida && 'min-w-0 flex-1')}>
                <ItemDoMenu area={configuracoes} ativo={ehDaArea(pathname, configuracoes.href)} recolhida={recolhida} contadores={contadores} />
              </div>
            )}
            <button
              type="button"
              onClick={alternarRecolhida}
              aria-label={recolhida ? 'Expandir menu' : 'Recolher menu'}
              title={recolhida ? 'Expandir menu' : 'Recolher menu'}
              data-ajuda="shell.recolher"
              className="flex size-9 shrink-0 items-center justify-center rounded-lg text-muted-foreground hover:bg-black/[0.045] hover:text-foreground"
            >
              {recolhida ? <PanelLeftOpen className="size-[17px]" /> : <PanelLeftClose className="size-[17px]" />}
            </button>
          </div>
          {mostrarBuild && !recolhida && (
            <div className="mt-2 rounded-lg bg-black/[0.03] px-2 py-1.5 text-[10px] leading-relaxed text-muted-foreground">
              <p>Build {buildInfo!.sha || 'local'}{buildInfo!.message ? ` — ${buildInfo!.message}` : ''}</p>
              <p>Visto em {new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'medium' }).format(new Date(buildInfo!.renderedAt))}</p>
            </div>
          )}
        </div>
      </aside>

      {open && (
        <div className="fixed inset-0 z-50 md:hidden" role="dialog" aria-modal="true" aria-label="Menu de navegação">
          <button type="button" className="absolute inset-0 bg-foreground/45 backdrop-blur-[2px]" aria-label="Fechar menu" onClick={close} />
          <aside className="relative flex h-full w-80 max-w-[88vw] flex-col bg-sidebar shadow-2xl [padding-bottom:env(safe-area-inset-bottom)] [padding-top:env(safe-area-inset-top)]">
            <div className="flex items-start justify-between gap-2 px-3 pb-3 pt-4">
              <Marca recolhida={false} />
              <button type="button" onClick={close} aria-label="Fechar menu" className="flex size-11 shrink-0 items-center justify-center rounded-lg text-sidebar-foreground/70 hover:bg-black/[0.045]">
                <X className="size-5" />
              </button>
            </div>
            <Navegacao grupos={doCelular} recolhida={false} contadores={contadores} fechadosIniciais={fechadosIniciais} onNavigate={close} className="flex-1 overflow-y-auto overscroll-contain px-3 pb-4" />
          </aside>
        </div>
      )}
    </Tooltip.Provider>
  )
}
