'use client'

import { useState, useTransition } from 'react'
import { Calculator } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { corrigirValor } from '@/app/actions/apis-publicas'

const campo = 'h-9 w-full rounded-lg border border-border bg-background px-3 text-sm outline-none focus:border-ring focus:ring-2 focus:ring-ring/30'

/** Atualiza um valor pelo IPCA acumulado de um período (do primeiro ao último mês, inclusive). */
export function CorrecaoPeloIpca() {
  const [valor, setValor] = useState('')
  const [de, setDe] = useState('')
  const [ate, setAte] = useState('')
  const [r, setR] = useState<{ texto: string; erro?: boolean } | null>(null)
  const [ocupado, iniciar] = useTransition()
  const calcular = () => iniciar(async () => {
    const n = Number(valor.replace(/\./g, '').replace(',', '.'))
    const x = await corrigirValor(n, de, ate)
    if (x.erro || x.corrigido == null) { setR({ texto: x.erro ?? 'Não foi possível calcular.', erro: true }); return }
    setR({ texto: `${n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })} corrigidos pelo IPCA de ${de.split('-').reverse().join('/')} a ${ate.split('-').reverse().join('/')} (${x.meses} ${x.meses === 1 ? 'mês' : 'meses'}, ${x.percentual?.toLocaleString('pt-BR')}%): ${x.corrigido.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}.` })
  })
  return (
    <div className="mt-5 border-t border-border pt-4">
      <p className="mb-2 flex items-center gap-1.5 text-sm font-medium"><Calculator className="size-4" />Corrigir um valor pelo IPCA</p>
      <p className="mb-2 text-xs text-muted-foreground">Aplica a inflação de cada mês do período, do primeiro ao último, inclusive.</p>
      <div className="grid gap-2 sm:grid-cols-[1fr_10rem_10rem_auto]">
        <input aria-label="Valor em reais" inputMode="decimal" placeholder="Valor (R$)" value={valor} onChange={(e) => setValor(e.target.value)} className={campo} />
        <input aria-label="Primeiro mês do período" title="Primeiro mês do período" type="month" value={de} onChange={(e) => setDe(e.target.value)} className={campo} />
        <input aria-label="Último mês do período" title="Último mês do período" type="month" value={ate} onChange={(e) => setAte(e.target.value)} className={campo} />
        <Button type="button" variant="outline" disabled={ocupado || !valor || !de || !ate} onClick={calcular}>{ocupado ? 'Calculando…' : 'Calcular'}</Button>
      </div>
      {r && <p role="status" className={`mt-2 text-sm ${r.erro ? 'text-warning-foreground' : ''}`}>{r.texto}</p>}
    </div>
  )
}
