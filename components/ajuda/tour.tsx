'use client'

import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { ArrowLeft, ArrowRight, Check, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import type { PassoDoTour } from '@/lib/ajuda/tipos'
import { estaNaTela, posicionarBalao, recorte, type Retangulo, type Tamanho } from '@/lib/ajuda/posicao'

export type FimDoTour = 'concluido' | 'pulado'

/**
 * O tour guiado: escurece a tela, ilumina o elemento marcado com
 * `data-ajuda` e explica em um balão, passo a passo. Serve ao Redação e à
 * Área do Voluntário (o conteúdo vem de lib/ajuda).
 *
 * Montado = aberto; quem abre desmonta no `aoTerminar`. Enquanto aberto, a
 * página não recebe clique (o tour não é para ser feito "clicando junto": um
 * clique fora do lugar navegaria e deixaria o balão apontando para o nada).
 *
 * Acessibilidade: é um diálogo modal (foco preso no balão, Esc fecha, setas
 * andam). A cada passo o foco vai para o próprio balão, e o leitor de tela lê
 * título e texto (aria-labelledby/-describedby). Ao fechar, o foco volta para
 * onde estava. Sem animação para quem pediu menos movimento.
 */
export function Tour({ passos, rotulo, aoTerminar }: {
  passos: PassoDoTour[]
  /** Aparece acima do título: "Tour de Pautas", "Boas-vindas". */
  rotulo: string
  aoTerminar: (fim: FimDoTour) => void
}) {
  const [lista, setLista] = useState<PassoDoTour[] | null>(null)
  const [i, setI] = useState(0)
  const [alvo, setAlvo] = useState<Retangulo | null>(null)
  const [tela, setTela] = useState<Tamanho>({ width: 1024, height: 768 })
  const [balao, setBalao] = useState<Tamanho>({ width: 344, height: 190 })
  const cartao = useRef<HTMLDivElement>(null)
  const terminar = useRef(aoTerminar)
  const id = useId()

  useEffect(() => { terminar.current = aoTerminar }, [aoTerminar])

  // Os passos opcionais cujo alvo não está na tela saem antes de começar
  // (a contagem "2 de 5" precisa ser a de verdade).
  useEffect(() => {
    const anterior = document.activeElement instanceof HTMLElement ? document.activeElement : null
    const visiveis = passos.filter((p) => p.seAusente !== 'pular' || acharAlvo(p.alvo))
    if (!visiveis.length) terminar.current('concluido')
    // eslint-disable-next-line react-hooks/set-state-in-effect -- depende do DOM, que só existe aqui
    else setLista(visiveis)
    return () => { if (anterior?.isConnected) anterior.focus({ preventScroll: true }) }
  }, [passos])

  const passo = lista?.[i]
  const total = lista?.length ?? 0
  const ultimo = i === total - 1

  // Acha o alvo do passo, rola até ele e acompanha a posição (rolagem suave,
  // redimensionar a janela, a lista que carrega e empurra o elemento).
  useEffect(() => {
    if (!passo) return
    const el = acharAlvo(passo.alvo)
    const reduzido = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    if (el) {
      const r = el.getBoundingClientRect()
      const cabe = r.top >= 64 && r.bottom <= window.innerHeight - 16
      if (!cabe) el.scrollIntoView({ block: 'center', inline: 'nearest', behavior: reduzido ? 'auto' : 'smooth' })
    }
    let quadro = 0
    const medir = () => {
      cancelAnimationFrame(quadro)
      quadro = requestAnimationFrame(() => {
        setTela({ width: window.innerWidth, height: window.innerHeight })
        const r = el?.isConnected ? el.getBoundingClientRect() : null
        setAlvo(r && estaNaTela(r, { width: window.innerWidth, height: window.innerHeight }) ? { top: r.top, left: r.left, width: r.width, height: r.height } : null)
      })
    }
    medir()
    // A rolagem suave anda por vários quadros: mede junto até ela assentar.
    const fim = performance.now() + 900
    let laco = 0
    const acompanhar = () => { medir(); if (performance.now() < fim) laco = requestAnimationFrame(acompanhar) }
    laco = requestAnimationFrame(acompanhar)
    const observador = el ? new ResizeObserver(medir) : null
    if (el) observador?.observe(el)
    window.addEventListener('resize', medir)
    window.addEventListener('scroll', medir, true)
    return () => {
      cancelAnimationFrame(quadro)
      cancelAnimationFrame(laco)
      observador?.disconnect()
      window.removeEventListener('resize', medir)
      window.removeEventListener('scroll', medir, true)
    }
  }, [passo])

  // O foco vai para o balão a cada passo: o leitor de tela lê o passo novo.
  useEffect(() => {
    if (passo) cartao.current?.focus({ preventScroll: true })
  }, [passo])

  // O tamanho real do balão (o texto muda de passo para passo) antes de pintar.
  useLayoutEffect(() => {
    const r = cartao.current?.getBoundingClientRect()
    if (r && (Math.abs(r.width - balao.width) > 1 || Math.abs(r.height - balao.height) > 1)) setBalao({ width: r.width, height: r.height })
  }, [passo, alvo, tela, balao.width, balao.height])

  const avancar = useCallback(() => {
    if (!lista) return
    if (i >= lista.length - 1) terminar.current('concluido')
    else setI(i + 1)
  }, [i, lista])
  const voltar = useCallback(() => setI((n) => Math.max(0, n - 1)), [])

  useEffect(() => {
    if (!lista) return
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); terminar.current('pulado'); return }
      if (e.key === 'ArrowRight') { e.preventDefault(); avancar(); return }
      if (e.key === 'ArrowLeft') { e.preventDefault(); voltar(); return }
      if (e.key === 'Enter' && e.target === cartao.current) { e.preventDefault(); avancar(); return }
      if (e.key === 'Tab' && cartao.current) {
        // Foco preso no balão: a página atrás está coberta.
        const focaveis = [...cartao.current.querySelectorAll<HTMLElement>('button:not([disabled])')]
        if (!focaveis.length) return
        const primeiro = focaveis[0]
        const derradeiro = focaveis[focaveis.length - 1]
        const ativo = document.activeElement
        if (e.shiftKey && (ativo === primeiro || ativo === cartao.current)) { e.preventDefault(); derradeiro.focus() }
        else if (!e.shiftKey && (ativo === derradeiro || !cartao.current.contains(ativo))) { e.preventDefault(); primeiro.focus() }
      }
    }
    document.addEventListener('keydown', onKeyDown, true)
    return () => document.removeEventListener('keydown', onKeyDown, true)
  }, [lista, avancar, voltar])

  if (!passo || typeof document === 'undefined') return null

  const posicao = posicionarBalao({ alvo, balao, tela, preferido: passo.lado })
  const luz = alvo ? recorte(alvo, tela) : null
  const estilo: React.CSSProperties | undefined = posicao.modo === 'ancorado' ? { top: posicao.top, left: posicao.left } : undefined

  return createPortal(
    <div data-tour-aberto="">
      {/* Pega os cliques da página. Sem alvo, é ele que escurece a tela toda. */}
      <div className={cn('fixed inset-0 z-[70]', !luz && 'bg-black/55')} aria-hidden="true" />
      {luz && (
        <div
          aria-hidden="true"
          className="pointer-events-none fixed z-[70] rounded-xl ring-2 ring-white/90 transition-[top,left,width,height] duration-200 ease-out motion-reduce:transition-none"
          style={{ top: luz.top, left: luz.left, width: luz.width, height: luz.height, boxShadow: '0 0 0 9999px rgb(12 12 12 / 0.55)' }}
        />
      )}
      <div
        ref={cartao}
        role="dialog"
        aria-modal="true"
        aria-labelledby={`${id}-titulo`}
        aria-describedby={`${id}-texto`}
        tabIndex={-1}
        style={estilo}
        className={cn(
          'fixed z-[71] flex flex-col gap-2 rounded-2xl border border-border bg-popover p-4 text-popover-foreground shadow-2xl outline-none',
          'transition-[top,left] duration-200 ease-out motion-reduce:transition-none',
          posicao.modo === 'ancorado' && 'w-[min(344px,calc(100vw-24px))]',
          posicao.modo === 'centro' && 'left-1/2 top-1/2 w-[min(400px,calc(100vw-24px))] -translate-x-1/2 -translate-y-1/2',
          posicao.modo === 'embaixo' && 'inset-x-3 bottom-[max(0.75rem,env(safe-area-inset-bottom))] mx-auto max-w-[480px]',
          posicao.modo === 'em-cima' && 'inset-x-3 top-[max(0.75rem,env(safe-area-inset-top))] mx-auto max-w-[480px]',
        )}
      >
        <div className="flex items-start gap-3">
          <p className="min-w-0 flex-1 pt-1 text-[11px] font-semibold uppercase tracking-wider text-primary">{rotulo}</p>
          <button
            type="button"
            onClick={() => terminar.current('pulado')}
            aria-label="Fechar o tour"
            className="-mr-1.5 -mt-1.5 inline-flex size-9 shrink-0 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring"
          >
            <X className="size-4" aria-hidden="true" />
          </button>
        </div>
        <h2 id={`${id}-titulo`} className="text-base font-semibold leading-snug">{passo.titulo}</h2>
        <p id={`${id}-texto`} className="text-sm leading-relaxed text-muted-foreground">{passo.texto}</p>
        <div className="mt-2 flex items-center gap-3">
          <span className="text-xs tabular-nums text-muted-foreground">{i + 1} de {total}</span>
          <span className="hidden gap-1 sm:flex" aria-hidden="true">
            {lista!.map((p, n) => <span key={n} className={cn('size-1.5 rounded-full', n === i ? 'bg-primary' : 'bg-border')} />)}
          </span>
          <div className="ml-auto flex gap-2">
            {i > 0 && (
              <Button type="button" variant="outline" onClick={voltar} className="h-10 px-3 sm:h-9">
                <ArrowLeft aria-hidden="true" />Voltar
              </Button>
            )}
            <Button type="button" onClick={avancar} className="h-10 px-4 sm:h-9">
              {ultimo ? <><Check aria-hidden="true" />Concluir</> : <>Próximo<ArrowRight aria-hidden="true" /></>}
            </Button>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  )
}

/** O primeiro elemento marcado que está de fato na tela (o menu do celular fechado não conta). */
export function acharAlvo(alvo: string | undefined): HTMLElement | null {
  if (!alvo || typeof document === 'undefined') return null
  const tela = { width: window.innerWidth, height: window.innerHeight }
  for (const el of document.querySelectorAll<HTMLElement>(`[data-ajuda="${CSS.escape(alvo)}"]`)) {
    if (el.closest('[inert], [aria-hidden="true"], [hidden]')) continue
    if (getComputedStyle(el).visibility === 'hidden') continue
    if (estaNaTela(el.getBoundingClientRect(), tela)) return el
  }
  return null
}
