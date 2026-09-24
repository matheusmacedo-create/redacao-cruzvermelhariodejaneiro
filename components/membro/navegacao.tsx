'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Award, BookOpen, GraduationCap, Home, UserRound } from 'lucide-react'

export const SECOES = [
  { href: '/membro', rotulo: 'Início', icone: Home },
  { href: '/membro/cursos', rotulo: 'Cursos', icone: GraduationCap },
  { href: '/membro/apostilas', rotulo: 'Apostilas', icone: BookOpen },
  { href: '/membro/certificados', rotulo: 'Certificados', icone: Award },
  { href: '/membro/perfil', rotulo: 'Perfil', icone: UserRound },
] as const

/** Abas no alto (tela larga) e barra fixa embaixo (celular), como um app. */
export function Navegacao() {
  const caminho = usePathname()
  const ativo = (href: string) => (href === '/membro' ? caminho === href : caminho.startsWith(href))
  return (
    <>
      <nav className="hidden gap-1 sm:flex" aria-label="Seções">
        {SECOES.map((s) => (
          <Link key={s.href} href={s.href} aria-current={ativo(s.href) ? 'page' : undefined}
            className={`rounded-lg px-3 py-2 text-sm font-medium ${ativo(s.href) ? 'bg-neutral-900 text-white' : 'text-neutral-600 hover:bg-neutral-200/70 hover:text-neutral-900'}`}>{s.rotulo}</Link>
        ))}
      </nav>
      <nav className="fixed inset-x-0 bottom-0 z-20 grid border-t border-neutral-200 bg-white/95 backdrop-blur sm:hidden" style={{ gridTemplateColumns: `repeat(${SECOES.length}, 1fr)` }} aria-label="Seções">
        {SECOES.map((s) => (
          <Link key={s.href} href={s.href} aria-current={ativo(s.href) ? 'page' : undefined}
            className={`flex flex-col items-center gap-0.5 py-2 text-[11px] font-medium ${ativo(s.href) ? 'text-[#e32219]' : 'text-neutral-500'}`}>
            <s.icone className="size-5" />{s.rotulo}
          </Link>
        ))}
      </nav>
    </>
  )
}
