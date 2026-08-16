import Link from 'next/link'
import { ArrowRight, Check, Clock, X } from 'lucide-react'
import { Card } from '@/components/ui/card'
import { PageHeader } from '@/components/app/page-header'
import { requireWorkspace } from '@/lib/session'
import { createClient } from '@/lib/supabase/server'
import { cn } from '@/lib/utils'

const stepMeta = {
  aprovado: { icon: Check, className: 'bg-success text-primary-foreground' },
  pendente: { icon: Clock, className: 'bg-warning text-primary-foreground' },
  reprovado: { icon: X, className: 'bg-destructive text-primary-foreground' },
} as const

export default async function AprovacoesPage() {
  const context = await requireWorkspace()
  const supabase = await createClient()
  const { data: approvals } = await supabase
    .from('approvals')
    .select('id,status,created_at,content_pieces(title,format,pautas(title)),approval_steps(label,status,step_order)')
    .eq('workspace_id', context.workspace.id)
    .order('created_at', { ascending: false })

  return (
    <div>
      <PageHeader title="Aprovações" description="Conteúdos aguardando validação das coordenações e da diretoria." />
      <div className="flex flex-col gap-3">
        {(approvals ?? []).map((approval: any) => {
          const content = Array.isArray(approval.content_pieces) ? approval.content_pieces[0] : approval.content_pieces
          const pauta = Array.isArray(content?.pautas) ? content.pautas[0] : content?.pautas
          const steps = [...(approval.approval_steps ?? [])].sort((a, b) => a.step_order - b.step_order)
          return (
            <Card key={approval.id} className="p-5">
              <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                <div className="min-w-0 flex-1">
                  <span className="rounded-md border border-border px-2 py-0.5 text-xs text-muted-foreground">{content?.format || 'Conteúdo editorial'}</span>
                  <h3 className="mt-2 text-base font-semibold">{content?.title || 'Conteúdo sem título'}</h3>
                  <p className="text-sm text-muted-foreground">Pauta: {pauta?.title || 'Sem pauta vinculada'}</p>
                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    {steps.map((step: any) => {
                      const meta = stepMeta[(step.status || 'pendente') as keyof typeof stepMeta] ?? stepMeta.pendente
                      return <span key={step.label} className="flex items-center gap-1.5 rounded-full bg-muted px-2 py-1 text-xs"><span className={cn('flex size-4 items-center justify-center rounded-full', meta.className)}><meta.icon className="size-2.5" /></span>{step.label}</span>
                    })}
                  </div>
                </div>
                <Link href={`/aprovacoes/${approval.id}`} className="inline-flex h-9 items-center justify-center gap-1.5 rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground">Revisar <ArrowRight className="size-4" /></Link>
              </div>
            </Card>
          )
        })}
        {!approvals?.length && <Card className="p-10 text-center"><p className="font-medium">Nenhuma aprovação neste espaço.</p><p className="mt-1 text-sm text-muted-foreground">As solicitações enviadas para revisão aparecerão aqui.</p></Card>}
      </div>
    </div>
  )
}
