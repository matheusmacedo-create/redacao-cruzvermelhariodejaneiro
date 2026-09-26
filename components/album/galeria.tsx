'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ChevronLeft, ChevronRight, Download, Play, X } from 'lucide-react'
import { cn } from '@/lib/utils'

export type FotoNaGaleria = { id: string; nome: string; categoria: 'foto' | 'video'; autor: string; temMiniatura: boolean }

/**
 * A grade do álbum do evento, com a foto em tela cheia (setas, teclado e
 * deslizar no celular) e o botão de baixar o original. As imagens vêm de
 * /api/publico/album/<token>/<id>, que confere o token e manda para o R2.
 */
export function Galeria({ token, fotos }: { token: string; fotos: FotoNaGaleria[] }) {
  const [pessoa, setPessoa] = useState<string | null>(null)
  const [aberta, setAberta] = useState<number | null>(null)
  const base = `/api/publico/album/${encodeURIComponent(token)}`
  const link = (id: string, tipo: 'mini' | 'ver' | 'baixar') => `${base}/${id}?tipo=${tipo}`

  const pessoas = useMemo(() => {
    const conta = new Map<string, number>()
    for (const f of fotos) conta.set(f.autor, (conta.get(f.autor) ?? 0) + 1)
    return [...conta].sort((a, b) => b[1] - a[1])
  }, [fotos])
  const visiveis = useMemo(() => (pessoa ? fotos.filter((f) => f.autor === pessoa) : fotos), [fotos, pessoa])

  const fechar = useCallback(() => setAberta(null), [])
  const andar = useCallback((passo: number) => setAberta((i) => (i === null ? null : (i + passo + visiveis.length) % visiveis.length)), [visiveis.length])

  useEffect(() => {
    if (aberta === null) return
    const tecla = (e: KeyboardEvent) => {
      if (e.key === 'Escape') fechar()
      else if (e.key === 'ArrowRight') andar(1)
      else if (e.key === 'ArrowLeft') andar(-1)
    }
    window.addEventListener('keydown', tecla)
    const rolagem = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { window.removeEventListener('keydown', tecla); document.body.style.overflow = rolagem }
  }, [aberta, andar, fechar])

  const toque = useRef<number | null>(null)
  const atual = aberta === null ? null : visiveis[aberta]

  return (
    <div className="flex flex-col gap-4">
      {pessoas.length > 1 && (
        <div className="flex flex-wrap gap-1.5" role="group" aria-label="Filtrar por quem mandou">
          <Chip ativo={pessoa === null} onClick={() => setPessoa(null)}>Todas ({fotos.length})</Chip>
          {pessoas.map(([nome, n]) => <Chip key={nome} ativo={pessoa === nome} onClick={() => setPessoa(nome)}>{nome} ({n})</Chip>)}
        </div>
      )}

      <ul className="grid grid-cols-3 gap-1 sm:grid-cols-4 sm:gap-1.5 lg:grid-cols-5">
        {visiveis.map((f, i) => (
          <li key={f.id}>
            <button type="button" onClick={() => setAberta(i)} aria-label={`${f.categoria === 'video' ? 'Vídeo' : 'Foto'} de ${f.autor}: ${f.nome}`}
              className="group relative block aspect-square w-full overflow-hidden rounded-md bg-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring">
              {f.categoria === 'foto' ? (
                <img src={link(f.id, 'mini')} alt="" loading="lazy" decoding="async" className="size-full object-cover transition-transform group-hover:scale-[1.03]" />
              ) : (
                <span className="flex size-full flex-col items-center justify-center gap-1 bg-foreground/85 text-background">
                  <Play className="size-7" aria-hidden="true" /><span className="px-2 text-[11px] opacity-80">vídeo</span>
                </span>
              )}
            </button>
          </li>
        ))}
      </ul>

      {atual && (
        <div role="dialog" aria-modal="true" aria-label={`${atual.categoria === 'video' ? 'Vídeo' : 'Foto'} ${aberta! + 1} de ${visiveis.length}`}
          className="fixed inset-0 z-50 flex flex-col bg-black/95 text-white"
          onTouchStart={(e) => { toque.current = e.touches[0].clientX }}
          onTouchEnd={(e) => {
            if (toque.current === null) return
            const dx = e.changedTouches[0].clientX - toque.current
            toque.current = null
            if (Math.abs(dx) > 50) andar(dx < 0 ? 1 : -1)
          }}>
          <div className="flex items-center gap-2 px-3 py-2 text-sm">
            <span className="min-w-0 flex-1 truncate">por <strong>{atual.autor}</strong> · {aberta! + 1} de {visiveis.length}</span>
            <a href={link(atual.id, 'baixar')} className="inline-flex h-10 items-center gap-1.5 rounded-lg px-3 font-medium hover:bg-white/10"><Download className="size-4" aria-hidden="true" />Baixar</a>
            <button type="button" onClick={fechar} aria-label="Fechar" className="inline-flex size-10 items-center justify-center rounded-lg hover:bg-white/10"><X className="size-5" /></button>
          </div>
          <div className="relative flex min-h-0 flex-1 items-center justify-center px-2 pb-4">
            {atual.categoria === 'foto'
              ? <img key={atual.id} src={link(atual.id, 'ver')} alt={`Foto de ${atual.autor}`} className="max-h-full max-w-full object-contain" />
              : <video key={atual.id} src={link(atual.id, 'ver')} controls playsInline className="max-h-full max-w-full" />}
            {visiveis.length > 1 && (
              <>
                <button type="button" onClick={() => andar(-1)} aria-label="Anterior" className="absolute left-2 top-1/2 inline-flex size-11 -translate-y-1/2 items-center justify-center rounded-full bg-black/50 hover:bg-black/70"><ChevronLeft className="size-6" /></button>
                <button type="button" onClick={() => andar(1)} aria-label="Próxima" className="absolute right-2 top-1/2 inline-flex size-11 -translate-y-1/2 items-center justify-center rounded-full bg-black/50 hover:bg-black/70"><ChevronRight className="size-6" /></button>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

function Chip({ ativo, onClick, children }: { ativo: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button type="button" onClick={onClick} aria-pressed={ativo}
      className={cn('min-h-9 rounded-full border px-3 text-sm', ativo ? 'border-primary bg-primary text-primary-foreground' : 'border-border bg-card hover:bg-muted')}>
      {children}
    </button>
  )
}
