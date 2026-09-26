'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { ArrowUpRight, ChevronLeft, ChevronRight } from 'lucide-react'
import type { BannerDoMembro } from '@/lib/membro/banners'
import { cn } from '@/lib/utils'
import { botaoSecundario } from './marca'

const INTERVALO = 7000

/**
 * Os banners da coordenação no alto do Início: imagem larga e, embaixo dela,
 * título, uma frase e um botão (secundário — o principal da tela é outro).
 * Texto nunca por cima da foto. Com mais de um, eles se revezam sozinhos a
 * cada 7 s, param quando a pessoa passa o mouse, toca ou navega pelo teclado,
 * e não se mexem para quem pediu menos movimento no sistema. No celular,
 * dá para arrastar.
 */
export function BannersDoMembro({ banners }: { banners: BannerDoMembro[] }) {
  const trilho = useRef<HTMLDivElement>(null)
  const [atual, setAtual] = useState(0)
  const [parado, setParado] = useState(false)
  const varios = banners.length > 1

  const irPara = (i: number) => {
    const t = trilho.current
    if (!t) return
    const alvo = (i + banners.length) % banners.length
    t.scrollTo({ left: alvo * t.clientWidth, behavior: 'smooth' })
  }

  // Qual está na tela, pela rolagem (vale para as setas, os pontos e o arrasto).
  useEffect(() => {
    const t = trilho.current
    if (!t || !varios) return
    const aoRolar = () => setAtual(Math.round(t.scrollLeft / Math.max(t.clientWidth, 1)))
    t.addEventListener('scroll', aoRolar, { passive: true })
    return () => t.removeEventListener('scroll', aoRolar)
  }, [varios])

  useEffect(() => {
    if (!varios || parado || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
    const id = window.setInterval(() => irPara(atual + 1), INTERVALO)
    return () => window.clearInterval(id)
    // irPara depende só do trilho e do total, que não mudam entre voltas.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [varios, parado, atual])

  if (!banners.length) return null
  return (
    <section
      aria-roledescription="carrossel" aria-label="Destaques da Cruz Vermelha RJ" id="destaques" data-ajuda="membro.banners"
      className="flex flex-col gap-2"
      onMouseEnter={() => setParado(true)} onMouseLeave={() => setParado(false)}
      onFocus={() => setParado(true)} onBlur={() => setParado(false)} onTouchStart={() => setParado(true)}
    >
      <div ref={trilho} className="flex snap-x snap-mandatory overflow-x-auto overscroll-x-contain rounded-xl [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {banners.map((b, i) => (
          <article key={b.id} aria-roledescription="slide" aria-label={varios ? `${i + 1} de ${banners.length}` : undefined}
            className="w-full shrink-0 snap-start overflow-hidden rounded-xl border border-border bg-card">
            {/* 16:9 no celular, 21:8 do tablet em diante: a mesma imagem, com as bordas cortadas no estreito. */}
            <img src={b.imagem} alt="" className="aspect-video w-full bg-muted object-cover sm:aspect-[21/8]" loading={i === 0 ? 'eager' : 'lazy'} />
            <div className="flex flex-col gap-3 px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-5">
              <div className="min-w-0">
                <h2 className="text-lg font-semibold leading-snug text-balance">{b.titulo}</h2>
                {b.texto && <p className="mt-0.5 text-sm text-muted-foreground">{b.texto}</p>}
              </div>
              {b.link_url && b.link_rotulo && (
                b.link_url.startsWith('/')
                  ? <Link href={b.link_url} className={cn(botaoSecundario, 'shrink-0')}>{b.link_rotulo}</Link>
                  : <a href={b.link_url} target="_blank" rel="noopener noreferrer" className={cn(botaoSecundario, 'shrink-0')}>{b.link_rotulo}<ArrowUpRight className="size-4" aria-hidden="true" /></a>
              )}
            </div>
          </article>
        ))}
      </div>
      {varios && (
        <div className="flex items-center justify-center gap-1">
          <button type="button" onClick={() => irPara(atual - 1)} aria-label="Destaque anterior" className="flex size-11 items-center justify-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground"><ChevronLeft className="size-4" /></button>
          {banners.map((b, i) => (
            <button key={b.id} type="button" onClick={() => irPara(i)} aria-label={`Ir para o destaque ${i + 1}`} aria-current={i === atual ? 'true' : undefined}
              className="flex size-8 items-center justify-center">
              <span className={cn('block h-1.5 rounded-full transition-all', i === atual ? 'w-5 bg-foreground' : 'w-1.5 bg-muted-foreground/40')} />
            </button>
          ))}
          <button type="button" onClick={() => irPara(atual + 1)} aria-label="Próximo destaque" className="flex size-11 items-center justify-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground"><ChevronRight className="size-4" /></button>
        </div>
      )}
    </section>
  )
}
