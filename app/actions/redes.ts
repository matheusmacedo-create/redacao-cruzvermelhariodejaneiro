'use server'

import { revalidatePath } from 'next/cache'
import { get } from '@vercel/blob'
import { requireWorkspace } from '@/lib/session'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import {
  FORMATOS,
  publicarFotos,
  publicarTexto,
  publicarVideo,
  redesDoFormato,
  statusDoEnvio,
  semSegredo,
  UploadPostError,
  type Formato,
  type RespostaDeEnvio,
} from '@/lib/publicacao/upload-post'
import { limiteDeMidias } from '@/lib/publicacao/requisitos'

const texto = (form: FormData, key: string) => String(form.get(key) ?? '').trim()


/** Limites reais de cada rede, para recusar aqui em vez de descobrir no erro
 * da API depois que metade das redes já publicou. */
const LIMITE_DE_TEXTO: Record<string, number> = {
  x: 25_000,        // vira thread automaticamente acima de 280
  threads: 25_000,  // idem acima de 500
  bluesky: 300,
  instagram: 2_200,
  facebook: 63_206,
  linkedin: 3_000,
  pinterest: 500,
}

function validar(formato: Formato, redes: string[], corpo: string, midiaUrl: string) {
  if (!redes.length) throw new Error('Escolha ao menos uma rede.')

  const permitidas = redesDoFormato(formato)
  const incompativel = redes.find((rede) => !permitidas.includes(rede))
  if (incompativel) {
    throw new Error(`${incompativel} não aceita ${FORMATOS[formato].rotulo}. Desmarque essa rede ou troque o formato.`)
  }

  // Stories não leva legenda: a Meta ignora o texto nesse formato. Exigir texto
  // aqui seria pedir trabalho que não vai aparecer em lugar nenhum.
  const exigeTexto = formato !== 'stories'
  if (exigeTexto && corpo.length < 2) throw new Error('Escreva o texto da publicação.')

  for (const rede of redes) {
    const limite = LIMITE_DE_TEXTO[rede]
    if (limite && corpo.length > limite) {
      throw new Error(`O texto tem ${corpo.length} caracteres e o limite do ${rede} é ${limite}.`)
    }
  }

  const midia = FORMATOS[formato].midia
  if (midia !== 'nenhuma' && !midiaUrl) {
    const oQue = midia === 'video' ? 'um vídeo' : midia === 'imagem' ? 'uma imagem' : 'uma imagem ou um vídeo'
    throw new Error(`${FORMATOS[formato].rotulo} exige ${oQue}. Informe a URL.`)
  }

  if (midiaUrl) {
    let url: URL
    try { url = new URL(midiaUrl) } catch { throw new Error('A URL da mídia é inválida.') }
    if (url.protocol !== 'https:') throw new Error('A URL da mídia precisa ser https.')
  }
}

/** Reels é sempre vídeo; stories depende da extensão do arquivo informado. */
function ehVideo(formato: Formato, midiaUrl: string): boolean {
  if (formato === 'reels') return true
  if (formato !== 'stories') return false
  return /\.(mp4|mov|m4v|webm)(\?|$)/i.test(midiaUrl)
}

/** Só os campos que vale a pena guardar do retorno — a resposta crua traz muita
 * coisa que envelhece e nada que a tela use. */
function resumirResultados(resposta: RespostaDeEnvio) {
  return (resposta.results ?? []).map((r) => ({
    rede: r.platform,
    ok: r.success,
    mensagem: r.message ?? null,
    url: r.post_url ?? null,
    pulada: r.skipped ?? false,
  }))
}

/**
 * Traz o arquivo da Biblioteca para a memória, pronto para virar multipart.
 *
 * O limite da Biblioteca é 10 MB por arquivo, então carregar inteiro cabe
 * folgado na função serverless. Vale conferir o vínculo com o espaço aqui
 * também: o id vem do formulário, e formulário é do navegador.
 */
async function carregarArquivos(fileIds: string[], workspaceId: string) {
  const carregados = []
  for (const id of fileIds) carregados.push(await carregarArquivo(id, workspaceId))
  return carregados
}

