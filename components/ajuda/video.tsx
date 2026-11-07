'use client'

import { useEffect, useId, useRef, useState } from 'react'
import { CirclePlay, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { duracaoLegivel, videoDaAjuda } from '@/lib/ajuda/videos'

/**
 * "Ver o vídeo" (docs/AJUDA.md §14): o vídeo curto de uma tarefa, aberto ali mesmo, sem sair da tela. Legenda ligada
 * por padrão (quem está no escritório nem sempre pode ouvir). Um som por vez na página, como no "Ouvir": o vídeo
 * começar para o áudio que estava tocando, e um "Ouvir" novo pausa o vídeo.
 *
 * Na tela estreita (celular), abre a versão de celular, em pé, quando ela existe; senão, a de computador.
 *
 * A janela é um <dialog> nativo: foco preso dentro, Escape fecha e o foco volta ao botão.
 */

/** A tela é de celular: a mesma linha do menu lateral virar gaveta (md, 768 px). */
const TELA_DE_CELULAR = '(max-width: 767px)'

const EVENTO = 'ajuda:ouvir'

export function VerOVideo({ id, className }: { id: string; className?: string }) {
  const video = videoDaAjuda(id)
  const chave = useId()
  const janela = useRef<HTMLDialogElement>(null)
  const player = useRef<HTMLVideoElement>(null)
  const [aberta, setAberta] = useState(false)
  const [falhou, setFalhou] = useState(false)
  const [emPe, setEmPe] = useState(false)

  useEffect(() => {
    const d = janela.current
    if (!d) return
    if (aberta && !d.open) d.showModal()
    if (!aberta && d.open) d.close()
    if (!aberta) player.current?.pause()
  }, [aberta])

  // Outro som começou na página: o vídeo pausa.
  useEffect(() => {
    const outro = (e: Event) => { if ((e as CustomEvent<string>).detail !== chave) player.current?.pause() }
    window.addEventListener(EVENTO, outro)
    return () => window.removeEventListener(EVENTO, outro)
  }, [chave])

  if (!video) return null
  const tituloId = `${chave}-titulo`
  const fonte = emPe && video.noCelular ? video.noCelular : video
  const abrir = () => {
    setFalhou(false)
    setEmPe(Boolean(video.noCelular) && window.matchMedia(TELA_DE_CELULAR).matches)
    setAberta(true)
  }

  return (
    <>
      <button
        type="button"
        onClick={abrir}
        className={cn(
          'inline-flex min-h-11 shrink-0 items-center justify-center gap-1.5 rounded-md border border-border bg-card px-3 text-sm font-medium text-foreground outline-none hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring/50 sm:min-h-9',
          className,
        )}
      >
        <CirclePlay className="size-4 text-primary" aria-hidden="true" />
        <span>Ver o vídeo</span>
        <span className="text-muted-foreground">· {duracaoLegivel(video.duracao)}</span>
      </button>
      <dialog
        ref={janela}
        aria-labelledby={tituloId}
        onClose={() => setAberta(false)}
        // O fundo escurecido fecha, como nos outros diálogos do Palácio (conferindo as coordenadas: arrastar a barra
        // do vídeo não fecha).
        onMouseDown={(e) => {
          const caixa = e.currentTarget.getBoundingClientRect()
          if (e.clientX < caixa.left || e.clientX > caixa.right || e.clientY < caixa.top || e.clientY > caixa.bottom) setAberta(false)
        }}
        className="m-auto w-[calc(100%-1rem)] max-w-4xl overflow-hidden rounded-xl border border-border bg-card p-0 text-card-foreground shadow-2xl backdrop:bg-[rgb(0_0_0/0.6)]"
      >
        <div className="flex items-center gap-3 border-b border-border px-4 py-2.5">
          <CirclePlay className="size-4 shrink-0 text-primary" aria-hidden="true" />
          <h2 id={tituloId} className="min-w-0 flex-1 truncate text-sm font-semibold">{video.titulo}</h2>
          <button type="button" onClick={() => setAberta(false)} className="inline-flex size-11 items-center justify-center rounded-md text-muted-foreground outline-none hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/50 sm:size-9" aria-label="Fechar o vídeo">
            <X className="size-4" aria-hidden="true" />
          </button>
        </div>
        {aberta && (
          falhou ? (
            <p className="px-5 py-10 text-center text-sm text-muted-foreground">
              Não foi possível carregar o vídeo agora. O passo a passo escrito continua no painel.{' '}
              <a href={fonte.enderecoDoVideo} target="_blank" rel="noreferrer" className="font-medium text-primary underline underline-offset-2">Abrir o vídeo numa aba</a>
            </p>
          ) : (
            <video
              ref={player}
              className={emPe ? 'mx-auto block bg-black' : 'block aspect-video w-full bg-black'}
              // Em pé, a altura cabe na tela (tirando o título e a nota) e a largura sai da proporção 9:16.
              style={emPe ? { aspectRatio: '9 / 16', height: 'min(calc(100dvh - 8rem), calc((100vw - 1rem) * 16 / 9))' } : undefined}
              controls
              autoPlay
              playsInline
              preload="metadata"
              poster={fonte.enderecoDaCapa}
              onPlay={() => window.dispatchEvent(new CustomEvent(EVENTO, { detail: chave }))}
              onError={() => setFalhou(true)}
            >
              <source src={fonte.enderecoDoVideo} type="video/mp4" onError={() => setFalhou(true)} />
              <track kind="captions" srcLang="pt-BR" label="Português" src={fonte.enderecoDaLegenda} default />
            </video>
          )
        )}
        <p className="px-4 py-2.5 text-xs text-muted-foreground">Gravado com dados fictícios, no espaço de Demonstração. O que vale é o passo a passo escrito, ao lado.</p>
      </dialog>
    </>
  )
}
