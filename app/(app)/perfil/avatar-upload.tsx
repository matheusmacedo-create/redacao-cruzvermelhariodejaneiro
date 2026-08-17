'use client'

import { useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Camera, Trash2 } from 'lucide-react'
import { Avatar } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import { AvatarCropper } from './avatar-cropper'

export function AvatarUpload({ initials, color, path, name }: { initials: string; color?: string; path?: string | null; name: string }) {
  const input = useRef<HTMLInputElement>(null)
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [pendingFile, setPendingFile] = useState<File | null>(null)
  const src = path ? `/api/private-blob?pathname=${encodeURIComponent(path)}` : null

  function handleSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (file) setPendingFile(file)
  }

  async function uploadCropped(blob: Blob) {
    setPendingFile(null)
    setBusy(true)
    setError('')
    const body = new FormData()
    body.set('file', new File([blob], 'avatar.jpg', { type: 'image/jpeg' }))
    const res = await fetch('/api/profile/avatar', { method: 'POST', body })
    const json = await res.json()
    setBusy(false)
    if (!res.ok) { setError(json.error); return }
    if (input.current) input.current.value = ''
    router.refresh()
  }

  async function remove() {
    setBusy(true)
    const res = await fetch('/api/profile/avatar', { method: 'DELETE' })
    setBusy(false)
    if (res.ok) router.refresh()
    else setError((await res.json()).error)
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-4">
        <Avatar initials={initials} color={color} src={src} alt={`Foto de ${name}`} size="xl" />
        <div className="flex flex-wrap gap-2">
          <input ref={input} type="file" accept="image/jpeg,image/png,image/webp" className="sr-only" onChange={handleSelect} />
          <Button type="button" variant="outline" onClick={() => input.current?.click()} disabled={busy}>
            <Camera className="size-4" />
            {busy ? 'Enviando…' : 'Trocar foto'}
          </Button>
          {path && <Button type="button" variant="ghost" onClick={remove} disabled={busy}><Trash2 className="size-4" />Remover</Button>}
        </div>
      </div>
      <p className="text-xs text-muted-foreground">JPEG, PNG ou WebP, até 2 MB. Você poderá ajustar o corte antes de salvar.</p>
      {error && <p className="text-sm text-destructive">{error}</p>}

      {pendingFile && (
        <AvatarCropper
          file={pendingFile}
          onCancel={() => { setPendingFile(null); if (input.current) input.current.value = '' }}
          onConfirm={uploadCropped}
        />
      )}
    </div>
  )
}
