'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { CheckCircle2, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { confirmarNoPalacio } from './acoes'

/**
 * O botão da tela de confirmar (e, no voto de aprovar — também o do plano do
 * assistente —, a conferência do setor para marcar antes, como na tela da
 * aprovação; no cadastro de colaborador, o usuário e o papel, que dá para
 * mudar antes). Confirmado, mostra o que foi feito (no plano, o recibo) e o
 * caminho para a tela do item; o link não vale mais.
 */
export function Confirmar({ token, botao, destrutivo, conferencia, link, rotuloDoLink = 'Fazer pela tela de sempre', cadastro }: {
  token: string
  botao: string
  destrutivo?: boolean
  conferencia: { setor: string; itens: string[] }[]
  link: string
  /** O caminho alternativo ao lado do botão (o plano do assistente não tem uma tela só: volta ao início). */
  rotuloDoLink?: string
  /** O cadastro de colaborador: o usuário sugerido e o papel (administrador nunca: a lista vem sem ele). */
  cadastro?: { usuario: string; papel: string; papeis: { valor: string; rotulo: string }[] }
}) {
  const [marcados, setMarcados] = useState<Set<string>>(new Set())
  const [usuario, setUsuario] = useState(cadastro?.usuario ?? '')
  const [papel, setPapel] = useState(cadastro?.papel ?? '')
  const [erro, setErro] = useState('')
  const [feito, setFeito] = useState('')
  const [ocupado, iniciar] = useTransition()
  const itens = conferencia.flatMap((b) => b.itens)
  const falta = itens.some((i) => !marcados.has(i))

  if (feito) {
    return (
      <div className="flex flex-col gap-3" role="status">
        <p className="flex items-start gap-2 whitespace-pre-line break-words rounded-lg bg-success/10 px-3 py-2 text-sm text-success"><CheckCircle2 className="mt-0.5 size-4 shrink-0" />{feito}</p>
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
      {cadastro && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <label className="flex flex-col gap-1.5 text-sm">
            <span className="text-xs text-muted-foreground">Usuário (o login)</span>
            <span className="flex h-10 items-center rounded-lg border border-border bg-background px-3 text-sm focus-within:border-ring focus-within:ring-2 focus-within:ring-ring/30">
              <span className="text-muted-foreground">@</span>
              <input value={usuario} onChange={(e) => setUsuario(e.target.value.toLowerCase().replace(/\s/g, ''))} maxLength={40} required
                autoCapitalize="none" autoCorrect="off" spellCheck={false} className="h-full w-full bg-transparent pl-0.5 outline-none" />
            </span>
          </label>
          <label className="flex flex-col gap-1.5 text-sm">
            <span className="text-xs text-muted-foreground">Papel</span>
            <select value={papel} onChange={(e) => setPapel(e.target.value)} className="h-10 w-full rounded-lg border border-border bg-background px-3 text-sm outline-none focus:border-ring focus:ring-2 focus:ring-ring/30">
              {cadastro.papeis.map((p) => <option key={p.valor} value={p.valor}>{p.rotulo}</option>)}
            </select>
          </label>
        </div>
      )}
      {erro && <p className="whitespace-pre-line break-words rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive" role="alert">{erro}</p>}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Link href={link} className="text-sm text-muted-foreground underline-offset-4 hover:underline">{rotuloDoLink}</Link>
        <Button variant={destrutivo ? 'destructive' : 'default'} disabled={ocupado || falta}
          onClick={() => iniciar(async () => {
            setErro('')
            const r = await confirmarNoPalacio(token, [...marcados], cadastro ? { usuario, papel } : null)
            if (r.erro) setErro(r.erro)
            else setFeito(r.feito ?? 'Pronto.')
          })}>
          {ocupado && <Loader2 className="size-4 animate-spin" />}{botao}
        </Button>
      </div>
    </div>
  )
}
