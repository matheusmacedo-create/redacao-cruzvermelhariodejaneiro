'use server'

import { revalidatePath } from 'next/cache'
import { requireAdmin, requireWorkspace } from '@/lib/session'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { executarPost } from '@/lib/meta/runner'
import { temBloqueio, validarPost } from '@/lib/meta/validation'
import type { MediaFile, PostType, SocialPost, SocialPlatform } from '@/lib/meta/types'

/**
 * Ações do módulo de publicação.
 *
 * Regra que atravessa o arquivo inteiro: só admin publica ou agenda. A criação
 * e a edição do rascunho ficam abertas à equipe, para que o social media monte
 * o post e mande para aprovação — mas o disparo é restrito.
 */

const text = (form: FormData, key: string) => String(form.get(key) ?? '').trim()

const POST_TYPES: PostType[] = ['feed', 'carousel', 'reels', 'story']

function lerPostType(form: FormData): PostType {
  const valor = text(form, 'postType') as PostType
  return POST_TYPES.includes(valor) ? valor : 'feed'
}

/** Carrega mídias e plataformas de um post — o que a validação precisa. */
async function contextoDoPost(postId: string) {
  const admin = createAdminClient()

  const { data: midiaRows } = await admin
    .from('social_post_media')
    .select('role,position,files(id,name,content_type,storage_path,size_bytes)')
    .eq('post_id', postId)
    .order('position')

  const midias: MediaFile[] = []
  for (const linha of midiaRows ?? []) {
    if (linha.role === 'cover') continue
    const file = (Array.isArray(linha.files) ? linha.files[0] : linha.files) as MediaFile | null
    if (file) midias.push(file)
  }

  const { data: targetRows } = await admin
    .from('social_post_targets')
    .select('social_channels(platform)')
    .eq('post_id', postId)

  const plataformas = [
    ...new Set(
      (targetRows ?? [])
        .map((linha) => {
          const canal = Array.isArray(linha.social_channels) ? linha.social_channels[0] : linha.social_channels
          return (canal as { platform: SocialPlatform } | null)?.platform
        })
        .filter(Boolean) as SocialPlatform[],
    ),
  ]

  return { midias, plataformas }
}

async function registrar(
  postId: string,
  workspaceId: string,
  evento: string,
  actorId: string,
  detalhe: Record<string, unknown> = {},
) {
  const admin = createAdminClient()
  await admin.from('social_post_events').insert({
    post_id: postId,
    workspace_id: workspaceId,
    actor_id: actorId,
    event: evento,
    detail: detalhe,
  })
}

// ---------------------------------------------------------------------------
// Rascunho
// ---------------------------------------------------------------------------

export async function criarPost(formData: FormData) {
  const context = await requireWorkspace()
  const supabase = await createClient()

  const { data, error } = await supabase
    .from('social_posts')
    .insert({
      workspace_id: context.workspace.id,
      content_id: text(formData, 'contentId') || null,
      pauta_id: text(formData, 'pautaId') || null,
      post_type: lerPostType(formData),
      caption: text(formData, 'caption'),
      status: 'rascunho',
      created_by: context.user.id,
    })
    .select('id')
    .single()

  if (error || !data) throw new Error(error?.message || 'Não foi possível criar a publicação.')

  await registrar(data.id, context.workspace.id, 'criado', context.user.id)
  revalidatePath('/calendario')
  return { postId: data.id }
}

export async function salvarPost(formData: FormData) {
  const context = await requireWorkspace()
  const supabase = await createClient()
  const postId = text(formData, 'postId')

  const { data: atual } = await supabase
    .from('social_posts')
    .select('status')
    .eq('id', postId)
    .eq('workspace_id', context.workspace.id)
    .single()

  if (!atual) throw new Error('Publicação não encontrada.')
  if (['publicando', 'publicado', 'parcial'].includes(atual.status)) {
    throw new Error('Esta publicação já foi para o ar e não pode mais ser editada.')
  }

  const { error } = await supabase
    .from('social_posts')
    .update({
      post_type: lerPostType(formData),
      caption: text(formData, 'caption'),
      first_comment: text(formData, 'firstComment') || null,
    })
    .eq('id', postId)
    .eq('workspace_id', context.workspace.id)

  if (error) throw new Error(error.message)

  revalidatePath(`/conteudos/${text(formData, 'contentId')}`)
  return { ok: true }
}

