'use client'

import { CirclePlay } from 'lucide-react'
import { cn } from '@/lib/utils'
import { duracaoLegivel, videoDaAjuda } from '@/lib/ajuda/videos'
import { VerOVideo } from './video'

/**
 * Um vídeo de "Comece por aqui" (na Central e no guia para começar, docs/AJUDA.md §16): a capa, o número na ordem, o
 * título e o tempo. Um toque abre o vídeo ali mesmo (VerOVideo), sem sair da página. `grande`: a letra do guia.
 */
export function CartaoDoVideo({ id, numero, onde, grande = false }: { id: string; numero: number; onde?: string; grande?: boolean }) {
  const video = videoDaAjuda(id)
  if (!video) return null
  return (
    <VerOVideo
      id={id}
      gatilho={(abrir) => (
        <button
          type="button"
          onClick={abrir}
          data-video-de-comeco={id}
          className="group flex h-full w-full flex-col overflow-hidden rounded-xl border border-border bg-card text-left shadow-xs outline-none hover:border-primary/40 focus-visible:ring-4 focus-visible:ring-ring/40"
        >
          <span className="relative block aspect-video w-full overflow-hidden bg-muted">
            <img src={video.enderecoDaCapa} alt="" loading="lazy" className="size-full object-cover" />
            {/* O play no canto, e não no meio: a capa é o cartão de abertura, com o título no meio. */}
            <span className="absolute inset-0 transition-colors group-hover:bg-black/10 motion-reduce:transition-none" aria-hidden="true" />
            <span className={cn('absolute bottom-2.5 right-2.5 flex items-center justify-center rounded-full bg-white/95 text-primary shadow-md', grande ? 'size-14' : 'size-11')} aria-hidden="true">
              <CirclePlay className={grande ? 'size-8' : 'size-6'} />
            </span>
            <span className="absolute left-2.5 top-2.5 flex size-8 items-center justify-center rounded-full bg-primary text-base font-bold text-primary-foreground shadow-sm" aria-hidden="true">{numero}</span>
          </span>
          <span className={cn('flex flex-1 flex-col gap-1', grande ? 'p-4' : 'p-3')}>
            <span className={cn('font-semibold leading-snug', grande ? 'text-lg' : 'text-sm')}><span className="sr-only">Vídeo {numero}: </span>{video.titulo}</span>
            <span className={cn('text-muted-foreground', grande ? 'text-base' : 'text-xs')}>{onde ? `${onde} · ` : ''}{duracaoLegivel(video.duracao)}</span>
          </span>
        </button>
      )}
    />
  )
}
