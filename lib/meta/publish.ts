import 'server-only'
import { graph, limitePublicacaoIg, MetaError } from './graph'
import { urlPublicaMidia } from './media-url'
import type { MediaFile, PostType, SocialChannel } from './types'

/**
 * Motor de publicação.
 *
 * Instagram e Facebook publicam de formas fundamentalmente diferentes:
 *
 *  INSTAGRAM — não tem agendamento. Só publica agora, e em dois passos:
 *    1. cria um "container" com a mídia (a Meta baixa e processa o arquivo)
 *    2. espera o container ficar FINISHED
 *    3. chama media_publish
 *    Carrossel exige um container por item antes do container pai.
 *
 *  FACEBOOK — tem agendamento nativo (scheduled_publish_time). Mandamos a data
 *    e a Meta guarda; não precisamos acordar na hora certa.
 *
 * Por isso o worker existe: ele é o "agendador do Instagram" que a Meta não dá.
 */

export type ResultadoPublicacao = {
  externalPostId: string
  permalink: string | null
  containerId?: string
}

// ---------------------------------------------------------------------------
// Instagram
// ---------------------------------------------------------------------------

type ParametrosContainer = Record<string, string | number | boolean | undefined>

function parametrosDaMidia(file: MediaFile): ParametrosContainer {
  const url = urlPublicaMidia(file.id)
  return file.content_type.startsWith('video/') ? { video_url: url } : { image_url: url }
}

async function criarContainer(igUserId: string, token: string, params: ParametrosContainer): Promise<string> {
  const resposta = await graph<{ id: string }>(`${igUserId}/media`, {
    method: 'POST',
    accessToken: token,
    params,
  })
  if (!resposta?.id) throw new MetaError('A Meta não devolveu o identificador da mídia.', { retryable: true })
  return resposta.id
}

/**
 * Espera o container ficar pronto.
 *
 * Imagem fica FINISHED quase na hora; vídeo pode levar minutos. O worker roda
 * a cada minuto e tem orçamento de execução limitado, então esperamos só até
 * `orcamentoMs`. Se estourar, devolvemos 'processando' e o container fica salvo
 * no banco — a próxima passada do worker continua de onde parou, sem recriar.
 */
export async function aguardarContainer(
  containerId: string,
  token: string,
  orcamentoMs = 45_000,
): Promise<'pronto' | 'processando'> {
  const limite = Date.now() + orcamentoMs
  let espera = 2_000

  while (Date.now() < limite) {
    const resposta = await graph<{ status_code: string; status?: string }>(containerId, {
      accessToken: token,
      params: { fields: 'status_code,status' },
    })

    switch (resposta.status_code) {
      case 'FINISHED':
        return 'pronto'
      case 'PUBLISHED':
        return 'pronto'
      case 'ERROR':
        throw new MetaError(
          resposta.status || 'A Meta não conseguiu processar o arquivo. Verifique formato, duração e proporção.',
        )
      case 'EXPIRED':
        // Container passou de 24h. Precisa recriar do zero.
        throw new MetaError('O envio da mídia expirou antes de publicar. A publicação será refeita.', { retryable: true })
      default:
        // IN_PROGRESS: espera crescente, até 8s entre consultas.
        await new Promise((resolve) => setTimeout(resolve, espera))
        espera = Math.min(espera * 1.5, 8_000)
    }
  }

  return 'processando'
}

export async function publicarContainerIg(
  igUserId: string,
  token: string,
  containerId: string,
): Promise<ResultadoPublicacao> {
  const publicado = await graph<{ id: string }>(`${igUserId}/media_publish`, {
    method: 'POST',
    accessToken: token,
    params: { creation_id: containerId },
  })

  // O permalink é informativo — se falhar, não invalida a publicação.
  let permalink: string | null = null
  try {
    const detalhe = await graph<{ permalink?: string }>(publicado.id, {
      accessToken: token,
      params: { fields: 'permalink' },
    })
    permalink = detalhe.permalink ?? null
  } catch {
    permalink = null
  }

  return { externalPostId: publicado.id, permalink }
}

/**
 * Monta o container do Instagram conforme o formato.
 * Devolve o id para ser salvo no banco antes de qualquer espera longa —
 * assim uma queda no meio do caminho não vira mídia duplicada.
 */
