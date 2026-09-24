'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Award, BookOpen, CalendarHeart, GraduationCap, Home, MessageCircle, UserRound } from 'lucide-react'

// `celular`: cabe na barra de baixo (5 no máximo). As outras ficam no alto
// em tela larga e em atalhos do início no celular.
export const SECOES = [
  { href: '/membro', rotulo: 'Início', icone: Home, celular: true },
  { href: '/membro/cursos', rotulo: 'Cursos', icone: GraduationCap, celular: true },
  { href: '/membro/oportunidades', rotulo: 'Oportunidades', icone: CalendarHeart, celular: true },
  { href: '/membro/apostilas', rotulo: 'Apostilas', icone: BookOpen, celular: false },
  { href: '/membro/certificados', rotulo: 'Certificados', icone: Award, celular: false },
  { href: '/membro/mensagens', rotulo: 'Mensagens', icone: MessageCircle, celular: true },
  { href: '/membro/perfil', rotulo: 'Perfil', icone: UserRound, celular: true },
] as const
const NO_CELULAR = SECOES.filter((s) => s.celular)

const Selo = ({ n }: { n: number }) => (
  <span className="absolute -right-1.5 -top-1 min-w-4 rounded-full bg-primary px-1 text-center text-[10px] font-bold leading-4 text-white" aria-label={`${n} não lidas`}>{n > 9 ? '9+' : n}</span>
)

/** Abas no alto (tela larga) e barra fixa embaixo (celular), como um app. */
export function Navegacao({ naoLidas = 0 }: { naoLidas?: number }) {
  const caminho = usePathname()
  const ativo = (href: string) => (href === '/membro' ? caminho === href : caminho.startsWith(href))
  return (
    <>
      <nav className="hidden gap-1 lg:flex" aria-label="Seções">
        {SECOES.map((s) => (
          <Link key={s.href} href={s.href} aria-current={ativo(s.href) ? 'page' : undefined}
            className={`relative rounded-lg px-3 py-2 text-sm font-medium ${ativo(s.href) ? 'bg-primary/10 text-primary' : 'text-muted-foreground hover:bg-muted hover:text-foreground'}`}>
            {s.rotulo}{s.href === '/membro/mensagens' && naoLidas > 0 && <Selo n={naoLidas} />}
          </Link>
        ))}
      </nav>
      <nav className="fixed inset-x-0 bottom-0 z-20 grid border-t border-border bg-card/95 backdrop-blur lg:hidden" style={{ gridTemplateColumns: `repeat(${NO_CELULAR.length}, 1fr)` }} aria-label="Seções">
        {NO_CELULAR.map((s) => (
          <Link key={s.href} href={s.href} aria-current={ativo(s.href) ? 'page' : undefined}
            className={`flex flex-col items-center gap-0.5 py-2 text-[11px] font-medium ${ativo(s.href) ? 'text-primary' : 'text-muted-foreground'}`}>
            <span className="relative"><s.icone className="size-5" />{s.href === '/membro/mensagens' && naoLidas > 0 && <Selo n={naoLidas} />}</span>{s.rotulo}
          </Link>
        ))}
      </nav>
    </>
  )
}
