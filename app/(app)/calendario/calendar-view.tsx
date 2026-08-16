'use client'

import { useState } from 'react'
import { Plus, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { createCalendarEvent } from '@/app/actions/editorial'

type Event = { id: string; title: string; event_date: string; event_time: string | null; type: string }

export function CalendarView({ events }: { events: Event[] }) {
  const [open, setOpen] = useState(false)
  const [month, setMonth] = useState(() => events[0]?.event_date.slice(0, 7) || new Date().toISOString().slice(0, 7))
  const date = new Date(`${month}-01T12:00:00`)
  const year = date.getFullYear(); const monthIndex = date.getMonth()
  const offset = new Date(year, monthIndex, 1).getDay(); const days = new Date(year, monthIndex + 1, 0).getDate()
  const cells = [...Array.from({ length: offset }, () => null), ...Array.from({ length: days }, (_, i) => i + 1)]
  const label = new Intl.DateTimeFormat('pt-BR', { month: 'long', year: 'numeric' }).format(date)

  return <>
    <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
      <div className="flex items-center gap-2">
        <input aria-label="Mês do calendário" type="month" value={month} onChange={(e) => setMonth(e.target.value)} className="rounded-lg border border-border bg-background px-3 py-2 text-sm" />
        <span className="text-sm font-medium capitalize text-muted-foreground">{label}</span>
      </div>
      <Button size="lg" onClick={() => setOpen(true)}><Plus className="size-4" />Agendar</Button>
    </div>
    <Card className="overflow-hidden">
      <div className="grid grid-cols-7 border-b border-border bg-muted/40">{['Dom','Seg','Ter','Qua','Qui','Sex','Sáb'].map(d => <div key={d} className="px-2 py-2.5 text-center text-xs font-semibold uppercase text-muted-foreground">{d}</div>)}</div>
      <div className="grid grid-cols-7">{cells.map((day, i) => {
        const key = day ? `${month}-${String(day).padStart(2,'0')}` : ''
        const dayEvents = events.filter(event => event.event_date === key)
        return <div key={i} className="min-h-28 border-b border-r border-border p-1.5 [&:nth-child(7n)]:border-r-0">{day && <><span className="block px-1 text-xs text-muted-foreground">{day}</span><div className="mt-1 flex flex-col gap-1">{dayEvents.map(event => <div key={event.id} className="rounded-md border-l-2 border-primary bg-primary/10 px-2 py-1 text-xs"><span className="font-medium">{event.title}</span>{event.event_time && <span className="block text-muted-foreground">{event.event_time.slice(0,5)}</span>}</div>)}</div></>}</div>
      })}</div>
    </Card>
    {open && <div className="fixed inset-0 z-50 flex items-center justify-center bg-foreground/40 p-4" role="dialog" aria-modal="true" aria-labelledby="schedule-title"><Card className="w-full max-w-md p-6"><div className="flex items-center justify-between"><h2 id="schedule-title" className="text-lg font-semibold">Novo agendamento</h2><Button type="button" variant="ghost" size="icon-sm" onClick={() => setOpen(false)} aria-label="Fechar"><X className="size-4" /></Button></div><form action={async formData => { await createCalendarEvent(formData); setOpen(false) }} className="mt-5 flex flex-col gap-4"><label className="text-sm font-medium">Título<input required minLength={3} name="title" className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2" /></label><div className="grid grid-cols-2 gap-3"><label className="text-sm font-medium">Data<input required name="eventDate" type="date" className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2" /></label><label className="text-sm font-medium">Horário<input name="eventTime" type="time" className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2" /></label></div><label className="text-sm font-medium">Tipo<select name="type" className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2"><option value="publicacao">Publicação</option><option value="prazo">Prazo</option><option value="atividade">Atividade</option></select></label><Button type="submit" size="lg">Salvar agendamento</Button></form></Card></div>}
  </>
}
