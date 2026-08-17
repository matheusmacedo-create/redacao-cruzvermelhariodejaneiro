import Link from 'next/link'
import { ArrowRight, Check, Clock, Users, X } from 'lucide-react'
import { Card } from '@/components/ui/card'
import { PageHeader } from '@/components/app/page-header'
import { requireWorkspace } from '@/lib/session'
import { createClient } from '@/lib/supabase/server'
import { cn } from '@/lib/utils'

const statusMeta = {
  pending: { label: 'Pendente', icon: Clock, className: 'bg-warning/15 text-warning-foreground' },
  approved: { label: 'Aprovada', icon: Check, className: 'bg-success/15 text-success' },
  changes_requested: { label: 'Ajustes solicitados', icon: X, className: 'bg-destructive/10 text-destructive' },
} as const

export default async function AprovacoesPage({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
  const { status = 'pending' } = await searchParams
  const context = await requireWorkspace()
  const supabase = await createClient()
  let query = supabase.from('approvals').select('id,status,created_at,requested_by,content_pieces(title,format,pautas(title)),approval_voters(user_id,decision,profiles(full_name))').eq('workspace_id', context.workspace.id).order('created_at', { ascending: false })
  if (['pending', 'approved', 'changes_requested'].includes(status)) query = query.eq('status', status)
  const { data: approvals } = await query

  const filters = [['pending','Pendentes'],['approved','Aprovadas'],['changes_requested','Ajustes'],['all','Todas']] as const
  return <div><PageHeader title="Aprovações" description="Acompanhe as matérias, os votos registrados e quem ainda precisa decidir." />
    <nav className="mb-5 flex flex-wrap gap-2" aria-label="Filtrar aprovações">{filters.map(([value,label]) => <Link key={value} href={`/aprovacoes?status=${value}`} className={cn('rounded-lg border px-3 py-2 text-sm font-medium', status === value ? 'border-primary bg-primary text-primary-foreground' : 'border-border bg-card text-muted-foreground hover:text-foreground')}>{label}</Link>)}</nav>
    <div className="flex flex-col gap-3">{(approvals ?? []).map((approval: any) => { const content = Array.isArray(approval.content_pieces) ? approval.content_pieces[0] : approval.content_pieces; const pauta = Array.isArray(content?.pautas) ? content.pautas[0] : content?.pautas; const voters = approval.approval_voters ?? []; const approved = voters.filter((v: any) => v.decision === 'approved').length; const meta = statusMeta[approval.status as keyof typeof statusMeta] ?? statusMeta.pending; return <Card key={approval.id} className="p-5"><div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between"><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><span className="rounded-md border border-border px-2 py-0.5 text-xs text-muted-foreground">{content?.format || 'Conteúdo editorial'}</span><span className={cn('inline-flex items-center gap-1 rounded-full px-2 py-1 text-xs font-medium', meta.className)}><meta.icon className="size-3" />{meta.label}</span></div><h3 className="mt-2 text-base font-semibold">{content?.title || 'Conteúdo sem título'}</h3><p className="text-sm text-muted-foreground">Pauta: {pauta?.title || 'Sem pauta vinculada'}</p><div className="mt-3 flex flex-wrap items-center gap-3 text-xs text-muted-foreground"><span className="inline-flex items-center gap-1"><Users className="size-3.5" />{approved} de {voters.length} aprovaram</span>{voters.filter((v:any)=>v.decision==='pending').slice(0,3).map((v:any)=>{const profile=Array.isArray(v.profiles)?v.profiles[0]:v.profiles;return <span key={v.user_id}>Falta: {profile?.full_name || 'Colaborador'}</span>})}</div></div><Link href={`/aprovacoes/${approval.id}`} className="inline-flex h-9 items-center justify-center gap-1.5 rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground">{approval.status === 'pending' ? 'Revisar' : 'Ver decisão'} <ArrowRight className="size-4" /></Link></div></Card>})}{!approvals?.length && <Card className="p-10 text-center"><p className="font-medium">Nenhuma aprovação neste filtro.</p><p className="mt-1 text-sm text-muted-foreground">Matérias enviadas para revisão aparecem aqui automaticamente.</p></Card>}</div>
  </div>
}
