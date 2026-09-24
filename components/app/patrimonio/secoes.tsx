import Link from 'next/link'
import { Boxes, ClipboardCheck, HeartHandshake, Package, Settings2, UserRoundCheck } from 'lucide-react'

const SECOES = [
  { href: '/patrimonio', rotulo: 'Bens', icone: Package },
  { href: '/patrimonio/estoque', rotulo: 'Estoque', icone: Boxes },
  { href: '/patrimonio/doacoes', rotulo: 'Doações', icone: HeartHandshake },
  { href: '/patrimonio/comigo', rotulo: 'Comigo', icone: UserRoundCheck },
  { href: '/patrimonio/inventario', rotulo: 'Inventário', icone: ClipboardCheck },
  { href: '/patrimonio/cadastros', rotulo: 'Cadastros', icone: Settings2 },
] as const

/** As seções do Patrimônio, no alto de cada uma. "Comigo" aparece para todos; o resto, para quem tem nível. */
export function SecoesDoPatrimonio({ atual, nivel }: { atual: (typeof SECOES)[number]['href']; nivel: number }) {
  return (
    <nav className="-mx-1 flex gap-1 overflow-x-auto px-1 pb-1" aria-label="Seções do Patrimônio">
      {SECOES.filter((s) => nivel >= 1 || s.href === '/patrimonio/comigo').map((s) => (
        <Link key={s.href} href={s.href} aria-current={atual === s.href ? 'page' : undefined}
          className={`flex shrink-0 items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm ${atual === s.href ? 'bg-primary/10 font-medium text-primary' : 'text-muted-foreground hover:bg-muted hover:text-foreground'}`}>
          <s.icone className="size-4" />{s.rotulo}
        </Link>
      ))}
    </nav>
  )
}
