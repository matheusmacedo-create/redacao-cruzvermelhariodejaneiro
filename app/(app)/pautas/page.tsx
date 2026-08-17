import Link from 'next/link'
import { Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { PageHeader } from '@/components/app/page-header'
import { requireWorkspace } from '@/lib/session'
import { createClient } from '@/lib/supabase/server'

const columns = [['incoming','Entrada'],['collection','Coleta'],['production','Produção'],['review','Revisão'],['approval','Aprovação'],['approved','Pronto']]
export default async function PautasPage() {
  const context = await requireWorkspace(); const supabase = await createClient()
  const { data: pautas } = await supabase.from('pautas').select('id,title,status,priority,coordination,due_date').eq('workspace_id',context.workspace.id).order('created_at',{ascending:false})
  return <div><PageHeader title="Pautas" description={`Fluxo editorial do espaço ${context.workspace.name}.`} actions={<Button size="lg" render={<Link href="/registrar"/>}><Plus className="size-4"/>Nova pauta</Button>}/><div className="flex gap-4 overflow-x-auto pb-4">{columns.map(([status,label]) => { const items=(pautas??[]).filter(p=>p.status===status); return <section key={status} className="w-72 shrink-0"><div className="mb-3 flex items-center justify-between px-1"><h2 className="text-xs font-bold uppercase text-muted-foreground">{label}</h2><span className="rounded-full bg-muted px-2 text-xs">{items.length}</span></div><div className="flex flex-col gap-3">{items.map(pauta=><Link key={pauta.id} href={`/pautas/${pauta.id}`}><Card className="p-4 hover:shadow-sm"><p className="font-medium">{pauta.title}</p><p className="mt-2 text-xs text-muted-foreground">{pauta.coordination||'Sem coordenação'}{pauta.due_date?` · ${new Intl.DateTimeFormat('pt-BR').format(new Date(`${pauta.due_date}T12:00:00`))}`:''}</p></Card></Link>)}{!items.length&&<div className="rounded-lg border border-dashed border-border py-8 text-center text-xs text-muted-foreground">Sem pautas</div>}</div></section>})}</div></div>
}
