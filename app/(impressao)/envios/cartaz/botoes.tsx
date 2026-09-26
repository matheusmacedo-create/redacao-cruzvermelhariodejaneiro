'use client'

import Link from 'next/link'
import { ArrowLeft, Printer } from 'lucide-react'

/** A barra acima do cartaz: some na impressão. "Salvar como PDF" é o destino da própria janela de impressão. */
export function BotoesDoCartaz() {
  return (
    <div className="mx-auto mb-4 flex w-[210mm] max-w-[calc(100vw-2rem)] items-center justify-between gap-2 print:hidden">
      <Link href="/envios" className="inline-flex h-10 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-lg px-3 text-sm font-medium text-neutral-700 hover:bg-white/70">
        <ArrowLeft className="size-4" aria-hidden="true" /><span className="sm:hidden">Voltar</span><span className="max-sm:hidden">Envios da equipe</span>
      </Link>
      <p className="mr-auto text-sm text-neutral-600 max-sm:hidden">A4 em pé · para o grupo, salve em PDF</p>
      <button type="button" onClick={() => window.print()} className="inline-flex h-10 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-lg bg-[rgb(227_34_25)] px-4 text-sm font-semibold text-white hover:bg-[rgb(200_28_20)]">
        <Printer className="size-4" aria-hidden="true" /><span className="sm:hidden">Imprimir / PDF</span><span className="max-sm:hidden">Imprimir ou salvar PDF</span>
      </button>
    </div>
  )
}
