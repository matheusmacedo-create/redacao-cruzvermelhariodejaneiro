'use client'

import { useEffect, useSyncExternalStore } from 'react'
import { usePathname } from 'next/navigation'
import { Monitor, Moon, Sun, type LucideIcon } from 'lucide-react'
import { COOKIE_DO_TEMA, ROTULO_DO_TEMA, TEMAS, escuroNaPagina, lerTema, type Tema } from '@/lib/tema'
import { cn } from '@/lib/utils'

/**
 * O modo escuro no navegador (as regras: lib/tema.ts). O script do <head>
 * pinta a primeira página; daqui em diante este componente reaplica ao
 * trocar de página (a conferência de ofício é sempre clara), quando o
 * sistema muda de claro para escuro e quando a pessoa escolhe outro tema.
 */

const MUDOU = 'tema-mudou'

function aplicar() {
  const tema = lerTema(document.cookie)
  const sistema = window.matchMedia('(prefers-color-scheme: dark)').matches
  const escuro = escuroNaPagina(tema, window.location.pathname, sistema)
  const html = document.documentElement
  html.classList.toggle('dark', escuro)
  html.style.colorScheme = escuro ? 'dark' : 'light'
  // A barra do navegador no celular acompanha o fundo.
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', escuro ? '#141414' : '#ffffff')
}

export function escolherTema(tema: Tema) {
  document.cookie = `${COOKIE_DO_TEMA}=${tema}; path=/; max-age=${60 * 60 * 24 * 400}; samesite=lax`
  aplicar()
  window.dispatchEvent(new Event(MUDOU))
}

/** Fica no layout raiz: mantém a classe `dark` certa em toda navegação. */
export function AplicarTema() {
  const caminho = usePathname()
  useEffect(() => { aplicar() }, [caminho])
  useEffect(() => {
    const sistema = window.matchMedia('(prefers-color-scheme: dark)')
    sistema.addEventListener('change', aplicar)
    return () => sistema.removeEventListener('change', aplicar)
  }, [])
  return null
}

function ouvirTema(avisar: () => void) {
  window.addEventListener(MUDOU, avisar)
  return () => window.removeEventListener(MUDOU, avisar)
}

const ICONES: Record<Tema, LucideIcon> = { claro: Sun, escuro: Moon, sistema: Monitor }

/** A escolha em três botões (Claro, Escuro, Automático), para o menu da conta e o Perfil do voluntário. */
export function EscolhaDeTema({ className }: { className?: string }) {
  // No servidor não há cookie do navegador: nada marcado até montar.
  const tema = useSyncExternalStore(ouvirTema, () => lerTema(document.cookie), () => null)
  return (
    <div role="radiogroup" aria-label="Aparência" className={cn('grid grid-cols-3 gap-1 rounded-lg bg-muted p-1', className)}>
      {TEMAS.map((t) => {
        const Icone = ICONES[t]
        const ativo = tema === t
        return (
          <button key={t} type="button" role="radio" aria-checked={ativo} onClick={() => escolherTema(t)}
            className={cn('flex min-h-9 items-center justify-center gap-1.5 rounded-md px-2 text-xs font-medium transition-colors',
              ativo ? 'bg-card text-foreground shadow-xs' : 'text-muted-foreground hover:text-foreground')}>
            <Icone className="size-3.5" aria-hidden="true" />{ROTULO_DO_TEMA[t]}
          </button>
        )
      })}
    </div>
  )
}
