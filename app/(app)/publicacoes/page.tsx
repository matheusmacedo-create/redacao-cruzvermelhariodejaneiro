import Link from 'next/link'
import { CalendarClock } from 'lucide-react'
import { PageHeader } from '@/components/app/page-header'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { FacebookIcon, InstagramIcon } from '@/components/social/platform-icon'
import { requireWorkspace } from '@/lib/session'
import { createClient } from '@/lib/supabase/server'
import { POST_STATUS_LABEL, POST_TYPE_LABEL, type PostStatus, type PostType } from '@/lib/meta/types'
import { NovaPublicacaoButton } from './nova-publicacao-button'

/** Tom visual de cada status, seguindo a paleta já usada em status-badge. */
const TOM: Record<PostStatus, string> = {
  rascunho: 'bg-secondary text-secondary-foreground',
  aguardando_aprovacao: 'bg-warning/20 text-warning-foreground',
  aprovado: 'bg-info/12 text-info',
  agendado: 'bg-primary/10 text-primary',
  publicando: 'bg-info/12 text-info',
  publicado: 'bg-success/14 text-success',
  parcial: 'bg-warning/20 text-warning-foreground',
  falhou: 'bg-destructive/12 text-destructive',
  cancelado: 'bg-secondary text-secondary-foreground',
}

export default async function PublicacoesPage() {
  const context = await requireWorkspace()
  const supabase = await createClient()

  const { data: posts } = await supabase
    .from('social_posts')
    .select('id,post_type,caption,status,scheduled_for,published_at,updated_at,social_post_targets(social_channels(platform))')
    .eq('workspace_id', context.workspace.id)
    .order('updated_at', { ascending: false })

  const lista = (posts ?? []).map((post: any) => {
    const plataformas = new Set<string>()
    for (const target of post.social_post_targets ?? []) {
      const canal = Array.isArray(target.social_channels) ? target.social_channels[0] : target.social_channels
      if (canal?.platform) plataformas.add(canal.platform)
    }
    return { ...post, plataformas: [...plataformas] }
  })

  return (
    <div>
      <PageHeader
        title="Publicações"
        description="Posts de redes sociais desta Redação, do rascunho até o ar."
        actions={<NovaPublicacaoButton />}
      />

      {lista.length === 0 ? (
        <Card className="p-10 text-center">
          <p className="text-sm font-medium">Nenhuma publicação ainda.</p>
          <p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">
            Crie uma publicação, envie para aprovação e, depois de aprovada, agende ou publique na hora.
          </p>
        </Card>
      ) : (
        <Card className="divide-y divide-border">
          {lista.map((post: any) => (
            <Link
              key={post.id}
              href={`/publicacoes/${post.id}`}
              className="flex flex-wrap items-center gap-3 px-4 py-3 transition-colors hover:bg-muted/40"
            >
              <div className="flex shrink-0 gap-1 text-muted-foreground">
                {post.plataformas.includes('instagram') && <InstagramIcon className="size-4" />}
                {post.plataformas.includes('facebook') && <FacebookIcon className="size-4" />}
              </div>

              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">
                  {post.caption?.trim() || 'Publicação sem legenda'}
                </p>
                <p className="truncate text-xs text-muted-foreground">
                  {POST_TYPE_LABEL[post.post_type as PostType]}
                  {post.scheduled_for && (
                    <>
                      {' · '}
                      <CalendarClock className="inline size-3 align-[-2px]" />{' '}
                      {new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' }).format(
                        new Date(post.scheduled_for),
                      )}
                    </>
                  )}
                </p>
              </div>

              <span
                className={`shrink-0 rounded-md px-2 py-0.5 text-xs font-medium ${
                  TOM[post.status as PostStatus] ?? 'bg-secondary'
                }`}
              >
                {POST_STATUS_LABEL[post.status as PostStatus] ?? post.status}
              </span>
            </Link>
          ))}
        </Card>
      )}
    </div>
  )
}
