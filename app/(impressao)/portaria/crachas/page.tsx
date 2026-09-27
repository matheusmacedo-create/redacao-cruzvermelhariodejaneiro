import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import { requireWorkspace } from '@/lib/session'
import { folhasDeCrachas, numerosDeCracha } from '@/lib/portaria/regras'
import { FrenteDoCrachaDeVisitante, VersoDoCrachaDeVisitante } from '@/components/portaria/cracha-de-visitante'
import { BotaoImprimir } from './botao'

export const metadata = { title: 'Crachás de visitante — Portaria' }
export const dynamic = 'force-dynamic'

/**
 * Os crachás de visitante para imprimir (Portaria): folhas A4 com 9 crachás
 * de 54 × 86 mm e marcas de corte. Com verso, cada folha de frentes vem
 * seguida da folha de versos, espelhada: imprima frente e verso virando pela
 * borda longa e cada verso cai atrás da sua frente. Fora do grupo (app),
 * como os outros cartazes: a folha impressa é só a folha.
 */
export default async function CrachasDeVisitante({ searchParams }: { searchParams: Promise<{ prefixo?: string; de?: string; ate?: string; verso?: string }> }) {
  await requireWorkspace()
  const sp = await searchParams
  const numeros = numerosDeCracha(sp.prefixo, sp.de, sp.ate)
  const comVerso = sp.verso !== 'nao'
  const folhas = folhasDeCrachas(numeros)
  const paginas = folhas.flatMap((f, i) => [
    { chave: `f${i}`, lado: 'frente' as const, itens: f.frente },
    ...(comVerso ? [{ chave: `v${i}`, lado: 'verso' as const, itens: f.verso }] : []),
  ])

  return (
    <div className="min-h-dvh bg-neutral-200 py-6 print:bg-white print:py-0">
      <style>{'@page { size: A4 portrait; margin: 0 } @media print { html, body { background: #fff } }'}</style>
      <div className="mx-auto mb-4 flex w-[210mm] max-w-[calc(100vw-2rem)] flex-wrap items-center justify-between gap-2 print:hidden">
        <Link href="/portaria?aba=crachas" className="inline-flex h-10 items-center gap-1.5 rounded-lg px-3 text-sm font-medium text-neutral-700 hover:bg-white/70">
          <ArrowLeft className="size-4" aria-hidden="true" />Portaria
        </Link>
        <p className="mr-auto text-sm text-neutral-600">
          {numeros[0]} a {numeros[numeros.length - 1]} · {paginas.length} {paginas.length === 1 ? 'folha' : 'folhas'} A4{comVerso ? ' · frente e verso, virando pela borda longa' : ''}
        </p>
        <BotaoImprimir />
      </div>
      {paginas.map((p) => (
        <section key={p.chave} className="mx-auto mb-6 flex h-[297mm] w-[210mm] items-center justify-center bg-white shadow-xl max-[860px]:[zoom:0.72] max-[600px]:[zoom:0.45] print:mb-0 print:break-after-page print:shadow-none print:[zoom:1]"
          aria-label={`${p.lado === 'frente' ? 'Frentes' : 'Versos'} dos crachás`} data-folha={p.lado}>
          <div className="grid grid-cols-[repeat(3,54mm)] grid-rows-[repeat(3,86mm)]">
            {p.itens.map((n, i) => (
              // Marca de corte: o contorno pontilhado fino de cada crachá.
              <div key={i} className="relative">
                {n ? (p.lado === 'frente' ? <FrenteDoCrachaDeVisitante numero={n} /> : <VersoDoCrachaDeVisitante numero={n} />) : <div className="h-[86mm] w-[54mm]" />}
                <span className="pointer-events-none absolute inset-0 border-[0.2mm] border-dashed border-neutral-400" aria-hidden="true" />
              </div>
            ))}
          </div>
        </section>
      ))}
    </div>
  )
}
