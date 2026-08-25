'use client'

import { useRef, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import {
  ArrowLeft,
  Archive,
  Heading2,
  Bold,
  Italic,
  List,
  Quote,
  Link2,
  ImageIcon,
  Video,
  Music,
  Save,
  Send,
  Clock,
  MessageSquare,
  Sparkles,
  Loader2,
  Trash2,
  Smile,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Avatar } from '@/components/ui/avatar'
import { privateAvatarUrl } from '@/lib/avatar-url'
import { ContentStatusBadge } from '@/components/ui/status-badge'
import { EmojiPicker } from '@/components/app/emoji-picker'
import type { ContentPiece, Pauta, Person } from '@/lib/data'
import { addContentComment, archiveContentDraft, saveContent, submitContentForApproval } from '@/app/actions/editorial'
import { SeletorDeRevisores, type PessoaDoEspaco } from '@/components/app/seletor-de-revisores'
import { mediaToken, parseContentBlocks } from '@/lib/content-blocks'
import { PublicadorRedes, type PublicacaoRegistro } from '@/components/app/publicador-redes'

const mediaKinds = [
  { kind: 'image' as const, icon: ImageIcon, label: 'Imagem', accept: 'image/jpeg,image/png,image/webp,image/gif' },
  { kind: 'video' as const, icon: Video, label: 'Vídeo', accept: 'video/mp4,video/webm,video/quicktime' },
  { kind: 'audio' as const, icon: Music, label: 'Áudio', accept: 'audio/mpeg,audio/wav,audio/ogg' },
]

export function ContentEditor({
  content,
  pauta,
  responsible,
  comments,
  canSubmit = false,
  publicacoes = [],
  workspaceId,
  pessoas = [],
}: {
  content: ContentPiece
  pauta?: Pauta
  responsible?: Person
  canSubmit?: boolean
  publicacoes?: PublicacaoRegistro[]
  workspaceId: string
  pessoas?: PessoaDoEspaco[]
  comments?: Array<{
    id: string
    text: string
    time: string
    author: { name: string; initials: string; color?: string; avatarPath?: string | null }
  }>
}) {
  const router = useRouter()
  // Rascunhos de demonstração não têm id no banco: não há o que publicar,
  // nem onde registrar o envio.
  const isPersisted = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(content.id)
  const [title, setTitle] = useState(content.title ?? '')
  const [subtitle, setSubtitle] = useState(content.subtitle ?? '')
  const [body, setBody] = useState(content.body ?? '')
  const [saved, setSaved] = useState(true)
  const [showConcludeModal, setShowConcludeModal] = useState(false)
  const [concludeBusy, setConcludeBusy] = useState(false)
  const [revisores, setRevisores] = useState<string[]>([])
  const [concludeError, setConcludeError] = useState('')
  const [uploadingKind, setUploadingKind] = useState<'image' | 'video' | 'audio' | null>(null)
  const [mediaError, setMediaError] = useState('')
  const [emojiPickerOpen, setEmojiPickerOpen] = useState(false)
  const imageInputRef = useRef<HTMLInputElement>(null)
  const videoInputRef = useRef<HTMLInputElement>(null)
  const audioInputRef = useRef<HTMLInputElement>(null)
  const bodyRef = useRef<HTMLTextAreaElement>(null)
  const inputRefs = { image: imageInputRef, video: videoInputRef, audio: audioInputRef }

  const wordCount = body.trim() ? body.trim().split(/\s+/).length : 0
  const readMinutes = Math.max(1, Math.round(wordCount / 200))
  const visibleComments = comments ?? []
  const mediaBlocks = parseContentBlocks(body).filter(
    (block): block is { type: 'image' | 'video' | 'audio'; url: string; alt: string } =>
      block.type === 'image' || block.type === 'video' || block.type === 'audio',
  )

  async function uploadMedia(kind: 'image' | 'video' | 'audio', file: File) {
    setMediaError('')
    setUploadingKind(kind)
    try {
      const formData = new FormData()
      formData.set('file', file)
      formData.set('tags', 'conteudo')
      const response = await fetch('/api/files/upload', { method: 'POST', body: formData })
      const result = await response.json()
      if (!response.ok) throw new Error(result.error || 'Não foi possível enviar o arquivo.')
      const url = `/api/private-blob?pathname=${encodeURIComponent(result.storagePath)}`
      const token = mediaToken(kind, url, file.name)
      setBody((current) => `${current}${current.trim() ? '\n\n' : ''}${token}\n\n`)
      setSaved(false)
    } catch (error) {
      setMediaError(error instanceof Error ? error.message : 'Não foi possível enviar o arquivo.')
    } finally {
      setUploadingKind(null)
    }
  }

  function removeMediaBlock(target: { type: string; url: string }) {
    const lines = body.split(/\n\n+/).filter((paragraph) => {
      const trimmed = paragraph.trim()
      return !(trimmed.includes(target.url) && trimmed.startsWith('!['))
    })
    setBody(lines.join('\n\n'))
    setSaved(false)
  }

  function focusBodyAt(start: number, end: number) {
    requestAnimationFrame(() => {
      const el = bodyRef.current
      if (!el) return
      el.focus()
      el.setSelectionRange(start, end)
    })
  }

  function wrapSelection(before: string, after: string, placeholder: string) {
    const el = bodyRef.current
    if (!el) return
    const start = el.selectionStart
    const end = el.selectionEnd
    const selected = body.slice(start, end) || placeholder
    const newBody = body.slice(0, start) + before + selected + after + body.slice(end)
    setBody(newBody)
    setSaved(false)
    focusBodyAt(start + before.length, start + before.length + selected.length)
  }

  function prefixLines(prefix: string) {
    const el = bodyRef.current
    if (!el) return
    const start = el.selectionStart
    const end = el.selectionEnd
    const lineStart = body.lastIndexOf('\n', start - 1) + 1
    const nextBreak = body.indexOf('\n', end)
    const lineEnd = nextBreak === -1 ? body.length : nextBreak
    const segment = body.slice(lineStart, lineEnd)
    const prefixed = segment
      .split('\n')
      .map((line) => (line.startsWith(prefix) ? line : `${prefix}${line}`))
      .join('\n')
    const newBody = body.slice(0, lineStart) + prefixed + body.slice(lineEnd)
    setBody(newBody)
    setSaved(false)
    focusBodyAt(lineStart, lineStart + prefixed.length)
  }

  function insertLink() {
    const el = bodyRef.current
    if (!el) return
    const url = window.prompt('Endereço do link (https://…)')
    if (!url) return
    const start = el.selectionStart
    const end = el.selectionEnd
    const selected = body.slice(start, end) || 'texto do link'
    const token = `[${selected}](${url})`
    const newBody = body.slice(0, start) + token + body.slice(end)
    setBody(newBody)
    setSaved(false)
    focusBodyAt(start, start + token.length)
  }

  function insertEmoji(emoji: string) {
    const el = bodyRef.current
    const start = el?.selectionStart ?? body.length
    const end = el?.selectionEnd ?? body.length
    const newBody = body.slice(0, start) + emoji + body.slice(end)
    setBody(newBody)
    setSaved(false)
    setEmojiPickerOpen(false)
    focusBodyAt(start + emoji.length, start + emoji.length)
  }

  async function handleSubmitForApproval(formData: FormData) {
    setConcludeBusy(true)
    setConcludeError('')
    try {
      await submitContentForApproval(formData)
      setShowConcludeModal(false)
      router.push('/aprovacoes')
    } catch (error) {
      setConcludeError(error instanceof Error ? error.message : 'Não foi possível enviar para aprovação.')
    } finally {
      setConcludeBusy(false)
    }
  }

  async function handleArchive(formData: FormData) {
    setConcludeBusy(true)
    setConcludeError('')
    try {
      await archiveContentDraft(formData)
      setShowConcludeModal(false)
      router.refresh()
    } catch (error) {
      setConcludeError(error instanceof Error ? error.message : 'Não foi possível arquivar a matéria.')
    } finally {
      setConcludeBusy(false)
    }
  }

  return (
    <div className="flex flex-col">
      {/* Editor topbar */}
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-border px-6 py-4 lg:px-8">
        <div className="flex items-center gap-4">
          <Link
            href={`/pautas/${content.pautaId}`}
            className="flex size-9 items-center justify-center rounded-lg border border-border text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            aria-label="Voltar para a pauta"
          >
            <ArrowLeft className="size-4" />
          </Link>
          <div>
            <div className="flex items-center gap-2">
              <ContentStatusBadge status={content.status} />
              <span className="text-xs text-muted-foreground">{content.type}</span>
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              Pauta: <span className="text-foreground">{content.pautaTitle}</span>
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="mr-2 flex items-center gap-1.5 text-xs text-muted-foreground">
            <Clock className="size-3.5" />
            {saved ? 'Salvo automaticamente' : 'Alterações não salvas'}
          </span>
          <form action={saveContent} onSubmit={() => setSaved(true)}>
            <input type="hidden" name="id" value={content.id} />
            <input type="hidden" name="title" value={title} />
            <input type="hidden" name="body" value={body} />
            <input type="hidden" name="subtitle" value={subtitle} />
            <Button variant="outline" size="lg" type="submit">
              <Save className="size-4" />
              Salvar
            </Button>
          </form>
          {canSubmit && (
            <Button size="lg" type="button" onClick={() => setShowConcludeModal(true)}>
              <Send className="size-4" />
              {content.status === 'aprovacao' ? 'Atualizar aprovação' : 'Concluir matéria'}
            </Button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_320px]">
        {/* Editor pane */}
        <div className="lg:border-r lg:border-border">
          <div className="flex flex-wrap items-center gap-1 border-b border-border px-6 py-2 lg:px-8">
            <button type="button" aria-label="Título" onClick={() => prefixLines('## ')} className="flex size-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground">
              <Heading2 className="size-4" />
            </button>
            <button type="button" aria-label="Negrito" onClick={() => wrapSelection('**', '**', 'negrito')} className="flex size-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground">
              <Bold className="size-4" />
            </button>
            <button type="button" aria-label="Itálico" onClick={() => wrapSelection('*', '*', 'itálico')} className="flex size-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground">
              <Italic className="size-4" />
            </button>
            <button type="button" aria-label="Lista" onClick={() => prefixLines('- ')} className="flex size-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground">
              <List className="size-4" />
            </button>
            <button type="button" aria-label="Citação" onClick={() => prefixLines('> ')} className="flex size-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground">
              <Quote className="size-4" />
            </button>
            <button type="button" aria-label="Link" onClick={insertLink} className="flex size-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground">
              <Link2 className="size-4" />
            </button>
            <div className="relative">
              <button type="button" aria-label="Emoji" onClick={() => setEmojiPickerOpen((open) => !open)} className="flex size-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground">
                <Smile className="size-4" />
              </button>
              {emojiPickerOpen && <EmojiPicker onSelect={insertEmoji} onClose={() => setEmojiPickerOpen(false)} />}
            </div>
            <div className="mx-2 h-5 w-px bg-border" />
            {mediaKinds.map((m) => (
              <button
                key={m.kind}
                type="button"
                aria-label={`Adicionar ${m.label.toLowerCase()}`}
                disabled={uploadingKind !== null}
                onClick={() => inputRefs[m.kind].current?.click()}
                className="flex size-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:opacity-50"
              >
                {uploadingKind === m.kind ? <Loader2 className="size-4 animate-spin" /> : <m.icon className="size-4" />}
              </button>
            ))}
            <div className="mx-2 h-5 w-px bg-border" />
            <button
              type="button"
              disabled
              title="Em breve — depende de escolher e configurar um serviço de IA"
              className="flex cursor-not-allowed items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium text-muted-foreground opacity-60"
            >
              <Sparkles className="size-4" />
              Assistente (em breve)
            </button>
            {mediaKinds.map((m) => (
              <input
                key={m.kind}
                ref={inputRefs[m.kind]}
                type="file"
                accept={m.accept}
                className="sr-only"
                onChange={(event) => {
                  const file = event.target.files?.[0]
                  event.target.value = ''
                  if (file) uploadMedia(m.kind, file)
                }}
              />
            ))}
          </div>
          {mediaError && <p className="px-6 pt-2 text-xs text-destructive lg:px-8">{mediaError}</p>}

          <div className="mx-auto max-w-3xl px-6 py-8 lg:px-12">
            <input
              value={title}
              onChange={(e) => {
                setTitle(e.target.value)
                setSaved(false)
              }}
              className="w-full border-none bg-transparent font-serif text-3xl font-bold leading-tight outline-none placeholder:text-muted-foreground/50"
              placeholder="Título do conteúdo"
            />
            <input
              value={subtitle}
              onChange={(e) => {
                setSubtitle(e.target.value)
                setSaved(false)
              }}
              className="mt-3 w-full border-none bg-transparent text-lg text-muted-foreground outline-none placeholder:text-muted-foreground/50"
              placeholder="Linha de apoio (opcional)"
            />
            <div className="mt-3 flex items-center gap-3 text-xs text-muted-foreground">
              <span>{wordCount} palavras</span>
              <span aria-hidden>·</span>
              <span>{readMinutes} min de leitura</span>
            </div>
            <textarea
              ref={bodyRef}
              value={body}
              onChange={(e) => {
                setBody(e.target.value)
                setSaved(false)
              }}
              rows={20}
              className="mt-6 w-full resize-none border-none bg-transparent text-base leading-relaxed outline-none placeholder:text-muted-foreground/50"
              placeholder="Comece a escrever o conteúdo…"
            />

            {mediaBlocks.length > 0 && (
              <div className="mt-6 flex flex-col gap-3 border-t border-border pt-6">
                <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Mídia anexada ({mediaBlocks.length})
                </h3>
                {mediaBlocks.map((block, index) => (
                  <div key={`${block.url}-${index}`} className="flex items-center gap-3 rounded-lg border border-border p-2">
                    {block.type === 'image' && <img src={block.url} alt={block.alt} className="size-14 shrink-0 rounded-md object-cover" />}
                    {block.type === 'video' && <video src={block.url} className="size-14 shrink-0 rounded-md bg-muted object-cover" muted />}
                    {block.type === 'audio' && (
                      <span className="flex size-14 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground">
                        <Music className="size-5" />
                      </span>
                    )}
                    <span className="min-w-0 flex-1 truncate text-sm">{block.alt || 'Arquivo sem nome'}</span>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-sm"
                      aria-label={`Remover ${block.alt || 'mídia'}`}
                      onClick={() => removeMediaBlock(block)}
                    >
                      <Trash2 className="size-4" />
                    </Button>
                  </div>
                ))}
              </div>
            )}

            {isPersisted && (
              <div className="mt-6 border-t border-border pt-6">
                <PublicadorRedes
                  workspaceId={workspaceId}
                  contentId={content.id}
                  textoInicial={[title, subtitle].filter(Boolean).join('\n\n')}
                  publicacoes={publicacoes}
                />
              </div>
            )}
          </div>
        </div>

        {/* Sidebar */}
        <aside className="flex flex-col gap-6 border-t border-border p-6 lg:border-t-0">
          <div>
            <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Detalhes
            </h3>
            <dl className="mt-3 space-y-3 text-sm">
              <Row label="Responsável">
                <span className="flex items-center gap-2">
                  <Avatar initials={responsible?.initials ?? '?'} color={responsible?.color} src={privateAvatarUrl((responsible as any)?.avatarPath)} size="sm" />
                  {responsible?.name}
                </span>
              </Row>
              <Row label="Formato">{content.type}</Row>
              <Row label="Projeto">{pauta?.project ?? '—'}</Row>
              <Row label="Versão">{content.version}</Row>
              <Row label="Atualizado">{content.lastEdit}</Row>
            </dl>
          </div>

          <div className="border-t border-border pt-6">
            <h3 className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              <MessageSquare className="size-3.5" />
              Comentários ({visibleComments.length})
            </h3>
            <ul className="mt-4 space-y-4" aria-live="polite">
              {visibleComments.map((comment) => (
                <li key={comment.id} className="flex gap-3">
                  <Avatar initials={comment.author.initials} color={comment.author.color} src={privateAvatarUrl(comment.author.avatarPath)} size="sm" />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-baseline gap-2">
                      <span className="text-sm font-medium">{comment.author.name}</span>
                      <span className="text-xs text-muted-foreground">{comment.time}</span>
                    </div>
                    <p className="mt-0.5 text-sm leading-relaxed text-muted-foreground">{comment.text}</p>
                  </div>
                </li>
              ))}
            </ul>
            {isPersisted && (
              <form action={addContentComment} className="mt-4 flex gap-2">
                <input type="hidden" name="contentId" value={content.id} />
                <input
                  name="body"
                  required
                  maxLength={2000}
                  className="h-9 min-w-0 flex-1 rounded-lg border border-border bg-background px-3 text-sm outline-none placeholder:text-muted-foreground focus:border-ring focus:ring-2 focus:ring-ring/30"
                  placeholder="Adicionar comentário…"
                  aria-label="Adicionar comentário"
                />
                <Button variant="outline" size="lg" type="submit">
                  Enviar
                </Button>
              </form>
            )}
          </div>
        </aside>
      </div>

      {showConcludeModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <button
            type="button"
            className="absolute inset-0 bg-background/80 backdrop-blur-sm"
            aria-label="Fechar"
            onClick={() => setShowConcludeModal(false)}
          />
          <Card className="relative z-10 w-full max-w-md p-6 shadow-lg">
            <h2 className="text-lg font-semibold">{content.status === 'aprovacao' ? 'Atualizar aprovação' : 'Concluir matéria'}</h2>
            <p className="mt-1.5 text-sm text-muted-foreground">
              {content.status === 'aprovacao'
                ? `“${title || 'Sem título'}” já está em aprovação. O que você quer fazer agora?`
                : `“${title || 'Sem título'}” está pronta. O que você quer fazer agora?`}
            </p>
            {concludeError && <p className="mt-3 text-sm text-destructive">{concludeError}</p>}
            <div className="mt-5 flex flex-col gap-3">
              <form action={handleSubmitForApproval} className="flex flex-col gap-3">
                <input type="hidden" name="id" value={content.id} />
                <input type="hidden" name="title" value={title} />
                <input type="hidden" name="subtitle" value={subtitle} />
                <input type="hidden" name="body" value={body} />
                <input type="hidden" name="format" value={content.type} />
                <SeletorDeRevisores
                  pessoas={pessoas}
                  selecionados={revisores}
                  onChange={setRevisores}
                  vazio="Não há outras pessoas neste espaço para revisar."
                />
                <button
                  type="submit"
                  disabled={concludeBusy}
                  className="w-full rounded-lg border border-primary bg-primary/5 p-3 text-left transition-colors hover:bg-primary/10 disabled:opacity-60"
                >
                  <span className="flex items-center gap-2 text-sm font-semibold text-primary">
                    <Send className="size-4" />
                    {concludeBusy ? 'Enviando…' : content.status === 'aprovacao' ? 'Atualizar quem precisa aprovar' : 'Enviar para aprovação'}
                  </span>
                  <span className="mt-1 block text-xs text-muted-foreground">
                    Quem você marcar acima recebe o pedido, somado aos participantes da pauta. Quem escreve e quem responde
                    pelo conteúdo não entra — ninguém aprova o próprio texto.
                  </span>
                </button>
              </form>
              <form action={handleArchive}>
                <input type="hidden" name="id" value={content.id} />
                <input type="hidden" name="title" value={title} />
                <input type="hidden" name="subtitle" value={subtitle} />
                <input type="hidden" name="body" value={body} />
                <button
                  type="submit"
                  disabled={concludeBusy}
                  className="w-full rounded-lg border border-border p-3 text-left transition-colors hover:bg-muted disabled:opacity-60"
                >
                  <span className="flex items-center gap-2 text-sm font-semibold">
                    <Archive className="size-4" />
                    {content.status === 'aprovacao' ? 'Cancelar aprovação e arquivar' : 'Arquivar e continuar depois'}
                  </span>
                  <span className="mt-1 block text-xs text-muted-foreground">
                    {content.status === 'aprovacao'
                      ? 'Tira a matéria da fila de aprovação e guarda como rascunho arquivado, sem avisar quem ainda não decidiu.'
                      : 'Guarda como rascunho arquivado, sem enviar para ninguém ainda.'}
                  </span>
                </button>
              </form>
            </div>
            <Button variant="ghost" size="sm" className="mt-4 w-full" type="button" disabled={concludeBusy} onClick={() => { setShowConcludeModal(false); setConcludeError('') }}>
              Cancelar
            </Button>
          </Card>
        </div>
      )}
    </div>
  )
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="flex items-center text-right font-medium">{children}</dd>
    </div>
  )
}
