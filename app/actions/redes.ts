'use server'

import { revalidatePath } from 'next/cache'
import { requireWorkspace } from '@/lib/session'
import { createClient } from '@/lib/supabase/server'
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

export async function publicarNasRedes(formData: FormData) {
  const context = await requireWorkspace()
  const supabase = await createClient()

  const contentId = texto(formData, 'contentId') || null
  const redes = formData.getAll('redes').map((r) => String(r)).filter(Boolean)
  const corpo = texto(formData, 'corpo')
  const linkUrl = texto(formData, 'linkUrl')
  const midiaUrl = texto(formData, 'midiaUrl')
  const agendarPara = texto(formData, 'agendarPara')

  const bruto = texto(formData, 'formato') || 'texto'
  if (!(bruto in FORMATOS)) throw new Error('Formato inválido.')
  const formato = bruto as Formato

  validar(formato, redes, corpo, midiaUrl)

  let quando: string | undefined
  if (agendarPara) {
    const data = new Date(agendarPara)
    if (Number.isNaN(data.getTime())) throw new Error('Data de agendamento inválida.')
    if (data.getTime() <= Date.now()) throw new Error('O agendamento precisa ser no futuro.')
    quando = data.toISOString()
  }

  // A matéria pertence mesmo a este espaço? Sem esta checagem, um id de outro
  // espaço vindo pelo formulário amarraria a publicação ao registro errado.
  if (contentId) {
    const { data: peca } = await supabase
      .from('content_pieces').select('id')
      .eq('id', contentId).eq('workspace_id', context.workspace.id).maybeSingle()
    if (!peca) throw new Error('Conteúdo não encontrado neste espaço.')
  }

  // A linha nasce antes do envio. Se a chamada estourar o tempo depois de a API
  // ter aceitado, ainda existe um registro para reconciliar — o contrário
  // deixaria uma publicação no ar sem rastro nenhum aqui dentro.
  const { data: registro, error: erroInsert } = await supabase
    .from('social_publications')
    .insert({
      workspace_id: context.workspace.id,
      content_id: contentId,
      networks: redes,
      body: corpo,
      link_url: linkUrl || null,
      image_url: midiaUrl || null,
      format: formato,
      scheduled_for: quando ?? null,
      created_by: context.user.id,
      status: 'pending',
    })
    .select('id')
    .single()

  if (erroInsert || !registro) throw new Error('Não foi possível registrar a publicação.')

  const comum = {
    redes,
    texto: corpo,
    externalId: registro.id,
    // A chave de idempotência é o id da linha: um retry do fetch depois de
    // timeout reencontra o mesmo envio em vez de publicar de novo.
    idempotencyKey: registro.id,
    agendarPara: quando,
    timezone: 'America/Sao_Paulo',
    linkUrl: linkUrl || undefined,
    formato,
  }

  try {
    // Cada formato tem seu endpoint: vídeo vai em /upload, imagem em
    // /upload_photos, texto puro em /upload_text.
    const { dados } = ehVideo(formato, midiaUrl)
      ? await publicarVideo({ ...comum, video: midiaUrl })
      : midiaUrl
        ? await publicarFotos({ ...comum, fotos: [midiaUrl] })
        : await publicarTexto(comum)

    await supabase
      .from('social_publications')
      .update({
        request_id: dados.request_id ?? null,
        job_id: dados.job_id ?? null,
        external_id: dados.external_id ?? registro.id,
        status: dados.status && dados.status !== 'not_found' ? dados.status : 'queued',
        results: resumirResultados(dados),
      })
      .eq('id', registro.id)
  } catch (causa) {
    const mensagem = causa instanceof UploadPostError
      ? `${causa.message} (HTTP ${causa.status})`
      : semSegredo(causa instanceof Error ? causa.message : String(causa))

    await supabase
      .from('social_publications')
      .update({ status: 'failed', error: mensagem.slice(0, 500) })
      .eq('id', registro.id)

    throw new Error(mensagem)
  }

  if (contentId) revalidatePath(`/conteudos/${contentId}`)
  revalidatePath('/calendario')
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
