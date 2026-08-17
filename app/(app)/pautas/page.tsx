import Link from 'next/link'
import { Plus, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { PageHeader } from '@/components/app/page-header'
import { requireWorkspace } from '@/lib/session'
import { createClient } from '@/lib/supabase/server'

const columns = [['incoming','Entrada'],['collection','Coleta'],['production','Produção'],['review','Revisão'],['approval','Aprovação'],['approved','Pronto']]

export default async function PautasPage({ searchParams }: { searchParams: Promise<{ projeto?: string }> }) {
  const { projeto } = await searchParams
  const context = await requireWorkspace()
  const supabase = await createClient()
  let query = supabase.from('pautas').select('id,title,status,priority,coordination,due_date,project_id').eq('workspace_id',context.workspace.id).order('created_at',{ascending:false})
  if (projeto) query = query.eq('project_id', projeto)
  const [{ data: pautas }, { data: project }] = await Promise.all([
    query,
    projeto ? supabase.from('projects').select('id,name').eq('id', projeto).eq('workspace_id', context.workspace.id).maybeSingle() : Promise.resolve({ data: null }),
  ])
  const description = project ? `Kanban do projeto ${project.name}.` : `Fluxo editorial do espaço ${context.workspace.name}.`
  return <div><PageHeader title={project ? `Pautas · ${project.name}` : 'Pautas'} description={description} actions={<div className="flex items-center gap-2">{project && <Button variant="outline" render={<Link href="/pautas"/>}><X className="size-4"/>Limpar filtro</Button>}<Button size="lg" render={<Link href={projeto ? `/registrar?projeto=${projeto}` : '/registrar'}/>}><Plus className="size-4"/>Nova pauta</Button></div>}/><div className="flex gap-4 overflow-x-auto pb-4">{columns.map(([status,label]) => { const items=(pautas??[]).filter(p=>p.status===status); return <section key={status} className="w-72 shrink-0"><div className="mb-3 flex items-center justify-between px-1"><h2 className="text-xs font-bold uppercase text-muted-foreground">{label}</h2><span className="rounded-full bg-muted px-2 text-xs">{items.length}</span></div><div className="flex flex-col gap-3">{items.map(pauta=><Link key={pauta.id} href={`/pautas/${pauta.id}`}><Card className="p-4 hover:shadow-sm"><p className="font-medium">{pauta.title}</p><p className="mt-2 text-xs text-muted-foreground">{pauta.coordination||'Sem coordenação'}{pauta.due_date?` · ${new Intl.DateTimeFormat('pt-BR').format(new Date(`${pauta.due_date}T12:00:00`))}`:''}</p></Card></Link>)}{!items.length&&<div className="rounded-lg border border-dashed border-border py-8 text-center text-xs text-muted-foreground">Sem pautas</div>}</div></section>})}</div></div>
}
