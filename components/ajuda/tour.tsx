'use client'

import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { ArrowLeft, ArrowRight, Check, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import type { PassoDoTour } from '@/lib/ajuda/tipos'
import { estaNaTela, posicionarBalao, recorte, type Retangulo, type Tamanho } from '@/lib/ajuda/posicao'

export type FimDoTour = 'concluido' | 'pulado'

/** O balão ancorado antes da primeira medida de cada passo (344 px é a largura dele). */
const ESTIMATIVA_DO_BALAO: Tamanho = { width: 344, height: 190 }

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
export function Tour({ passos, rotulo, aoTerminar, focoDeVolta }: {
  passos: PassoDoTour[]
  /** Aparece acima do título: "Tour de Pautas", "Boas-vindas". */
  rotulo: string
  aoTerminar: (fim: FimDoTour) => void
  /**
   * Para onde o foco vai ao fechar quando o que o tinha na abertura não serve
   * mais: saiu da tela (o botão da dica, que some com o tour) ou era a página
   * inteira (o tour veio de um diálogo que já fechou, ou de um link). Sem
   * isto, o foco cai no começo da página e o teclado perde o lugar.
   */
  focoDeVolta?: () => HTMLElement | null
}) {
  const [lista, setLista] = useState<PassoDoTour[] | null>(null)
  const [i, setI] = useState(0)
  const [alvo, setAlvo] = useState<Retangulo | null>(null)
  const [tela, setTela] = useState<Tamanho>({ width: 1024, height: 768 })
  // A medida do balão ancorado, com o passo em que foi tirada (outro passo, outro texto: vale a estimativa).
  const [medida, setMedida] = useState<{ de: PassoDoTour; tamanho: Tamanho } | null>(null)
  const cartao = useRef<HTMLDivElement>(null)
  const terminar = useRef(aoTerminar)
  const volta = useRef(focoDeVolta)
  const id = useId()

  useEffect(() => { terminar.current = aoTerminar }, [aoTerminar])
  useEffect(() => { volta.current = focoDeVolta }, [focoDeVolta])

  // Os passos opcionais cujo alvo não está na tela saem antes de começar
  // (a contagem "2 de 5" precisa ser a de verdade).
  useEffect(() => {
    const anterior = document.activeElement instanceof HTMLElement ? document.activeElement : null
    const visiveis = passos.filter((p) => p.seAusente !== 'pular' || acharAlvo(p.alvo))
    if (!visiveis.length) terminar.current('concluido')
    // eslint-disable-next-line react-hooks/set-state-in-effect -- depende do DOM, que só existe aqui
    else setLista(visiveis)
    return () => {
      const destino = anterior?.isConnected && anterior !== document.body ? anterior : volta.current?.()
      destino?.focus({ preventScroll: true })
    }
  }, [passos])

  const passo = lista?.[i]
  const total = lista?.length ?? 0
  const ultimo = i === total - 1

  // Acha o alvo do passo, rola até ele e acompanha a posição (rolagem suave,
  // redimensionar a janela, a lista que carrega e empurra o elemento).
  useEffect(() => {
    if (!passo) return
    const alvoDoPasso = passo.alvo
    let el = acharAlvo(alvoDoPasso)
    const reduzido = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    if (el) {
      const r = el.getBoundingClientRect()
      const cabeEmPe = r.top >= 64 && r.bottom <= window.innerHeight - 16
      // De lado: o alvo numa faixa que rola na horizontal (as abas no celular) pode estar à direita, fora da tela.
      const cabeDeLado = r.width > window.innerWidth || (r.left >= 0 && r.right <= window.innerWidth)
      // Mais alto que a tela (a prova inteira, o formulário do perfil), o alvo
      // vai com o começo para o alto: centralizado, mostrava o meio dele (a
      // questão 3 de 5) e escondia o que o texto do passo descreve.
      const alto = r.height > window.innerHeight - 96
      if (!cabeEmPe || !cabeDeLado) el.scrollIntoView({ block: cabeEmPe ? 'nearest' : alto ? 'start' : 'center', inline: 'nearest', behavior: reduzido ? 'auto' : 'smooth' })
    }
    let quadro = 0
    const observador = new ResizeObserver(medir)
    if (el) observador.observe(el)
    // Os estados só mudam quando a medida muda: medir a cada quadro e a cada
    // rolagem (de qualquer elemento) não pode redesenhar o tour à toa.
    function medirAgora() {
      // O React pode trocar o nó no meio do passo (a lista recarregou, chegou
      // algo pelo tempo real, um Suspense resolveu): procura o alvo de novo,
      // senão o balão ia para o centro e ficava lá até o passo seguinte.
      if (!el?.isConnected) {
        observador.disconnect()
        el = acharAlvo(alvoDoPasso)
        if (el) observador.observe(el)
      }
      const agora = { width: window.innerWidth, height: window.innerHeight }
      setTela((antes) => (antes.width === agora.width && antes.height === agora.height ? antes : agora))
      const r = el ? el.getBoundingClientRect() : null
      const novo = r && estaNaTela(r, agora) ? { top: r.top, left: r.left, width: r.width, height: r.height } : null
      setAlvo((antes) => (mesmoRetangulo(antes, novo) ? antes : novo))
    }
    function medir() {
      cancelAnimationFrame(quadro)
      quadro = requestAnimationFrame(medirAgora)
    }
    medir()
    // A rolagem suave anda por vários quadros, e o que empurra o alvo sem
    // rolar nada (a lista que chega em cima dele) não dispara evento: mede a
    // cada quadro por um tempo. Sem mudança, nenhum quadro redesenha.
    const fim = performance.now() + 900
    let laco = 0
    const acompanhar = () => { medirAgora(); if (performance.now() < fim) laco = requestAnimationFrame(acompanhar) }
    laco = requestAnimationFrame(acompanhar)
    window.addEventListener('resize', medir)
    window.addEventListener('scroll', medir, true)
    return () => {
      cancelAnimationFrame(quadro)
      cancelAnimationFrame(laco)
      observador.disconnect()
      window.removeEventListener('resize', medir)
      window.removeEventListener('scroll', medir, true)
    }
  }, [passo])

  // O foco vai para o balão a cada passo: o leitor de tela lê o passo novo.
  // Confere de novo no quadro seguinte: um diálogo que fecha junto com a
  // abertura do tour (o painel "?", as boas-vindas) devolve o foco a quem o
  // abriu num microtask — depois deste efeito — e o balão ficaria sem ele.
  useEffect(() => {
    if (!passo) return
    cartao.current?.focus({ preventScroll: true })
    const quadro = requestAnimationFrame(() => {
      const el = cartao.current
      if (el && !el.contains(document.activeElement)) el.focus({ preventScroll: true })
    })
    return () => cancelAnimationFrame(quadro)
  }, [passo])

  const balao = medida && medida.de === passo ? medida.tamanho : ESTIMATIVA_DO_BALAO
  const posicao = passo ? posicionarBalao({ alvo, balao, tela, preferido: passo.lado }) : null
  const modo = posicao?.modo

  // O tamanho real do balão ancorado (o texto muda de passo para passo), antes
  // de pintar. Só o ancorado é medido: a folha (até 480 px) e o centro (400 px)
  // têm outra largura e outra altura, e medir neles fazia o balão alternar sem
  // fim entre "cabe ao lado" (medido na folha, mais baixo) e "não cabe"
  // (medido ancorado, mais alto) — o React desistia com "Maximum update depth"
  // e o tour sumia (alvo grande, como a grade do Calendário).
  useLayoutEffect(() => {
    if (modo !== 'ancorado' || !passo) return
    const r = cartao.current?.getBoundingClientRect()
    if (r && (Math.abs(r.width - balao.width) > 1 || Math.abs(r.height - balao.height) > 1)) setMedida({ de: passo, tamanho: { width: r.width, height: r.height } })
  }, [passo, modo, alvo, tela, balao.width, balao.height])

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

  if (!passo || !posicao || typeof document === 'undefined') return null

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
            className="-mr-2 -mt-2 inline-flex size-11 shrink-0 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring sm:-mr-1.5 sm:-mt-1.5 sm:size-9"
          >
            <X className="size-4" aria-hidden="true" />
          </button>
        </div>
        <h2 id={`${id}-titulo`} className="text-base font-semibold leading-snug">{passo.titulo}</h2>
        <p id={`${id}-texto`} className="text-sm leading-relaxed text-muted-foreground">{passo.texto}</p>
        {/* Só o "2 de 7", sem bolinhas: no balão de 344 px, as bolinhas, o "Voltar" e o
            "Próximo" não cabem juntos e espremiam o contador em três linhas. */}
        <div className="mt-2 flex items-center gap-3">
          <span className="shrink-0 whitespace-nowrap text-xs tabular-nums text-muted-foreground">{i + 1} de {total}</span>
          <div className="ml-auto flex gap-2">
            {i > 0 && (
              <Button type="button" variant="outline" onClick={voltar} className="h-11 px-3 sm:h-9">
                <ArrowLeft aria-hidden="true" />Voltar
              </Button>
            )}
            <Button type="button" onClick={avancar} className="h-11 px-4 sm:h-9">
              {ultimo ? <><Check aria-hidden="true" />Concluir</> : <>Próximo<ArrowRight aria-hidden="true" /></>}
            </Button>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  )
}

