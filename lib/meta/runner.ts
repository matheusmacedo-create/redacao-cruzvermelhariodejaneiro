import 'server-only'
import { createAdminClient } from '@/lib/supabase/admin'
import { decifrarToken } from './crypto'
import { CODIGOS_TOKEN_INVALIDO, MetaError } from './graph'
import {
  aguardarContainer,
  checarCotaIg,
  comentarIg,
  montarContainerIg,
  publicarContainerIg,
  publicarFacebook,
} from './publish'
import type { MediaFile, PostStatus, SocialChannel, SocialPost, SocialPostTarget } from './types'

/**
 * Executa uma publicação do começo ao fim.
 *
 * É o mesmo caminho para "Publicar agora" e para o worker do agendamento — a
 * única diferença é quem chama. Manter um único caminho evita a classe de bug
 * em que o post agendado se comporta diferente do publicado na hora.
 *
 * Todo o progresso é gravado no banco a cada passo. Se a execução morrer no
 * meio (timeout da Vercel, deploy, queda), a próxima passada retoma pelo
 * container já salvo em vez de recriar a mídia e duplicar o post.
 */

const MAX_TENTATIVAS = 3
/** Espera entre tentativas: 2min, 10min, 30min. */
const ESPERA_TENTATIVA_MS = [2, 10, 30].map((m) => m * 60_000)

type Contexto = {
  /** Quanto tempo ainda temos nesta execução. */
  prazoFinal: number
  actorId?: string | null
}

async function registrar(
  postId: string,
  workspaceId: string,
  evento: string,
  detalhe: Record<string, unknown> = {},
  opcoes: { channelId?: string | null; actorId?: string | null } = {},
) {
  const admin = createAdminClient()
  await admin.from('social_post_events').insert({
    post_id: postId,
    workspace_id: workspaceId,
    channel_id: opcoes.channelId ?? null,
    actor_id: opcoes.actorId ?? null,
    event: evento,
    detail: detalhe,
  })
}

function serializarErro(erro: unknown) {
  if (erro instanceof MetaError) return erro.toJSON()
  if (erro instanceof Error) return { message: erro.message, retryable: false }
  return { message: String(erro), retryable: false }
}

function mensagemDoErro(erro: unknown): string {
  return erro instanceof Error ? erro.message : String(erro)
}

/** Marca o canal como precisando de reconexão quando o token morre. */
async function invalidarCanal(channelId: string, motivo: string) {
  const admin = createAdminClient()
  await admin
    .from('social_channels')
    .update({ status: 'expired', last_error: motivo, last_checked_at: new Date().toISOString() })
    .eq('id', channelId)
}

async function carregarMidias(postId: string): Promise<{ midias: MediaFile[]; capa: MediaFile | null }> {
  const admin = createAdminClient()
  const { data } = await admin
    .from('social_post_media')
    .select('position,role,files(id,name,content_type,storage_path,size_bytes)')
    .eq('post_id', postId)
    .order('position')

  const midias: MediaFile[] = []
  let capa: MediaFile | null = null

  for (const linha of data ?? []) {
    const file = (Array.isArray(linha.files) ? linha.files[0] : linha.files) as MediaFile | null
    if (!file) continue
    if (linha.role === 'cover') capa = file
    else midias.push(file)
  }

  return { midias, capa }
}

/**
 * Publica em UM canal. Isolado de propósito: se o Instagram falhar, o Facebook
 * ainda sai, e o post fica com status 'parcial' em vez de tudo ou nada.
 */
async function executarDestino(
  post: SocialPost,
  target: SocialPostTarget,
  canal: SocialChannel & { access_token_cipher: string },
  contexto: Contexto,
): Promise<'publicado' | 'processando'> {
  const admin = createAdminClient()
  const token = decifrarToken(canal.access_token_cipher)
  const { midias, capa } = await carregarMidias(post.id)

  await admin.from('social_post_targets').update({ status: 'publicando', error: null }).eq('id', target.id)

  if (canal.platform === 'facebook') {
    const resultado = await publicarFacebook({
      pageId: canal.external_id,
      token,
      legenda: post.caption,
      midias,
    })
    await admin
      .from('social_post_targets')
      .update({
        status: 'publicado',
        external_post_id: resultado.externalPostId,
        permalink: resultado.permalink,
        published_at: new Date().toISOString(),
        error: null,
      })
      .eq('id', target.id)
    await registrar(post.id, post.workspace_id, 'publicado', resultado as any, { channelId: canal.id })
    return 'publicado'
  }

  // --- Instagram ---
  await checarCotaIg(canal, token)

  // Reaproveita o container de uma execução anterior, se ele ainda existe.
  let containerId = target.container_id
  if (!containerId) {
    containerId = await montarContainerIg({
      igUserId: canal.external_id,
      token,
      postType: post.post_type,
      legenda: post.post_type === 'story' ? '' : post.caption,
      midias,
      capa,
    })
    // Grava ANTES de esperar: se cair agora, retomamos daqui.
    await admin.from('social_post_targets').update({ container_id: containerId }).eq('id', target.id)
    await registrar(post.id, post.workspace_id, 'container_criado', { containerId }, { channelId: canal.id })
  }

  const orcamento = Math.max(5_000, contexto.prazoFinal - Date.now() - 8_000)
  const situacao = await aguardarContainer(containerId, token, orcamento)

  if (situacao === 'processando') {
    // Vídeo longo. Sai desta execução e continua na próxima passada do worker.
    await registrar(post.id, post.workspace_id, 'aguardando_processamento', { containerId }, { channelId: canal.id })
    return 'processando'
  }

  const resultado = await publicarContainerIg(canal.external_id, token, containerId)

  await admin
    .from('social_post_targets')
    .update({
      status: 'publicado',
      external_post_id: resultado.externalPostId,
      permalink: resultado.permalink,
      published_at: new Date().toISOString(),
      error: null,
    })
    .eq('id', target.id)

  if (post.first_comment?.trim() && post.post_type !== 'story') {
    // O primeiro comentário é acessório: se falhar, o post continua publicado.
    try {
      await comentarIg(resultado.externalPostId, token, post.first_comment.trim())
    } catch (erro) {
      await registrar(post.id, post.workspace_id, 'primeiro_comentario_falhou', serializarErro(erro), {
        channelId: canal.id,
      })
    }
  }

  await registrar(post.id, post.workspace_id, 'publicado', resultado as any, { channelId: canal.id })
  return 'publicado'
}

