import Link from 'next/link'
import { MessageCircle } from 'lucide-react'
import { Card } from '@/components/ui/card'
import { Avatar } from '@/components/ui/avatar'
import { privateAvatarUrl } from '@/lib/avatar-url'
import { PageHeader } from '@/components/app/page-header'
import { requireWorkspace } from '@/lib/session'
import { createClient } from '@/lib/supabase/server'
import { formatDate } from '@/lib/format'
import { SendMessageWidget } from './send-message-widget'

const statusLabel: Record<string, string> = { pending: 'Aguardando decisão', approved: 'Aprovada', changes_requested: 'Ajustes solicitados' }

export default async function MensagensPage() {
  const context = await requireWorkspace()
  const supabase = await createClient()

  const [{ data: myVoterRows }, { data: requestedRows }, { data: memberRows }] = await Promise.all([
    supabase.from('approval_voters').select('approval_id').eq('workspace_id', context.workspace.id).eq('user_id', context.user.id),
    supabase.from('approvals').select('id').eq('workspace_id', context.workspace.id).eq('requested_by', context.user.id),
    supabase.from('workspace_members').select('user_id,profiles(id,full_name,initials,color,avatar_path,active)').eq('workspace_id', context.workspace.id),
  ])

  const colleagues = (memberRows ?? [])
    .map((member: any) => Array.isArray(member.profiles) ? member.profiles[0] : member.profiles)
    .filter((profile: any) => profile && profile.active !== false && profile.id !== context.user.id)
    .map((profile: any) => ({ id: profile.id, name: profile.full_name, initials: profile.initials, color: profile.color, avatarPath: profile.avatar_path }))
  const approvalIds = [...new Set([...(myVoterRows ?? []).map((r) => r.approval_id), ...(requestedRows ?? []).map((r) => r.id)])]

  const { data: approvals } = approvalIds.length
    ? await supabase.from('approvals').select('id,content_id,requested_by,status,created_at').in('id', approvalIds).eq('workspace_id', context.workspace.id).order('created_at', { ascending: false })
    : { data: [] as any[] }

  const contentIds = [...new Set((approvals ?? []).map((a) => a.content_id))]
  const { data: contents } = contentIds.length ? await supabase.from('content_pieces').select('id,title,format').in('id', contentIds) : { data: [] as any[] }
  const contentById = new Map((contents ?? []).map((c) => [c.id, c]))

  const { data: voterRows } = approvalIds.length ? await supabase.from('approval_voters').select('approval_id,user_id,decision').in('approval_id', approvalIds) : { data: [] as any[] }
  const votersByApproval = new Map<string, typeof voterRows>()
  for (const v of voterRows ?? []) votersByApproval.set(v.approval_id, [...(votersByApproval.get(v.approval_id) ?? []), v])

  const { data: commentRows } = contentIds.length ? await supabase.from('content_comments').select('content_id,body,author_id,created_at').in('content_id', contentIds).order('created_at', { ascending: true }) : { data: [] as any[] }
  const commentsByContent = new Map<string, typeof commentRows>()
  for (const c of commentRows ?? []) commentsByContent.set(c.content_id, [...(commentsByContent.get(c.content_id) ?? []), c])

  const profileIds = new Set<string>()
  for (const a of approvals ?? []) if (a.requested_by) profileIds.add(a.requested_by)
  for (const v of voterRows ?? []) profileIds.add(v.user_id)
  for (const c of commentRows ?? []) profileIds.add(c.author_id)
  const { data: profiles } = profileIds.size ? await supabase.from('profiles').select('id,full_name,initials,color,avatar_path').in('id', [...profileIds]) : { data: [] as any[] }
  const profileById = new Map((profiles ?? []).map((p) => [p.id, p]))

  const threads = (approvals ?? []).map((a) => {
    const content = contentById.get(a.content_id)
    const voters = votersByApproval.get(a.id) ?? []
    const comments = commentsByContent.get(a.content_id) ?? []
    const lastComment = comments[comments.length - 1]
    const requester = profileById.get(a.requested_by)
    const isRequester = a.requested_by === context.user.id
    const otherPeople = (isRequester ? voters.map((v) => profileById.get(v.user_id)) : [requester]).filter(Boolean) as any[]
    const lastActivity = lastComment ? lastComment.created_at : a.created_at
    return { approvalId: a.id, contentId: a.content_id, title: content?.title || 'Conteúdo sem título', format: content?.format, status: a.status, createdAt: a.created_at, isRequester, otherPeople, lastComment, commentCount: comments.length, lastActivity }
  })

  const seen = new Set<string>()
  const dedupedThreads = threads
    .sort((a, b) => new Date(b.lastActivity).getTime() - new Date(a.lastActivity).getTime())
    .filter((t) => (seen.has(t.contentId) ? false : (seen.add(t.contentId), true)))

  return (
    <div>
      <PageHeader title="Mensagens" description="Conversas ligadas às matérias que você enviou ou precisa aprovar." actions={<SendMessageWidget colleagues={colleagues} />} />
      <div className="flex flex-col gap-3">
        {dedupedThreads.map((thread) => (
          <Link key={thread.contentId} href={`/mensagens/${thread.contentId}`}>
            <Card className="flex items-center gap-3 p-4 transition-colors hover:bg-muted/40">
              <div className="flex -space-x-2">
                {thread.otherPeople.slice(0, 3).map((person) => (
                  <Avatar key={person.id} initials={person.initials || '?'} color={person.color} src={privateAvatarUrl(person.avatar_path)} size="md" className="ring-2 ring-background" />
                ))}
                {!thread.otherPeople.length && <Avatar initials="?" size="md" />}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-baseline gap-2">
                  <p className="truncate text-sm font-semibold">{thread.otherPeople.map((p) => p.full_name?.split(' ')[0]).join(', ') || 'Ninguém na conversa'}</p>
                  <span className="text-xs text-muted-foreground">{thread.isRequester ? 'você enviou' : 'enviou para você'}</span>
                </div>
                <p className="truncate text-sm text-muted-foreground">
                  {thread.lastComment ? `${profileById.get(thread.lastComment.author_id)?.full_name?.split(' ')[0] || 'Alguém'}: ${thread.lastComment.body}` : `“${thread.title}” — sem mensagens ainda`}
                </p>
              </div>
              <div className="flex shrink-0 flex-col items-end gap-1">
                <span className="rounded-md bg-muted px-2 py-0.5 text-xs text-muted-foreground">{statusLabel[thread.status] || thread.status}</span>
                <span className="text-xs text-muted-foreground">{formatDate(thread.lastActivity, { dateStyle: 'short', timeStyle: 'short' })}</span>
              </div>
            </Card>
          </Link>
        ))}
        {!dedupedThreads.length && (
          <Card className="p-10 text-center">
            <MessageCircle className="mx-auto size-8 text-muted-foreground" />
            <p className="mt-3 font-medium">Nenhuma conversa ainda.</p>
            <p className="mt-1 text-sm text-muted-foreground">Elas aparecem automaticamente quando você envia ou recebe uma matéria para aprovação.</p>
          </Card>
        )}
      </div>
    </div>
  )
}