/** Define os canais de destino, substituindo a seleção anterior. */
export async function definirDestinos(formData: FormData) {
  const context = await requireWorkspace()
  const supabase = await createClient()
  const postId = text(formData, 'postId')
  const channelIds = formData.getAll('channelIds').map(String).filter(Boolean)

  const { data: post } = await supabase
    .from('social_posts')
    .select('status')
    .eq('id', postId)
    .eq('workspace_id', context.workspace.id)
    .single()
  if (!post) throw new Error('Publicação não encontrada.')

  const admin = createAdminClient()
  // Só remove o que ainda não foi publicado — histórico de destino publicado fica.
  await admin.from('social_post_targets').delete().eq('post_id', postId).in('status', ['pendente', 'cancelado'])

  if (channelIds.length) {
    await admin
      .from('social_post_targets')
      .upsert(
        channelIds.map((channel_id) => ({ post_id: postId, channel_id, status: 'pendente' })),
        { onConflict: 'post_id,channel_id' },
      )
  }

  revalidatePath(`/conteudos/${text(formData, 'contentId')}`)
  return { ok: true }
}

/** Anexa um arquivo da Biblioteca ao post. */
export async function anexarMidia(formData: FormData) {
  const context = await requireWorkspace()
  const supabase = await createClient()
  const postId = text(formData, 'postId')
  const fileId = text(formData, 'fileId')
  const role = text(formData, 'role') === 'cover' ? 'cover' : 'media'

  // O arquivo tem que ser do mesmo espaço — não se anexa mídia de outro workspace.
  const { data: file } = await supabase
    .from('files')
    .select('id')
    .eq('id', fileId)
    .eq('workspace_id', context.workspace.id)
    .maybeSingle()
  if (!file) throw new Error('Arquivo não encontrado na Biblioteca deste espaço.')

  const admin = createAdminClient()
  const { data: existentes } = await admin
    .from('social_post_media')
    .select('position')
    .eq('post_id', postId)
    .eq('role', role)
    .order('position', { ascending: false })
    .limit(1)

  const position = role === 'cover' ? 0 : (existentes?.[0]?.position ?? -1) + 1

  const { error } = await admin
    .from('social_post_media')
    .upsert({ post_id: postId, file_id: fileId, position, role, alt_text: text(formData, 'altText') || null },
      { onConflict: 'post_id,position,role' })

  if (error) throw new Error(error.message)
  revalidatePath(`/conteudos/${text(formData, 'contentId')}`)
  return { ok: true }
}

export async function removerMidia(formData: FormData) {
  await requireWorkspace()
  const admin = createAdminClient()
  await admin.from('social_post_media').delete().eq('id', text(formData, 'mediaId'))
  revalidatePath(`/conteudos/${text(formData, 'contentId')}`)
  return { ok: true }
}

// ---------------------------------------------------------------------------
// Agendar e publicar — só admin
// ---------------------------------------------------------------------------

async function carregarParaDisparo(postId: string, workspaceId: string) {
  const admin = createAdminClient()
  const { data: post } = await admin
    .from('social_posts')
    .select('*')
    .eq('id', postId)
    .eq('workspace_id', workspaceId)
    .single<SocialPost>()

  if (!post) throw new Error('Publicação não encontrada.')

  // A trava central: nada vai para o ar sem passar pela esteira de aprovação.
  if (!['aprovado', 'agendado', 'falhou'].includes(post.status)) {
    throw new Error('Esta publicação ainda não foi aprovada. Envie para aprovação antes de publicar.')
  }

  return post
}

