'use client'

import { useId, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Dialog } from '@base-ui/react/dialog'
import { CornerDownLeft, Loader2, Search, type LucideIcon } from 'lucide-react'
import { cn } from '@/lib/utils'
import { buscarAreas, type Grupo } from '@/lib/navegacao'
import { ACOES_DE_CRIAR, useCriar, type AcaoDeCriar } from './acoes-de-criar'
import { useShell } from './app-shell'

type Item = {
  chave: string
  secao: string
  rotulo: string
  resumo: string
  icone: LucideIcon
  termos?: string[]
  href?: string
  acao?: AcaoDeCriar
}

/**
 * A busca rápida (⌘K): ir para qualquer área ou começar qualquer coisa sem
 * procurar no menu. É o atalho do Linear, do Notion e do Slack — quem já usa
 * uma dessas ferramentas chega sabendo. Aceita os nomes antigos das áreas.
 */
export function BuscaRapida() {
  const { grupos, buscaAberta, setBuscaAberta } = useShell()
  return (
    <Dialog.Root open={buscaAberta} onOpenChange={setBuscaAberta}>
      <Dialog.Portal>
        <Dialog.Backdrop className="fixed inset-0 z-50 bg-foreground/30 backdrop-blur-[2px] transition-opacity duration-150 data-[ending-style]:opacity-0 data-[starting-style]:opacity-0" />
        <Dialog.Popup className="fixed left-1/2 top-[max(1rem,10vh)] z-50 flex max-h-[min(34rem,calc(100dvh-2rem))] w-[calc(100vw-1.5rem)] max-w-xl -translate-x-1/2 flex-col overflow-hidden rounded-2xl border border-border bg-popover text-popover-foreground shadow-2xl outline-none transition-[opacity,transform] duration-150 data-[ending-style]:scale-[0.98] data-[ending-style]:opacity-0 data-[starting-style]:scale-[0.98] data-[starting-style]:opacity-0">
          <Dialog.Title className="sr-only">Buscar no sistema</Dialog.Title>
          <Conteudo grupos={grupos} fechar={() => setBuscaAberta(false)} />
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  )
}

function Conteudo({ grupos, fechar }: { grupos: Grupo[]; fechar: () => void }) {
  const router = useRouter()
  const { executar, pendente, erro } = useCriar()
  const [busca, setBusca] = useState('')
  const [ativo, setAtivo] = useState(0)
  const listaRef = useRef<HTMLDivElement>(null)
  const idDaLista = useId()

  const todos = useMemo<Item[]>(() => [
    ...ACOES_DE_CRIAR.map((a) => ({ chave: `criar:${a.id}`, secao: 'Criar', rotulo: a.rotulo, resumo: a.resumo, icone: a.icone, termos: a.termos, acao: a })),
    ...grupos.flatMap((g) => g.areas.map((a) => ({ chave: a.href, secao: g.rotulo ?? 'Ir para', rotulo: a.rotulo, resumo: a.resumo, icone: a.icone, termos: a.termos, href: a.href }))),
  ], [grupos])

  // Buscando, as áreas vêm antes das ações: quem digita um nome quer ir lá.
  const itens = useMemo(() => {
    if (!busca.trim()) return todos
    const achados = buscarAreas(busca, todos)
    return [...achados.filter((i) => i.href).map((i) => ({ ...i, secao: 'Ir para' })), ...achados.filter((i) => i.acao)]
  }, [busca, todos])

  const indice = Math.min(ativo, Math.max(itens.length - 1, 0))

  function escolher(item: Item) {
    if (item.href) { router.push(item.href); fechar(); return }
    if (item.acao) executar(item.acao, fechar)
  }

  function mover(para: number) {
    const total = itens.length
    if (!total) return
    const novo = (para + total) % total
    setAtivo(novo)
    listaRef.current?.querySelector<HTMLElement>(`[data-indice="${novo}"]`)?.scrollIntoView({ block: 'nearest' })
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'ArrowDown') { e.preventDefault(); mover(indice + 1) }
    else if (e.key === 'ArrowUp') { e.preventDefault(); mover(indice - 1) }
    else if (e.key === 'Enter') { e.preventDefault(); const item = itens[indice]; if (item) escolher(item) }
  }

  return (
    <>
      <div className="flex items-center gap-3 border-b border-border px-4">
        <Search className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
        <input
          autoFocus
          value={busca}
          onChange={(e) => { setBusca(e.target.value); setAtivo(0) }}
          onKeyDown={onKeyDown}
          placeholder="Buscar área ou ação…"
          role="combobox"
          aria-expanded="true"
          aria-controls={idDaLista}
          aria-activedescendant={itens[indice] ? `${idDaLista}-${indice}` : undefined}
          aria-label="Buscar área ou ação"
          className="h-14 min-w-0 flex-1 bg-transparent text-[15px] outline-none placeholder:text-muted-foreground"
        />
        {pendente ? <Loader2 className="size-4 animate-spin text-muted-foreground" aria-label="Criando" /> : <kbd className="hidden rounded border border-border bg-muted px-1.5 py-0.5 font-sans text-[11px] text-muted-foreground sm:inline">Esc</kbd>}
      </div>
      {erro && <p className="border-b border-border bg-destructive/5 px-4 py-2 text-sm text-destructive">{erro}</p>}
      <div ref={listaRef} id={idDaLista} role="listbox" aria-label="Resultados" className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-2">
        {!itens.length && <p className="px-3 py-10 text-center text-sm text-muted-foreground">Nada com “{busca.trim()}”. Tente outro nome — os antigos também valem.</p>}
        {itens.map((item, i) => {
          const titulo = i === 0 || itens[i - 1].secao !== item.secao ? item.secao : null
          const Icone = item.icone
          return (
            <div key={item.chave}>
              {titulo && <p className="px-2.5 pb-1 pt-3 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground first:pt-1">{titulo}</p>}
              <div
                id={`${idDaLista}-${i}`}
                role="option"
                aria-selected={i === indice}
                data-indice={i}
                onMouseMove={() => { if (i !== indice) setAtivo(i) }}
                onClick={() => escolher(item)}
                className={cn('flex min-h-11 cursor-pointer items-center gap-3 rounded-lg px-2.5 py-2 text-sm', i === indice ? 'bg-accent text-accent-foreground' : 'text-foreground')}
              >
                <span className={cn('flex size-8 shrink-0 items-center justify-center rounded-lg border border-border bg-background', i === indice && 'border-primary/20 text-primary')}>
                  <Icone className="size-4" aria-hidden="true" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium">{item.rotulo}</span>
                  <span className="block truncate text-xs text-muted-foreground">{item.resumo}</span>
                </span>
                {i === indice && <CornerDownLeft className="hidden size-3.5 shrink-0 text-muted-foreground sm:block" aria-hidden="true" />}
              </div>
            </div>
          )
        })}
      </div>
      <div className="hidden items-center gap-4 border-t border-border bg-muted/40 px-4 py-2 text-[11px] text-muted-foreground sm:flex">
        <span><kbd className="font-sans">↑</kbd> <kbd className="font-sans">↓</kbd> navegar</span>
        <span><kbd className="font-sans">Enter</kbd> abrir</span>
        <span><kbd className="font-sans">Esc</kbd> fechar</span>
        <span className="ml-auto"><kbd className="font-sans">⌘K</kbd> ou <kbd className="font-sans">Ctrl K</kbd> de qualquer tela</span>
      </div>
    </>
  )
}
