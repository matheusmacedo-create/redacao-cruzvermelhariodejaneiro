import Link from 'next/link'
import { CalendarCheck, HeartPulse, Landmark, ListOrdered, Settings2 } from 'lucide-react'

const SECOES = [
  { href: '/financeiro', rotulo: 'Lançamentos', icone: ListOrdered },
  { href: '/financeiro/saude', rotulo: 'Saúde do caixa', icone: HeartPulse },
  { href: '/financeiro/conciliacao', rotulo: 'Conciliação', icone: Landmark },
  { href: '/financeiro/fechamento', rotulo: 'Fechamento', icone: CalendarCheck },
  { href: '/financeiro/cadastros', rotulo: 'Cadastros', icone: Settings2 },
] as const

/** As seções do Financeiro, no alto de cada uma. */
export function SecoesDoFinanceiro({ atual }: { atual: (typeof SECOES)[number]['href'] }) {
  return (
    <nav className="-mx-1 flex gap-1 overflow-x-auto px-1 pb-1" aria-label="Seções do Financeiro">
      {SECOES.map((s) => (
        <Link key={s.href} href={s.href} aria-current={atual === s.href ? 'page' : undefined}
          className={`flex shrink-0 items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm ${atual === s.href ? 'bg-primary/10 font-medium text-primary' : 'text-muted-foreground hover:bg-muted hover:text-foreground'}`}>
          <s.icone className="size-4" />{s.rotulo}
        </Link>
      ))}
    </nav>
  )
}
