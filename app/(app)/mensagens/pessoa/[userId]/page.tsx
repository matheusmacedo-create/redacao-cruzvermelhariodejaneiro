import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ArrowLeft } from 'lucide-react'
import { Card } from '@/components/ui/card'
import { Avatar } from '@/components/ui/avatar'
import { privateAvatarUrl } from '@/lib/avatar-url'
import { cn } from '@/lib/utils'
import { requireWorkspace } from '@/lib/session'
import { createClient } from '@/lib/supabase/server'
import { formatDate } from '@/lib/format'
import { sendDirectMessage } from '@/app/actions/editorial'

export default async function ConversaDiretaPage({ params }: { params: Promise<{ userId: string }> }) {
  const { userId } = await params
  const context = await requireWorkspace()
  const supabase = await createClient()

  if (userId === context.user.id) notFound()

  const { data: member } = await supabase
    .from('workspace_members')
    .select('user_id,profiles(id,full_name,initials,color,avatar_path)')
    .eq('workspace_id', context.workspace.id)
    .eq('user_id', userId)
    .maybeSingle()
  if (!member) notFound()

  const other: any = Array.isArray(member.profiles) ? member.profiles[0] : member.profiles
  if (!other) notFound()

  // A RLS já restringe a conversa direta às duas pessoas; o filtro aqui é para
  // separar esta conversa das outras, não para proteger.
  const { data: messages } = await supabase
    .from('messages')
    .select('id,author_id,recipient_id,body,created_at')
    .eq('workspace_id', context.workspace.id)
    .is('pauta_id', null)
    .or(`and(author_id.eq.${context.user.id},recipient_id.eq.${userId}),and(author_id.eq.${userId},recipient_id.eq.${context.user.id})`)
    .order('created_at', { ascending: true })

  const firstName = other.full_name?.split(' ')[0] || 'Colaborador'

  return (
    <div className="mx-auto flex max-w-2xl flex-col">
      <nav className="mb-4 flex items-center gap-1 text-xs text-muted-foreground">
        <Link href="/mensagens" className="flex items-center gap-1 hover:text-foreground"><ArrowLeft className="size-3.5" />Mensagens</Link>
        <span>/</span>
        <span className="text-foreground">{other.full_name}</span>
      </nav>

      <Card className="flex items-center gap-3 p-4">
        <Avatar initials={other.initials || '?'} color={other.color} src={privateAvatarUrl(other.avatar_path)} size="md" />
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold">{other.full_name}</p>
          <p className="text-xs text-muted-foreground">Conversa direta — só você e {firstName} enxergam.</p>
        </div>
      </Card>

      <div className="mt-4 flex flex-col gap-3">
        {(messages ?? []).map((message) => {
          const mine = message.author_id === context.user.id
          return (
            <div key={message.id} className={cn('flex items-end gap-2', mine && 'flex-row-reverse')}>
              <Avatar
                initials={(mine ? context.profile?.initials : other.initials) || '?'}
                color={mine ? context.profile?.color : other.color}
                src={privateAvatarUrl(mine ? context.profile?.avatar_path : other.avatar_path)}
                size="xs"
              />
              <div className={cn('max-w-[75%] rounded-2xl px-3.5 py-2 text-sm leading-relaxed', mine ? 'rounded-br-sm bg-primary text-primary-foreground' : 'rounded-bl-sm bg-muted')}>
                {!mine && <p className="mb-0.5 text-xs font-semibold opacity-80">{firstName}</p>}
                <p className="text-pretty">{message.body}</p>
                <p className="mt-1 text-[10px] opacity-70">{formatDate(message.created_at, { dateStyle: 'short', timeStyle: 'short' })}</p>
              </div>
            </div>
          )
        })}
        {!messages?.length && <p className="py-8 text-center text-sm text-muted-foreground">Nenhuma mensagem ainda. Escreva a primeira.</p>}
      </div>

      <form action={sendDirectMessage} className="sticky bottom-0 mt-4 flex gap-2 border-t border-border bg-background py-3 [padding-bottom:max(0.75rem,env(safe-area-inset-bottom))]">
        <input type="hidden" name="recipientId" value={userId} />
        <input
          name="body"
          required
          maxLength={2000}
          className="h-11 min-w-0 flex-1 rounded-full border border-border bg-background px-4 text-sm outline-none placeholder:text-muted-foreground focus:border-ring focus:ring-2 focus:ring-ring/30"
          placeholder={`Escreva para ${firstName}…`}
          aria-label="Escrever mensagem"
        />
        <button type="submit" className="flex h-11 shrink-0 items-center justify-center rounded-full bg-primary px-5 text-sm font-medium text-primary-foreground">
          Enviar
        </button>
      </form>
    </div>
  )
}
