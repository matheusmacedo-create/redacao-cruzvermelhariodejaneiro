'use client'

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { ExternalLink, X } from 'lucide-react'
import type { ArestaDoGrafo, NoDoGrafo, TipoDeNo } from '@/lib/cerebro/grafo'
import { MOTIVOS_RECUSA, type MotivoRecusa } from '@/lib/cerebro/contrato'
import { cn } from '@/lib/utils'

/**
 * O mapa do Cérebro — um grafo de força estilo Obsidian, em SVG puro.
 *
 * Sem biblioteca: a simulação (molas nas arestas + repulsão + gravidade)
 * roda num requestAnimationFrame e escreve posição direto nos elementos via
 * ref — re-renderizar React a cada quadro com centenas de nós não
 * sobreviveria. React cuida do que é raro: estrutura, filtros, foco,
 * seleção e o painel lateral.
 *
 * As cores saem dos tokens do tema (var(--...)): o mapa pertence ao mesmo
 * sistema visual do resto da Redação.
 */

const COR: Record<TipoDeNo, string> = {
  eixo: 'var(--primary)',
  conta: 'var(--info)',
  fonte: 'var(--muted-foreground)',
  sinal: 'var(--foreground)',
  data: 'var(--warning)',
  proposta: 'oklch(0.62 0.16 300)',
  pacote: 'var(--success)',
  canal: 'oklch(0.3 0 0)',
}

const ROTULO_TIPO: Record<TipoDeNo, string> = {
  eixo: 'Eixo',
  conta: 'Conta observada',
  fonte: 'Fonte documental',
  sinal: 'Sinal',
  data: 'Data do calendário',
  proposta: 'Proposta',
  pacote: 'Pacote no hub',
  canal: 'Canal publicado',
}

// No servidor o layout effect não existe e o React avisa; cair para o
// useEffect ali é inofensivo porque nada é pintado no servidor mesmo.
const useLayoutEffectSeguro = typeof window !== 'undefined' ? useLayoutEffect : useEffect

interface Simulado extends NoDoGrafo {
  x: number
  y: number
  vx: number
  vy: number
  raio: number
  preso: boolean
}

