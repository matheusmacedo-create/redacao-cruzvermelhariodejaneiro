import Link from 'next/link'
import { Plus, ArrowRight, AlertTriangle, ChevronRight } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Avatar } from '@/components/ui/avatar'
import { StatusBadge, PriorityBadge } from '@/components/ui/status-badge'
import {
  dashboardStats,
  editorialFlow,
  recentActivity,
  calendarItems,
  pautas,
  getPerson,
  getProject,
} from '@/lib/data'

const toneStyles: Record<string, { value: string; ring: string }> = {
  neutral: { value: 'text-foreground', ring: 'bg-muted-foreground' },
  info: { value: 'text-info', ring: 'bg-info' },
  warning: { value: 'text-warning-foreground', ring: 'bg-warning' },
  success: { value: 'text-success', ring: 'bg-success' },
  danger: { value: 'text-destructive', ring: 'bg-destructive' },
}

export default function DashboardPage() {
  const week = calendarItems.slice(1, 4)
  const attention = pautas.filter((p) => p.needsAttention)

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Boa tarde, Matheus.</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Acompanhe o que está acontecendo na Redação CVRJ.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="lg" render={<Link href="/registrar" />}>
            Registrar atividade
          </Button>
          <Button size="lg" render={<Link href="/pautas" />}>
            <Plus className="size-4" />
            Nova pauta
          </Button>
        </div>
      </div>

      {/* Indicadores */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
        {dashboardStats.map((s) => {
          const t = toneStyles[s.tone]
          return (
            <Card key={s.label} className="p-4">
              <div className="flex items-center gap-2">
                <span className={`size-2 rounded-full ${t.ring}`} />
                <span className={`text-3xl font-bold tabular-nums ${t.value}`}>{s.value}</span>
              </div>
              <p className="mt-1 text-sm text-muted-foreground">{s.label}</p>
            </Card>
          )
        })}
      </div>

      {/* Fluxo editorial */}
      <section className="mt-6">
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          Fluxo editorial
        </h2>
        <Card className="p-5">
          <div className="flex flex-wrap items-center gap-2">
            {editorialFlow.map((step, i) => (
              <div key={step.label} className="flex items-center gap-2">
                <div className="flex min-w-24 flex-col rounded-lg border border-border px-3 py-2">
                  <span className="text-lg font-bold tabular-nums">{step.count}</span>
                  <span className="text-xs text-muted-foreground">{step.label}</span>
                </div>
                {i < editorialFlow.length - 1 && (
                  <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
                )}
              </div>
            ))}
          </div>
        </Card>
      </section>

      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        {/* Minha semana */}
        <section className="lg:col-span-2">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
              Minha semana
            </h2>
            <Link
              href="/calendario"
              className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
            >
              Ver calendário <ArrowRight className="size-3" />
            </Link>
          </div>
          <Card className="divide-y divide-border">
            {week.map((item) => {
              const project = getProject(item.projectId)
              return (
                <Link
                  key={item.pautaId}
                  href={`/pautas/${item.pautaId}`}
                  className="flex items-center gap-4 px-5 py-3.5 transition-colors hover:bg-muted/50"
                >
                  <div className="flex w-14 flex-col items-center rounded-lg bg-muted py-1.5">
                    <span className="text-lg font-bold leading-none tabular-nums">{item.day}</span>
                    <span className="text-[10px] font-medium uppercase text-muted-foreground">
                      {item.month}
                    </span>
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="flex items-center gap-1.5 text-xs font-medium text-primary">
                      <span>{project?.emoji}</span>
                      {item.project}
                    </p>
                    <p className="truncate text-sm font-medium">{item.title}</p>
                  </div>
                  <ChevronRight className="size-4 text-muted-foreground" />
                </Link>
              )
            })}
          </Card>
        </section>

        {/* Atividade recente */}
        <section>
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            Atividade recente
          </h2>
          <Card className="p-5">
            <ul className="flex flex-col gap-4">
              {recentActivity.map((a) => {
                const person = getPerson(a.authorId)
                return (
                  <li key={a.id} className="flex gap-3">
                    <Avatar initials={person?.initials ?? '?'} color={person?.color} size="sm" />
                    <div className="min-w-0">
                      <p className="text-sm leading-snug">
                        <span className="font-medium">{person?.name.split(' ')[0]}</span>{' '}
                        <span className="text-muted-foreground">{a.text}</span>
                      </p>
                      <p className="text-xs text-muted-foreground">{a.time}</p>
                    </div>
                  </li>
                )
              })}
            </ul>
          </Card>
        </section>
      </div>

      {/* Precisam da minha atenção */}
      <section className="mt-6">
        <div className="mb-3 flex items-center gap-2">
          <AlertTriangle className="size-4 text-primary" />
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            Precisam da minha atenção
          </h2>
        </div>
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {attention.map((p) => {
            const person = getPerson(p.responsibleId)
            return (
              <Link key={p.id} href={`/pautas/${p.id}`}>
                <Card className="h-full border-l-2 border-l-primary p-4 transition-shadow hover:shadow-sm">
                  <div className="mb-2 flex items-center justify-between gap-2">
                    <StatusBadge status={p.status} />
                    <PriorityBadge priority={p.priority} />
                  </div>
                  <p className="font-medium leading-snug text-pretty">{p.title}</p>
                  <div className="mt-3 flex items-center justify-between text-xs text-muted-foreground">
                    <span className="flex items-center gap-1.5">
                      <Avatar
                        initials={person?.initials ?? '?'}
                        color={person?.color}
                        size="xs"
                      />
                      {person?.name.split(' ')[0]}
                    </span>
                    <span>Prazo {p.deadline}</span>
                  </div>
                </Card>
              </Link>
            )
          })}
        </div>
      </section>
    </div>
  )
}