async function carregarArquivo(fileId: string, workspaceId: string) {
  const supabase = await createClient()
  const { data: arquivo } = await supabase
    .from('files')
    .select('name,content_type,storage_path,status,authorization_status')
    .eq('id', fileId)
    .eq('workspace_id', workspaceId)
    .maybeSingle()

  if (!arquivo || arquivo.status === 'deleted' || !arquivo.storage_path) {
    throw new Error('Arquivo não encontrado na Biblioteca deste espaço.')
  }

  // A tela já filtra, mas o id chega pelo formulário e formulário é do
  // navegador. Publicar imagem sem autorização de uso é o tipo de erro que
  // não se desfaz depois que saiu na página da instituição.
  if (arquivo.authorization_status !== 'authorized') {
    throw new Error(
      'Este arquivo não tem autorização de uso de imagem. Marque a autorização na Biblioteca antes de publicar.',
    )
  }

  const resultado = await get(arquivo.storage_path, { access: 'private' })
  if (!resultado) throw new Error('O arquivo não está mais disponível no armazenamento.')

  const bytes = await new Response(resultado.stream).arrayBuffer()
  const contentType = arquivo.content_type || resultado.blob.contentType || 'application/octet-stream'

  return {
    blob: new File([bytes], arquivo.name || 'arquivo', { type: contentType }),
    contentType,
  }
}

/** Campos que descrevem um post, venham do formulário ou de um rascunho. */
type Post = {
  formato: Formato
  redes: string[]
  corpo: string
  linkUrl: string
  midiaUrl: string
  fileIds: string[]
  quando?: string
}

/**
 * Entrega o post ao Upload-Post e grava o retorno na linha já existente.
 *
 * Separado de quem cria a linha porque publicar acontece em dois momentos:
 * agora, direto da tela, ou depois, quando a aprovação sai. O caminho até a
 * API precisa ser o mesmo nos dois casos.
 */
async function entregar(registroId: string, post: Post, workspaceId: string) {
  const supabase = await createClient()

  const comum = {
    redes: post.redes,
    texto: post.corpo,
    externalId: registroId,
    idempotencyKey: registroId,
    agendarPara: post.quando,
    timezone: 'America/Sao_Paulo',
    linkUrl: post.linkUrl || undefined,
    formato: post.formato,
  }

  try {
    const daBiblioteca = post.fileIds.length
      ? await carregarArquivos(post.fileIds, workspaceId)
      : []

    // Vídeo é sempre um só: carrossel de vídeo não existe nas redes que
    // atendemos, e a primeira mídia é quem decide o endpoint.
    const eVideo = daBiblioteca.length
      ? daBiblioteca[0].contentType.startsWith('video/')
      : ehVideo(post.formato, post.midiaUrl)

    const fotos: (string | Blob)[] = daBiblioteca.length
      ? daBiblioteca.map((a) => a.blob)
      : post.midiaUrl ? [post.midiaUrl] : []

    const { dados } = eVideo
      ? await publicarVideo({ ...comum, video: fotos[0] })
      : fotos.length
        ? await publicarFotos({ ...comum, fotos })
        : await publicarTexto(comum)

    await supabase.from('social_publications').update({
      request_id: dados.request_id ?? null,
      job_id: dados.job_id ?? null,
      external_id: dados.external_id ?? registroId,
      status: dados.status && dados.status !== 'not_found' ? dados.status : 'queued',
      results: resumirResultados(dados),
      error: null,
    }).eq('id', registroId)
  } catch (causa) {
    const mensagem = causa instanceof UploadPostError
      ? `${causa.message} (HTTP ${causa.status})`
      : semSegredo(causa instanceof Error ? causa.message : String(causa))

    await supabase.from('social_publications')
      .update({ status: 'failed', error: mensagem.slice(0, 500) })
      .eq('id', registroId)

    throw new Error(mensagem)
  }
}

/** Lê e valida o post que veio do formulário. Compartilhado pelos dois botões. */
async function lerPost(formData: FormData, workspaceId: string): Promise<Post & { contentId: string | null }> {
  const supabase = await createClient()
  const contentId = texto(formData, 'contentId') || null
  const redes = formData.getAll('redes').map((r) => String(r)).filter(Boolean)
  const corpo = texto(formData, 'corpo')
  const linkUrl = texto(formData, 'linkUrl')
  const midiaUrl = texto(formData, 'midiaUrl')
  const fileIds = formData.getAll('fileIds').map((v) => String(v)).filter(Boolean)
  const agendarPara = texto(formData, 'agendarPara')

  const bruto = texto(formData, 'formato') || 'texto'
  if (!(bruto in FORMATOS)) throw new Error('Formato inválido.')
  const formato = bruto as Formato

  validar(formato, redes, corpo, midiaUrl || (fileIds.length ? 'biblioteca' : ''))
  if (midiaUrl && fileIds.length) throw new Error('Escolha arquivos da Biblioteca ou informe uma URL, não os dois.')

  if (fileIds.length > 1) {
    if (formato === 'stories' || formato === 'reels') {
      throw new Error(`${FORMATOS[formato].rotulo} aceita uma mídia só.`)
    }
    const teto = limiteDeMidias(redes)
    if (teto === 1) throw new Error('Uma das redes marcadas não aceita carrossel.')
  }

  let quando: string | undefined
  if (agendarPara) {
    const data = new Date(agendarPara)
    if (Number.isNaN(data.getTime())) throw new Error('Data de agendamento inválida.')
    if (data.getTime() <= Date.now()) throw new Error('O agendamento precisa ser no futuro.')
    quando = data.toISOString()
  }

  if (contentId) {
    const { data: peca } = await supabase
      .from('content_pieces').select('id')
      .eq('id', contentId).eq('workspace_id', workspaceId).maybeSingle()
    if (!peca) throw new Error('Conteúdo não encontrado neste espaço.')
  }

  return { formato, redes, corpo, linkUrl, midiaUrl, fileIds, quando, contentId }
}