export type ResultadoExecucao = {
  status: PostStatus
  publicados: number
  falhas: number
  processando: number
}

/**
 * Processa um post inteiro: percorre seus destinos e consolida o status final.
 */
export async function executarPost(postId: string, contexto: Contexto): Promise<ResultadoExecucao> {
  const admin = createAdminClient()

  const { data: post } = await admin.from('social_posts').select('*').eq('id', postId).single<SocialPost>()
  if (!post) throw new Error('Publicação não encontrada.')

  await admin.from('social_posts').update({ status: 'publicando' }).eq('id', postId)
  await registrar(postId, post.workspace_id, 'publicando', {}, { actorId: contexto.actorId })

  const { data: targets } = await admin
    .from('social_post_targets')
    .select('*')
    .eq('post_id', postId)
    .in('status', ['pendente', 'publicando', 'falhou'])
    .returns<SocialPostTarget[]>()

  let publicados = 0
  let falhas = 0
  let processando = 0
  let ultimoErro: string | null = null
  let tokenMorreu = false

  for (const target of targets ?? []) {
    const { data: canal } = await admin
      .from('social_channels')
      .select('*')
      .eq('id', target.channel_id)
      .single<SocialChannel & { access_token_cipher: string }>()

    if (!canal) {
      falhas += 1
      ultimoErro = 'O canal de destino não existe mais.'
      await admin.from('social_post_targets').update({ status: 'falhou', error: ultimoErro }).eq('id', target.id)
      continue
    }

    try {
      const situacao = await executarDestino(post, target, canal, contexto)
      if (situacao === 'publicado') publicados += 1
      else processando += 1
    } catch (erro) {
      falhas += 1
      ultimoErro = mensagemDoErro(erro)

      if (erro instanceof MetaError && erro.code !== undefined && CODIGOS_TOKEN_INVALIDO.has(erro.code)) {
        tokenMorreu = true
        await invalidarCanal(canal.id, ultimoErro)
      }

      await admin.from('social_post_targets').update({ status: 'falhou', error: ultimoErro }).eq('id', target.id)
      await registrar(postId, post.workspace_id, 'falhou', serializarErro(erro), { channelId: canal.id })
    }

    // Não começa um destino novo sem tempo hábil para ele.
    if (Date.now() > contexto.prazoFinal - 5_000) break
  }

  // --- consolida o status do post ---
  const tentativas = post.attempts + 1
  let status: PostStatus
  let proximaTentativa: string | null = null

  if (processando > 0 && falhas === 0) {
    // Continua na próxima passada do worker, sem contar como tentativa falha.
    status = 'agendado'
    proximaTentativa = new Date(Date.now() + 60_000).toISOString()
  } else if (falhas === 0) {
    status = 'publicado'
  } else if (publicados > 0) {
    status = 'parcial'
  } else if (tentativas < MAX_TENTATIVAS && !tokenMorreu) {
    // Token inválido não se resolve sozinho: não adianta repetir.
    status = 'falhou'
    proximaTentativa = new Date(
      Date.now() + (ESPERA_TENTATIVA_MS[tentativas - 1] ?? ESPERA_TENTATIVA_MS.at(-1)!),
    ).toISOString()
  } else {
    status = 'falhou'
  }

  const publicouAlgo = status === 'publicado' || status === 'parcial'

  await admin
    .from('social_posts')
    .update({
      status,
      attempts: processando > 0 && falhas === 0 ? post.attempts : tentativas,
      next_attempt_at: proximaTentativa,
      last_error: falhas > 0 ? ultimoErro : null,
      published_at: publicouAlgo ? new Date().toISOString() : null,
      published_by: publicouAlgo ? (contexto.actorId ?? post.published_by) : post.published_by,
    })
    .eq('id', postId)

  await registrar(postId, post.workspace_id, status, { publicados, falhas, processando, tentativas })

  return { status, publicados, falhas, processando }
}

/**
 * Posts que devem ser processados agora.
 * `agendado` cuja hora chegou, ou `falhou` cuja hora de retentar chegou.
 */
export async function postsDaFila(limite = 5): Promise<string[]> {
  const admin = createAdminClient()
  const agora = new Date().toISOString()

  const { data: agendados } = await admin
    .from('social_posts')
    .select('id')
    .eq('status', 'agendado')
    .lte('scheduled_for', agora)
    .order('scheduled_for')
    .limit(limite)

  const { data: retentar } = await admin
    .from('social_posts')
    .select('id')
    .eq('status', 'falhou')
    .not('next_attempt_at', 'is', null)
    .lte('next_attempt_at', agora)
    .order('next_attempt_at')
    .limit(limite)

  const ids = [...(agendados ?? []), ...(retentar ?? [])].map((linha) => linha.id)
  return [...new Set(ids)].slice(0, limite)
}
