import Link from 'next/link'
import { BookOpen, Images, Megaphone, Newspaper } from 'lucide-react'

const ITENS = [
  { href: '/escola/marketing/cursos', rotulo: 'Cursos', icone: BookOpen },
  { href: '/escola/marketing', rotulo: 'Campanhas', icone: Megaphone },
  { href: '/escola/marketing/advertoriais', rotulo: 'Advertoriais', icone: Newspaper },
  { href: '/escola/marketing/biblioteca', rotulo: 'Biblioteca de peças', icone: Images },
] as const

export type ItemDoMarketing = (typeof ITENS)[number]['href']

/**
 * O submenu do Marketing da escola: os cursos (o que foi feito para cada um e
 * quantos alunos tem), as campanhas, os advertoriais e a biblioteca. Fica
 * logo abaixo das seções da Escola, em todas as telas do marketing.
 */
export function SubmenuDoMarketing({ atual }: { atual: ItemDoMarketing }) {
  return (
    <nav className="-mt-3 flex gap-1 overflow-x-auto border-b border-border" aria-label="Marketing da escola" data-ajuda="escola-marketing.submenu">
      {ITENS.map((i) => (
        <Link key={i.href} href={i.href} aria-current={atual === i.href ? 'page' : undefined} data-ajuda={i.href === '/escola/marketing/cursos' ? 'escola-marketing.cursos' : i.href === '/escola/marketing/biblioteca' ? 'escola-marketing.biblioteca' : undefined}
          className={`-mb-px flex shrink-0 items-center gap-1.5 border-b-2 px-3 py-2 text-sm ${atual === i.href ? 'border-primary font-medium text-foreground' : 'border-transparent text-muted-foreground hover:text-foreground'}`}>
          <i.icone className="size-4" />{i.rotulo}
        </Link>
      ))}
    </nav>
  )
}
