'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { CheckCircle2, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { confirmarNoPalacio } from './acoes'

/**
 * O botão da tela de confirmar (e, no voto de aprovar, a conferência do setor
 * para marcar antes, como na tela da aprovação). Confirmado, mostra o que foi
 * feito e o caminho para a tela do item; o link não vale mais.
 */
export function Confirmar({ token, botao, destrutivo, conferencia, link }: {
  token: string
  botao: string
  destrutivo?: boolean
  conferencia: { setor: string; itens: string[] }[]
  link: string
}) {
  const [marcados, setMarcados] = useState<Set<string>>(new Set())
  const [erro, setErro] = useState('')
  const [feito, setFeito] = useState('')
  const [ocupado, iniciar] = useTransition()
  const itens = conferencia.flatMap((b) => b.itens)
  const falta = itens.some((i) => !marcados.has(i))

  if (feito) {
    return (
      <div className="flex flex-col gap-3" role="status">
        <p className="flex items-start gap-2 rounded-lg bg-success/10 px-3 py-2 text-sm text-success"><CheckCircle2 className="mt-0.5 size-4 shrink-0" />{feito}</p>
        <p className="text-sm text-muted-foreground">A resposta também foi para o seu WhatsApp. Este link não vale mais.</p>
        <Button variant="outline" render={<Link href={link} />}>Abrir no Palácio</Button>
      </div>
    )
  }

  const alternar = (item: string) => setMarcados((atual) => {
    const novo = new Set(atual)
    if (novo.has(item)) novo.delete(item)
    else novo.add(item)
    return novo
  })

  return (
    <div className="flex flex-col gap-4">
      {conferencia.length > 0 && (
        <fieldset className="flex flex-col gap-3 rounded-lg border border-border bg-muted/30 p-4">
          <legend className="px-1 text-sm font-medium">Conferência antes de aprovar</legend>
          {conferencia.map((b) => (
            <div key={b.setor} className="flex flex-col gap-2">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{b.setor}</p>
              {b.itens.map((item) => (
                <label key={item} className="flex items-start gap-2 text-sm">
                  <input type="checkbox" className="mt-0.5 size-4 accent-primary" checked={marcados.has(item)} onChange={() => alternar(item)} />
                  <span>{item}</span>
                </label>
              ))}
            </div>
          ))}
        </fieldset>
      )}
      {erro && <p className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive" role="alert">{erro}</p>}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Link href={link} className="text-sm text-muted-foreground underline-offset-4 hover:underline">Fazer pela tela de sempre</Link>
        <Button variant={destrutivo ? 'destructive' : 'default'} disabled={ocupado || falta}
          onClick={() => iniciar(async () => {
            setErro('')
            const r = await confirmarNoPalacio(token, [...marcados])
            if (r.erro) setErro(r.erro)
            else setFeito(r.feito ?? 'Pronto.')
          })}>
          {ocupado && <Loader2 className="size-4 animate-spin" />}{botao}
        </Button>
      </div>
    </div>
  )
}
