'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { reais } from '@/lib/financeiro/regras'

type Ponto = { data: string; livre: number }

const curta = (d: string) => `${d.slice(8, 10)}/${d.slice(5, 7)}`
/** Passo "redondo" (1, 2, 2,5 ou 5 × 10ⁿ) para ~4 intervalos. */
function passoRedondo(intervalo: number): number {
  const bruto = intervalo / 4
  const potencia = 10 ** Math.floor(Math.log10(bruto))
  return ([1, 2, 2.5, 5, 10].find((m) => m * potencia >= bruto) ?? 10) * potencia
}

const compacto = (n: number) => (Math.abs(n) >= 1000 ? `${(n / 1000).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} mil` : n.toLocaleString('pt-BR', { maximumFractionDigits: 0 }))

/**
 * O saldo livre previsto para os próximos 90 dias. Uma série só (o título
 * diz qual), linha fina em cor neutra; a reserva mínima é uma referência
 * tracejada, e o zero, a linha de base. Passar o mouse (ou o dedo) mostra o
 * dia e o saldo; a tabela abaixo dá os mesmos números para leitor de tela.
 */
export function GraficoDePrevisao({ pontos, reserva }: { pontos: Ponto[]; reserva: number | null }) {
  const [foco, setFoco] = useState<number | null>(null)
  const svg = useRef<SVGSVGElement>(null)
  const caixa = useRef<HTMLDivElement>(null)
  // Desenha na largura real do espaço: o texto fica em 11px no celular e no computador.
  const [L, setL] = useState(720)
  useEffect(() => {
    const el = caixa.current
    if (!el) return
    const medir = () => setL(Math.max(280, Math.round(el.getBoundingClientRect().width)))
    medir()
    const ro = new ResizeObserver(medir)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])
  const A = 240, esq = 52, dir = 12, topo = 16, base = 28
  const { min, max, x, y, caminho, ticks } = useMemo(() => {
    const valores = pontos.map((p) => p.livre).concat(reserva ?? 0, 0)
    let lo = Math.min(...valores), hi = Math.max(...valores)
    if (lo === hi) { lo -= 1; hi += 1 }
    const passo = passoRedondo(hi - lo)
    const min = Math.floor(lo / passo) * passo
    const max = Math.ceil(hi / passo) * passo
    const x = (i: number) => esq + (i / Math.max(1, pontos.length - 1)) * (L - esq - dir)
    const y = (v: number) => topo + (1 - (v - min) / (max - min)) * (A - topo - base)
    const caminho = pontos.map((p, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(p.livre).toFixed(1)}`).join('')
    const ticks: number[] = []
    for (let v = min; v <= max + passo / 2; v += passo) ticks.push(Math.round(v * 100) / 100)
    return { min, max, x, y, caminho, ticks }
  }, [pontos, reserva, L])
  if (!pontos.length) return null

  const mover = (clientX: number) => {
    const r = svg.current?.getBoundingClientRect()
    if (!r) return
    const px = ((clientX - r.left) / r.width) * L
    const i = Math.round(((px - esq) / (L - esq - dir)) * (pontos.length - 1))
    setFoco(Math.max(0, Math.min(pontos.length - 1, i)))
  }
  const f = foco !== null ? pontos[foco] : null
  const cada = L < 480 ? 30 : 15
  const semanas = pontos.filter((_, i) => i % cada === 0 || i === pontos.length - 1).filter((p, i, a) => i === a.length - 1 || pontos.indexOf(a[a.length - 1]) - pontos.indexOf(p) >= cada / 2)
  const minimo = pontos.reduce((m, p) => (p.livre < m.livre ? p : m), pontos[0])

  return (
    <figure className="flex flex-col gap-2" id="grafico-previsao">
      <div className="relative" ref={caixa}>
        <svg ref={svg} viewBox={`0 0 ${L} ${A}`} width={L} height={A} className="block max-w-full touch-none select-none" role="img"
          aria-label={`Saldo livre previsto de ${curta(pontos[0].data)} a ${curta(pontos[pontos.length - 1].data)}: começa em ${reais(pontos[0].livre)}, menor valor ${reais(minimo.livre)} em ${curta(minimo.data)}, termina em ${reais(pontos[pontos.length - 1].livre)}.`}
          onPointerMove={(e) => mover(e.clientX)} onPointerDown={(e) => mover(e.clientX)} onPointerLeave={() => setFoco(null)}>
          {ticks.map((v) => (
            <g key={v}>
              <line x1={esq} x2={L - dir} y1={y(v)} y2={y(v)} stroke="var(--border)" strokeWidth={1} />
              <text x={esq - 8} y={y(v)} textAnchor="end" dominantBaseline="middle" fontSize={11} fill="var(--muted-foreground)">{compacto(v)}</text>
            </g>
          ))}
          {min < 0 && max > 0 && <line x1={esq} x2={L - dir} y1={y(0)} y2={y(0)} stroke="var(--muted-foreground)" strokeWidth={1} />}
          {reserva !== null && reserva > 0 && (
            <g>
              <line x1={esq} x2={L - dir} y1={y(reserva)} y2={y(reserva)} stroke="var(--muted-foreground)" strokeWidth={1} strokeDasharray="4 4" />
              <text x={L - dir} y={y(reserva) - 6} textAnchor="end" fontSize={11} fill="var(--muted-foreground)">reserva mínima</text>
            </g>
          )}
          <path d={caminho} fill="none" stroke="var(--chart-4)" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
          {semanas.map((p) => {
            const i = pontos.indexOf(p)
            return <text key={p.data} x={x(i)} y={A - 8} textAnchor={i === 0 ? 'start' : i === pontos.length - 1 ? 'end' : 'middle'} fontSize={11} fill="var(--muted-foreground)">{curta(p.data)}</text>
          })}
          {f && foco !== null && (
            <g>
              <line x1={x(foco)} x2={x(foco)} y1={topo} y2={A - base} stroke="var(--muted-foreground)" strokeWidth={1} />
              <circle cx={x(foco)} cy={y(f.livre)} r={5} fill="var(--chart-4)" stroke="var(--card)" strokeWidth={2} />
            </g>
          )}
        </svg>
        {f && foco !== null && (
          <div className="pointer-events-none absolute top-1 rounded-lg border border-border bg-card px-2.5 py-1.5 text-xs shadow-sm"
            style={{ left: `${(x(foco) / L) * 100}%`, transform: `translateX(${foco > pontos.length / 2 ? 'calc(-100% - 8px)' : '8px'})` }} role="status">
            <span className="block text-muted-foreground">{curta(f.data)}</span>
            <span className={`font-semibold tabular-nums ${f.livre < 0 ? 'text-destructive' : ''}`}>{reais(f.livre)}</span>
          </div>
        )}
      </div>
      <details className="text-xs text-muted-foreground">
        <summary className="cursor-pointer">Ver em tabela</summary>
        <table className="mt-2 w-full max-w-sm text-left">
          <thead><tr><th className="py-1">Dia</th><th className="py-1 text-right">Saldo livre previsto</th></tr></thead>
          <tbody>{pontos.filter((_, i) => i % 7 === 0 || i === pontos.length - 1).map((p) => <tr key={p.data}><td className="py-0.5">{curta(p.data)}</td><td className="py-0.5 text-right tabular-nums">{reais(p.livre)}</td></tr>)}</tbody>
        </table>
      </details>
    </figure>
  )
}
