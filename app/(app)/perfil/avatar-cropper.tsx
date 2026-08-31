'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { Check, X, ZoomIn } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'

const VIEWPORT = 280
const OUTPUT = 512

export function AvatarCropper({ file, onCancel, onConfirm }: { file: File; onCancel: () => void; onConfirm: (blob: Blob) => void }) {
  const imgRef = useRef<HTMLImageElement>(null)
  const [imageUrl, setImageUrl] = useState('')
  const [natural, setNatural] = useState({ width: 0, height: 0 })
  const [zoom, setZoom] = useState(1)
  const [pos, setPos] = useState({ left: 0, top: 0 })
  const [busy, setBusy] = useState(false)
  const dragRef = useRef<{ startX: number; startY: number; left: number; top: number } | null>(null)
  // O cursor precisa MUDAR durante o arraste, e mudança de ref não redesenha:
  // lido só do ref, ele ficava em "grab" o tempo todo.
  const [arrastando, setArrastando] = useState(false)

  // Sincroniza com um sistema externo — o ciclo de vida do object URL, que
  // precisa ser criado e revogado em par. É o caso que o efeito existe para
  // atender.
  useEffect(() => {
    const url = URL.createObjectURL(file)
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setImageUrl(url)
    return () => URL.revokeObjectURL(url)
  }, [file])

  const baseScale = useMemo(() => {
    if (!natural.width || !natural.height) return 0
    return Math.max(VIEWPORT / natural.width, VIEWPORT / natural.height)
  }, [natural])

  const drawScale = baseScale * zoom
  const renderedWidth = natural.width * drawScale
  const renderedHeight = natural.height * drawScale

  function clamp(left: number, top: number, width: number, height: number) {
    const minLeft = Math.min(0, VIEWPORT - width)
    const minTop = Math.min(0, VIEWPORT - height)
    return { left: Math.min(0, Math.max(minLeft, left)), top: Math.min(0, Math.max(minTop, top)) }
  }

  function handleImageLoad() {
    const img = imgRef.current
    if (!img) return
    const width = img.naturalWidth
    const height = img.naturalHeight
    const scale = Math.max(VIEWPORT / width, VIEWPORT / height)
    setNatural({ width, height })
    setPos({ left: (VIEWPORT - width * scale) / 2, top: (VIEWPORT - height * scale) / 2 })
  }

  function handleZoomChange(next: number) {
    const centerSourceX = (VIEWPORT / 2 - pos.left) / drawScale
    const centerSourceY = (VIEWPORT / 2 - pos.top) / drawScale
    const nextDrawScale = baseScale * next
    const nextLeft = VIEWPORT / 2 - centerSourceX * nextDrawScale
    const nextTop = VIEWPORT / 2 - centerSourceY * nextDrawScale
    setZoom(next)
    setPos(clamp(nextLeft, nextTop, natural.width * nextDrawScale, natural.height * nextDrawScale))
  }

  function handlePointerDown(e: React.PointerEvent) {
    e.currentTarget.setPointerCapture(e.pointerId)
    dragRef.current = { startX: e.clientX, startY: e.clientY, left: pos.left, top: pos.top }
    setArrastando(true)
  }

  function handlePointerMove(e: React.PointerEvent) {
    if (!dragRef.current) return
    const dx = e.clientX - dragRef.current.startX
    const dy = e.clientY - dragRef.current.startY
    setPos(clamp(dragRef.current.left + dx, dragRef.current.top + dy, renderedWidth, renderedHeight))
  }

  function handlePointerUp() {
    dragRef.current = null
    setArrastando(false)
  }

  async function confirm() {
    if (!drawScale) return
    setBusy(true)
    const canvas = document.createElement('canvas')
    canvas.width = OUTPUT
    canvas.height = OUTPUT
    const ctx = canvas.getContext('2d')
    if (!ctx) { setBusy(false); return }
    const sourceX = (0 - pos.left) / drawScale
    const sourceY = (0 - pos.top) / drawScale
    const sourceSize = VIEWPORT / drawScale
    const img = imgRef.current!
    ctx.drawImage(img, sourceX, sourceY, sourceSize, sourceSize, 0, 0, OUTPUT, OUTPUT)
    canvas.toBlob((blob) => {
      setBusy(false)
      if (blob) onConfirm(blob)
    }, 'image/jpeg', 0.92)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-labelledby="crop-title">
      <button type="button" className="absolute inset-0 bg-foreground/40" aria-label="Fechar" onClick={onCancel} />
      <Card className="relative z-10 w-full max-w-sm p-6 shadow-xl">
        <div className="flex items-center justify-between gap-4">
          <h2 id="crop-title" className="text-lg font-semibold">Ajustar foto</h2>
          <Button type="button" variant="ghost" size="icon-sm" onClick={onCancel} aria-label="Fechar"><X className="size-4" /></Button>
        </div>
        <p className="mt-1 text-sm text-muted-foreground">Arraste a foto para posicionar e use o controle para aproximar. A área do círculo é o que vai aparecer.</p>

        <div
          className="relative mx-auto mt-4 touch-none select-none overflow-hidden rounded-lg bg-muted"
          style={{ width: VIEWPORT, height: VIEWPORT, cursor: arrastando ? 'grabbing' : 'grab' }}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerLeave={handlePointerUp}
        >
          {imageUrl && (
            <img
              ref={imgRef}
              src={imageUrl}
              alt="Prévia da foto para recorte"
              draggable={false}
              onLoad={handleImageLoad}
              className="absolute max-w-none"
              style={{ left: pos.left, top: pos.top, width: renderedWidth || undefined, height: renderedHeight || undefined }}
            />
          )}
          <div className="pointer-events-none absolute inset-0 rounded-full" style={{ boxShadow: `0 0 0 999px rgba(0,0,0,0.45)` }} />
        </div>

        <label className="mt-4 flex items-center gap-2 text-xs text-muted-foreground">
          <ZoomIn className="size-3.5 shrink-0" />
          <input type="range" min={1} max={3} step={0.01} value={zoom} onChange={(e) => handleZoomChange(Number(e.target.value))} className="w-full" />
        </label>

        <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button type="button" variant="outline" size="lg" onClick={onCancel}>Cancelar</Button>
          <Button type="button" size="lg" onClick={confirm} disabled={busy || !imageUrl}><Check className="size-4" />{busy ? 'Salvando…' : 'Usar esta foto'}</Button>
        </div>
      </Card>
    </div>
  )
}
