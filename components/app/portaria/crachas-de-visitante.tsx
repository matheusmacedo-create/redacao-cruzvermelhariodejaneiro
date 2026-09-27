'use client'

import { useState } from 'react'
import { Printer } from 'lucide-react'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { FORMATOS_DE_CRACHA, MAXIMO_DE_CRACHAS, crachasPorFolha, formatoDoCracha, type FormatoDoCracha } from '@/lib/portaria/regras'
import { FrenteDoCrachaDeVisitante, VersoDoCrachaDeVisitante } from '@/components/portaria/cracha-de-visitante'

const inputClass = 'rounded-lg border border-border bg-background px-3 py-2 text-sm'

/**
 * Os modelos de crachá de visitante: escolhe o formato e a numeração e abre a
 * folha A4 para imprimir. A prévia mostra só o formato escolhido, e o "Até o
 * número" acompanha uma folha cheia (10 deitados, 9 em pé) enquanto a pessoa
 * não mexer nele.
 */
export function CrachasDeVisitante() {
  const [formato, setFormato] = useState<FormatoDoCracha>('deitado')
  const [ate, setAte] = useState<string | null>(null)
  const deitado = formato === 'deitado'

  return (
    <Card className="flex flex-col gap-5 p-5" data-ajuda="portaria.crachas-modelo">
      <div>
        <h2 className="font-semibold">Imprimir crachás de visitante</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Folhas A4 com marcas de corte, no tamanho de cartão: {crachasPorFolha('deitado')} crachás deitados (86 × 54 mm, para o porta-crachá horizontal com presilha) ou {crachasPorFolha('empe')} em pé (54 × 86 mm). O crachá leva só o número: a portaria anota o número na entrada e confere a devolução na saída. Use capa plástica ou plastifique para durar.
        </p>
      </div>
      <form action="/portaria/crachas" className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5" target="_blank">
        <label className="col-span-2 flex flex-col gap-1 text-sm font-medium sm:col-span-1">Formato
          <select name="formato" value={formato} onChange={(e) => setFormato(formatoDoCracha(e.target.value))} className={inputClass}>
            {Object.entries(FORMATOS_DE_CRACHA).map(([k, v]) => <option key={k} value={k}>{v.rotulo}</option>)}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-sm font-medium">Prefixo
          <input name="prefixo" defaultValue="V" maxLength={5} className={inputClass} />
        </label>
        <label className="flex flex-col gap-1 text-sm font-medium">Do número
          <input name="de" type="number" min={1} max={999} defaultValue={1} className={inputClass} />
        </label>
        <label className="flex flex-col gap-1 text-sm font-medium">Até o número
          <input name="ate" type="number" min={1} max={999} value={ate ?? String(crachasPorFolha(formato))} onChange={(e) => setAte(e.target.value)} className={inputClass} />
        </label>
        <label className="flex flex-col gap-1 text-sm font-medium">Verso
          <select name="verso" defaultValue="sim" className={inputClass}>
            <option value="sim">Com as regras no verso</option>
            <option value="nao">Só a frente</option>
          </select>
        </label>
        <div className="col-span-2 flex flex-wrap items-center gap-3 sm:col-span-3 lg:col-span-5">
          <Button type="submit" data-portaria-crachas><Printer className="size-4" />Abrir para imprimir</Button>
          <span className="text-xs text-muted-foreground">Até {MAXIMO_DE_CRACHAS} crachás por vez. Com verso, imprima frente e verso virando pela borda longa.</span>
        </div>
      </form>
      <figure className="flex flex-col items-center gap-2 border-t border-border pt-5" aria-label={`Prévia do crachá de visitante ${FORMATOS_DE_CRACHA[formato].rotulo}`}>
        <div className="flex flex-wrap items-start justify-center gap-4">
          <div className="overflow-hidden rounded-xl border border-border shadow-sm"><FrenteDoCrachaDeVisitante numero="V-07" deitado={deitado} /></div>
          <div className="overflow-hidden rounded-xl border border-border shadow-sm max-sm:hidden"><VersoDoCrachaDeVisitante numero="V-07" deitado={deitado} /></div>
        </div>
        <figcaption className="text-xs text-muted-foreground">Prévia: {FORMATOS_DE_CRACHA[formato].rotulo}, frente e verso</figcaption>
      </figure>
    </Card>
  )
}
