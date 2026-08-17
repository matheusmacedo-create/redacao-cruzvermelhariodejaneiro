import Link from 'next/link'
import { ArrowRight, Check, Clock, FolderKanban, X } from 'lucide-react'
import { Card } from '@/components/ui/card'
import { Avatar } from '@/components/ui/avatar'
import { privateAvatarUrl } from '@/lib/avatar-url'
import { PageHeader } from '@/components/app/page-header'
import { requireWorkspace } from '@/lib/session'
import { createClient } from '@/lib/supabase/server'
import { formatDate } from '@/lib/format'
import { cn } from '@/lib/utils'

const statusMeta = {
  pending: { label: 'Pendente', icon: Clock, className: 'bg-warning/15 text-warning-foreground' },
  approved: { label: 'Aprovada', icon: Check, className: 'bg-success/15 text-success' },
  changes_requested: { label: 'Ajustes solicitados', icon: X, className: 'bg-destructive/10 text-destructive' },
} as const

const decisionMeta = {
  pending: { icon: Clock, className: 'bg-warning/15 text-warning-foreground' },
  approved: { icon: Check, className: 'bg-success/15 text-success' },
  changes_requested: { icon: X, className: 'bg-destructive/10 text-destructive' },
} as const

export default async function AprovacoesPage({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
  const { status = 'pending' } = await searchParams
  const context = await requireWorkspace()
  const supabase = await createClient()

  let query = supabase
    .from('approvals')
    .select('id,status,created_at,requested_by,content_id')
    .eq('workspace_id', context.workspace.id)
    .order('created_at', { ascending: false })
  if (['pending', 'approved', 'changes_requested'].includes(status)) query = query.eq('status', status)
  const { data: approvals } = await query

  const contentIds = [...new Set((approvals ?? []).map((a) => a.content_id).filter(Boolean))]
  const { data: contents } = contentIds.length
    ? await supabase.from('content_pieces').select('id,title,format,pauta_id').in('id', contentIds)
    : { data: [] as any[] }
  const contentById = new Map((contents ?? []).map((c) => [c.id, c]))

  const pautaIds = [...new Set((contents ?? []).map((c) => c.pauta_id).filter(Boolean))]
  const { data: pautas } = pautaIds.length
    ? await supabase.from('pautas').select('id,title,project_id').in('id', pautaIds)
    : { data: [] as any[] }
  const pautaById = new Map((pautas ?? []).map((p) => [p.id, p]))

  const projectIds = [...new Set((pautas ?? []).map((p) => p.project_id).filter(Boolean))]
  const { data: projects } = projectIds.length
    ? await supabase.from('projects').select('id,name').in('id', projectIds)
    : { data: [] as any[] }
  const projectById = new Map((projects ?? []).map((p) => [p.id, p]))

  const approvalIds = (approvals ?? []).map((a) => a.id)
  const { data: voterRows } = approvalIds.length
    ? await supabase.from('approval_voters').select('approval_id,user_id,decision,decided_at').in('approval_id', approvalIds)
    : { data: [] as any[] }
  const votersByApproval = new Map<string, typeof voterRows>()
  for (const v of voterRows ?? []) votersByApproval.set(v.approval_id, [...(votersByApproval.get(v.approval_id) ?? []), v])

  const profileIds = new Set<string>()
  for (const a of approvals ?? []) if (a.requested_by) profileIds.add(a.requested_by)
  for (const v of voterRows ?? []) profileIds.add(v.user_id)
  const { data: profiles } = profileIds.size
    ? await supabase.from('profiles').select('id,full_name,initials,color,avatar_path').in('id', [...profileIds])
    : { data: [] as any[] }
  const profileById = new Map((profiles ?? []).map((p) => [p.id, p]))

  const filters = [['pending', 'Pendentes'], ['approved', 'Aprovadas'], ['changes_requested', 'Ajustes'], ['all', 'Todas']] as const

  return (
    <div>
      <PageHeader title="Aprovações" description="Acompanhe as matérias, quem já decidiu e quem ainda falta, projeto por projeto." />

      <nav className="mb-5 flex flex-wrap gap-2" aria-label="Filtrar aprovações">
        {filters.map(([value, label]) => (
          <Link
            key={value}
            href={`/aprovacoes?status=${value}`}
            className={cn(
              'rounded-lg border px-3 py-2 text-sm font-medium',
              status === value ? 'border-primary bg-primary text-primary-foreground' : 'border-border bg-card text-muted-foreground hover:text-foreground',
            )}
          >
            {label}
          </Link>
        ))}
      </nav>

      <div className="flex flex-col gap-3">
        {(approvals ?? []).map((approval) => {
          const content = contentById.get(approval.content_id)
          const pauta = content ? pautaById.get(content.pauta_id) : undefined
          const project = pauta?.project_id ? projectById.get(pauta.project_id) : undefined
          const voters = votersByApproval.get(approval.id) ?? []
          const approvedCount = voters.filter((v) => v.decision === 'approved').length
          const pendingVoters = voters.filter((v) => v.decision === 'pending')
          const meta = statusMeta[approval.status as keyof typeof statusMeta] ?? statusMeta.pending
          const requester = approval.requested_by ? profileById.get(approval.requested_by) : undefined

          return (
            <Card key={approval.id} className="p-5">
              <div className="flex flex-wrap items-center gap-2">
                <span className="rounded-md border border-border px-2 py-0.5 text-xs text-muted-foreground">{content?.format || 'Conteúdo editorial'}</span>
                <span className={cn('inline-flex items-center gap-1 rounded-full px-2 py-1 text-xs font-medium', meta.className)}>
                  <meta.icon className="size-3" />
                  {meta.label}
                </span>
                <span className="ml-auto text-xs text-muted-foreground">Solicitado por {requester?.full_name?.split(' ')[0] || 'alguém'} em {formatDate(approval.created_at, { dateStyle: 'short' })}</span>
              </div>

              <Link href={`/aprovacoes/${approval.id}`} className="mt-2 block">
                <h3 className="text-base font-semibold hover:underline">{content?.title || 'Conteúdo sem título'}</h3>
              </Link>

              <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                <span>Pauta: {pauta?.title ? <Link href={`/pautas/${pauta.id}`} className="hover:text-foreground hover:underline">{pauta.title}</Link> : 'sem pauta vinculada'}</span>
                <span className="inline-flex items-center gap-1">
                  <FolderKanban className="size-3.5" />
                  {project ? <Link href={`/projetos/${project.id}`} className="hover:text-foreground hover:underline">{project.name}</Link> : 'Sem projeto vinculado'}
                </span>
              </div>

              <div className="mt-4 border-t border-border pt-4">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium text-muted-foreground">{approvedCount} de {voters.length} aprovaram</span>
                </div>
                <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted">
                  <div className="h-full bg-success transition-all" style={{ width: `${voters.length ? (approvedCount / voters.length) * 100 : 0}%` }} />
                </div>

                <div className="mt-3 flex flex-wrap gap-x-4 gap-y-2">
                  {voters.map((voter) => {
                    const profile = profileById.get(voter.user_id)
                    const vMeta = decisionMeta[voter.decision as keyof typeof decisionMeta] ?? decisionMeta.pending
                    return (
                      <span key={voter.user_id} className="flex items-center gap-1.5">
                        <span className="relative shrink-0">
                          <Avatar initials={profile?.initials || '?'} color={profile?.color} src={privateAvatarUrl(profile?.avatar_path)} size="xs" />
                          <span className={cn('absolute -bottom-0.5 -right-0.5 flex size-3.5 items-center justify-center rounded-full ring-2 ring-card', vMeta.className)}>
                            <vMeta.icon className="size-2.5" />
                          </span>
                        </span>
                        <span className="text-xs font-medium">{profile?.full_name?.split(' ')[0] || 'Colaborador'}</span>
                      </span>
                    )
                  })}
                  {!voters.length && <span className="text-xs text-muted-foreground">Nenhum aprovador definido.</span>}
                </div>
              </div>

              <div className="mt-4 flex items-center justify-between gap-3">
                {pendingVoters.length > 0 ? (
                  <span className="text-xs text-muted-foreground">Aguardando: {pendingVoters.map((v) => profileById.get(v.user_id)?.full_name?.split(' ')[0] || 'alguém').join(', ')}</span>
                ) : <span />}
                <Link href={`/aprovacoes/${approval.id}`} className="inline-flex h-9 shrink-0 items-center justify-center gap-1.5 rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground">
                  {approval.status === 'pending' ? 'Revisar' : 'Ver decisão'}
                  <ArrowRight className="size-4" />
                </Link>
              </div>
            </Card>
          )
        })}
        {!approvals?.length && (
          <Card className="p-10 text-center">
            <p className="font-medium">Nenhuma aprovação neste filtro.</p>
            <p className="mt-1 text-sm text-muted-foreground">Matérias enviadas para revisão aparecem aqui automaticamente.</p>
          </Card>
        )}
      </div>
    </div>
  )
}
