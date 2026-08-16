import Link from 'next/link'
import { ArrowRight, Check, Clock, X } from 'lucide-react'
import { Card } from '@/components/ui/card'
import { Avatar } from '@/components/ui/avatar'
import { PageHeader } from '@/components/app/page-header'
import { approvals, getPerson } from '@/lib/data'
import { cn } from '@/lib/utils'

const stepMeta = {
  aprovado: { icon: Check, className: 'bg-success text-white', ring: 'text-success' },
  pendente: { icon: Clock, className: 'bg-warning text-white', ring: 'text-warning-foreground' },
  reprovado: { icon: X, className: 'bg-destructive text-white', ring: 'text-destructive' },
} as const

export default function AprovacoesPage() {
  return (
    <div>
      <PageHeader
        title="Aprovações"
        description="Conteúdos aguardando validação das coordenações e da diretoria."
      />

      <div className="mb-5 flex flex-wrap gap-1.5">
        {['Aguardando você', 'Todas', 'Aprovadas', 'Reprovadas'].map((f, i) => (
          <button
            key={f}
            type="button"
            className={cn(
              'rounded-lg px-3 py-1.5 text-sm font-medium transition-colors',
              i === 0
                ? 'bg-foreground text-background'
                : 'bg-muted text-muted-foreground hover:text-foreground',
            )}
          >
            {f}
          </button>
        ))}
      </div>

      <div className="flex flex-col gap-3">
        {approvals.map((a) => {
          const responsible = getPerson(a.responsibleId)
          const requester = getPerson(a.requesterId)
          const pending = a.steps.filter((s) => s.status === 'pendente').length
          return (
            <Card key={a.id} className="p-5">
              <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="rounded-md border border-border px-2 py-0.5 text-xs text-muted-foreground">
                      {a.type}
                    </span>
                    {pending > 0 && (
                      <span className="rounded-md bg-warning/20 px-2 py-0.5 text-xs font-medium text-warning-foreground">
                        {pending} etapa{pending > 1 ? 's' : ''} pendente{pending > 1 ? 's' : ''}
                      </span>
                    )}
                  </div>
                  <h3 className="mt-1.5 text-base font-semibold">{a.title}</h3>
                  <p className="mt-0.5 text-sm text-muted-foreground">Pauta: {a.pauta}</p>

                  {/* Steps */}
                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    {a.steps.map((s, i) => {
                      const m = stepMeta[s.status]
                      return (
                        <div key={s.label} className="flex items-center gap-2">
                          <span className="flex items-center gap-1.5 rounded-full bg-muted/60 py-1 pl-1 pr-2.5">
                            <span
                              className={cn(
                                'flex size-4 items-center justify-center rounded-full',
                                m.className,
                              )}
                            >
                              <m.icon className="size-2.5" />
                            </span>
                            <span className="text-xs font-medium">{s.label}</span>
                          </span>
                          {i < a.steps.length - 1 && (
                            <ArrowRight className="size-3 text-muted-foreground" />
                          )}
                        </div>
                      )
                    })}
                  </div>

                  <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
                    <span className="flex items-center gap-1.5">
                      <Avatar initials={requester?.initials ?? '?'} color={requester?.color} size="xs" />
                      Solicitado por {requester?.name.split(' ')[0]}
                    </span>
                    <span>Responsável: {responsible?.name}</span>
                    <span>{a.date}</span>
                  </div>
                </div>

                <Link
                  href={`/aprovacoes/${a.id}`}
                  className="inline-flex h-9 shrink-0 items-center justify-center gap-1.5 rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
                >
                  Revisar
                  <ArrowRight className="size-4" />
                </Link>
              </div>
            </Card>
          )
        })}
      </div>
    </div>
  )
}