export async function publicarNasRedes(formData: FormData) {
  const context = await requireWorkspace()
  const supabase = await createClient()
  const post = await lerPost(formData, context.workspace.id)

  // A linha nasce antes do envio. Se a chamada estourar o tempo depois de a API
  // ter aceitado, ainda existe um registro para reconciliar — o contrário
  // deixaria uma publicação no ar sem rastro nenhum aqui dentro.
  const { data: registro, error } = await supabase
    .from('social_publications')
    .insert({
      workspace_id: context.workspace.id,
      content_id: post.contentId,
      networks: post.redes,
      body: post.corpo,
      link_url: post.linkUrl || null,
      image_url: post.midiaUrl || null,
      file_ids: post.fileIds,
      format: post.formato,
      scheduled_for: post.quando ?? null,
      created_by: context.user.id,
      status: 'pending',
    })
    .select('id')
    .single()

  if (error || !registro) throw new Error('Não foi possível registrar a publicação.')

  await entregar(registro.id, post, context.workspace.id)

  if (post.contentId) revalidatePath(`/conteudos/${post.contentId}`)
  revalidatePath('/redes')
  revalidatePath('/calendario')
}

/**
 * Guarda o post e o manda para a fila de aprovação existente.
 *
 * O post vira um content_piece de formato "Post para redes" e entra na mesma
 * tela de Aprovações das matérias — mesma votação, mesmos comentários, mesmas
 * notificações. Duplicar esse fluxo só para posts seria manter duas verdades
 * sobre quem aprovou o quê.
 */
export async function enviarPostParaAprovacao(formData: FormData) {
  const context = await requireWorkspace()
  const supabase = await createClient()
  const post = await lerPost(formData, context.workspace.id)

  const aprovadores = [...new Set(formData.getAll('aprovadores').map((v) => String(v)).filter(Boolean))]
    .filter((id) => id !== context.user.id)
  if (!aprovadores.length) throw new Error('Escolha quem precisa aprovar este post.')

  // Só gente do espaço aprova. Os ids vêm do formulário.
  const { data: membros } = await supabase
    .from('workspace_members').select('user_id')
    .eq('workspace_id', context.workspace.id).in('user_id', aprovadores)
  const validos = (membros ?? []).map((m) => m.user_id)
  if (!validos.length) throw new Error('Nenhuma das pessoas escolhidas pertence a este espaço.')

  // O título é a primeira linha da legenda: é assim que o post aparece na fila
  // de Aprovações, e "Post para redes" repetido não distinguiria nada.
  const primeiraLinha = post.corpo.split('\n')[0].trim()
  const titulo = (primeiraLinha || `Post para ${post.redes.join(', ')}`).slice(0, 120)

  const { data: peca, error: erroPeca } = await supabase
    .from('content_pieces')
    .insert({
      workspace_id: context.workspace.id,
      title: titulo,
      subtitle: `${FORMATOS[post.formato].rotulo} · ${post.redes.join(', ')}`,
      body: post.corpo || '(sem legenda)',
      format: 'Post para redes',
      status: 'review',
      responsible_id: context.user.id,
      created_by: context.user.id,
    })
    .select('id')
    .single()
  if (erroPeca || !peca) throw new Error('Não foi possível criar o item de aprovação.')

  const { data: approvalId, error: erroEnvio } = await supabase
    .rpc('submit_content_for_approval', { p_content_id: peca.id })
  if (erroEnvio || !approvalId) throw new Error(erroEnvio?.message || 'Não foi possível enviar para aprovação.')

  const admin = createAdminClient()
  await admin.from('approval_voters').insert(
    validos.map((user_id) => ({
      approval_id: approvalId as string,
      workspace_id: context.workspace.id,
      user_id,
    })),
  )

  const { data: rascunho, error: erroRascunho } = await supabase
    .from('social_publications')
    .insert({
      workspace_id: context.workspace.id,
      content_id: peca.id,
      networks: post.redes,
      body: post.corpo,
      link_url: post.linkUrl || null,
      image_url: post.midiaUrl || null,
      file_ids: post.fileIds,
      format: post.formato,
      scheduled_for: post.quando ?? null,
      created_by: context.user.id,
      status: 'draft',
    })
    .select('id')
    .single()
  if (erroRascunho || !rascunho) throw new Error('Não foi possível guardar o rascunho do post.')

  await admin.from('notifications').insert(
    validos.map((user_id) => ({
      workspace_id: context.workspace.id,
      user_id,
      title: `${context.profile?.full_name || 'Um colega'} pediu sua aprovação`,
      message: titulo,
      link: `/aprovacoes/${approvalId}`,
    })),
  )

  revalidatePath('/aprovacoes')
  revalidatePath('/redes')
}

