import Link from 'next/link'
import { KeyRound, LayoutDashboard, ReceiptText } from 'lucide-react'

const SECOES = [
  { href: '/escola', rotulo: 'Painel', icone: LayoutDashboard },
  { href: '/escola/transacoes', rotulo: 'Transações', icone: ReceiptText },
  { href: '/escola/contas', rotulo: 'Contas Únicopag', icone: KeyRound },
] as const

/** As seções da Escola, no alto de cada uma. */
export function SecoesDaEscola({ atual }: { atual: (typeof SECOES)[number]['href'] }) {
  return (
    <nav className="-mx-1 flex gap-1 overflow-x-auto px-1 pb-1" aria-label="Seções da Escola">
      {SECOES.map((s) => (
        <Link key={s.href} href={s.href} aria-current={atual === s.href ? 'page' : undefined}
          className={`flex shrink-0 items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm ${atual === s.href ? 'bg-primary/10 font-medium text-primary' : 'text-muted-foreground hover:bg-muted hover:text-foreground'}`}>
          <s.icone className="size-4" />{s.rotulo}
        </Link>
      ))}
    </nav>
  )
}
