'use client'
import { useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { CheckCircle2, Download, FileText, Folder, ImageIcon, Music, Search, Trash2, UploadCloud, Video } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { cn } from '@/lib/utils'

type Item = { id: string; name: string; kind: string; contentType: string | null; size: number; status: string; tags: string[]; createdAt: string; storagePath: string | null; author: { name: string; initials: string; color?: string }; canDelete: boolean }
const icons: Record<string, typeof FileText> = { foto: ImageIcon, video: Video, audio: Music, documento: FileText }
const kinds = [['todos', 'Todos'], ['foto', 'Fotos'], ['video', 'Vídeos'], ['audio', 'Áudios'], ['documento', 'Documentos']]
const format = (n: number) => (n <= 0 ? '0 KB' : n < 1024 * 1024 ? `${Math.max(1, Math.round(n / 1024))} KB` : `${(n / 1024 / 1024).toFixed(1)} MB`)

const FOLDER_PREFIX = 'pasta:'
const folderOf = (tags: string[]) => tags.find((t) => t.startsWith(FOLDER_PREFIX))?.slice(FOLDER_PREFIX.length) || null
const visibleTags = (tags: string[]) => tags.filter((t) => !t.startsWith(FOLDER_PREFIX))

export function LibraryView({ initialFiles, usedBytes, limitBytes }: { initialFiles: Item[]; usedBytes: number; limitBytes: number }) {
  const router = useRouter()
  const input = useRef<HTMLInputElement>(null)
  const [kind, setKind] = useState('todos')
  const [folder, setFolder] = useState('todas')
  const [query, setQuery] = useState('')
  const [tags, setTags] = useState('')
  const [newFolder, setNewFolder] = useState('')
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  const knownFolders = useMemo(() => [...new Set(initialFiles.map((f) => folderOf(f.tags)).filter((f): f is string => !!f))].sort(), [initialFiles])

  const list = initialFiles.filter((f) => {
    if (kind !== 'todos' && f.kind !== kind) return false
    if (folder === 'sem-pasta' && folderOf(f.tags)) return false
    if (folder !== 'todas' && folder !== 'sem-pasta' && folderOf(f.tags) !== folder) return false
    return `${f.name} ${f.tags.join(' ')}`.toLowerCase().includes(query.toLowerCase())
  })

  async function upload() {
    const file = selectedFile ?? input.current?.files?.[0]
    if (!file) { setError('Escolha um arquivo antes de enviar.'); return }
    setBusy(true); setError(''); setSuccess('')
    const body = new FormData()
    body.set('file', file)
    const folderTag = newFolder.trim() ? `${FOLDER_PREFIX}${newFolder.trim()}` : ''
    const allTags = [folderTag, ...tags.split(',').map((t) => t.trim())].filter(Boolean).join(',')
    body.set('tags', allTags)
    const res = await fetch('/api/files/upload', { method: 'POST', body })
    const json = await res.json()
    setBusy(false)
    if (!res.ok) { setError(json.error || 'Não foi possível enviar o arquivo.'); return }
    setSuccess(`“${file.name}” enviado com sucesso.`)
    router.refresh()
    if (input.current) input.current.value = ''
    setSelectedFile(null)
    setTags('')
    setNewFolder('')
  }

  async function remove(id: string, name: string) {
    if (!confirm(`Excluir "${name}" permanentemente? Essa ação não pode ser desfeita.`)) return
    setError('')
    const res = await fetch(`/api/files/${id}`, { method: 'DELETE' })
    if (res.ok) router.refresh()
    else setError((await res.json()).error || 'Não foi possível excluir o arquivo.')
  }

  return (
    <div className="flex flex-col gap-5">
      <Card className="p-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end">
          <div className="flex-1">
            <p className="text-sm font-semibold">Enviar arquivo</p>
            <p className="mt-1 text-xs text-muted-foreground">PDF, Office, imagens, áudio ou vídeo · máximo de 200 MB.</p>
            <input
              ref={input}
              type="file"
              onChange={(e) => { setSelectedFile(e.target.files?.[0] ?? null); setError(''); setSuccess('') }}
              className="mt-3 block w-full text-sm"
            />
            <p className="mt-1.5 text-xs font-medium text-muted-foreground">
              {selectedFile ? `Selecionado: ${selectedFile.name} (${format(selectedFile.size)})` : 'Nenhum arquivo selecionado ainda.'}
            </p>
          </div>
          <label className="text-sm font-medium">
            Pasta
            <input
              list="pasta-options"
              value={newFolder}
              onChange={(e) => setNewFolder(e.target.value)}
              className="mt-1 h-10 w-full rounded-lg border border-border bg-background px-3 lg:w-48"
              placeholder="Ex.: Eventos"
            />
            <datalist id="pasta-options">
              {knownFolders.map((f) => <option key={f} value={f} />)}
            </datalist>
          </label>
          <label className="text-sm font-medium">
            Tags
            <input value={tags} onChange={(e) => setTags(e.target.value)} className="mt-1 h-10 w-full rounded-lg border border-border bg-background px-3 lg:w-56" placeholder="evento, campanha" />
          </label>
          <Button onClick={upload} disabled={busy || !selectedFile}>{busy ? 'Enviando…' : <><UploadCloud className="size-4" />Enviar</>}</Button>
        </div>
        {error && <p className="mt-3 text-sm text-destructive">{error}</p>}
        {success && <p className="mt-3 flex items-center gap-1.5 text-sm text-success"><CheckCircle2 className="size-4" />{success}</p>}
        <div className="mt-4">
          <div className="mb-1 flex justify-between text-xs text-muted-foreground"><span>Espaço usado</span><span>{format(usedBytes)} de {format(limitBytes)}</span></div>
          <div className="h-2 overflow-hidden rounded-full bg-muted"><div className="h-full bg-primary" style={{ width: `${Math.min(100, (usedBytes / limitBytes) * 100)}%` }} /></div>
        </div>
      </Card>

      <div className="flex flex-col gap-3 sm:flex-row">
        <div className="relative flex-1"><Search className="absolute left-3 top-3 size-4 text-muted-foreground" /><input value={query} onChange={(e) => setQuery(e.target.value)} className="h-10 w-full rounded-lg border border-border bg-background pl-9 pr-3" placeholder="Buscar arquivos e tags" /></div>
        <div className="flex flex-wrap gap-2">{kinds.map(([value, label]) => <button key={value} type="button" onClick={() => setKind(value)} className={cn('rounded-lg px-3 py-2 text-sm', kind === value ? 'bg-foreground text-background' : 'bg-muted text-muted-foreground')}>{label}</button>)}</div>
      </div>

      {knownFolders.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-medium text-muted-foreground">Pastas:</span>
          <button type="button" onClick={() => setFolder('todas')} className={cn('inline-flex items-center gap-1 rounded-lg px-3 py-1.5 text-xs font-medium', folder === 'todas' ? 'bg-foreground text-background' : 'bg-muted text-muted-foreground')}>Todas</button>
          {knownFolders.map((f) => (
            <button key={f} type="button" onClick={() => setFolder(f)} className={cn('inline-flex items-center gap-1 rounded-lg px-3 py-1.5 text-xs font-medium', folder === f ? 'bg-foreground text-background' : 'bg-muted text-muted-foreground')}>
              <Folder className="size-3" />{f}
            </button>
          ))}
          <button type="button" onClick={() => setFolder('sem-pasta')} className={cn('inline-flex items-center gap-1 rounded-lg px-3 py-1.5 text-xs font-medium', folder === 'sem-pasta' ? 'bg-foreground text-background' : 'bg-muted text-muted-foreground')}>Sem pasta</button>
        </div>
      )}

      <p className="text-xs text-muted-foreground">{list.length} arquivo(s)</p>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {list.map((f) => {
          const Icon = icons[f.kind] || FileText
          const preview = f.kind === 'foto' && f.storagePath ? `/api/private-blob?pathname=${encodeURIComponent(f.storagePath)}` : null
          const fileFolder = folderOf(f.tags)
          return (
            <Card key={f.id} className="overflow-hidden">
              <div className="flex aspect-video items-center justify-center bg-muted">{preview ? <img src={preview} alt={f.name} className="size-full object-cover" /> : <Icon className="size-10 text-muted-foreground" />}</div>
              <div className="flex flex-col gap-3 p-4">
                <div>
                  <p className="truncate text-sm font-semibold">{f.name}</p>
                  <p className="text-xs text-muted-foreground">{f.author.name} · {format(f.size)} · {new Intl.DateTimeFormat('pt-BR').format(new Date(f.createdAt))}</p>
                </div>
                <div className="flex flex-wrap gap-1">
                  {fileFolder && <span className="inline-flex items-center gap-1 rounded bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary"><Folder className="size-3" />{fileFolder}</span>}
                  {visibleTags(f.tags).map((t) => <span key={t} className="rounded bg-muted px-2 py-0.5 text-xs">#{t}</span>)}
                </div>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" className="flex-1" render={<a href={`/api/files/${f.id}/download`} />}><Download className="size-4" />Baixar</Button>
                  {f.canDelete && <Button variant="ghost" size="icon-sm" onClick={() => remove(f.id, f.name)} aria-label={`Excluir ${f.name}`}><Trash2 className="size-4" /></Button>}
                </div>
              </div>
            </Card>
          )
        })}
      </div>
      {!list.length && <Card className="p-12 text-center text-sm text-muted-foreground">Nenhum arquivo encontrado.</Card>}
    </div>
  )
}
