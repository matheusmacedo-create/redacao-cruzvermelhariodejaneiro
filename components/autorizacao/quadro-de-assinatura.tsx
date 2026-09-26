'use client'

import { useEffect, useRef } from 'react'
import { Eraser } from 'lucide-react'
import { botaoFantasma } from '@/components/membro/marca'
import type { Tracos } from '@/lib/imagem/regras'

/**
 * O quadro onde a pessoa assina com o dedo, a caneta ou o mouse. Guarda os
 * traços com coordenadas de 0 a 1000 (independe do tamanho da tela) e avisa
 * a cada traço terminado.
 */
export function QuadroDeAssinatura({ id, onChange }: { id: string; onChange: (tracos: Tracos) => void }) {
  const tela = useRef<HTMLCanvasElement>(null)
  const tracos = useRef<Tracos>([])
  const desenhando = useRef(false)

  // Ajusta a resolução ao tamanho real (tela de retina) e redesenha ao girar o celular.
  useEffect(() => {
    const c = tela.current
    if (!c) return
    const ajustar = () => {
      const r = c.getBoundingClientRect()
      const dpr = window.devicePixelRatio || 1
      c.width = Math.round(r.width * dpr)
      c.height = Math.round(r.height * dpr)
      redesenhar()
    }
    ajustar()
    const obs = new ResizeObserver(ajustar)
    obs.observe(c)
    return () => obs.disconnect()
  }, [])

  function redesenhar() {
    const c = tela.current
    const ctx = c?.getContext('2d')
    if (!c || !ctx) return
    ctx.clearRect(0, 0, c.width, c.height)
    ctx.lineWidth = 2.5 * (window.devicePixelRatio || 1)
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
    ctx.strokeStyle = '#111'
    for (const t of tracos.current) {
      ctx.beginPath()
      t.forEach(([x, y], i) => { const px = (x / 1000) * c.width; const py = (y / 1000) * c.height; if (i) ctx.lineTo(px, py); else ctx.moveTo(px, py) })
      if (t.length === 1) ctx.lineTo((t[0][0] / 1000) * c.width + 0.1, (t[0][1] / 1000) * c.height)
      ctx.stroke()
    }
  }

  function ponto(e: React.PointerEvent<HTMLCanvasElement>): [number, number] {
    const r = e.currentTarget.getBoundingClientRect()
    const x = Math.min(1000, Math.max(0, ((e.clientX - r.left) / r.width) * 1000))
    const y = Math.min(1000, Math.max(0, ((e.clientY - r.top) / r.height) * 1000))
    return [Math.round(x), Math.round(y)]
  }

  function comecar(e: React.PointerEvent<HTMLCanvasElement>) {
    if (tracos.current.length >= 80) return
    e.currentTarget.setPointerCapture(e.pointerId)
    desenhando.current = true
    tracos.current.push([ponto(e)])
    redesenhar()
  }
  function mover(e: React.PointerEvent<HTMLCanvasElement>) {
    if (!desenhando.current) return
    const atual = tracos.current[tracos.current.length - 1]
    const p = ponto(e)
    const ultimo = atual[atual.length - 1]
    if (Math.abs(p[0] - ultimo[0]) + Math.abs(p[1] - ultimo[1]) < 3) return
    if (tracos.current.reduce((s, t) => s + t.length, 0) >= 6000) return
    atual.push(p)
    redesenhar()
  }
  function terminar() {
    if (!desenhando.current) return
    desenhando.current = false
    onChange(tracos.current.map((t) => [...t]))
  }
  function limpar() {
    tracos.current = []
    redesenhar()
    onChange([])
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="relative">
        <canvas
          id={id}
          ref={tela}
          aria-label="Quadro para assinar com o dedo ou o mouse"
          className="aspect-[3/1] w-full touch-none rounded-lg border-2 border-dashed border-input bg-white"
          onPointerDown={comecar}
          onPointerMove={mover}
          onPointerUp={terminar}
          onPointerCancel={terminar}
        />
        <span aria-hidden="true" className="pointer-events-none absolute inset-x-6 bottom-[22%] border-b border-muted-foreground/40" />
      </div>
      <button type="button" onClick={limpar} className={`${botaoFantasma} self-start`}>
        <Eraser className="size-4" aria-hidden="true" />Limpar e assinar de novo
      </button>
    </div>
  )
}
