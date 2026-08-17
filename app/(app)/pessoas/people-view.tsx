'use client'

import { useState } from 'react'
import { Card } from '@/components/ui/card'
import { Avatar, privateAvatarUrl } from '@/components/ui/avatar'
import { cn } from '@/lib/utils'

type Person = { id: string; name: string; role: string; coordination: string; initials: string; color: string; avatarPath?: string | null; accessRole: string }
const categories = ['Todos', 'Admin', 'Editor', 'Colaborador'] as const

export function PeopleView({ people }: { people: Person[] }) {
  const [category, setCategory] = useState<(typeof categories)[number]>('Todos')
  const list = people.filter(person => category === 'Todos' || person.accessRole === category.toLowerCase())
  return <div><div className="mb-5 flex flex-wrap gap-1.5">{categories.map(item => <button key={item} type="button" onClick={() => setCategory(item)} className={cn('rounded-lg px-3 py-1.5 text-sm font-medium', category === item ? 'bg-foreground text-background' : 'bg-muted text-muted-foreground')}>{item}</button>)}</div><div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{list.map(person => <Card key={person.id} className="p-5"><div className="flex items-center gap-3"><Avatar initials={person.initials || '?'} color={person.color} src={privateAvatarUrl(person.avatarPath)} alt={person.name} size="lg"/><div className="min-w-0"><h2 className="truncate font-semibold">{person.name}</h2><p className="truncate text-sm text-muted-foreground">{person.role || 'Colaborador'}</p></div></div><div className="mt-4 flex flex-wrap gap-2"><span className="rounded-md bg-primary/10 px-2 py-1 text-xs text-primary">{person.coordination || 'Sem coordenação'}</span><span className="rounded-md border border-border px-2 py-1 text-xs capitalize text-muted-foreground">{person.accessRole}</span></div></Card>)}{!list.length && <Card className="p-8 text-center text-sm text-muted-foreground sm:col-span-2 lg:col-span-3">Nenhum colaborador nesta categoria.</Card>}</div></div>
}
