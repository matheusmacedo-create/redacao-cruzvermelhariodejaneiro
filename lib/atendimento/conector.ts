import 'server-only'
import { chamarUploadPost, perfilPadrao } from '@/lib/publicacao/upload-post'
import { normalizarComentarios, normalizarConversas, maisRecentesPrimeiro, type Mensagem } from '@/lib/atendimento/normalizar'

/**
 * O atendimento: ler e responder o que o público escreve.
 *
 * Reusa o cliente HTTP do conector de publicação — mesma chave, mesmo
 * tratamento de erro, mesma leitura de limites. Um segundo cliente para a
 * mesma API seria um segundo lugar por onde o segredo vaza.
 *
 * O QUE CADA REDE PERMITE, e por que a tela precisa dizer isso
 *
 * O conector não cobre todas as redes conectadas, e fingir que cobre seria
 * pior do que não ter a tela: alguém confiaria que está atendendo todo mundo
 * enquanto metade das perguntas ficaria sem resposta, invisível.
 */

/** Redes em que dá para listar e responder comentários. */
export const REDES_COM_COMENTARIO = ['instagram', 'facebook', 'youtube', 'linkedin'] as const

/** Redes em que dá para ler e responder mensagem direta. */
export const REDES_COM_DM = ['instagram'] as const

/**
 * O que fica de fora, e o motivo — texto para a tela mostrar, não comentário
 * de código. Quem opera precisa saber onde ainda tem de olhar na mão.
 */
export const FORA_DO_ALCANCE: Record<string, string> = {
  tiktok: 'O TikTok não tem API pública de comentários.',
  x: 'O conector não oferece comentários nem mensagens do X.',
  threads: 'O conector não oferece comentários nem mensagens do Threads.',
  bluesky: 'O conector não oferece respostas do Bluesky por aqui.',
  pinterest: 'O conector não oferece comentários do Pinterest.',
  reddit: 'O conector não oferece comentários do Reddit por aqui.',
  telegram: 'O Telegram é canal de envio nesta integração, sem leitura de respostas.',
  discord: 'O Discord é canal de envio nesta integração, sem leitura de respostas.',
  mastodon: 'O conector não oferece respostas do Mastodon por aqui.',
  google_business: 'As avaliações do Perfil da Empresa não passam por este conector.',
  /** O caso que o usuário perguntou explicitamente. */
  messenger: 'O Messenger do Facebook não é oferecido por este conector. Só os comentários das publicações da Página chegam aqui; conversas do Messenger continuam no aplicativo da Meta.',
}

export type Post = {
  canal: string
  postId: string
  postUrl?: string
  titulo: string
  quando: string
}

/**
 * Os posts recentes que aceitam comentário.
 *
 * Vem do histórico do próprio conector, e não do nosso banco, de propósito: o
 * histórico inclui o que foi publicado antes deste sistema existir e o que
 * alguém publicou por outro caminho pelo mesmo perfil. Usar só a nossa tabela
 * deixaria comentários de posts antigos invisíveis para sempre.
 *
 * Fica a limitação honesta: post feito direto pelo celular, fora do
 * Upload-Post, não aparece no histórico — e portanto não é atendido aqui.
 */
export async function postsRecentes(limite = 10): Promise<Post[]> {
  const busca = new URLSearchParams({ limit: '20', status: 'success', profile_username: perfilPadrao() })
  const { dados } = await chamarUploadPost<{ history?: Record<string, unknown>[] }>(`/uploadposts/history?${busca}`)

  return (dados.history ?? [])
    .filter((linha) => REDES_COM_COMENTARIO.includes(String(linha.platform) as typeof REDES_COM_COMENTARIO[number]))
    .flatMap((linha) => {
      // platform_post_id pode vir como texto ou como lista (carrossel).
      const cru = linha.platform_post_id
      const postId = Array.isArray(cru) ? String(cru[0] ?? '') : String(cru ?? '')
      const postUrl = typeof linha.post_url === 'string' ? linha.post_url : undefined
      if (!postId && !postUrl) return []
      return [{
        canal: String(linha.platform),
        postId,
        postUrl,
        titulo: String(linha.post_title || linha.post_caption || 'Publicação sem título').slice(0, 120),
        quando: String(linha.upload_timestamp ?? ''),
      }]
    })
    .slice(0, limite)
}

/** Os comentários de um post, já traduzidos para a forma da casa. */
export async function comentariosDoPost(post: Post): Promise<Mensagem[]> {
  const busca = new URLSearchParams({ platform: post.canal, user: perfilPadrao(), limit: '25' })
  // post_id quando existe; a URL é o plano B que o conector aceita.
  if (post.postId) busca.set('post_id', post.postId)
  else if (post.postUrl) busca.set('post_url', post.postUrl)

  const { dados } = await chamarUploadPost<unknown>(`/uploadposts/comments?${busca}`)
  return normalizarComentarios(dados, {
    canal: post.canal,
    postId: post.postId || post.postUrl || '',
    postTitulo: post.titulo,
    postUrl: post.postUrl,
  })
}

/** As conversas de mensagem direta. Só Instagram, hoje. */
export async function conversas(quemSomos: { nossoId?: string; nossoUsuario?: string } = {}): Promise<Mensagem[]> {
  const busca = new URLSearchParams({ platform: 'instagram', user: perfilPadrao() })
  const { dados } = await chamarUploadPost<unknown>(`/uploadposts/dms/conversations?${busca}`)
  return normalizarConversas(dados, { canal: 'instagram', ...quemSomos })
}

