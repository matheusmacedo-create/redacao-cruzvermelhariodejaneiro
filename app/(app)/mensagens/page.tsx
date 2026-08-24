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

type Person = { id: string; full_name?: string; initials?: string; color?: string; avatar_path?: string | null }

type ThreadItem = {
  key: string
  href: string
  people: Person[]
  headline: string
  tag: string
  preview: string
  badge: string
  lastActivity: string
}

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

  // Conversas diretas: a RLS já entrega apenas as que envolvem quem está logado.
  const { data: directRows } = await supabase
    .from('messages')
    .select('id,author_id,recipient_id,body,created_at')
    .eq('workspace_id', context.workspace.id)
    .is('pauta_id', null)
    .order('created_at', { ascending: true })

  const profileIds = new Set<string>()
  for (const a of approvals ?? []) if (a.requested_by) profileIds.add(a.requested_by)
  for (const v of voterRows ?? []) profileIds.add(v.user_id)
  for (const c of commentRows ?? []) profileIds.add(c.author_id)
  for (const m of directRows ?? []) {
    if (m.author_id) profileIds.add(m.author_id)
    if (m.recipient_id) profileIds.add(m.recipient_id)
  }
  const { data: profiles } = profileIds.size ? await supabase.from('profiles').select('id,full_name,initials,color,avatar_path').in('id', [...profileIds]) : { data: [] as any[] }
  const profileById = new Map((profiles ?? []).map((p) => [p.id, p]))

  const approvalThreads = (approvals ?? []).map((a) => {
    const content = contentById.get(a.content_id)
    const voters = votersByApproval.get(a.id) ?? []
    const comments = commentsByContent.get(a.content_id) ?? []
    const lastComment = comments[comments.length - 1]
    const requester = profileById.get(a.requested_by)
    const isRequester = a.requested_by === context.user.id
    const otherPeople = (isRequester ? voters.map((v) => profileById.get(v.user_id)) : [requester]).filter(Boolean) as Person[]
    return {
      contentId: a.content_id,
      title: content?.title || 'Conteúdo sem título',
      status: a.status,
      isRequester,
      otherPeople,
      lastComment,
      lastActivity: lastComment ? lastComment.created_at : a.created_at,
    }
  })

  const seen = new Set<string>()
  const approvalItems: ThreadItem[] = approvalThreads
    .sort((a, b) => new Date(b.lastActivity).getTime() - new Date(a.lastActivity).getTime())
    .filter((t) => (seen.has(t.contentId) ? false : (seen.add(t.contentId), true)))
    .map((t) => ({
      key: `aprovacao:${t.contentId}`,
      href: `/mensagens/${t.contentId}`,
      people: t.otherPeople,
      headline: t.otherPeople.map((p) => p.full_name?.split(' ')[0]).join(', ') || 'Ninguém na conversa',
      tag: t.isRequester ? 'você enviou' : 'enviou para você',
      preview: t.lastComment
        ? `${profileById.get(t.lastComment.author_id)?.full_name?.split(' ')[0] || 'Alguém'}: ${t.lastComment.body}`
        : `“${t.title}” — sem mensagens ainda`,
      badge: statusLabel[t.status] || t.status,
      lastActivity: t.lastActivity,
    }))

  type DirectRow = NonNullable<typeof directRows>[number]
  const directByPerson = new Map<string, DirectRow[]>()
  for (const m of directRows ?? []) {
    const otherId = m.author_id === context.user.id ? m.recipient_id : m.author_id
    if (!otherId || otherId === context.user.id) continue
    directByPerson.set(otherId, [...(directByPerson.get(otherId) ?? []), m])
  }

  const directItems: ThreadItem[] = [...directByPerson.entries()].map(([otherId, rows]) => {
    const person = profileById.get(otherId)
    const last = rows[rows.length - 1]
    const fromMe = last.author_id === context.user.id
    return {
      key: `direta:${otherId}`,
      href: `/mensagens/pessoa/${otherId}`,
      people: person ? [person] : [],
      headline: person?.full_name?.split(' ')[0] || 'Colaborador',
      tag: 'conversa direta',
      preview: `${fromMe ? 'Você' : person?.full_name?.split(' ')[0] || 'Alguém'}: ${last.body}`,
      badge: 'Direta',
      lastActivity: last.created_at,
    }
  })

  const items = [...approvalItems, ...directItems].sort(
    (a, b) => new Date(b.lastActivity).getTime() - new Date(a.lastActivity).getTime(),
  )

  return (
    <div>
      <PageHeader title="Mensagens" description="Conversas ligadas às matérias e recados diretos entre a equipe." actions={<SendMessageWidget colleagues={colleagues} />} />
      <div className="flex flex-col gap-3">
        {items.map((item) => (
          <Link key={item.key} href={item.href}>
            <Card className="flex items-center gap-3 p-4 transition-colors hover:bg-muted/40">
              <div className="flex -space-x-2">
                {item.people.slice(0, 3).map((person) => (
                  <Avatar key={person.id} initials={person.initials || '?'} color={person.color} src={privateAvatarUrl(person.avatar_path)} size="md" className="ring-2 ring-background" />
                ))}
                {!item.people.length && <Avatar initials="?" size="md" />}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-baseline gap-2">
                  <p className="truncate text-sm font-semibold">{item.headline}</p>
                  <span className="text-xs text-muted-foreground">{item.tag}</span>
                </div>
                <p className="truncate text-sm text-muted-foreground">{item.preview}</p>
              </div>
              <div className="flex shrink-0 flex-col items-end gap-1">
                <span className="rounded-md bg-muted px-2 py-0.5 text-xs text-muted-foreground">{item.badge}</span>
                <span className="text-xs text-muted-foreground">{formatDate(item.lastActivity, { dateStyle: 'short', timeStyle: 'short' })}</span>
              </div>
            </Card>
          </Link>
        ))}
        {!items.length && (
          <Card className="p-10 text-center">
            <MessageCircle className="mx-auto size-8 text-muted-foreground" />
            <p className="mt-3 font-medium">Nenhuma conversa ainda.</p>
            <p className="mt-1 text-sm text-muted-foreground">Elas aparecem quando você envia ou recebe uma matéria para aprovação — ou quando alguém manda um recado direto.</p>
          </Card>
        )}
      </div>
    </div>
  )
}
