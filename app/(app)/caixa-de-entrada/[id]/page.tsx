import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ArrowLeft, ArrowRight, Archive } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { requireWorkspace } from '@/lib/session'
import { createClient } from '@/lib/supabase/server'
import { archiveInboxItem, convertInboxToPauta } from '@/app/actions/editorial'

export default async function InboxItemPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params; const context = await requireWorkspace(); const supabase = await createClient()
  const { data: item } = await supabase.from('inbox_items').select('*').eq('id', id).eq('workspace_id', context.workspace.id).maybeSingle()
  if (!item) notFound()
  return <div className="mx-auto max-w-3xl"><Link href="/caixa-de-entrada" className="mb-4 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"><ArrowLeft className="size-4"/>Caixa de Entrada</Link><Card className="p-6"><div className="flex flex-wrap gap-2"><span className="rounded-md bg-primary/10 px-2 py-1 text-xs text-primary">{item.type}</span><span className="rounded-md bg-muted px-2 py-1 text-xs">{item.coordination || 'Sem coordenação'}</span></div><h1 className="mt-4 text-2xl font-bold text-balance">{item.title}</h1><p className="mt-2 text-sm text-muted-foreground">Enviado por {item.sender_name || 'Não informado'} em {new Intl.DateTimeFormat('pt-BR',{dateStyle:'long',timeStyle:'short'}).format(new Date(item.received_at))}</p><div className="mt-6 rounded-lg bg-muted/50 p-5 text-sm leading-relaxed">{item.summary || 'Nenhuma descrição informada.'}</div><div className="mt-6 flex flex-wrap gap-2"><form action={convertInboxToPauta}><input type="hidden" name="id" value={item.id}/><Button type="submit">Transformar em pauta <ArrowRight className="size-4"/></Button></form><form action={archiveInboxItem}><input type="hidden" name="id" value={item.id}/><Button type="submit" variant="outline"><Archive className="size-4"/>Arquivar</Button></form></div></Card></div>
}
