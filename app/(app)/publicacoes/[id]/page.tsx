import { notFound } from 'next/navigation'
import { PageHeader } from '@/components/app/page-header'
import { PostComposer } from '@/components/social/post-composer'
import { requireWorkspace } from '@/lib/session'
import { createClient } from '@/lib/supabase/server'
import { POST_TYPE_LABEL, type PostType, type SocialChannel } from '@/lib/meta/types'

export default async function PublicacaoPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const context = await requireWorkspace()
  const supabase = await createClient()

  const { data: post } = await supabase
    .from('social_posts')
    .select('id,content_id,pauta_id,post_type,caption,first_comment,status,scheduled_for,last_error')
    .eq('id', id)
    .eq('workspace_id', context.workspace.id)
    .maybeSingle()

  if (!post) notFound()

  const [{ data: canais }, { data: destinos }, { data: midias }, { data: arquivos }, { data: eventos }] =
    await Promise.all([
      supabase
        .from('social_channels')
        .select('id,workspace_id,platform,external_id,account_name,username,avatar_url,facebook_page_id,token_expires_at,status,last_checked_at,last_error')
        .eq('workspace_id', context.workspace.id)
        .order('platform')
        .returns<SocialChannel[]>(),
      supabase.from('social_post_targets').select('channel_id').eq('post_id', id),
      supabase
        .from('social_post_media')
        .select('id,role,position,files(id,name,content_type,storage_path,size_bytes)')
        .eq('post_id', id)
        .order('position'),
      // Só imagem e vídeo entram no seletor — documento não vira post.
      supabase
        .from('files')
        .select('id,name,content_type,storage_path,size_bytes')
        .eq('workspace_id', context.workspace.id)
        .in('file_type', ['foto', 'video'])
        .neq('status', 'deleted')
        .order('created_at', { ascending: false })
        .limit(120),
      supabase
        .from('social_post_events')
        .select('id,event,created_at,detail,profiles(full_name)')
        .eq('post_id', id)
        .order('created_at', { ascending: false })
        .limit(50),
    ])

  const midiasAnexadas = (midias ?? [])
    .map((linha: any) => {
      const file = Array.isArray(linha.files) ? linha.files[0] : linha.files
      return file ? { id: linha.id, role: linha.role as 'media' | 'cover', file } : null
    })
    .filter(Boolean) as any[]

  const historico = (eventos ?? []).map((evento: any) => {
    const autor = Array.isArray(evento.profiles) ? evento.profiles[0] : evento.profiles
    return {
      id: evento.id,
      event: evento.event,
      created_at: evento.created_at,
      detail: evento.detail,
      autor: autor?.full_name ?? null,
    }
  })

  return (
    <div>
      <PageHeader
        title={post.caption?.trim().slice(0, 60) || 'Nova publicação'}
        description={POST_TYPE_LABEL[post.post_type as PostType]}
        breadcrumbs={[{ label: 'Publicações', href: '/publicacoes' }, { label: 'Editar' }]}
      />
      <PostComposer
        post={post as any}
        canais={canais ?? []}
        destinosIniciais={(destinos ?? []).map((linha: any) => linha.channel_id)}
        midiasIniciais={midiasAnexadas}
        biblioteca={(arquivos ?? []) as any[]}
        podePublicar={context.role === 'admin'}
        historico={historico}
      />
    </div>
  )
}
