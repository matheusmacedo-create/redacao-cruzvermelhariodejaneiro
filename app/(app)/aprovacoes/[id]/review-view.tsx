'use client'

import { useState } from 'react'
import Link from 'next/link'
import { ArrowLeft, Check, X, Clock, MessageSquarePlus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Avatar } from '@/components/ui/avatar'
import { ContentStatusBadge } from '@/components/ui/status-badge'
import type { ApprovalItem, ContentPiece, Person } from '@/lib/data'
import { getPerson } from '@/lib/data'
import { cn } from '@/lib/utils'
import { decideApproval } from '@/app/actions/editorial'

const stepMeta = {
  aprovado: { icon: Check, className: 'bg-success text-white', label: 'Aprovado', tone: 'text-success' },
  pendente: { icon: Clock, className: 'bg-warning text-white', label: 'Pendente', tone: 'text-warning-foreground' },
  reprovado: { icon: X, className: 'bg-destructive text-white', label: 'Reprovado', tone: 'text-destructive' },
} as const

export function ReviewView({
  approval,
  content,
  requester,
}: {
  approval: ApprovalItem
  content?: ContentPiece
  requester?: Person
}) {
  const [decision, setDecision] = useState<'aprovado' | 'reprovado' | null>(null)
  const [note, setNote] = useState('')

  const bodyParagraphs = (content?.body ?? 'Conteúdo em elaboração.').split('\n\n')

  return (
    <div>
      <nav className="mb-4 flex items-center gap-1 text-xs text-muted-foreground">
        <Link href="/aprovacoes" className="flex items-center gap-1 hover:text-foreground">
          <ArrowLeft className="size-3.5" />
          Aprovações
        </Link>
        <span>/</span>
        <span className="text-foreground">{approval.title}</span>
      </nav>

      <div className="grid gap-6 lg:grid-cols-[1fr_340px]">
        {/* Content preview */}
        <Card className="overflow-hidden">
          <div className="flex items-center justify-between border-b border-border px-6 py-3">
            <div className="flex items-center gap-2">
              {content && <ContentStatusBadge status={content.status} />}
              <span className="text-xs text-muted-foreground">{approval.type}</span>
            </div>
            <span className="text-xs text-muted-foreground">{content?.version}</span>
          </div>
          <article className="px-6 py-8 lg:px-10">
            <p className="text-xs font-medium uppercase tracking-wide text-primary">
              {approval.pauta}
            </p>
            <h1 className="mt-2 font-serif text-3xl font-bold leading-tight text-balance">
              {content?.title ?? approval.title}
            </h1>
            {content?.subtitle && (
              <p className="mt-3 text-lg text-muted-foreground text-pretty">{content.subtitle}</p>
            )}
            <div className="mt-6 flex flex-col gap-4 text-base leading-relaxed">
              {bodyParagraphs.map((p, i) => (
                <p key={i}>{p}</p>
              ))}
            </div>
          </article>
        </Card>

        {/* Decision panel */}
        <div className="flex flex-col gap-4">
          <Card className="p-5">
            <h3 className="text-sm font-semibold">Fluxo de aprovação</h3>
            <ol className="mt-4 space-y-4">
              {approval.steps.map((s) => {
                const m = stepMeta[s.status]
                return (
                  <li key={s.label} className="flex items-center gap-3">
                    <span
                      className={cn(
                        'flex size-6 shrink-0 items-center justify-center rounded-full',
                        m.className,
                      )}
                    >
                      <m.icon className="size-3.5" />
                    </span>
                    <div className="flex-1">
                      <p className="text-sm font-medium">{s.label}</p>
                    </div>
                    <span className={cn('text-xs font-medium', m.tone)}>{m.label}</span>
                  </li>
                )
              })}
            </ol>
          </Card>

          <Card className="p-5">
            <div className="flex items-center gap-2">
              <Avatar initials={requester?.initials ?? '?'} color={requester?.color} size="sm" />
              <div>
                <p className="text-sm font-medium">{requester?.name}</p>
                <p className="text-xs text-muted-foreground">
                  Solicitou em {approval.date}
                </p>
              </div>
            </div>
          </Card>

          <Card className="p-5">
            <form action={decideApproval}>
            <input type="hidden" name="id" value={approval.id} />
            <input type="hidden" name="decision" value={decision === 'aprovado' ? 'approved' : decision === 'reprovado' ? 'changes_requested' : ''} />
            <h3 className="text-sm font-semibold">Sua decisão</h3>
            <div className="mt-3 grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setDecision('aprovado')}
                className={cn(
                  'flex items-center justify-center gap-1.5 rounded-lg border px-3 py-2 text-sm font-medium transition-colors',
                  decision === 'aprovado'
                    ? 'border-success bg-success/12 text-success'
                    : 'border-border text-muted-foreground hover:bg-muted',
                )}
              >
                <Check className="size-4" />
                Aprovar
              </button>
              <button
                type="button"
                onClick={() => setDecision('reprovado')}
                className={cn(
                  'flex items-center justify-center gap-1.5 rounded-lg border px-3 py-2 text-sm font-medium transition-colors',
                  decision === 'reprovado'
                    ? 'border-destructive bg-destructive/10 text-destructive'
                    : 'border-border text-muted-foreground hover:bg-muted',
                )}
              >
                <X className="size-4" />
                Solicitar ajustes
              </button>
            </div>

            <label className="mt-4 flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
              <MessageSquarePlus className="size-3.5" />
              Comentário {decision === 'reprovado' && <span className="text-primary">(obrigatório)</span>}
            </label>
            <textarea
              name="note"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={3}
              placeholder="Deixe uma observação para a equipe…"
              className="mt-1.5 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-ring focus:ring-2 focus:ring-ring/30"
            />

            <Button
              size="lg"
              className="mt-4 h-11 w-full"
              disabled={!decision || (decision === 'reprovado' && !note.trim())}
            >
              Confirmar decisão
            </Button>
            </form>
          </Card>
        </div>
      </div>
    </div>
  )
}