export async function agendarPost(formData: FormData) {
  const context = await requireAdmin()
  const postId = text(formData, 'postId')
  const post = await carregarParaDisparo(postId, context.workspace.id)

  const quando = new Date(text(formData, 'scheduledFor'))
  if (Number.isNaN(quando.getTime())) throw new Error('Data de agendamento inválida.')

  const { midias, plataformas } = await contextoDoPost(postId)
  const problemas = validarPost({
    postType: post.post_type,
    legenda: post.caption,
    midias,
    plataformas,
    agendarPara: quando,
  })
  if (temBloqueio(problemas)) {
    throw new Error(problemas.filter((p) => p.bloqueia).map((p) => p.mensagem).join(' '))
  }

  const admin = createAdminClient()
  await admin
    .from('social_posts')
    .update({
      status: 'agendado',
      scheduled_for: quando.toISOString(),
      timezone: text(formData, 'timezone') || 'America/Sao_Paulo',
      attempts: 0,
      next_attempt_at: null,
      last_error: null,
    })
    .eq('id', postId)

  // Espelha no calendário editorial que já existe.
  await admin.from('calendar_events').insert({
    workspace_id: context.workspace.id,
    pauta_id: post.pauta_id,
    title: post.caption.slice(0, 80) || 'Publicação em redes sociais',
    event_date: quando.toISOString().slice(0, 10),
    event_time: quando.toISOString().slice(11, 16),
    type: 'publication',
    created_by: context.user.id,
  })

  await registrar(postId, context.workspace.id, 'agendado', context.user.id, {
    scheduledFor: quando.toISOString(),
  })

  revalidatePath('/calendario')
  revalidatePath(`/conteudos/${post.content_id}`)
  return { ok: true, scheduledFor: quando.toISOString() }
}

export async function publicarAgora(formData: FormData) {
  const context = await requireAdmin()
  const postId = text(formData, 'postId')
  const post = await carregarParaDisparo(postId, context.workspace.id)

  const { midias, plataformas } = await contextoDoPost(postId)
  const problemas = validarPost({
    postType: post.post_type,
    legenda: post.caption,
    midias,
    plataformas,
  })
  if (temBloqueio(problemas)) {
    throw new Error(problemas.filter((p) => p.bloqueia).map((p) => p.mensagem).join(' '))
  }

  const admin = createAdminClient()
  await admin.from('social_posts').update({ attempts: 0, last_error: null, next_attempt_at: null }).eq('id', postId)

  // Orçamento curto: é uma ação de tela, não pode deixar a pessoa esperando.
  // Vídeo que não termina a tempo cai na fila e o worker conclui.
  const resultado = await executarPost(postId, {
    prazoFinal: Date.now() + 40_000,
    actorId: context.user.id,
  })

  revalidatePath('/calendario')
  revalidatePath(`/conteudos/${post.content_id}`)
  return resultado
}

export async function cancelarAgendamento(formData: FormData) {
  const context = await requireAdmin()
  const postId = text(formData, 'postId')
  const admin = createAdminClient()

  const { data: post } = await admin
    .from('social_posts')
    .select('status,content_id')
    .eq('id', postId)
    .eq('workspace_id', context.workspace.id)
    .single()

  if (!post) throw new Error('Publicação não encontrada.')
  if (['publicado', 'parcial', 'publicando'].includes(post.status)) {
    throw new Error('Esta publicação já foi disparada e não pode ser cancelada por aqui.')
  }

  await admin
    .from('social_posts')
    .update({ status: 'cancelado', scheduled_for: null, next_attempt_at: null })
    .eq('id', postId)
  await admin.from('social_post_targets').update({ status: 'cancelado' }).eq('post_id', postId).eq('status', 'pendente')

  await registrar(postId, context.workspace.id, 'cancelado', context.user.id)

  revalidatePath('/calendario')
  revalidatePath(`/conteudos/${post.content_id}`)
  return { ok: true }
}

// ---------------------------------------------------------------------------
// Canais
// ---------------------------------------------------------------------------

export async function desconectarCanal(formData: FormData) {
  const context = await requireAdmin()
  const channelId = text(formData, 'channelId')
  const admin = createAdminClient()

  // Não desconecta um canal com publicação pendente — viraria post órfão.
  const { count } = await admin
    .from('social_post_targets')
    .select('id', { count: 'exact', head: true })
    .eq('channel_id', channelId)
    .in('status', ['pendente', 'publicando'])

  if ((count ?? 0) > 0) {
    throw new Error('Existem publicações agendadas para este canal. Cancele-as antes de desconectar.')
  }

  await admin.from('social_channels').delete().eq('id', channelId).eq('workspace_id', context.workspace.id)
  revalidatePath('/configuracoes')
  return { ok: true }
}
