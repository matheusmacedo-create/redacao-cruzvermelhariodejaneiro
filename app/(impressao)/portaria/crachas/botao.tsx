'use client'

import { Printer } from 'lucide-react'

export function BotaoImprimir() {
  return (
    <button type="button" onClick={() => window.print()} className="inline-flex h-10 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-lg bg-[rgb(227_34_25)] px-4 text-sm font-semibold text-white hover:bg-[rgb(200_28_20)]" data-crachas-imprimir>
      <Printer className="size-4" aria-hidden="true" />Imprimir ou salvar PDF
    </button>
  )
}
