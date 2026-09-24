'use client'

import { useState } from 'react'
import { Check, Printer, X } from 'lucide-react'

async function sha256Hex(texto: string) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(texto))
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

/**
 * Recalcula no navegador de quem confere o SHA-256 do texto guardado e
 * compara com o código registrado — sem confiar no servidor para isso.
 */
export function ConferirNoNavegador({ itens }: { itens: { rotulo: string; texto: string; hash: string }[] }) {
  const [res, setRes] = useState<(boolean | null)[]>(itens.map(() => null))
  return (
    <div className="flex flex-col gap-2">
      <button type="button" className="self-start rounded-lg border border-neutral-300 bg-white px-3 py-1.5 text-sm font-medium hover:bg-neutral-50"
        onClick={async () => setRes(await Promise.all(itens.map(async (i) => (await sha256Hex(i.texto)) === i.hash)))}>
        Recalcular os códigos neste navegador
      </button>
      <ul className="flex flex-col gap-1 text-sm">
        {itens.map((i, k) => (
          <li key={i.rotulo} className="flex items-center gap-2">
            {res[k] === null ? <span className="size-4" /> : res[k] ? <Check className="size-4 text-emerald-700" /> : <X className="size-4 text-red-700" />}
            {i.rotulo}{res[k] === null ? '' : res[k] ? ': confere' : ': NÃO confere'}
          </li>
        ))}
      </ul>
    </div>
  )
}

export function BotaoImprimir() {
  return (
    <button type="button" onClick={() => window.print()} className="inline-flex items-center gap-1.5 rounded-lg border border-neutral-300 bg-white px-3 py-1.5 text-sm font-medium hover:bg-neutral-50 print:hidden">
      <Printer className="size-4" />Imprimir ou salvar em PDF
    </button>
  )
}
