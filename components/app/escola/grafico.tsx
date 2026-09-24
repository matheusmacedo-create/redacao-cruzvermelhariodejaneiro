'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { mesCurto, mesPorExtenso, reaisDeCentavos } from '@/lib/escola/painel'

type Ponto = { mes: string; recebido: number }

function passoRedondo(intervalo: number): number {
  const bruto = intervalo / 4
  const potencia = 10 ** Math.floor(Math.log10(bruto))
  return ([1, 2, 2.5, 5, 10].find((m) => m * potencia >= bruto) ?? 10) * potencia
}
const compacto = (c: number) => {
  const n = c / 100
  return Math.abs(n) >= 1000 ? `${(n / 1000).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} mil` : n.toLocaleString('pt-BR', { maximumFractionDigits: 0 })
}

/**
 * Recebido por mês nos últimos 12 meses. Uma série (o título diz qual), em
 * barras finas com ponta arredondada presa à base; o mês aberto no painel
 * fica cheio e os outros, mais claros. Passar o mouse mostra o valor; clicar
 * abre o mês. A tabela abaixo dá os mesmos números para leitor de tela.
 */
export function GraficoMensal({ pontos, atual }: { pontos: Ponto[]; atual: string }) {
  const router = useRouter()
  const [foco, setFoco] = useState<number | null>(null)
  const caixa = useRef<HTMLDivElement>(null)
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
  const A = 220, esq = 52, dir = 8, topo = 12, base = 26
  const { max, ticks, y, largura, x } = useMemo(() => {
    const hi = Math.max(...pontos.map((p) => p.recebido), 100)
    const passo = passoRedondo(hi)
    const max = Math.ceil(hi / passo) * passo
    const ticks: number[] = []
    for (let v = 0; v <= max + passo / 2; v += passo) ticks.push(v)
    const y = (v: number) => topo + (1 - v / max) * (A - topo - base)
    const faixa = (L - esq - dir) / pontos.length
    const largura = Math.max(6, Math.min(28, faixa * 0.55))
    const x = (i: number) => esq + faixa * i + faixa / 2
    return { max, ticks, y, largura, x }
  }, [pontos, L])
  if (!pontos.length) return null
  const f = foco !== null ? pontos[foco] : null
  const total = pontos.reduce((s, p) => s + p.recebido, 0)

  return (
    <figure className="flex flex-col gap-2" id="grafico-mensal">
      <div className="relative" ref={caixa}>
        <svg viewBox={`0 0 ${L} ${A}`} width={L} height={A} className="block max-w-full select-none" role="img"
          aria-label={`Recebido por mês, de ${mesCurto(pontos[0].mes)} a ${mesCurto(pontos[pontos.length - 1].mes)}: ${reaisDeCentavos(total)} no total.`}
          onPointerLeave={() => setFoco(null)}>
          {ticks.map((v) => (
            <g key={v}>
              <line x1={esq} x2={L - dir} y1={y(v)} y2={y(v)} stroke="var(--border)" strokeWidth={1} />
              <text x={esq - 8} y={y(v)} textAnchor="end" dominantBaseline="middle" fontSize={11} fill="var(--muted-foreground)">{compacto(v)}</text>
            </g>
          ))}
          {pontos.map((p, i) => {
            const h = Math.max(0, y(0) - y(Math.min(p.recebido, max)))
            const r = Math.min(4, h / 2, largura / 2)
            const x0 = x(i) - largura / 2, y0 = y(0) - h
            const faixa = (L - esq - dir) / pontos.length
            return (
              <g key={p.mes} onPointerEnter={() => setFoco(i)} onPointerDown={() => setFoco(i)} onClick={() => router.push(`/escola?mes=${p.mes}`)} className="cursor-pointer">
                <rect x={esq + faixa * i} y={topo} width={faixa} height={A - topo - base} fill="transparent" />
                {h > 0 && (
                  <path d={`M${x0},${y(0)} V${y0 + r} Q${x0},${y0} ${x0 + r},${y0} H${x0 + largura - r} Q${x0 + largura},${y0} ${x0 + largura},${y0 + r} V${y(0)} Z`}
                    fill="var(--chart-4)" opacity={p.mes === atual || foco === i ? 1 : 0.45} />
                )}
                {/* No celular, um mês sim, outro não, contando do último (o mês aberto). */}
                {(L >= 520 || (pontos.length - 1 - i) % 2 === 0) && (
                  <text x={x(i)} y={A - 8} textAnchor="middle" fontSize={11} fill={p.mes === atual ? 'var(--foreground)' : 'var(--muted-foreground)'} fontWeight={p.mes === atual ? 600 : 400}>{mesCurto(p.mes)}</text>
                )}
              </g>
            )
          })}
          <line x1={esq} x2={L - dir} y1={y(0)} y2={y(0)} stroke="var(--muted-foreground)" strokeWidth={1} />
        </svg>
        {f && foco !== null && (
          <div className="pointer-events-none absolute top-1 rounded-lg border border-border bg-card px-2.5 py-1.5 text-xs shadow-sm"
            style={{ left: `${(x(foco) / L) * 100}%`, transform: `translateX(${foco > pontos.length / 2 ? 'calc(-100% - 12px)' : '12px'})` }} role="status">
            <span className="block text-muted-foreground">{mesPorExtenso(f.mes)}</span>
            <span className="font-semibold tabular-nums">{reaisDeCentavos(f.recebido)}</span>
          </div>
        )}
      </div>
      <details className="text-xs text-muted-foreground">
        <summary className="cursor-pointer">Ver em tabela</summary>
        <table className="mt-2 w-full max-w-sm text-left">
          <thead><tr><th className="py-1">Mês</th><th className="py-1 text-right">Recebido</th></tr></thead>
          <tbody>{pontos.map((p) => <tr key={p.mes}><td className="py-0.5">{mesPorExtenso(p.mes)}</td><td className="py-0.5 text-right tabular-nums">{reaisDeCentavos(p.recebido)}</td></tr>)}</tbody>
        </table>
      </details>
    </figure>
  )
}
