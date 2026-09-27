'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { FileText, Loader2, PenLine, Plus, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { inputClass } from '@/components/app/imprensa/campos'
import { definirAssinaturas } from '@/app/actions/diplomas'
import { MAXIMO_DE_ASSINATURAS, lerAssinaturas, type Assinatura } from '@/lib/cursos/assinaturas'

const mesma = (a: Assinatura, b: Assinatura) => a.nome.trim().toLowerCase() === b.nome.trim().toLowerCase()

/**
 * Quem assina os Diplomas de Reconhecimento: de uma a três pessoas, na ordem
 * em que saem no diploma. Vale para os emitidos daqui em diante; cada diploma
 * guarda quem assinava no dia.
 */
export function QuemAssina({ atuais, escolhida, sugestoes, nomesDaEquipe, podeEditar }: {
  /** A lista que vale hoje (a escolhida ou, sem escolha, a presidência). */
  atuais: Assinatura[]
  /** A filial já escolheu? Sem escolha, os diplomas saem só com a presidência. */
  escolhida: boolean
  sugestoes: Assinatura[]
  nomesDaEquipe: string[]
  podeEditar: boolean
}) {
  const router = useRouter()
  const [editando, setEditando] = useState(false)
  const [lista, setLista] = useState<Assinatura[]>(atuais)
  const [erro, setErro] = useState('')
  const [salvo, setSalvo] = useState(false)
  const [ocupado, iniciar] = useTransition()

  const faltam = sugestoes.filter((s) => !lista.some((a) => mesma(a, s)))
  const cheia = lista.length >= MAXIMO_DE_ASSINATURAS
  const mudar = (i: number, campo: keyof Assinatura, valor: string) => setLista((l) => l.map((a, j) => (j === i ? { ...a, [campo]: valor } : a)))

  const salvar = () => iniciar(async () => {
    setErro(''); setSalvo(false)
    const lida = lerAssinaturas(lista)
    if (lida.erro) { setErro(lida.erro); return }
    const r = await definirAssinaturas(lida.assinaturas)
    if (r.erro) { setErro(r.erro); return }
    setLista(lida.assinaturas); setEditando(false); setSalvo(true)
    router.refresh()
  })

  return (
    <Card className="flex flex-col gap-4 p-5" data-ajuda="diplomas.assinaturas">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="flex items-center gap-2 font-semibold"><PenLine className="size-4 text-primary" />Quem assina</h2>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
            Até três assinaturas, lado a lado no pé do diploma. Vale para os diplomas emitidos daqui em diante; cada um guarda quem assinava no dia.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" render={<a href="/api/voluntariado/diplomas/exemplo" target="_blank" rel="noopener" />}><FileText className="size-3.5" />Ver exemplo em PDF</Button>
          {podeEditar && !editando && <Button size="sm" onClick={() => { setLista(atuais); setEditando(true); setSalvo(false) }}><PenLine className="size-3.5" />Alterar</Button>}
        </div>
      </div>

      {!editando ? (
        <>
          <ol className="grid grid-cols-1 gap-3 sm:grid-cols-3" aria-label="Assinaturas do diploma">
            {atuais.map((a) => (
              <li key={`${a.nome}-${a.cargo}`} className="rounded-lg border border-border px-4 py-3 text-center">
                <p className="truncate font-serif text-lg italic">{a.nome}</p>
                <p className="mt-1 border-t border-border pt-1 text-xs font-semibold">{a.cargo}</p>
              </li>
            ))}
          </ol>
          {!escolhida && <p className="text-xs text-muted-foreground">Ainda não escolhida: os diplomas saem só com a assinatura da presidência.</p>}
          {salvo && <p role="status" className="text-xs text-emerald-700 dark:text-emerald-500">Salvo. Os próximos diplomas já saem com estas assinaturas.</p>}
        </>
      ) : (
        <div className="flex flex-col gap-3">
          <datalist id="nomes-da-equipe">{nomesDaEquipe.map((n) => <option key={n} value={n} />)}</datalist>
          <ol className="flex flex-col gap-2">
            {lista.map((a, i) => (
              <li key={i} className="flex items-start gap-2 sm:items-center" data-assinatura={i}>
                <span className="w-5 shrink-0 pt-2.5 text-right text-xs tabular-nums text-muted-foreground sm:pt-0">{i + 1}.</span>
                <div className="flex min-w-0 flex-1 flex-col gap-2 sm:flex-row">
                  <input value={a.nome} onChange={(e) => mudar(i, 'nome', e.target.value)} list="nomes-da-equipe" maxLength={80} placeholder="Nome de quem assina" aria-label={`Nome da assinatura ${i + 1}`} className={`${inputClass} min-w-0 sm:flex-[3]`} />
                  <input value={a.cargo} onChange={(e) => mudar(i, 'cargo', e.target.value)} maxLength={60} placeholder="Cargo (ex.: Vice-Presidente)" aria-label={`Cargo da assinatura ${i + 1}`} className={`${inputClass} min-w-0 sm:flex-[2]`} />
                </div>
                <Button variant="ghost" size="sm" className="mt-1 sm:mt-0" onClick={() => setLista((l) => l.filter((_x, j) => j !== i))} disabled={lista.length <= 1} aria-label={`Tirar a assinatura ${i + 1}`}><X className="size-4" /></Button>
              </li>
            ))}
          </ol>
          <div className="flex flex-wrap items-center gap-2">
            {faltam.map((s) => (
              <Button key={s.nome} variant="outline" size="sm" disabled={cheia} onClick={() => setLista((l) => [...l, s])}>
                <Plus className="size-3.5" />{s.cargo}: {s.nome}
              </Button>
            ))}
            <Button variant="ghost" size="sm" disabled={cheia} onClick={() => setLista((l) => [...l, { nome: '', cargo: '' }])}><Plus className="size-3.5" />Outra pessoa</Button>
            {cheia && <span className="text-xs text-muted-foreground">Três é o máximo: mais do que isso não cabe no diploma.</span>}
          </div>
          {erro && <p role="alert" className="text-sm text-destructive">{erro}</p>}
          <div className="flex flex-wrap gap-2">
            <Button onClick={salvar} disabled={ocupado}>{ocupado && <Loader2 className="size-4 animate-spin" />}Salvar</Button>
            <Button variant="outline" onClick={() => { setEditando(false); setErro('') }} disabled={ocupado}>Cancelar</Button>
          </div>
        </div>
      )}
    </Card>
  )
}
