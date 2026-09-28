'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ArrowLeft, Printer } from 'lucide-react'

/** A barra acima do cartaz: volta, troca de setor e imprime. Some na impressão. */
export function BotoesDoCartaz({ filas, atual }: { filas: { slug: string; nome: string }[]; atual: string }) {
  const router = useRouter()
  return (
    <div className="mx-auto mb-4 flex w-[210mm] max-w-[calc(100vw-2rem)] flex-wrap items-center gap-2 print:hidden">
      <Link href="/chamados" className="inline-flex h-10 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-lg px-3 text-sm font-medium text-neutral-700 hover:bg-white/70">
        <ArrowLeft className="size-4" aria-hidden="true" />Chamados
      </Link>
      <label className="mr-auto flex items-center gap-2 text-sm text-neutral-700">
        <span className="max-sm:sr-only">Setor</span>
        <select value={atual} onChange={(e) => router.replace(`/chamados/cartaz?fila=${e.target.value}`)} className="h-10 rounded-lg border border-neutral-300 bg-white px-2 text-sm" data-cartaz-fila>
          {filas.map((f) => <option key={f.slug} value={f.slug}>{f.nome}</option>)}
        </select>
      </label>
      <button type="button" onClick={() => window.print()} className="inline-flex h-10 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-lg bg-[rgb(227_34_25)] px-4 text-sm font-semibold text-white hover:bg-[rgb(200_28_20)]" data-chamados-imprimir>
        <Printer className="size-4" aria-hidden="true" />Imprimir ou salvar PDF
      </button>
    </div>
  )
}
