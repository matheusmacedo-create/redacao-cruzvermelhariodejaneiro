import Link from 'next/link'
import { KeyRound, LayoutDashboard, Megaphone, Newspaper, ReceiptText, Wallet } from 'lucide-react'

type Acesso = 'vendas' | 'marketing' | 'qualquer'

const SECOES = [
  { href: '/escola', rotulo: 'Visão geral', icone: LayoutDashboard, acesso: 'qualquer' as Acesso },
  { href: '/escola/vendas', rotulo: 'Vendas', icone: ReceiptText, acesso: 'vendas' as Acesso },
  { href: '/escola/financeiro', rotulo: 'Financeiro', icone: Wallet, acesso: 'vendas' as Acesso },
  { href: '/escola/marketing', rotulo: 'Marketing', icone: Megaphone, acesso: 'marketing' as Acesso },
  { href: '/escola/marketing/advertoriais', rotulo: 'Advertoriais', icone: Newspaper, acesso: 'marketing' as Acesso },
  { href: '/escola/configuracoes', rotulo: 'Contas e integrações', icone: KeyRound, acesso: 'qualquer' as Acesso },
] as const

export type SecaoDaEscola = (typeof SECOES)[number]['href']

/**
 * As seções da Escola, no alto de cada página: a escola é uma empresa à
 * parte dentro da filial, e estas abas são o mapa dela. Vendas (dinheiro)
 * só aparece para quem vê o financeiro da escola; Marketing e Advertoriais,
 * para quem trabalha no marketing.
 */
export function SecoesDaEscola({ atual, financeiro = true, marketing = true }: { atual: SecaoDaEscola; financeiro?: boolean; marketing?: boolean }) {
  return (
    <nav className="-mx-1 flex gap-1 overflow-x-auto px-1 pb-1" aria-label="Seções da Escola">
      {SECOES.filter((s) => s.acesso === 'qualquer' || (s.acesso === 'vendas' ? financeiro : marketing)).map((s) => (
        <Link key={s.href} href={s.href} aria-current={atual === s.href ? 'page' : undefined}
          className={`flex shrink-0 items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm ${atual === s.href ? 'bg-primary/10 font-medium text-primary' : 'text-muted-foreground hover:bg-muted hover:text-foreground'}`}>
          <s.icone className="size-4" />{s.rotulo}
        </Link>
      ))}
    </nav>
  )
}
