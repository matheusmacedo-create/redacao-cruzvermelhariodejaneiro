'use client'

import { useState } from 'react'
import Link from 'next/link'
import { Plus, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { createCalendarEvent } from '@/app/actions/editorial'

type Event = { id: string; title: string; event_date: string; event_time: string | null; type: string; pauta_id: string | null }

export function CalendarView({ events }: { events: Event[] }) {
  const [open, setOpen] = useState(false)
  const [month, setMonth] = useState(() => events[0]?.event_date.slice(0, 7) || new Date().toISOString().slice(0, 7))
  const date = new Date(`${month}-01T12:00:00`)
  const year = date.getFullYear(); const monthIndex = date.getMonth()
  const offset = new Date(year, monthIndex, 1).getDay(); const days = new Date(year, monthIndex + 1, 0).getDate()
  const cells = [...Array.from({ length: offset }, () => null), ...Array.from({ length: days }, (_, i) => i + 1)]
  const label = new Intl.DateTimeFormat('pt-BR', { month: 'long', year: 'numeric' }).format(date)
  const agendaDays = Array.from({ length: days }, (_, i) => i + 1)
    .map((day) => ({ day, key: `${month}-${String(day).padStart(2, '0')}`, dayEvents: events.filter((event) => event.event_date === `${month}-${String(day).padStart(2, '0')}`) }))
    .filter((entry) => entry.dayEvents.length > 0)

  return <>
    <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
      <div className="flex items-center gap-2">
        <input aria-label="Mês do calendário" type="month" value={month} onChange={(e) => setMonth(e.target.value)} className="rounded-lg border border-border bg-background px-3 py-2 text-sm" />
        <span className="text-sm font-medium capitalize text-muted-foreground">{label}</span>
      </div>
      <Button size="lg" onClick={() => setOpen(true)}><Plus className="size-4" />Agendar</Button>
    </div>

    {/* Agenda list — used on narrow screens where the 7-column grid can't fit event text */}
    <Card className="divide-y divide-border sm:hidden">
      {agendaDays.map(({ day, dayEvents }) => (
        <div key={day} className="px-4 py-3">
          <p className="text-xs font-semibold uppercase text-muted-foreground">Dia {day}</p>
          <div className="mt-2 flex flex-col gap-2">
            {dayEvents.map((event) => event.pauta_id ? (
              <Link key={event.id} href={`/pautas/${event.pauta_id}`} className="rounded-md border-l-2 border-primary bg-primary/10 px-3 py-2 text-sm hover:bg-primary/15">
                <span className="block font-medium">{event.title}</span>
                <span className="block text-xs text-muted-foreground">Pauta integrada{event.event_time ? ` · ${event.event_time.slice(0, 5)}` : ''}</span>
              </Link>
            ) : (
              <div key={event.id} className="rounded-md border-l-2 border-primary bg-primary/10 px-3 py-2 text-sm">
                <span className="block font-medium">{event.title}</span>
                {event.event_time && <span className="block text-xs text-muted-foreground">{event.event_time.slice(0, 5)}</span>}
              </div>
            ))}
          </div>
        </div>
      ))}
      {!agendaDays.length && <p className="p-8 text-center text-sm text-muted-foreground">Nenhum agendamento neste mês.</p>}
    </Card>

    {/* Month grid — desktop and wider tablets */}
    <Card className="hidden overflow-hidden sm:block">
      <div className="grid grid-cols-7 border-b border-border bg-muted/40">{['Dom','Seg','Ter','Qua','Qui','Sex','Sáb'].map(d => <div key={d} className="px-2 py-2.5 text-center text-xs font-semibold uppercase text-muted-foreground">{d}</div>)}</div>
      <div className="grid grid-cols-7">{cells.map((day, i) => {
        const key = day ? `${month}-${String(day).padStart(2,'0')}` : ''
        const dayEvents = events.filter(event => event.event_date === key)
        return <div key={i} className="min-h-28 border-b border-r border-border p-1.5 [&:nth-child(7n)]:border-r-0">{day && <><span className="block px-1 text-xs text-muted-foreground">{day}</span><div className="mt-1 flex flex-col gap-1">{dayEvents.map(event => event.pauta_id ? <Link key={event.id} href={`/pautas/${event.pauta_id}`} className="rounded-md border-l-2 border-primary bg-primary/10 px-2 py-1 text-xs hover:bg-primary/15"><span className="font-medium">{event.title}</span><span className="block text-muted-foreground">Pauta integrada{event.event_time ? ` · ${event.event_time.slice(0,5)}` : ''}</span></Link> : <div key={event.id} className="rounded-md border-l-2 border-primary bg-primary/10 px-2 py-1 text-xs"><span className="font-medium">{event.title}</span>{event.event_time && <span className="block text-muted-foreground">{event.event_time.slice(0,5)}</span>}</div>)}</div></>}</div>
      })}</div>
    </Card>
    {open && <div className="fixed inset-0 z-50 flex items-center justify-center bg-foreground/40 p-4" role="dialog" aria-modal="true" aria-labelledby="schedule-title"><Card className="w-full max-w-md p-6"><div className="flex items-center justify-between"><h2 id="schedule-title" className="text-lg font-semibold">Novo agendamento</h2><Button type="button" variant="ghost" size="icon-sm" onClick={() => setOpen(false)} aria-label="Fechar"><X className="size-4" /></Button></div><form action={async formData => { await createCalendarEvent(formData); setOpen(false) }} className="mt-5 flex flex-col gap-4"><label className="text-sm font-medium">Título<input required minLength={3} name="title" className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2" /></label><div className="grid grid-cols-2 gap-3"><label className="text-sm font-medium">Data<input required name="eventDate" type="date" className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2" /></label><label className="text-sm font-medium">Horário<input name="eventTime" type="time" className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2" /></label></div><label className="text-sm font-medium">Tipo<select name="type" className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2"><option value="publicacao">Publicação</option><option value="prazo">Prazo</option><option value="atividade">Atividade</option></select></label><label className="flex items-start gap-3 rounded-lg border border-border bg-muted/30 p-3 text-sm"><input name="createPauta" type="checkbox" className="mt-0.5 size-4 accent-primary" /><span><strong className="block font-medium">Criar pauta integrada</strong><span className="text-muted-foreground">Cria uma pauta com este título e data e mantém acesso direto pelo calendário.</span></span></label><Button type="submit" size="lg">Salvar agendamento</Button></form></Card></div>}
  </>
}
