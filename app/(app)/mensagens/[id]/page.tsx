import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ArrowLeft, ArrowRight, Check, Clock, X } from 'lucide-react'
import { Card } from '@/components/ui/card'
import { Avatar, privateAvatarUrl } from '@/components/ui/avatar'
import { cn } from '@/lib/utils'
import { requireWorkspace } from '@/lib/session'
import { createClient } from '@/lib/supabase/server'
import { addContentComment } from '@/app/actions/editorial'

const decisionMeta: Record<string, { label: string; icon: typeof Clock; className: string }> = {
  pending: { label: 'aguardando', icon: Clock, className: 'text-warning-foreground' },
  approved: { label: 'aprovou', icon: Check, className: 'text-success' },
  changes_requested: { label: 'pediu ajustes', icon: X, className: 'text-destructive' },
}

export default async function MensagemThreadPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: contentId } = await params
  const context = await requireWorkspace()
  const supabase = await createClient()

  const { data: content } = await supabase.from('content_pieces').select('id,title,format,pauta_id,pautas(title)').eq('id', contentId).eq('workspace_id', context.workspace.id).maybeSingle()
  if (!content) notFound()

  const { data: approval } = await supabase.from('approvals').select('id,requested_by,status,created_at').eq('content_id', contentId).eq('workspace_id', context.workspace.id).order('created_at', { ascending: false }).limit(1).maybeSingle()

  const { data: voterRows } = approval ? await supabase.from('approval_voters').select('user_id,decision,decided_at').eq('approval_id', approval.id) : { data: [] as any[] }

  const isParticipant = context.role === 'admin' || approval?.requested_by === context.user.id || (voterRows ?? []).some((v) => v.user_id === context.user.id)
  if (!isParticipant) notFound()

  const profileIds = new Set<string>()
  if (approval?.requested_by) profileIds.add(approval.requested_by)
  for (const v of voterRows ?? []) profileIds.add(v.user_id)

  const { data: commentRows } = await supabase.from('content_comments').select('id,body,author_id,created_at').eq('content_id', contentId).eq('workspace_id', context.workspace.id).order('created_at', { ascending: true })
  for (const c of commentRows ?? []) profileIds.add(c.author_id)

  const { data: profiles } = profileIds.size ? await supabase.from('profiles').select('id,full_name,initials,color,avatar_path').in('id', [...profileIds]) : { data: [] as any[] }
  const profileById = new Map((profiles ?? []).map((p) => [p.id, p]))

  const requesterProfile = approval?.requested_by ? profileById.get(approval.requested_by) : undefined
  const rawPauta = Array.isArray(content.pautas) ? content.pautas[0] : content.pautas
  const otherVoters = (voterRows ?? []).filter((v) => v.user_id !== context.user.id)
  const isRequester = approval?.requested_by === context.user.id

  const introLine = approval
    ? isRequester
      ? `Você enviou “${content.title}” para aprovação de ${otherVoters.map((v) => profileById.get(v.user_id)?.full_name?.split(' ')[0] || 'alguém').join(', ') || 'alguém'} em ${new Intl.DateTimeFormat('pt-BR', { dateStyle: 'long', timeStyle: 'short' }).format(new Date(approval.created_at))}.`
      : `${requesterProfile?.full_name || 'Alguém'} enviou “${content.title}” para sua aprovação em ${new Intl.DateTimeFormat('pt-BR', { dateStyle: 'long', timeStyle: 'short' }).format(new Date(approval.created_at))}.`
    : `Conversa sobre “${content.title}”.`

  return (
    <div className="mx-auto flex max-w-2xl flex-col">
      <nav className="mb-4 flex items-center gap-1 text-xs text-muted-foreground">
        <Link href="/mensagens" className="flex items-center gap-1 hover:text-foreground"><ArrowLeft className="size-3.5" />Mensagens</Link>
        <span>/</span>
        <span className="text-foreground">{content.title}</span>
      </nav>

      <Card className="p-4">
        <p className="text-sm leading-relaxed">{introLine}</p>
        {rawPauta?.title && <p className="mt-1 text-xs text-muted-foreground">Pauta: {rawPauta.title}</p>}
        {!!(voterRows ?? []).length && (
          <div className="mt-3 flex flex-wrap gap-3 border-t border-border pt-3">
            {(voterRows ?? []).map((voter) => {
              const profile = profileById.get(voter.user_id)
              const meta = decisionMeta[voter.decision] || decisionMeta.pending
              return (
                <span key={voter.user_id} className="flex items-center gap-1.5 text-xs">
                  <Avatar initials={profile?.initials || '?'} color={profile?.color} src={privateAvatarUrl(profile?.avatar_path)} size="xs" />
                  <span className="font-medium">{profile?.full_name?.split(' ')[0] || 'Colaborador'}</span>
                  <span className={cn('inline-flex items-center gap-0.5', meta.className)}><meta.icon className="size-3" />{meta.label}</span>
                </span>
              )
            })}
          </div>
        )}
        {approval && (
          <Link href={`/aprovacoes/${approval.id}`} className="mt-3 inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline">
            Abrir tela de aprovação<ArrowRight className="size-3" />
          </Link>
        )}
      </Card>

      <div className="mt-4 flex flex-col gap-3">
        {(commentRows ?? []).map((comment) => {
          const author = profileById.get(comment.author_id)
          const mine = comment.author_id === context.user.id
          return (
            <div key={comment.id} className={cn('flex items-end gap-2', mine && 'flex-row-reverse')}>
              <Avatar initials={author?.initials || '?'} color={author?.color} src={privateAvatarUrl(author?.avatar_path)} size="xs" />
              <div className={cn('max-w-[75%] rounded-2xl px-3.5 py-2 text-sm leading-relaxed', mine ? 'rounded-br-sm bg-primary text-primary-foreground' : 'rounded-bl-sm bg-muted')}>
                {!mine && <p className="mb-0.5 text-xs font-semibold opacity-80">{author?.full_name?.split(' ')[0] || 'Colaborador'}</p>}
                <p className="text-pretty">{comment.body}</p>
                <p className={cn('mt-1 text-[10px] opacity-70')}>{new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(comment.created_at))}</p>
              </div>
            </div>
          )
        })}
        {!commentRows?.length && <p className="py-8 text-center text-sm text-muted-foreground">Nenhuma mensagem ainda. Escreva a primeira.</p>}
      </div>

      <form action={addContentComment} className="sticky bottom-0 mt-4 flex gap-2 border-t border-border bg-background py-3 [padding-bottom:max(0.75rem,env(safe-area-inset-bottom))]">
        <input type="hidden" name="contentId" value={contentId} />
        <input
          name="body"
          required
          maxLength={2000}
          className="h-11 min-w-0 flex-1 rounded-full border border-border bg-background px-4 text-sm outline-none placeholder:text-muted-foreground focus:border-ring focus:ring-2 focus:ring-ring/30"
          placeholder="Escreva uma mensagem…"
          aria-label="Escrever mensagem"
        />
        <button type="submit" className="flex h-11 shrink-0 items-center justify-center rounded-full bg-primary px-5 text-sm font-medium text-primary-foreground">
          Enviar
        </button>
      </form>
    </div>
  )
}