/**
 * O primeiro elemento marcado que está de fato na tela (o que está escondido
 * ou empurrado para fora dela não conta) — ou que dá para trazer rolando de
 * lado: numa faixa com rolagem horizontal, como as pastas da Caixa de
 * entrada no celular, o último item fica à direita, fora da tela.
 */
export function acharAlvo(alvo: string | undefined): HTMLElement | null {
  if (!alvo || typeof document === 'undefined') return null
  const tela = { width: window.innerWidth, height: window.innerHeight }
  for (const el of document.querySelectorAll<HTMLElement>(`[data-ajuda="${CSS.escape(alvo)}"]`)) {
    if (el.closest('[inert], [aria-hidden="true"], [hidden]')) continue
    if (getComputedStyle(el).visibility === 'hidden') continue
    const r = el.getBoundingClientRect()
    if (estaNaTela(r, tela) || (r.width > 0 && r.height > 0 && rolaDeLado(el))) return el
  }
  return null
}

function mesmoRetangulo(a: Retangulo | null, b: Retangulo | null): boolean {
  if (!a || !b) return a === b
  return a.top === b.top && a.left === b.left && a.width === b.width && a.height === b.height
}

/** Algum antepassado rola na horizontal e tem para onde rolar? */
function rolaDeLado(el: HTMLElement): boolean {
  for (let pai = el.parentElement; pai && pai !== document.body; pai = pai.parentElement) {
    const { overflowX } = getComputedStyle(pai)
    if ((overflowX === 'auto' || overflowX === 'scroll') && pai.scrollWidth > pai.clientWidth) return true
  }
  return false
}
