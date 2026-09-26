'use client'

import { useEffect, useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowDown, ArrowUp, Eye, EyeOff, GripVertical, LayoutGrid, Loader2, RotateCcw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { restaurarInicio, salvarInicio } from '@/app/actions/inicio'
import { BLOCOS, alternar, arrumacaoPadrao, ehPadrao, levarPara, mover, type Arrumacao, type IdDoBloco } from '@/lib/inicio/blocos'
import { cn } from '@/lib/utils'

const LARGURA = { inteiro: 'largura toda', largo: 'coluna larga', estreito: 'coluna estreita' } as const

/**
 * "Personalizar o Início": a lista dos blocos, para mostrar, esconder e mudar
 * de lugar (arrastando ou pelas setas, que também servem no celular e no
 * teclado). Guarda por pessoa; "Voltar ao padrão" apaga a escolha.
 */
export function PersonalizarInicio({ inicial }: { inicial: Arrumacao }) {
  const [aberto, setAberto] = useState(false)
  return (
    <>
      <Button variant="outline" size="sm" onClick={() => setAberto(true)} data-ajuda="inicio.personalizar">
        <LayoutGrid className="size-4" aria-hidden="true" />Personalizar o Início
      </Button>
      {aberto && <Dialogo inicial={inicial} aoFechar={() => setAberto(false)} />}
    </>
  )
}

function Dialogo({ inicial, aoFechar }: { inicial: Arrumacao; aoFechar: () => void }) {
  const router = useRouter()
  const ref = useRef<HTMLDialogElement>(null)
  const [lista, setLista] = useState(inicial)
  const [arrastando, setArrastando] = useState<IdDoBloco | null>(null)
  const [erro, setErro] = useState('')
  const [aviso, setAviso] = useState('')
  const [ocupado, iniciar] = useTransition()
  useEffect(() => { ref.current?.showModal() }, [])
  const visiveis = lista.filter((b) => b.visivel).length

  // As setas: move e deixa o foco no mesmo botão, e o leitor de tela ouve a nova posição.
  const moverCom = (id: IdDoBloco, passo: -1 | 1) => {
    const nova = mover(lista, id, passo)
    if (nova === lista) return
    setLista(nova)
    setAviso(`${BLOCOS[id].nome}: posição ${nova.findIndex((b) => b.id === id) + 1} de ${nova.length}.`)
  }

  const salvar = () => iniciar(async () => {
    setErro('')
    const r = ehPadrao(lista) ? await restaurarInicio() : await salvarInicio(lista)
    if (r.erro) { setErro(r.erro); return }
    aoFechar()
    router.refresh()
  })

  return (
    <dialog
      ref={ref}
      aria-labelledby="inicio-personalizar-titulo"
      aria-describedby="inicio-personalizar-texto"
      onClose={aoFechar}
      onMouseDown={(e) => {
        const caixa = e.currentTarget.getBoundingClientRect()
        if (e.clientX < caixa.left || e.clientX > caixa.right || e.clientY < caixa.top || e.clientY > caixa.bottom) aoFechar()
      }}
      className="m-auto max-h-[calc(100dvh-2rem)] w-[calc(100%-2rem)] max-w-xl overflow-y-auto rounded-xl border border-border bg-card p-0 text-card-foreground shadow-2xl backdrop:bg-[rgb(0_0_0/0.45)]"
    >
      <div className="flex flex-col gap-4 px-5 py-5 sm:px-6">
        <div>
          <h2 id="inicio-personalizar-titulo" className="text-base font-semibold">Personalizar o Início</h2>
          <p id="inicio-personalizar-texto" className="mt-1 text-sm text-muted-foreground">
            Escolha o que aparece e em que ordem. Arraste pela alça ou use as setas. Blocos de coluna larga e estreita em sequência ficam lado a lado.
            Vale só para você.
          </p>
        </div>

        <ol className="flex flex-col gap-1.5" data-lista-de-blocos>
          {lista.map((b, i) => {
            const bloco = BLOCOS[b.id]
            return (
              <li
                key={b.id}
                draggable
                onDragStart={(e) => { setArrastando(b.id); e.dataTransfer.effectAllowed = 'move' }}
                onDragOver={(e) => { e.preventDefault(); if (arrastando && arrastando !== b.id) setLista((l) => levarPara(l, arrastando, b.id)) }}
                onDragEnd={() => setArrastando(null)}
                data-bloco={b.id}
                className={cn(
                  'flex items-center gap-2 rounded-lg border border-border bg-background px-2 py-2 transition-colors',
                  !b.visivel && 'bg-muted/40 text-muted-foreground',
                  arrastando === b.id && 'border-primary/60 opacity-60',
                )}
              >
                <GripVertical className="size-4 shrink-0 cursor-grab text-muted-foreground" aria-hidden="true" />
                <label className="flex min-w-0 flex-1 cursor-pointer items-start gap-2.5">
                  <input type="checkbox" checked={b.visivel} onChange={() => setLista((l) => alternar(l, b.id))} className="mt-1" aria-describedby={`bloco-${b.id}-desc`} />
                  <span className="min-w-0">
                    <span className="block text-sm font-medium">{bloco.nome}</span>
                    <span id={`bloco-${b.id}-desc`} className="block text-xs text-muted-foreground">{bloco.descricao} · {LARGURA[bloco.largura]}</span>
                  </span>
                </label>
                {b.visivel ? <Eye className="hidden size-4 shrink-0 text-muted-foreground sm:block" aria-hidden="true" /> : <EyeOff className="hidden size-4 shrink-0 sm:block" aria-hidden="true" />}
                <div className="flex shrink-0 gap-1">
                  <button type="button" onClick={() => moverCom(b.id, -1)} disabled={i === 0} aria-label={`Subir ${bloco.nome}`}
                    className="inline-flex size-8 items-center justify-center rounded-md border border-border hover:bg-muted disabled:opacity-30"><ArrowUp className="size-4" /></button>
                  <button type="button" onClick={() => moverCom(b.id, 1)} disabled={i === lista.length - 1} aria-label={`Descer ${bloco.nome}`}
                    className="inline-flex size-8 items-center justify-center rounded-md border border-border hover:bg-muted disabled:opacity-30"><ArrowDown className="size-4" /></button>
                </div>
              </li>
            )
          })}
        </ol>
        <p className="sr-only" aria-live="polite">{aviso}</p>

        {visiveis === 0 && <p className="rounded-md bg-warning/10 px-3 py-2 text-xs text-warning-foreground">Com tudo escondido, o Início fica vazio: só o botão para personalizar de novo.</p>}
        {erro && <p className="text-sm text-destructive" role="alert">{erro}</p>}

        <div className="flex flex-wrap items-center justify-end gap-2">
          <Button type="button" variant="ghost" size="sm" className="mr-auto" onClick={() => setLista(arrumacaoPadrao())} disabled={ehPadrao(lista)}>
            <RotateCcw className="size-4" aria-hidden="true" />Voltar ao padrão
          </Button>
          <Button type="button" variant="outline" onClick={aoFechar}>Cancelar</Button>
          <Button type="button" onClick={salvar} disabled={ocupado}>{ocupado && <Loader2 className="size-4 animate-spin" />}Salvar</Button>
        </div>
      </div>
    </dialog>
  )
}
