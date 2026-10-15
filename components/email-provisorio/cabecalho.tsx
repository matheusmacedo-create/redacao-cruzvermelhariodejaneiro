import Link from 'next/link'
import { Inbox, LogOut, Users } from 'lucide-react'
import { BrandMark } from '@/components/app/brand-mark'
import { Button } from '@/components/ui/button'

/**
 * O topo do app de e-mail (/email): a marca, o endereço da caixa aberta em
 * destaque (como o Gmail mostra a conta), quem está logado, a caixa, a
 * equipe (só para quem é responsável de alguma caixa) e sair. Nada do menu
 * do Palácio: quem é só do e-mail não entra lá. "Provisório" não aparece
 * para quem usa: para a equipe, é o e-mail do setor.
 */
export function CabecalhoDoEmail({ nome, responsavel, atual, caixa }: {
  nome: string
  responsavel: boolean
  atual: 'caixa' | 'equipe'
  /** A caixa aberta: o endereço vai grande no topo. Null nas telas sem caixa (equipe, sem acesso). */
  caixa: { email: string; setor: string } | null
}) {
  return (
    <header className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-border bg-card px-4 py-2.5 sm:px-6">
      <Link href="/email" className="flex items-center gap-3">
        <BrandMark compact rotulo="E-mail dos setores" className="w-40" />
      </Link>
      {caixa && (
        <div className="order-last min-w-0 basis-full sm:order-none sm:flex-1 sm:basis-auto">
          <p className="truncate text-base font-semibold tracking-tight sm:text-lg" title={caixa.email}>{caixa.email}</p>
          <p className="truncate text-xs text-muted-foreground">{[caixa.setor, nome].filter(Boolean).join(' · ')}</p>
        </div>
      )}
      <nav className="ml-auto flex flex-wrap items-center gap-1" aria-label="E-mail">
        <Button variant={atual === 'caixa' ? 'secondary' : 'ghost'} size="sm" render={<Link href="/email" />}><Inbox className="size-4" />Caixa</Button>
        {responsavel && <Button variant={atual === 'equipe' ? 'secondary' : 'ghost'} size="sm" render={<Link href="/email/equipe" />}><Users className="size-4" />Equipe das caixas</Button>}
        {!caixa && nome && <span className="hidden px-2 text-sm text-muted-foreground sm:inline">{nome}</span>}
        <form action="/auth/signout" method="post">
          <Button type="submit" variant="ghost" size="sm"><LogOut className="size-4" />Sair</Button>
        </form>
      </nav>
    </header>
  )
}