/**
 * Junta tudo numa fila só, mais recente primeiro.
 *
 * Uma rede que falhe NÃO derruba as outras: o erro dela vira um aviso na tela,
 * e o resto continua aparecendo. Atendimento que só funciona quando as quatro
 * redes respondem é atendimento que quase nunca funciona.
 */
export async function filaDeAtendimento(opcoes: { nossoId?: string; nossoUsuario?: string; posts?: number } = {}): Promise<{
  mensagens: Mensagem[]
  avisos: string[]
  postsConsultados: number
}> {
  const avisos: string[] = []
  let posts: Post[] = []

  try {
    posts = await postsRecentes(opcoes.posts ?? 8)
  } catch (causa) {
    avisos.push(`Não consegui listar as publicações recentes: ${mensagemDoErro(causa)}`)
  }

  // Em paralelo: cada post é uma chamada, e em série a tela abriria devagar.
  const porPost = await Promise.all(posts.map(async (post) => {
    try { return await comentariosDoPost(post) } catch (causa) {
      const aviso = explicarFalha(post, mensagemDoErro(causa))
      if (aviso) avisos.push(aviso)
      return [] as Mensagem[]
    }
  }))

  let dms: Mensagem[] = []
  try { dms = await conversas({ nossoId: opcoes.nossoId, nossoUsuario: opcoes.nossoUsuario }) } catch (causa) {
    avisos.push(`Mensagens diretas do Instagram: ${mensagemDoErro(causa)}`)
  }

  return {
    mensagens: maisRecentesPrimeiro([...porPost.flat(), ...dms]),
    avisos,
    postsConsultados: posts.length,
  }
}

/** Responde um comentário. */
export async function responderComentario(pedido: {
  canal: string
  comentarioId?: string
  postId?: string
  mensagem: string
}): Promise<void> {
  const corpo: Record<string, string> = {
    platform: pedido.canal,
    user: perfilPadrao(),
    message: pedido.mensagem,
  }
  // O Instagram EXIGE comment_id: lá só existe resposta a comentário, nunca
  // comentário solto no próprio post pela API.
  if (pedido.comentarioId) corpo.comment_id = pedido.comentarioId
  if (pedido.postId) corpo.post_id = pedido.postId
  await chamarUploadPost('/uploadposts/comments/create', { method: 'POST', json: corpo })
}

/** Responde uma mensagem direta. */
export async function responderDm(pedido: {
  destinatarioId: string
  mensagem: string
}): Promise<void> {
  await chamarUploadPost('/uploadposts/dms/send', {
    method: 'POST',
    json: {
      platform: 'instagram',
      user: perfilPadrao(),
      recipient_id: pedido.destinatarioId,
      message: pedido.mensagem,
    },
  })
}

/**
 * Esconde um comentário.
 *
 * Existe porque uma instituição humanitária recebe, junto com as perguntas,
 * ataque e desinformação — e apagar é definitivo enquanto esconder é
 * reversível. A tela oferece esconder, não apagar, de propósito.
 */
export async function esconderComentario(pedido: { canal: string; comentarioId: string; esconder: boolean }): Promise<void> {
  await chamarUploadPost('/uploadposts/comments/action', {
    method: 'POST',
    json: {
      platform: pedido.canal,
      user: perfilPadrao(),
      comment_id: pedido.comentarioId,
      action: pedido.esconder ? 'hide' : 'unhide',
    },
  })
}

export function nomeDoCanal(id: string): string {
  return ({
    instagram: 'Instagram', facebook: 'Facebook', youtube: 'YouTube',
    linkedin: 'LinkedIn', tiktok: 'TikTok',
  } as Record<string, string>)[id] ?? id
}

function mensagemDoErro(causa: unknown): string {
  return (causa instanceof Error ? causa.message : String(causa)).slice(0, 200)
}

/**
 * Transforma a falha de um post em algo acionável — ou em silêncio.
 *
 * Nem toda falha é problema. Publicação apagada da rede responde "objeto não
 * existe" para sempre, e um post de teste que alguém removeu ficaria gritando
 * na tela todo dia sem nada a fazer. Erro assim não vira aviso: vira nada.
 *
 * O que sobra tem de dizer o que fazer. "HTTP 502" sozinho não ajuda ninguém;
 * "o Facebook oscilou, tente atualizar" ajuda.
 */
function explicarFalha(post: Post, erro: string): string | null {
  const onde = `${nomeDoCanal(post.canal)} — "${post.titulo.slice(0, 40)}"`

  // A publicação não está mais lá. Nada a fazer, nada a avisar.
  if (/does not exist|cannot be loaded|Unsupported get request|not found/i.test(erro)) return null

  // Instabilidade da rede: passa sozinho, e a ação é atualizar.
  if (/\b50[0234]\b|timeout|demorou/i.test(erro)) {
    return `${onde}: a rede oscilou e não respondeu agora. Use Atualizar daqui a pouco.`
  }

  // Falta de escopo: tem conserto, e é reconectar a conta.
  if (/permission|scope|forbidden|\b403\b/i.test(erro)) {
    return `${onde}: a conta precisa ser reconectada no Upload-Post com permissão de leitura de comentários.`
  }

  return `${onde}: ${erro}`
}
