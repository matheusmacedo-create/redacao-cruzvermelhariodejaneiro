'use client'

import { useEffect, useRef, useState } from 'react'
import { Mic, Square, Trash2 } from 'lucide-react'
import { botaoSecundario } from '@/components/membro/marca'
import { MINUTOS_DE_AUDIO } from '@/lib/envios/regras'

/** O formato que este navegador grava: Chrome/Android em WebM, Safari/iPhone em MP4. */
function formatoDeGravacao(): { mime: string; extensao: string } | null {
  if (typeof MediaRecorder === 'undefined') return null
  for (const [mime, extensao] of [['audio/webm;codecs=opus', 'webm'], ['audio/mp4', 'm4a'], ['audio/webm', 'webm'], ['audio/ogg;codecs=opus', 'ogg']] as const) {
    if (MediaRecorder.isTypeSupported(mime)) return { mime, extensao }
  }
  return { mime: '', extensao: 'webm' }
}

const relogio = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`

/**
 * "Aperte e conte o que aconteceu": grava no próprio navegador, sem app.
 * Cada gravação vira um arquivo de áudio do envio (até 5 minutos cada).
 */
export function Gravador({ aoGravar, desabilitado }: { aoGravar: (arquivo: File) => void; desabilitado?: boolean }) {
  const [estado, setEstado] = useState<'parado' | 'gravando' | 'erro'>('parado')
  const [segundos, setSegundos] = useState(0)
  const [erro, setErro] = useState('')
  const gravador = useRef<MediaRecorder | null>(null)
  const pedacos = useRef<Blob[]>([])
  const relogioRef = useRef<ReturnType<typeof setInterval> | null>(null)

  useEffect(() => () => {
    if (relogioRef.current) clearInterval(relogioRef.current)
    gravador.current?.stream.getTracks().forEach((t) => t.stop())
  }, [])

  async function comecar() {
    setErro('')
    const formato = formatoDeGravacao()
    if (!formato || !navigator.mediaDevices?.getUserMedia) {
      setEstado('erro'); setErro('Este navegador não grava áudio. Grave no WhatsApp ou no gravador do celular e mande o arquivo abaixo.'); return
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const rec = new MediaRecorder(stream, formato.mime ? { mimeType: formato.mime } : undefined)
      pedacos.current = []
      rec.ondataavailable = (e) => { if (e.data.size) pedacos.current.push(e.data) }
      rec.onstop = () => {
        stream.getTracks().forEach((t) => t.stop())
        if (relogioRef.current) clearInterval(relogioRef.current)
        const tipo = rec.mimeType || formato.mime || 'audio/webm'
        const blob = new Blob(pedacos.current, { type: tipo.split(';')[0] })
        if (blob.size > 0) {
          const hora = new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }).replace(':', 'h')
          aoGravar(new File([blob], `audio-relato-${hora}.${tipo.includes('mp4') ? 'm4a' : formato.extensao}`, { type: blob.type }))
        }
        setEstado('parado'); setSegundos(0)
      }
      gravador.current = rec
      rec.start(1000)
      setEstado('gravando')
      const inicio = Date.now()
      relogioRef.current = setInterval(() => {
        const s = Math.floor((Date.now() - inicio) / 1000)
        setSegundos(s)
        if (s >= MINUTOS_DE_AUDIO * 60) rec.state === 'recording' && rec.stop()
      }, 250)
    } catch {
      setEstado('erro')
      setErro('Não deu para usar o microfone. Confira se o navegador tem permissão (no cadeado ao lado do endereço) ou mande um áudio gravado pelo celular.')
    }
  }

  function parar() { if (gravador.current?.state === 'recording') gravador.current.stop() }
  function descartar() {
    if (!gravador.current) return
    gravador.current.onstop = () => { gravador.current?.stream.getTracks().forEach((t) => t.stop()); setEstado('parado'); setSegundos(0) }
    if (relogioRef.current) clearInterval(relogioRef.current)
    gravador.current.stop()
  }

  if (estado === 'gravando') {
    return (
      <div className="flex flex-wrap items-center gap-3 rounded-xl border border-primary/40 bg-primary/5 p-3" role="status" aria-live="polite">
        <span className="relative flex size-3" aria-hidden="true">
          <span className="absolute inline-flex size-full animate-ping rounded-full bg-primary opacity-60" />
          <span className="relative inline-flex size-3 rounded-full bg-primary" />
        </span>
        <span className="font-semibold tabular-nums">Gravando {relogio(segundos)}</span>
        <span className="text-xs text-muted-foreground">até {MINUTOS_DE_AUDIO} min</span>
        <span className="ml-auto flex gap-2">
          <button type="button" onClick={descartar} className={botaoSecundario}><Trash2 className="size-4" aria-hidden="true" />Descartar</button>
          <button type="button" onClick={parar} className="inline-flex min-h-11 items-center gap-2 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground hover:bg-primary/90">
            <Square className="size-4 fill-current" aria-hidden="true" />Parar e guardar
          </button>
        </span>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-2">
      <button type="button" onClick={comecar} disabled={desabilitado}
        className="inline-flex min-h-14 w-full items-center justify-center gap-2 rounded-xl border-2 border-dashed border-primary/50 bg-card px-4 text-base font-semibold text-primary transition-colors hover:bg-primary/5 disabled:opacity-60">
        <Mic className="size-5" aria-hidden="true" />Gravar um áudio contando
      </button>
      {erro && <p className="text-sm text-destructive">{erro}</p>}
    </div>
  )
}
