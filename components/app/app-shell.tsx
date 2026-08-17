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

  useEffect(() => setOpen(false), [pathname])

  return (
    <MobileNavContext.Provider value={{ open, toggle: () => setOpen((v) => !v), close: () => setOpen(false) }}>
      {children}
    </MobileNavContext.Provider>
  )
}