export function GrafoDoCerebro({ nos, arestas }: { nos: NoDoGrafo[]; arestas: ArestaDoGrafo[] }) {
  const [ocultos, setOcultos] = useState<Set<TipoDeNo>>(new Set())
  const [busca, setBusca] = useState('')
  const [focoId, setFocoId] = useState<string | null>(null)
  const [selecionado, setSelecionado] = useState<NoDoGrafo | null>(null)

  // O recorte visível: esconder um tipo esconde também as arestas dele.
  const { visiveis, arestasVisiveis, vizinhos, grau } = useMemo(() => {
    const visiveis = nos.filter((n) => !ocultos.has(n.tipo))
    const ids = new Set(visiveis.map((n) => n.id))
    const arestasVisiveis = arestas.filter((a) => ids.has(a.de) && ids.has(a.para))
    const vizinhos = new Map<string, Set<string>>()
    const grau = new Map<string, number>()
    for (const a of arestasVisiveis) {
      if (!vizinhos.has(a.de)) vizinhos.set(a.de, new Set())
      if (!vizinhos.has(a.para)) vizinhos.set(a.para, new Set())
      vizinhos.get(a.de)!.add(a.para)
      vizinhos.get(a.para)!.add(a.de)
      grau.set(a.de, (grau.get(a.de) ?? 0) + 1)
      grau.set(a.para, (grau.get(a.para) ?? 0) + 1)
    }
    return { visiveis, arestasVisiveis, vizinhos, grau }
  }, [nos, arestas, ocultos])

  const batem = useMemo(() => {
    const q = busca.trim().toLowerCase()
    if (!q) return null
    return new Set(visiveis.filter((n) => n.rotulo.toLowerCase().includes(q)).map((n) => n.id))
  }, [busca, visiveis])

  const emFoco = useMemo(() => {
    if (!focoId) return null
    const conjunto = new Set([focoId])
    for (const v of vizinhos.get(focoId) ?? []) conjunto.add(v)
    return conjunto
  }, [focoId, vizinhos])

  return (
    <div className="flex h-full min-h-0 flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <input
          type="search"
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          placeholder="Buscar no mapa…"
          className="h-9 w-56 rounded-lg border border-border bg-card px-3 text-sm outline-none focus:border-primary"
        />
        {(Object.keys(ROTULO_TIPO) as TipoDeNo[])
          .filter((t) => nos.some((n) => n.tipo === t))
          .map((t) => (
            <button
              key={t}
              type="button"
              onClick={() =>
                setOcultos((antes) => {
                  const prox = new Set(antes)
                  if (prox.has(t)) prox.delete(t)
                  else prox.add(t)
                  return prox
                })
              }
              className={cn(
                'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium',
                ocultos.has(t)
                  ? 'border-border text-muted-foreground/50 line-through'
                  : 'border-border text-muted-foreground hover:bg-muted',
              )}
            >
              <span className="size-2 rounded-full" style={{ background: COR[t] }} />
              {ROTULO_TIPO[t]}
              <span className="tabular-nums text-muted-foreground/70">
                {nos.filter((n) => n.tipo === t).length}
              </span>
            </button>
          ))}
      </div>

      <div className="relative min-h-0 flex-1 overflow-hidden rounded-xl border border-border bg-card">
        <Tela
          nos={visiveis}
          arestas={arestasVisiveis}
          grau={grau}
          emFoco={emFoco}
          batem={batem}
          aoFocar={setFocoId}
          aoSelecionar={setSelecionado}
        />
        {selecionado && (
          <Painel
            no={selecionado}
            vizinhos={[...(vizinhos.get(selecionado.id) ?? [])]
              .map((id) => visiveis.find((n) => n.id === id))
              .filter((n): n is NoDoGrafo => Boolean(n))}
            fechar={() => setSelecionado(null)}
            abrir={setSelecionado}
          />
        )}
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* A tela: simulação e desenho, fora do ciclo do React                 */
/* ------------------------------------------------------------------ */

function Tela({
  nos,
  arestas,
  grau,
  emFoco,
  batem,
  aoFocar,
  aoSelecionar,
}: {
  nos: NoDoGrafo[]
  arestas: ArestaDoGrafo[]
  grau: Map<string, number>
  emFoco: Set<string> | null
  batem: Set<string> | null
  aoFocar: (id: string | null) => void
  aoSelecionar: (no: NoDoGrafo) => void
}) {
  const container = useRef<HTMLDivElement>(null)
  const centroRef = useRef<SVGGElement>(null)
  const gRef = useRef<SVGGElement>(null)
  const noRefs = useRef(new Map<string, SVGGElement>())
  const arestaRefs = useRef(new Map<number, SVGLineElement>())
  const camera = useRef({ x: 0, y: 0, k: 1 })

  const posicoes = useRef(new Map<string, { x: number; y: number }>())
  const sim = useRef<{ nos: Simulado[]; porId: Map<string, Simulado>; alpha: number }>({
    nos: [],
    porId: new Map(),
    alpha: 0,
  })

  // A simulação inteira vive dentro do efeito: os objetos que a física muta
  // a cada quadro nascem aqui, nunca no render — o React desenha a
  // estrutura uma vez e o laço escreve transform/x1/y1 direto no DOM.
  // Quem sobreviveu a um filtro recupera a posição; quem entra nasce na
  // posição determinística do hash, a mesma do primeiro quadro do render.
  useEffect(() => {
    const simulados: Simulado[] = nos.map((n) => {
      const antes = posicoes.current.get(n.id)
      const inicio = posInicial(n.id)
      return {
        ...n,
        x: antes?.x ?? inicio.x,
        y: antes?.y ?? inicio.y,
        vx: 0,
        vy: 0,
        raio: raioDe(n, grau.get(n.id) ?? 0),
        preso: false,
      }
    })
    sim.current = { nos: simulados, porId: new Map(simulados.map((s) => [s.id, s])), alpha: 1 }
    let vivo = true
    let quadro: number

    const desenhar = () => {
      const s = sim.current
      for (const n of s.nos) {
        posicoes.current.set(n.id, { x: n.x, y: n.y })
        const el = noRefs.current.get(n.id)
        if (el) el.setAttribute('transform', `translate(${n.x},${n.y})`)
      }
      arestas.forEach((a, i) => {
        const el = arestaRefs.current.get(i)
        const de = s.porId.get(a.de)
        const para = s.porId.get(a.para)
        if (el && de && para) {
          el.setAttribute('x1', String(de.x))
          el.setAttribute('y1', String(de.y))
          el.setAttribute('x2', String(para.x))
          el.setAttribute('y2', String(para.y))
        }
      })
    }

    const tick = () => {
      if (!vivo) return
      const s = sim.current
      if (s.alpha > 0.005) {
        passo(s.nos, arestas, s.porId, grau, s.alpha)
        s.alpha *= 0.985
        desenhar()
      }
      quadro = requestAnimationFrame(tick)
    }

    desenhar()
    quadro = requestAnimationFrame(tick)
    return () => {
      vivo = false
      cancelAnimationFrame(quadro)
    }
  }, [nos, grau, arestas])

  // Centro do palco no meio do contêiner, acompanhando redimensionamento.
  // Layout effect: centrar depois da primeira pintura mostraria o grafo no
  // canto por um quadro.
  useLayoutEffectSeguro(() => {
    const el = container.current
    if (!el) return
    const centrar = () => {
      const caixa = el.getBoundingClientRect()
      centroRef.current?.setAttribute('transform', `translate(${caixa.width / 2},${caixa.height / 2})`)
    }
    centrar()
    const observador = new ResizeObserver(centrar)
    observador.observe(el)
    return () => observador.disconnect()
  }, [])

  const aplicarCamera = () => {
    const c = camera.current
    gRef.current?.setAttribute('transform', `translate(${c.x},${c.y}) scale(${c.k})`)
  }

  // Zoom na roda. onWheel do React é passivo — o listener entra pelo ref
  // com {passive: false}, o mesmo caminho do recorte de avatar do Perfil.
  useEffect(() => {
    const el = container.current
    if (!el) return
    const aoRolar = (e: WheelEvent) => {
      e.preventDefault()
      const caixa = el.getBoundingClientRect()
      const mx = e.clientX - caixa.left - caixa.width / 2
      const my = e.clientY - caixa.top - caixa.height / 2
      const c = camera.current
      const fator = Math.exp(-e.deltaY * 0.0015)
      const k = Math.min(4, Math.max(0.25, c.k * fator))
      // O ponto sob o cursor fica parado enquanto o resto escala.
      c.x = mx - ((mx - c.x) * k) / c.k
      c.y = my - ((my - c.y) * k) / c.k
      c.k = k
      aplicarCamera()
    }
    el.addEventListener('wheel', aoRolar, { passive: false })
    return () => el.removeEventListener('wheel', aoRolar)
  })

  // `ativo` diz que ESTE gesto começou aqui — sem ele, um botão pressionado
  // vindo de fora reaproveitaria a origem de um arrasto antigo e a câmera
  // saltaria. `moveu` separa arrasto de clique: soltar depois de arrastar
  // não pode abrir o painel.
  const arrasto = useRef<{
    ativo: boolean
    moveu: boolean
    id: string | null
    x: number
    y: number
    baseX: number
    baseY: number
  }>({ ativo: false, moveu: false, id: null, x: 0, y: 0, baseX: 0, baseY: 0 })

  const aoDescerNoFundo = (e: React.PointerEvent) => {
    if (e.button !== 0) return
    e.currentTarget.setPointerCapture(e.pointerId)
    arrasto.current = {
      ativo: true,
      moveu: false,
      id: null,
      x: e.clientX,
      y: e.clientY,
      baseX: camera.current.x,
      baseY: camera.current.y,
    }
  }

  const aoDescerNoNo = (e: React.PointerEvent, id: string) => {
    const n = sim.current.porId.get(id)
    if (!n) return
    e.stopPropagation()
    ;(e.currentTarget as SVGGElement).setPointerCapture(e.pointerId)
    n.preso = true
    arrasto.current = {
      ativo: true,
      moveu: false,
      id,
      x: e.clientX,
      y: e.clientY,
      baseX: n.x,
      baseY: n.y,
    }
  }

  const aoMover = (e: React.PointerEvent) => {
    const a = arrasto.current
    if (!a.ativo || !e.buttons) return
    const dx = e.clientX - a.x
    const dy = e.clientY - a.y
    if (Math.abs(dx) + Math.abs(dy) > 3) a.moveu = true
    if (a.id) {
      const n = sim.current.porId.get(a.id)
      if (n) {
        n.x = a.baseX + dx / camera.current.k
        n.y = a.baseY + dy / camera.current.k
        // O arrasto reaquece a simulação: os vizinhos acompanham.
        sim.current.alpha = Math.max(sim.current.alpha, 0.3)
      }
    } else {
      camera.current.x = a.baseX + dx
      camera.current.y = a.baseY + dy
      aplicarCamera()
    }
  }

  const aoSoltar = () => {
    const a = arrasto.current
    if (a.id) {
      const n = sim.current.porId.get(a.id)
      if (n) n.preso = false
    }
    a.id = null
    a.ativo = false
    // `moveu` sobrevive até o próximo gesto: o onClick que dispara depois
    // deste pointerup ainda precisa saber que houve arrasto.
  }

  const apagado = (id: string) =>
    (emFoco !== null && !emFoco.has(id)) || (batem !== null && !batem.has(id))

  return (
    <div
      ref={container}
      className="h-full w-full cursor-grab touch-none select-none"
      onPointerDown={aoDescerNoFundo}
      onPointerMove={aoMover}
      onPointerUp={aoSoltar}
      onPointerCancel={aoSoltar}
    >
      <svg className="h-full w-full" role="img" aria-label="Mapa de ligações do Cérebro">
        <g ref={centroRef}>
          <g ref={gRef}>
            {arestas.map((a, i) => {
              // Sem pontas no JSX toda linha nasceria colapsada em (0,0) até
              // o primeiro desenhar(); as posições determinísticas dos nós
              // valem para as arestas também.
              const de = posInicial(a.de)
              const para = posInicial(a.para)
              return (
                <line
                  key={`${a.de}→${a.para}:${i}`}
                  ref={(el) => {
                    if (el) arestaRefs.current.set(i, el)
                    else arestaRefs.current.delete(i)
                  }}
                  x1={de.x}
                  y1={de.y}
                  x2={para.x}
                  y2={para.y}
                  stroke="var(--border)"
                  strokeWidth={a.tipo === 'importou' || a.tipo === 'saiu' ? 1.6 : 0.8}
                  strokeDasharray={a.tipo === 'sugere' || a.tipo === 'marca' ? '3 3' : undefined}
                  opacity={emFoco ? (emFoco.has(a.de) && emFoco.has(a.para) ? 0.9 : 0.12) : 0.7}
                  // Sem a transição, varrer o mouse faz o mapa inteiro
                  // estalar entre aceso e apagado a cada nó atravessado.
                  style={{ transition: 'opacity 150ms ease' }}
                />
              )
            })}
            {nos.map((n) => {
              const inicio = posInicial(n.id)
              const raio = raioDe(n, grau.get(n.id) ?? 0)
              return (
                <g
                  key={n.id}
                  ref={(el) => {
                    if (el) noRefs.current.set(n.id, el)
                    else noRefs.current.delete(n.id)
                  }}
                  transform={`translate(${inicio.x},${inicio.y})`}
                  style={{
                    cursor: 'pointer',
                    opacity: apagado(n.id) ? 0.15 : 1,
                    transition: 'opacity 150ms ease',
                  }}
                  onPointerDown={(e) => aoDescerNoNo(e, n.id)}
                  onPointerEnter={() => aoFocar(n.id)}
                  onPointerLeave={() => aoFocar(null)}
                  onClick={() => {
                    if (!arrasto.current.moveu) aoSelecionar(n)
                  }}
                >
                  <circle
                    r={raio}
                    fill={COR[n.tipo]}
                    fillOpacity={n.recusado || n.foraDoAcervo ? 0.35 : 0.9}
                    stroke={n.recusado ? 'var(--destructive)' : 'var(--card)'}
                    strokeWidth={n.recusado ? 1.5 : 1}
                    strokeDasharray={n.recusado ? '2 2' : undefined}
                  />
                  {(n.tipo === 'eixo' ||
                    n.tipo === 'canal' ||
                    n.tipo === 'conta' ||
                    (emFoco?.has(n.id) ?? false)) && (
                    <text
                      y={raio + 11}
                      textAnchor="middle"
                      fill="var(--muted-foreground)"
                      fontSize={n.tipo === 'eixo' ? 11 : 9}
                      fontWeight={n.tipo === 'eixo' ? 700 : 500}
                      style={{ pointerEvents: 'none' }}
                    >
                      {n.rotulo.length > 34 ? `${n.rotulo.slice(0, 33)}…` : n.rotulo}
                    </text>
                  )}
                </g>
              )
            })}
          </g>
        </g>
      </svg>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* Física                                                              */
/* ------------------------------------------------------------------ */

/** Um passo de força: molas nas arestas, repulsão entre todos, gravidade. */
function passo(
  nos: Simulado[],
  arestas: ArestaDoGrafo[],
  porId: Map<string, Simulado>,
  grau: Map<string, number>,
  alpha: number,
) {
  const DISTANCIA = 70
  const REPULSAO = 900

  for (const a of arestas) {
    const de = porId.get(a.de)
    const para = porId.get(a.para)
    if (!de || !para) continue
    const dx = para.x - de.x
    const dy = para.y - de.y
    const d = Math.max(1, Math.hypot(dx, dy))
    const alvo = DISTANCIA + de.raio + para.raio
    // Mola normalizada pelo grau, como no d3-force: um eixo com cinquenta
    // ligações não pode somar cinquenta puxões inteiros por quadro — a
    // integração diverge e o mapa inteiro é catapultado para fora da tela.
    // A intensidade divide pelo lado menos ligado e o viés faz o nó mais
    // ligado (o polo) mover menos que a folha.
    const grauDe = grau.get(a.de) || 1
    const grauPara = grau.get(a.para) || 1
    const puxao = (((d - alvo) / d) * alpha) / Math.min(grauDe, grauPara)
    const vies = grauDe / (grauDe + grauPara)
    para.vx -= dx * puxao * vies
    para.vy -= dy * puxao * vies
    de.vx += dx * puxao * (1 - vies)
    de.vy += dy * puxao * (1 - vies)
  }

  // Repulsão O(n²): com poucas centenas de nós isso é barato e o código
  // fica legível — Barnes-Hut aqui seria complexidade sem cliente.
  for (let i = 0; i < nos.length; i++) {
    const a = nos[i]
    for (let j = i + 1; j < nos.length; j++) {
      const b = nos[j]
      let dx = b.x - a.x
      let dy = b.y - a.y
      let d2 = dx * dx + dy * dy
      if (d2 > 90_000) continue
      if (d2 < 1) {
        // Empate exato de posição: separa por um passo determinístico.
        dx = ((hash(a.id) % 7) - 3) * 0.1 || 0.1
        dy = ((hash(b.id) % 7) - 3) * 0.1 || -0.1
        d2 = dx * dx + dy * dy
      }
      // O piso no denominador é o que impede a catapulta: dois centros a
      // ~1px sem teto de força chutariam o nó para fora da tela.
      const f = (REPULSAO / Math.max(d2, (a.raio + b.raio) ** 2)) * alpha
      const d = Math.sqrt(d2)
      const fx = (dx / d) * f
      const fy = (dy / d) * f
      a.vx -= fx
      a.vy -= fy
      b.vx += fx
      b.vy += fy
    }
  }

  for (const n of nos) {
    // Gravidade suave ao centro segura os desgarrados na tela.
    n.vx -= n.x * 0.003 * alpha
    n.vy -= n.y * 0.003 * alpha
    // Teto de velocidade: nenhuma força legítima precisa de mais que isso
    // num quadro. É o cinto de segurança contra qualquer divergência futura.
    const v = Math.hypot(n.vx, n.vy)
    if (v > 80) {
      n.vx = (n.vx / v) * 80
      n.vy = (n.vy / v) * 80
    }
    if (!n.preso) {
      n.x += n.vx
      n.y += n.vy
    }
    n.vx *= 0.6
    n.vy *= 0.6
  }
}

/** Hash determinístico do id — a posição inicial não pode sortear. */
function hash(texto: string): number {
  let h = 2166136261
  for (let i = 0; i < texto.length; i++) {
    h ^= texto.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return Math.abs(h)
}

/** Posição de nascimento, a mesma no render e na simulação. */
function posInicial(id: string): { x: number; y: number } {
  const semente = hash(id)
  return {
    x: Math.cos(semente % 6.283) * (180 + (semente % 240)),
    y: Math.sin(semente % 6.283) * (180 + ((semente >> 3) % 240)),
  }
}

/** O tamanho conta a história: eixo é polo, sinal cresce com a nota. */
function raioDe(n: NoDoGrafo, grau: number): number {
  if (n.tipo === 'eixo') return 16
  if (n.tipo === 'canal') return 10
  if (n.tipo === 'conta' || n.tipo === 'pacote') return 6 + Math.min(4, grau * 0.4)
  if (n.tipo === 'data' || n.tipo === 'proposta') return 4.5
  return 3 + Math.min(3.5, (n.nota ?? 0) / 30)
}

/* ------------------------------------------------------------------ */
/* Painel do nó selecionado                                            */
/* ------------------------------------------------------------------ */

function Painel({
  no,
  vizinhos,
  fechar,
  abrir,
}: {
  no: NoDoGrafo
  vizinhos: NoDoGrafo[]
  fechar: () => void
  abrir: (no: NoDoGrafo) => void
}) {
  return (
    <aside className="absolute inset-y-3 right-3 flex w-72 flex-col gap-2 overflow-y-auto rounded-xl border border-border bg-background/95 p-4 shadow-sm backdrop-blur">
      <div className="flex items-start justify-between gap-2">
        <span
          className="rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white"
          style={{ background: COR[no.tipo] }}
        >
          {ROTULO_TIPO[no.tipo]}
        </span>
        <button
          type="button"
          onClick={fechar}
          aria-label="Fechar"
          className="rounded p-1 text-muted-foreground hover:bg-muted"
        >
          <X className="size-4" />
        </button>
      </div>

      <h3 className="text-sm font-semibold leading-snug">{no.rotulo}</h3>

      <div className="space-y-1 text-xs text-muted-foreground">
        {no.modoRotulo && (
          <p>
            {no.modoRotulo}
            {typeof no.nota === 'number' ? ` · nota ${no.nota}/100` : ''}
          </p>
        )}
        {no.recusado && (
          <p className="text-destructive">
            Recusado pela equipe ({MOTIVOS_RECUSA[no.recusado as MotivoRecusa]?.rotulo ?? no.recusado}
            ).
          </p>
        )}
        {no.foraDoAcervo && <p>Fora da janela atual do Cérebro — mantido no mapa pela importação.</p>}
        {no.interna && <p>Fonte de uso interno: nunca vira conteúdo público.</p>}
        {typeof no.dias === 'number' && no.dias >= 0 && (
          <p>{no.dias === 0 ? 'É hoje.' : `Em ${no.dias} dia(s).`}</p>
        )}
        {no.status && <p>Status no hub: {no.status}.</p>}
        {no.agrupados ? <p>Agrupa mais {no.agrupados} boletim(ns) semelhante(s).</p> : null}
      </div>

      {no.url &&
        (no.url.startsWith('/') ? (
          <Link
            href={no.url}
            className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
          >
            Abrir na Redação
            <ExternalLink className="size-3" />
          </Link>
        ) : (
          <a
            href={no.url}
            target="_blank"
            rel="noreferrer noopener"
            className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
          >
            Ver no Cérebro
            <ExternalLink className="size-3" />
          </a>
        ))}

      {vizinhos.length > 0 && (
        <div className="mt-1 border-t border-border pt-2">
          <p className="mb-1 text-[10px] font-bold uppercase tracking-wide text-muted-foreground">
            Ligações ({vizinhos.length})
          </p>
          <ul className="space-y-1">
            {vizinhos.slice(0, 14).map((v) => (
              <li key={v.id}>
                <button
                  type="button"
                  onClick={() => abrir(v)}
                  className="flex w-full items-center gap-1.5 rounded px-1 py-0.5 text-left text-xs text-muted-foreground hover:bg-muted hover:text-foreground"
                >
                  <span
                    className="size-2 shrink-0 rounded-full"
                    style={{ background: COR[v.tipo] }}
                  />
                  <span className="truncate">{v.rotulo}</span>
                </button>
              </li>
            ))}
            {vizinhos.length > 14 && (
              <li className="px-1 text-[11px] text-muted-foreground/70">
                e mais {vizinhos.length - 14}…
              </li>
            )}
          </ul>
        </div>
      )}
    </aside>
  )
}
