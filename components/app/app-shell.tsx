'use client'

import { createContext, useContext, useEffect, useState } from 'react'
import { usePathname } from 'next/navigation'

type MobileNavState = { open: boolean; toggle: () => void; close: () => void }

const MobileNavContext = createContext<MobileNavState | null>(null)

export function useMobileNav() {
  const ctx = useContext(MobileNavContext)
  if (!ctx) throw new Error('useMobileNav must be used within AppShellProvider')
  return ctx
}

export function AppShellProvider({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false)
  const pathname = usePathname()

  // Fecha o menu do celular a cada navegação — inclusive na seta de voltar do
  // navegador, que nenhum onClick de link alcança.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => setOpen(false), [pathname])

  return (
    <MobileNavContext.Provider value={{ open, toggle: () => setOpen((v) => !v), close: () => setOpen(false) }}>
      {children}
    </MobileNavContext.Provider>
  )
}
