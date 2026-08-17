import Link from 'next/link'
import { Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { requireWorkspace } from '@/lib/session'
import { createClient } from '@/lib/supabase/server'

export default async function DashboardPage() {
  const context = await requireWorkspace(); const supabase = await createClient()
  const [{ data: pautas }, { data: events }, { data: inbox }, { data: approvals }] = await Promise.all([
    supabase.from('pautas').select('id,title,status,priority,due_date').eq('workspace_id', context.workspace.id),
    supabase.from('calendar_events').select('id,title,event_date,event_time').eq('workspace_id', context.workspace.id).gte('event_date', new Date().toISOString().slice(0,10)).order('event_date').limit(5),
    supabase.from('inbox_items').select('id').eq('workspace_id', context.workspace.id).eq('status','new'),
    supabase.from('approvals').select('id').eq('workspace_id', context.workspace.id).eq('status','pending'),
  ])
  const name = context.profile?.full_name?.split(' ')[0] || context.profile?.username || 'colaborador'
  const stats = [
    ['Pautas abertas', pautas?.filter(p => !['approved','archived','done'].includes(p.status)).length ?? 0],
    ['Em produção', pautas?.filter(p => p.status === 'production').length ?? 0],
    ['Aguardando aprovação', approvals?.length ?? 0],
    ['Caixa de entrada', inbox?.length ?? 0],
  ]
  return <div><div className="mb-6 flex flex-wrap items-start justify-between gap-4"><div><h1 className="text-2xl font-bold">Olá, {name}.</h1><p className="mt-1 text-sm text-muted-foreground">Visão geral do espaço {context.workspace.name}.</p></div><div className="flex gap-2"><Button variant="outline" render={<Link href="/registrar"/>}>Registrar atividade</Button><Button render={<Link href="/registrar"/>}><Plus className="size-4"/>Nova pauta</Button></div></div><div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">{stats.map(([label,value]) => <Card key={String(label)} className="p-5"><p className="text-3xl font-bold tabular-nums">{value}</p><p className="mt-1 text-sm text-muted-foreground">{label}</p></Card>)}</div><div className="mt-6 grid gap-6 lg:grid-cols-2"><section><h2 className="mb-3 text-sm font-semibold uppercase text-muted-foreground">Próximos agendamentos</h2><Card className="divide-y divide-border">{events?.map(event => <Link key={event.id} href="/calendario" className="flex items-center justify-between px-5 py-4 hover:bg-muted/50"><span className="font-medium">{event.title}</span><span className="text-sm text-muted-foreground">{new Intl.DateTimeFormat('pt-BR').format(new Date(`${event.event_date}T12:00:00`))}</span></Link>)}{!events?.length && <p className="p-8 text-center text-sm text-muted-foreground">Nenhum agendamento neste espaço.</p>}</Card></section><section><h2 className="mb-3 text-sm font-semibold uppercase text-muted-foreground">Pautas recentes</h2><Card className="divide-y divide-border">{pautas?.slice(0,5).map(pauta => <Link key={pauta.id} href={`/pautas/${pauta.id}`} className="block px-5 py-4 hover:bg-muted/50"><p className="font-medium">{pauta.title}</p><p className="text-xs capitalize text-muted-foreground">{pauta.status}</p></Link>)}{!pautas?.length && <p className="p-8 text-center text-sm text-muted-foreground">Produção ainda está vazia. Crie a primeira pauta.</p>}</Card></section></div></div>
}
