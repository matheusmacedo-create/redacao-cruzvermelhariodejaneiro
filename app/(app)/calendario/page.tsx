import Link from 'next/link'
import { Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { PageHeader } from '@/components/app/page-header'
import { calendarItems, getProject } from '@/lib/data'

const weekdays = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb']
// Agosto/2025 começa numa sexta-feira (offset 5).
const firstWeekdayOffset = 5
const daysInMonth = 31

export default function CalendarioPage() {
  const itemsByDay = new Map<number, typeof calendarItems>()
  for (const item of calendarItems) {
    const arr = itemsByDay.get(item.day) ?? []
    arr.push(item)
    itemsByDay.set(item.day, arr)
  }

  const cells: (number | null)[] = [
    ...Array.from({ length: firstWeekdayOffset }, () => null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ]

  return (
    <div>
      <PageHeader
        title="Calendário editorial"
        description="Agosto de 2025 — prazos e publicações programadas."
        actions={
          <Button size="lg">
            <Plus className="size-4" />
            Agendar
          </Button>
        }
      />

      <Card className="overflow-hidden">
        <div className="grid grid-cols-7 border-b border-border bg-muted/40">
          {weekdays.map((d) => (
            <div
              key={d}
              className="px-2 py-2.5 text-center text-xs font-semibold uppercase tracking-wide text-muted-foreground"
            >
              {d}
            </div>
          ))}
        </div>
        <div className="grid grid-cols-7">
          {cells.map((day, i) => {
            const items = day ? itemsByDay.get(day) ?? [] : []
            return (
              <div
                key={i}
                className="min-h-28 border-b border-r border-border p-1.5 last:border-r-0 [&:nth-child(7n)]:border-r-0"
              >
                {day && (
                  <>
                    <span className="mb-1 block px-1 text-xs font-medium text-muted-foreground">
                      {day}
                    </span>
                    <div className="flex flex-col gap-1">
                      {items.map((item) => {
                        const project = getProject(item.projectId)
                        return (
                          <Link
                            key={item.pautaId}
                            href={`/pautas/${item.pautaId}`}
                            className="block rounded-md border-l-2 border-l-primary bg-primary/8 px-1.5 py-1 text-[11px] leading-tight transition-colors hover:bg-primary/15"
                          >
                            <span className="block font-medium text-primary">
                              {project?.emoji} {item.project}
                            </span>
                            <span className="line-clamp-2 text-foreground">{item.title}</span>
                          </Link>
                        )
                      })}
                    </div>
                  </>
                )}
              </div>
            )
          })}
        </div>
      </Card>
    </div>
  )
}
