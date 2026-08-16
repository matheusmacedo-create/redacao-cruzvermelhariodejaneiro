'use client'

import { useState } from 'react'
import Link from 'next/link'
import {
  ArrowLeft,
  Heading2,
  Bold,
  Italic,
  List,
  Quote,
  Link2,
  ImageIcon,
  Save,
  Send,
  Clock,
  MessageSquare,
  Sparkles,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Avatar } from '@/components/ui/avatar'
import { ContentStatusBadge } from '@/components/ui/status-badge'
import type { ContentPiece, Pauta, Person } from '@/lib/data'
import { getPerson } from '@/lib/data'

const tools = [
  { icon: Heading2, label: 'Título' },
  { icon: Bold, label: 'Negrito' },
  { icon: Italic, label: 'Itálico' },
  { icon: List, label: 'Lista' },
  { icon: Quote, label: 'Citação' },
  { icon: Link2, label: 'Link' },
  { icon: ImageIcon, label: 'Imagem' },
]

const editorComments = [
  { id: 'ec1', authorId: 'matheus', time: 'há 40 min', text: 'Podemos citar o número exato de voluntários no segundo parágrafo?' },
  { id: 'ec2', authorId: 'ana', time: 'há 25 min', text: 'Ajustei. Confirmei com o Carlos: foram 14 voluntários.' },
]

export function ContentEditor({
  content,
  pauta,
  responsible,
}: {
  content: ContentPiece
  pauta?: Pauta
  responsible?: Person
}) {
  const [title, setTitle] = useState(content.title ?? '')
  const [subtitle, setSubtitle] = useState(content.subtitle ?? '')
  const [body, setBody] = useState(content.body ?? '')
  const [saved, setSaved] = useState(true)

  const wordCount = body.trim() ? body.trim().split(/\s+/).length : 0
  const readMinutes = Math.max(1, Math.round(wordCount / 200))

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
        <div className="flex items-center gap-2">
          <span className="mr-2 flex items-center gap-1.5 text-xs text-muted-foreground">
            <Clock className="size-3.5" />
            {saved ? 'Salvo automaticamente' : 'Alterações não salvas'}
          </span>
          <Button variant="outline" size="lg" onClick={() => setSaved(true)}>
            <Save className="size-4" />
            Salvar
          </Button>
          <Button size="lg">
            <Send className="size-4" />
            Enviar para aprovação
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px]">
        {/* Editor pane */}
        <div className="lg:border-r lg:border-border">
          <div className="flex items-center gap-1 border-b border-border px-6 py-2 lg:px-8">
            {tools.map((t) => (
              <button
                key={t.label}
                type="button"
                aria-label={t.label}
                className="flex size-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              >
                <t.icon className="size-4" />
              </button>
            ))}
            <div className="mx-2 h-5 w-px bg-border" />
            <button
              type="button"
              className="flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium text-primary transition-colors hover:bg-primary/10"
            >
              <Sparkles className="size-4" />
              Assistente
            </button>
          </div>

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
              value={body}
              onChange={(e) => {
                setBody(e.target.value)
                setSaved(false)
              }}
              rows={20}
              className="mt-6 w-full resize-none border-none bg-transparent text-base leading-relaxed outline-none placeholder:text-muted-foreground/50"
              placeholder="Comece a escrever o conteúdo…"
            />
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
                  <Avatar initials={responsible?.initials ?? '?'} color={responsible?.color} size="sm" />
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
              Comentários ({editorComments.length})
            </h3>
            <ul className="mt-4 space-y-4">
              {editorComments.map((c) => {
                const author = getPerson(c.authorId)
                return (
                  <li key={c.id} className="flex gap-3">
                    <Avatar initials={author?.initials ?? '?'} color={author?.color} size="sm" />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-baseline gap-2">
                        <span className="text-sm font-medium">{author?.name}</span>
                        <span className="text-xs text-muted-foreground">{c.time}</span>
                      </div>
                      <p className="mt-0.5 text-sm leading-relaxed text-muted-foreground">{c.text}</p>
                    </div>
                  </li>
                )
              })}
            </ul>
            <div className="mt-4 flex gap-2">
              <input
                className="h-9 flex-1 rounded-lg border border-border bg-background px-3 text-sm outline-none placeholder:text-muted-foreground focus:border-ring focus:ring-2 focus:ring-ring/30"
                placeholder="Adicionar comentário…"
              />
              <Button variant="outline" size="lg">
                Enviar
              </Button>
            </div>
          </div>
        </aside>
      </div>
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