/**
 * Publica um rascunho que já passou pela aprovação.
 *
 * A checagem é feita aqui e não na tela: o botão pode estar desatualizado, e
 * publicar em nome da instituição algo que ninguém aprovou é justamente o que
 * o fluxo existe para impedir.
 */
export async function publicarRascunho(formData: FormData) {
  const context = await requireWorkspace()
  const supabase = await createClient()
  const id = texto(formData, 'rascunhoId')
  if (!id) throw new Error('Rascunho não informado.')

  const { data: rascunho } = await supabase
    .from('social_publications')
    .select('id,content_id,networks,body,link_url,image_url,file_ids,format,scheduled_for,status')
    .eq('id', id).eq('workspace_id', context.workspace.id).maybeSingle()

  if (!rascunho) throw new Error('Rascunho não encontrado.')
  if (rascunho.status !== 'draft') throw new Error('Este post já foi enviado.')

  if (rascunho.content_id) {
    const { data: aprovacao } = await supabase
      .from('approvals').select('status')
      .eq('content_id', rascunho.content_id)
      .order('created_at', { ascending: false })
      .limit(1).maybeSingle()
    if (aprovacao?.status !== 'approved') {
      throw new Error('Este post ainda não foi aprovado.')
    }
  }

  // Agendamento no passado, porque a aprovação demorou, vira publicação agora.
  const agendado = rascunho.scheduled_for && new Date(rascunho.scheduled_for).getTime() > Date.now()
    ? new Date(rascunho.scheduled_for).toISOString()
    : undefined

  await supabase.from('social_publications').update({ status: 'pending' }).eq('id', rascunho.id)

  await entregar(rascunho.id, {
    formato: rascunho.format as Formato,
    redes: rascunho.networks ?? [],
    corpo: rascunho.body ?? '',
    linkUrl: rascunho.link_url ?? '',
    midiaUrl: rascunho.image_url ?? '',
    fileIds: rascunho.file_ids ?? [],
    quando: agendado,
  }, context.workspace.id)

  revalidatePath('/redes')
  revalidatePath('/aprovacoes')
}

/**
 * Relê o estado de um envio na API e grava aqui. Chamado pelo botão de atualizar
 * da tela: envio assíncrono não avisa quando termina, alguém precisa perguntar.
 */
export async function atualizarStatusPublicacao(formData: FormData) {
  const context = await requireWorkspace()
  const supabase = await createClient()
  const id = texto(formData, 'publicacaoId')
  if (!id) throw new Error('Publicação não informada.')

  const { data: registro } = await supabase
    .from('social_publications')
    .select('id,content_id,request_id,job_id,status')
    .eq('id', id).eq('workspace_id', context.workspace.id).maybeSingle()

  if (!registro) throw new Error('Publicação não encontrada.')
  if (!registro.request_id && !registro.job_id) throw new Error('Esta publicação não chegou a ser enviada.')

  try {
    const { dados } = await statusDoEnvio({
      requestId: registro.request_id ?? undefined,
      jobId: registro.job_id ?? undefined,
    })

    await supabase
      .from('social_publications')
      .update({
        status: dados.status && dados.status !== 'not_found' ? dados.status : registro.status,
        results: resumirResultados(dados),
      })
      .eq('id', registro.id)
  } catch (causa) {
    // Consultar e falhar não muda o que já foi publicado: só registramos o
    // motivo, sem marcar como falha um envio que pode estar correndo bem.
    const mensagem = causa instanceof Error ? semSegredo(causa.message) : String(causa)
    await supabase.from('social_publications').update({ error: mensagem.slice(0, 500) }).eq('id', registro.id)
    throw new Error(mensagem)
  }

  if (registro.content_id) revalidatePath(`/conteudos/${registro.content_id}`)
}
