import Link from 'next/link'
import { Archive, ArrowRight } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { PageHeader } from '@/components/app/page-header'
import { requireWorkspace } from '@/lib/session'
import { createClient } from '@/lib/supabase/server'
import { archiveInboxItem, convertInboxToPauta } from '@/app/actions/editorial'

export default async function CaixaEntradaPage() {
  const context = await requireWorkspace()
  const supabase = await createClient()
  const { data: items } = await supabase.from('inbox_items').select('*').eq('workspace_id', context.workspace.id).neq('status','archived').order('received_at', { ascending: false })
  return <div>
    <PageHeader title="Caixa de Entrada" description="Materiais, relatos e sugestões enviados para a Comunicação." actions={<Button variant="outline" size="lg" render={<Link href="/registrar" />}>Registrar atividade</Button>} />
    <div className="flex flex-col gap-3">{(items ?? []).map(item => <Card key={item.id} className="p-4"><div className="flex flex-col gap-4 sm:flex-row sm:items-start"><div className="min-w-0 flex-1"><div className="flex flex-wrap gap-2"><span className="rounded bg-primary px-2 py-0.5 text-[10px] font-bold text-primary-foreground">{item.status === 'new' ? 'NOVO' : item.status.toUpperCase()}</span><span className="rounded-md border border-border px-2 py-0.5 text-xs text-muted-foreground">{item.type}</span>{item.coordination && <span className="rounded-md bg-primary/10 px-2 py-0.5 text-xs text-primary">{item.coordination}</span>}</div><h2 className="mt-2 font-semibold">{item.title}</h2><p className="mt-1 text-sm text-muted-foreground">{item.summary}</p><p className="mt-3 text-xs text-muted-foreground">Enviado por {item.sender_name || 'Não informado'} · {new Intl.DateTimeFormat('pt-BR',{dateStyle:'short',timeStyle:'short'}).format(new Date(item.received_at))}</p></div><div className="flex shrink-0 flex-wrap gap-2 sm:w-44 sm:flex-col"><form action={convertInboxToPauta}><input type="hidden" name="id" value={item.id}/><Button type="submit" size="sm" className="w-full">Transformar em pauta <ArrowRight className="size-3.5"/></Button></form><Button variant="outline" size="sm" render={<Link href={`/caixa-de-entrada/${item.id}`} />}>Abrir</Button><form action={archiveInboxItem}><input type="hidden" name="id" value={item.id}/><Button type="submit" variant="ghost" size="sm" className="w-full"><Archive className="size-4"/> Arquivar</Button></form></div></div></Card>)}
    {!items?.length && <Card className="p-10 text-center"><p className="font-medium">Caixa de entrada vazia.</p><p className="mt-1 text-sm text-muted-foreground">Este espaço ainda não recebeu materiais.</p></Card>}</div>
  </div>
}
