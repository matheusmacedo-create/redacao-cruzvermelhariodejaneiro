'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { CheckCircle2, Loader2, Package } from 'lucide-react'
import { aceitarTermoDoBem } from '@/app/actions/membro'
import type { BemComOVoluntario } from '@/lib/membro/bens'
import { botaoDoMembro } from './marca'

const DATA = (d: string) => new Date(d.length === 10 ? `${d}T12:00:00Z` : d).toLocaleDateString('pt-BR', { timeZone: d.length === 10 ? 'UTC' : 'America/Sao_Paulo' })

function Aceitar({ id }: { id: string }) {
  const router = useRouter()
  const [erro, setErro] = useState('')
  const [lido, setLido] = useState(false)
  const [ocupado, iniciar] = useTransition()
  return (
    <div className="flex flex-col gap-2">
      <label className="flex items-start gap-2 text-sm"><input type="checkbox" checked={lido} onChange={(e) => setLido(e.target.checked)} className="mt-0.5 size-4 accent-primary" />Li o termo, conferi o bem e o recebi.</label>
      <div>
        <button type="button" disabled={!lido || ocupado} className={botaoDoMembro} onClick={() => iniciar(async () => { setErro(''); const r = await aceitarTermoDoBem(id); if (r.erro) setErro(r.erro); else router.refresh() })}>
          {ocupado && <Loader2 className="size-4 animate-spin" />}Aceitar o termo
        </button>
      </div>
      {erro && <p className="text-sm text-destructive" role="alert">{erro}</p>}
    </div>
  )
}

/** Os bens da filial que estão com o voluntário, com o termo de responsabilidade. */
export function BensComigo({ bens }: { bens: BemComOVoluntario[] }) {
  if (!bens.length) return null
  return (
    <section className="rounded-xl border border-border bg-card p-5" id="bens">
      <h2 className="mb-3 flex items-center gap-2 font-semibold"><Package className="size-4 text-primary" />Bens da filial com você</h2>
      <ul className="flex flex-col gap-4">
        {bens.map((b) => (
          <li key={b.cautela_id} className="flex flex-col gap-2 rounded-lg border border-border p-4" data-cautela={b.cautela_id}>
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <span className="font-medium">{b.nome}</span>
              <span className="font-mono text-xs text-muted-foreground">{b.plaqueta}</span>
            </div>
            <p className="text-xs text-muted-foreground">
              {[b.marca, b.modelo, b.numero_serie && `série ${b.numero_serie}`].filter(Boolean).join(' · ')}{b.marca || b.modelo || b.numero_serie ? ' · ' : ''}recebido em {DATA(b.entregue_em)}
              {b.prevista_devolucao ? ` · devolver até ${DATA(b.prevista_devolucao)}` : ''}
            </p>
            <details className="text-sm" open={!b.termo_aceito_em}>
              <summary className="cursor-pointer text-xs font-medium text-muted-foreground">Termo de responsabilidade</summary>
              <p className="mt-2 whitespace-pre-line rounded-lg bg-muted/60 p-3 text-xs leading-relaxed">{b.termo}</p>
            </details>
            {b.termo_aceito_em
              ? <p className="flex items-center gap-1.5 text-xs text-success"><CheckCircle2 className="size-3.5" />Termo aceito em {DATA(b.termo_aceito_em)}</p>
              : <Aceitar id={b.cautela_id} />}
          </li>
        ))}
      </ul>
    </section>
  )
}