export async function montarContainerIg(entrada: {
  igUserId: string
  token: string
  postType: PostType
  legenda: string
  midias: MediaFile[]
  capa?: MediaFile | null
}): Promise<string> {
  const { igUserId, token, postType, legenda, midias, capa } = entrada

  if (postType === 'carousel') {
    // Cada item vira um container filho; só então o container pai é criado.
    const filhos: string[] = []
    for (const file of midias) {
      filhos.push(
        await criarContainer(igUserId, token, {
          ...parametrosDaMidia(file),
          is_carousel_item: true,
        }),
      )
    }
    return criarContainer(igUserId, token, {
      media_type: 'CAROUSEL',
      children: filhos.join(','),
      caption: legenda,
    })
  }

  const principal = midias[0]
  if (!principal) throw new MetaError('Nenhuma mídia foi anexada à publicação.')

  if (postType === 'reels') {
    return criarContainer(igUserId, token, {
      media_type: 'REELS',
      video_url: urlPublicaMidia(principal.id),
      caption: legenda,
      cover_url: capa ? urlPublicaMidia(capa.id) : undefined,
      share_to_feed: true,
    })
  }

  if (postType === 'story') {
    return criarContainer(igUserId, token, {
      media_type: 'STORIES',
      ...parametrosDaMidia(principal),
      // Stories não têm legenda.
    })
  }

  // feed
  return criarContainer(igUserId, token, {
    ...parametrosDaMidia(principal),
    caption: legenda,
  })
}

/** Verifica a cota antes de gastar tempo criando container. */
export async function checarCotaIg(canal: SocialChannel, token: string): Promise<void> {
  const restante = await limitePublicacaoIg(canal.external_id, token)
  if (restante <= 0) {
    throw new MetaError(
      `A conta @${canal.username ?? canal.account_name} atingiu o limite de 50 publicações em 24 horas.`,
    )
  }
}

/** Publica o primeiro comentário logo após o post entrar no ar. */
export async function comentarIg(mediaId: string, token: string, texto: string): Promise<void> {
  await graph(`${mediaId}/comments`, {
    method: 'POST',
    accessToken: token,
    params: { message: texto },
  })
}

// ---------------------------------------------------------------------------
// Facebook
// ---------------------------------------------------------------------------

/**
 * Publica (ou agenda nativamente) numa Página do Facebook.
 *
 * `agendarPara` só é aceito pela Meta a partir de 10 minutos no futuro. Quando
 * a data está mais perto que isso, quem publica é o nosso worker, na hora.
 */
export async function publicarFacebook(entrada: {
  pageId: string
  token: string
  legenda: string
  midias: MediaFile[]
  agendarPara?: Date | null
}): Promise<ResultadoPublicacao> {
  const { pageId, token, legenda, midias, agendarPara } = entrada

  const agendamento = agendarPara
    ? { published: false, scheduled_publish_time: Math.floor(agendarPara.getTime() / 1000) }
    : {}

  // Sem mídia: publicação de texto no feed.
  if (midias.length === 0) {
    const resposta = await graph<{ id: string }>(`${pageId}/feed`, {
      method: 'POST',
      accessToken: token,
      params: { message: legenda, ...agendamento },
    })
    return { externalPostId: resposta.id, permalink: `https://www.facebook.com/${resposta.id}` }
  }

  const principal = midias[0]

  if (principal.content_type.startsWith('video/')) {
    const resposta = await graph<{ id: string }>(`${pageId}/videos`, {
      method: 'POST',
      accessToken: token,
      params: { file_url: urlPublicaMidia(principal.id), description: legenda, ...agendamento },
    })
    return { externalPostId: resposta.id, permalink: `https://www.facebook.com/${resposta.id}` }
  }

  // Uma imagem: publica direto.
  if (midias.length === 1) {
    const resposta = await graph<{ id: string; post_id?: string }>(`${pageId}/photos`, {
      method: 'POST',
      accessToken: token,
      params: { url: urlPublicaMidia(principal.id), caption: legenda, ...agendamento },
    })
    const id = resposta.post_id ?? resposta.id
    return { externalPostId: id, permalink: `https://www.facebook.com/${id}` }
  }

  // Várias imagens: sobe cada uma sem publicar e anexa todas a um único post.
  const anexos: Array<{ media_fbid: string }> = []
  for (const file of midias) {
    const foto = await graph<{ id: string }>(`${pageId}/photos`, {
      method: 'POST',
      accessToken: token,
      params: { url: urlPublicaMidia(file.id), published: false },
    })
    anexos.push({ media_fbid: foto.id })
  }

  const resposta = await graph<{ id: string }>(`${pageId}/feed`, {
    method: 'POST',
    accessToken: token,
    params: {
      message: legenda,
      attached_media: JSON.stringify(anexos),
      ...agendamento,
    },
  })
  return { externalPostId: resposta.id, permalink: `https://www.facebook.com/${resposta.id}` }
}
