'use client'

import Link from 'next/link'
import { CalendarCheck, HeartPulse, Landmark, ListOrdered, Settings2, ShoppingCart } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useLivro, useNoLivro } from './livro'

const SECOES = [
  { href: '/financeiro', rotulo: 'Lançamentos', icone: ListOrdered },
  { href: '/financeiro/saude', rotulo: 'Saúde do caixa', icone: HeartPulse },
  { href: '/financeiro/compras', rotulo: 'Compras', icone: ShoppingCart },
  { href: '/financeiro/conciliacao', rotulo: 'Conciliação', icone: Landmark },
  { href: '/financeiro/fechamento', rotulo: 'Fechamento', icone: CalendarCheck },
  { href: '/financeiro/cadastros', rotulo: 'Cadastros', icone: Settings2 },
] as const

/**
 * As seções do Financeiro, no alto de cada uma, sempre no livro aberto: na
 * Escola, as abas levam a /escola/financeiro/... e sublinham na cor dela.
 * Não há troca de empresa aqui: cada livro tem o seu endereço (FaixaDoLivro).
 */
export function SecoesDoFinanceiro({ atual }: { atual: (typeof SECOES)[number]['href'] }) {
  const livro = useLivro()
  const noLivro = useNoLivro()
  const escola = livro === 'escola'
  return (
    <nav className="-mx-1 flex gap-1 overflow-x-auto border-b border-border px-1" aria-label="Seções do Financeiro" data-ajuda="financeiro.secoes">
      {SECOES.map((s) => {
        const ativa = atual === s.href
        return (
          <Link key={s.href} href={noLivro(s.href)} aria-current={ativa ? 'page' : undefined}
            className={cn('-mb-px flex shrink-0 items-center gap-1.5 border-b-2 px-3 py-2.5 text-sm transition-colors',
              ativa ? cn('font-medium text-foreground', escola ? 'border-sky-700' : 'border-primary') : 'border-transparent text-muted-foreground hover:border-border hover:text-foreground')}>
            <s.icone className={cn('size-4', ativa && (escola ? 'text-sky-700' : 'text-primary'))} />{s.rotulo}
          </Link>
        )
      })}
    </nav>
  )
}
