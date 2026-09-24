'use client'

import { useState } from 'react'
import { Check, Copy } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { Tom } from './dados'

/** Peças repetidas nas seções da trilha. */

const CLASSE_DO_TOM: Record<Tom, string> = {
  ok: 'bg-success/15 text-success',
  aviso: 'bg-warning/20 text-warning-foreground',
  erro: 'bg-destructive/10 text-destructive',
  info: 'bg-info/12 text-info',
  neutro: 'bg-muted text-muted-foreground',
}

/** A pílula de situação, no mesmo desenho da lista de ofícios. */
export function Selo({ tom, children, className }: { tom: Tom; children: React.ReactNode; className?: string }) {
  return <span className={cn('inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold', CLASSE_DO_TOM[tom], className)}>{children}</span>
}

/** Link de texto com foco visível (os da tabela são pequenos: o anel ajuda quem navega pelo teclado). */
export const classeDoLink = 'inline-flex items-center gap-1 rounded-sm font-medium text-primary underline-offset-2 outline-none hover:underline focus-visible:ring-2 focus-visible:ring-ring/50'

export function Copiar({ valor, rotulo }: { valor: string; rotulo: string }) {
  const [copiado, setCopiado] = useState(false)
  return (
    <button
      type="button"
      aria-label={copiado ? 'Copiado' : rotulo}
      title={rotulo}
      className="inline-flex shrink-0 rounded p-1 align-middle text-muted-foreground outline-none hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/50"
      onClick={() => navigator.clipboard?.writeText(valor).then(() => { setCopiado(true); setTimeout(() => setCopiado(false), 1500) }).catch(() => undefined)}
    >
      {copiado ? <Check className="size-3.5 text-success" aria-hidden="true" /> : <Copy className="size-3.5" aria-hidden="true" />}
    </button>
  )
}

/** Uma seção do painel: título (h2), uma linha do que ela mostra e o conteúdo. */
export function Secao({ id, titulo, descricao, children }: { id: string; titulo: string; descricao?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section aria-labelledby={id} className="flex scroll-mt-4 flex-col gap-3">
      <div className="min-w-0">
        <h2 id={id} className="font-semibold">{titulo}</h2>
        {descricao && <p className="mt-0.5 max-w-3xl text-sm text-muted-foreground text-pretty">{descricao}</p>}
      </div>
      {children}
    </section>
  )
}

/**
 * Tabela larga: rola na horizontal no celular. A região recebe foco para que
 * dê para rolar pelo teclado também.
 */
export function Rolagem({ rotulo, children }: { rotulo: string; children: React.ReactNode }) {
  return (
    <div role="region" aria-label={rotulo} tabIndex={0} className="overflow-x-auto rounded-[inherit] outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring/50">
      {children}
    </div>
  )
}

/** Cabeçalho de coluna no padrão das tabelas da Redação. */
export const classeDoCabecalho = 'border-b border-border bg-muted/40 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground'
