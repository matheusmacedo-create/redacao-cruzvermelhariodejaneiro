'use client'

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { usePathname } from 'next/navigation'
import { gruposDaEquipeDaEscola, gruposVisiveis, type Escolhido, type Grupo } from '@/lib/navegacao'
import type { Permissao } from '@/lib/permissoes'
// O nome mora fora deste módulo do cliente: o layout lê o cookie no servidor para não piscar.
import { COOKIE_DA_SIDEBAR } from './cookies-do-menu'

type ShellState = {
  /** As áreas que esta pessoa pode abrir, já agrupadas. */
  grupos: Grupo[]
  /** Menu do celular (gaveta). */
  open: boolean
  toggle: () => void
  close: () => void
  /** Sidebar do computador só com os ícones. */
  recolhida: boolean
  alternarRecolhida: () => void
  /** Busca rápida (⌘K). */
  buscaAberta: boolean
  setBuscaAberta: (aberta: boolean) => void
  /** Quem é só da equipe da escola: não tem o "Criar" nem abre chamados. */
  equipeDaEscola: boolean
}

const ShellContext = createContext<ShellState | null>(null)

export function useShell() {
  const ctx = useContext(ShellContext)
  if (!ctx) throw new Error('useShell must be used within AppShellProvider')
  return ctx
}

export function AppShellProvider({ children, permitidas, recolhidaInicial = false, equipeDaEscola = null, escolhidos = {} }: {
  children: React.ReactNode; permitidas: Permissao[]; recolhidaInicial?: boolean
  /** Áreas liberadas por pessoa: registro de acessos, envios da equipe. */
  escolhidos?: Partial<Record<Escolhido, boolean>>
  /** Quem é só da equipe da escola: o menu mostra só a Escola (e o Financeiro dela, se liberado). */
  equipeDaEscola?: { financeiro: boolean } | null
}) {
  // Os grupos têm ícones (componentes), que não atravessam do servidor para o
  // cliente como props — por isso o servidor manda só as permissões e a lista
  // é montada aqui.
  const grupos = useMemo(
    () => (equipeDaEscola ? gruposDaEquipeDaEscola(equipeDaEscola.financeiro) : gruposVisiveis((p) => permitidas.includes(p), undefined, escolhidos)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [permitidas, equipeDaEscola, escolhidos.leitorDeAcessos, escolhidos.avaliadorDeEnvios],
  )
  const [open, setOpen] = useState(false)
  const [recolhida, setRecolhida] = useState(recolhidaInicial)
  const [buscaAberta, setBuscaAberta] = useState(false)
  const pathname = usePathname()

  // Fecha o menu do celular a cada navegação — inclusive na seta de voltar do
  // navegador, que nenhum onClick de link alcança.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => setOpen(false), [pathname])

  // ⌘K / Ctrl+K abre a busca de qualquer tela, até de dentro de um campo:
  // é o atalho que as ferramentas de trabalho ensinaram a todo mundo.
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && !e.altKey && !e.shiftKey && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        // Com o tour aberto, a busca abriria por baixo do balão e tiraria o
        // foco dele (e as setas digitadas no campo andariam o tour).
        if (document.querySelector('[data-tour-aberto]')) return
        setBuscaAberta((v) => !v)
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])

  const alternarRecolhida = useCallback(() => {
    setRecolhida((atual) => {
      const nova = !atual
      // Cookie, não localStorage: o servidor precisa saber a largura antes de
      // desenhar, senão a sidebar abre larga e encolhe na frente da pessoa.
      document.cookie = `${COOKIE_DA_SIDEBAR}=${nova ? '1' : '0'}; path=/; max-age=31536000; samesite=lax`
      return nova
    })
  }, [])

  const valor = useMemo<ShellState>(() => ({
    grupos,
    open,
    toggle: () => setOpen((v) => !v),
    close: () => setOpen(false),
    recolhida,
    alternarRecolhida,
    buscaAberta,
    setBuscaAberta,
    equipeDaEscola: equipeDaEscola !== null,
  }), [grupos, open, recolhida, alternarRecolhida, buscaAberta, equipeDaEscola])

  return <ShellContext.Provider value={valor}>{children}</ShellContext.Provider>
}
