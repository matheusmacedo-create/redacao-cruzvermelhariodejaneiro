'use client'

import { useEffect, useId, useRef, useState } from 'react'
import { Loader2, Square, Volume2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { codigoDoTexto } from '@/lib/ajuda/ouvir'

/**
 * "Ouvir" (docs/AJUDA.md §12): lê o texto com a voz da filial. O áudio vem de /api/ajuda/ouvir, pelo código do
 * texto; na primeira vez de um texto ele é gravado na hora ("Preparando o áudio…"). Sem a rota (fora do Palácio,
 * voz não configurada, sem internet), a voz do próprio aparelho lê o mesmo texto. Um áudio por vez na página: tocar
 * outro "Ouvir" para o que estava tocando.
 */

type Estado = 'parado' | 'preparando' | 'tocando'

const EVENTO = 'ajuda:ouvir'

export function Ouvir({ texto, rotulo = 'Ouvir', compacto = false, className }: { texto: string; rotulo?: string; compacto?: boolean; className?: string }) {
  const id = useId()
  const [estado, setEstado] = useState<Estado>('parado')
  const audio = useRef<HTMLAudioElement | null>(null)
  const ativo = useRef(false)

  const parar = () => {
    ativo.current = false
    audio.current?.pause()
    audio.current = null
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) window.speechSynthesis.cancel()
    setEstado('parado')
  }

  // Outro "Ouvir" começou: este para. Ao sair da tela (painel fechado, tour avançou), também.
  useEffect(() => {
    const outro = (e: Event) => { if ((e as CustomEvent<string>).detail !== id && ativo.current) parar() }
    window.addEventListener(EVENTO, outro)
    return () => { window.removeEventListener(EVENTO, outro); if (ativo.current) parar() }
  }, [id])

  // O texto mudou (o tour passou para o balão seguinte): o áudio do anterior para.
  useEffect(() => { if (ativo.current) parar() }, [texto])

  const vozDoAparelho = () => {
    if (!ativo.current) return
    if (!('speechSynthesis' in window)) { parar(); return }
    const fala = new SpeechSynthesisUtterance(texto)
    fala.lang = 'pt-BR'
    fala.rate = 0.95
    fala.onend = () => { if (ativo.current) parar() }
    fala.onerror = () => { if (ativo.current) parar() }
    window.speechSynthesis.cancel()
    window.speechSynthesis.speak(fala)
    setEstado('tocando')
  }

  const tocar = async () => {
    if (estado !== 'parado') { parar(); return }
    window.dispatchEvent(new CustomEvent(EVENTO, { detail: id }))
    ativo.current = true
    setEstado('preparando')
    let codigo: string
    try {
      codigo = await codigoDoTexto(texto)
    } catch {
      vozDoAparelho()
      return
    }
    if (!ativo.current) return
    const a = new Audio(`/api/ajuda/ouvir?c=${codigo}`)
    audio.current = a
    a.onplaying = () => { if (audio.current === a) setEstado('tocando') }
    a.onended = () => { if (audio.current === a) parar() }
    a.onerror = () => { if (audio.current === a) { audio.current = null; vozDoAparelho() } }
    a.play().catch(() => { if (audio.current === a) { audio.current = null; vozDoAparelho() } })
  }

  const Icone = estado === 'preparando' ? Loader2 : estado === 'tocando' ? Square : Volume2
  const legenda = estado === 'preparando' ? 'Preparando o áudio…' : estado === 'tocando' ? 'Parar' : rotulo
  return (
    <button
      type="button"
      onClick={tocar}
      aria-pressed={estado !== 'parado'}
      aria-label={compacto ? (estado === 'parado' ? `${rotulo}: ouvir em voz alta` : legenda) : undefined}
      title={compacto ? legenda : undefined}
      className={cn(
        'inline-flex shrink-0 items-center justify-center gap-1.5 rounded-md border border-border bg-card text-sm font-medium text-foreground outline-none hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring/50 aria-pressed:border-primary/40 aria-pressed:bg-primary/[0.06] aria-pressed:text-primary',
        compacto ? 'size-11 sm:size-9' : 'min-h-11 px-3 sm:min-h-9',
        className,
      )}
    >
      <Icone className={cn('size-4', estado === 'preparando' && 'animate-spin motion-reduce:animate-none')} aria-hidden="true" />
      {!compacto && <span>{legenda}</span>}
      <span className="sr-only" aria-live="polite">{estado === 'preparando' ? 'Preparando o áudio.' : ''}</span>
    </button>
  )
}
