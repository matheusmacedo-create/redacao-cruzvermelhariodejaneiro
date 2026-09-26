'use client'

import { useRef } from 'react'
import Link from 'next/link'
import { Menu } from '@base-ui/react/menu'
import { CircleHelp, Compass, LogOut, UserRound } from 'lucide-react'
import { sair } from '@/app/actions/membro'
import { CHAVE_DO_ULTIMO_EMAIL } from '@/lib/membro/entrada'
import { iniciais } from '@/lib/membro/regras'
import { cn } from '@/lib/utils'
import { CHAVE_DA_AJUDA, useAjudaDoMembro } from './ajuda'

/**
 * Ao sair, o aparelho esquece a pessoa (aparelho compartilhado): o e-mail que
 * a tela de entrada preenche e o que ela já viu da ajuda — senão quem entrasse
 * depois no mesmo aparelho não ganharia o convite de boas-vindas. Vai no
 * `onSubmit` dos formulários de sair: roda antes da action, e sem
 * `preventDefault` a action segue normalmente.
 */
export function esquecerAoSair() {
  try {
    localStorage.removeItem(CHAVE_DO_ULTIMO_EMAIL)
    localStorage.removeItem(CHAVE_DA_AJUDA)
  } catch {
    // Sem armazenamento: nada a esquecer.
  }
}

// Mesmo desenho do menu da pessoa no Redação (components/app/topbar.tsx).
const popup = 'origin-[var(--transform-origin)] rounded-xl border border-border bg-popover text-popover-foreground shadow-lg outline-none transition-[opacity,transform] duration-150 data-[ending-style]:scale-95 data-[ending-style]:opacity-0 data-[starting-style]:scale-95 data-[starting-style]:opacity-0'
// Sem `outline-none`: no teclado, o contorno do foco aparece por dentro do item
// (o fundo `bg-muted` sozinho quase não se distingue do popup branco).
const itemDeMenu = 'flex min-h-11 cursor-default items-center gap-3 rounded-lg px-2.5 py-2 text-sm -outline-offset-2 select-none focus-visible:outline-ring data-[highlighted]:bg-muted data-[highlighted]:text-foreground'
const avatar = 'flex shrink-0 items-center justify-center rounded-full border border-border bg-muted font-semibold text-foreground'

/**
 * O menu da conta, em todas as larguras: avatar com as iniciais, nome,
 * e-mail, "Meu perfil", "Ajuda", "Tour desta tela" (só onde há tour) e "Sair"
 * (no celular, o "Sair" também fica no fim do Perfil). Na visualização da
 * equipe, "Sair" é "Voltar ao Redação" (a mesma ação `sair`, que ali só
 * desfaz a prévia).
 */
export function MenuDaConta({ nome, email, previa = false }: { nome: string; email: string | null; previa?: boolean }) {
  const formulario = useRef<HTMLFormElement>(null)
  const gatilho = useRef<HTMLButtonElement>(null)
  const ajuda = useAjudaDoMembro()
  // O tour espera o menu terminar de fechar: um foco que chegasse depois
  // tiraria o foco do balão (e o leitor de tela não leria o passo).
  const tourAoFechar = useRef(false)
  const letras = iniciais(nome)
  return (
    <>
      {/* Abrir o menu já baixa o texto do tour: o "Tour desta tela" está a um toque. */}
      <Menu.Root onOpenChange={(aberto) => { if (aberto) ajuda?.adiantarTour() }} onOpenChangeComplete={(aberto) => {
        if (aberto || !tourAoFechar.current) return
        tourAoFechar.current = false
        window.setTimeout(() => {
          // Fechado pelo item, o menu deixa o foco no <body> (o item some com
          // o popup): sem isto, o tour guardava o <body> como "onde estava" e,
          // ao terminar, o foco não voltava ao avatar, de onde a pessoa pediu o tour.
          gatilho.current?.focus({ preventScroll: true })
          ajuda?.iniciarTourDaTela()
        }, 50)
      }}>
        <Menu.Trigger ref={gatilho} aria-label={`Conta de ${nome}`} data-ajuda="membro.conta"
          className="flex size-11 shrink-0 items-center justify-center rounded-full hover:bg-muted focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring data-[popup-open]:bg-muted">
          <span aria-hidden="true" className={cn(avatar, 'size-9 text-sm')}>{letras}</span>
        </Menu.Trigger>
        <Menu.Portal>
          <Menu.Positioner side="bottom" align="end" sideOffset={6} className="z-50">
            <Menu.Popup className={cn(popup, 'w-72 max-w-[calc(100vw-1rem)] p-1.5')}>
              <Menu.Group>
                <Menu.GroupLabel className="flex items-center gap-3 px-2.5 pb-2.5 pt-1.5">
                  <span aria-hidden="true" className={cn(avatar, 'size-10 text-sm')}>{letras}</span>
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-semibold">{nome}</span>
                    {email && <span className="block truncate text-xs text-muted-foreground">{email}</span>}
                  </span>
                </Menu.GroupLabel>
                <Menu.Separator className="my-1 h-px bg-border" />
                <Menu.LinkItem closeOnClick render={<Link href="/membro/perfil" />} className={itemDeMenu}>
                  <UserRound className="size-4 text-muted-foreground" aria-hidden="true" />Meu perfil
                </Menu.LinkItem>
                <Menu.LinkItem closeOnClick render={<Link href="/membro/ajuda" />} className={itemDeMenu}>
                  <CircleHelp className="size-4 text-muted-foreground" aria-hidden="true" />Ajuda
                </Menu.LinkItem>
                {ajuda?.temTourNaTela && (
                  <Menu.Item onClick={() => { tourAoFechar.current = true }} className={itemDeMenu}>
                    <Compass className="size-4 text-muted-foreground" aria-hidden="true" />Tour desta tela
                  </Menu.Item>
                )}
                <Menu.Separator className="my-1 h-px bg-border" />
                <Menu.Item onClick={() => formulario.current?.requestSubmit()} className={itemDeMenu}>
                  <LogOut className="size-4 text-muted-foreground" aria-hidden="true" />{previa ? 'Voltar ao Redação' : 'Sair'}
                </Menu.Item>
              </Menu.Group>
            </Menu.Popup>
          </Menu.Positioner>
        </Menu.Portal>
      </Menu.Root>
      {/*
        Fora do menu: o popup vive num portal e some ao fechar, levando o form
        junto. Na prévia, a ação só desfaz a visualização: não há o que esquecer
        (a prévia não grava o progresso da ajuda).
      */}
      <form ref={formulario} action={sair} onSubmit={previa ? undefined : esquecerAoSair} className="hidden" />
    </>
  )
}
