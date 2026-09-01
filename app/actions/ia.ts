'use server'

import { put, del } from '@vercel/blob'
import { revalidatePath } from 'next/cache'
import { requireWorkspace } from '@/lib/session'
import { createClient } from '@/lib/supabase/server'
import { mensagemDoErro } from '@/lib/erro-de-acao'
import { adapter, formatoDoAdapter } from '@/lib/publicacao/canais'
import { textoParaRede } from '@/lib/publicacao/texto-plano'
import { adaptarTexto, gerarImagem, iaConfigurada, reescreverComGpt, semChave, sugerirBriefings, tetoMensalDeImagens } from '@/lib/ia/openai'
import { claudeConfigurado, reescreverComClaude, semChaveDoClaude } from '@/lib/ia/anthropic'
import { TETO_DO_CORPO, garantirFotos, montarPedidoDeMelhoria } from '@/lib/ia/formatos'
import { REGRAS_FIXAS, assuntoDaMateria } from '@/lib/ia/sugestoes'
import { WORKSPACE_STORAGE_LIMIT } from '@/lib/storage'
import { ETIQUETA_DE_IA } from '@/lib/ia/etiqueta'

/**
 * O módulo de IA da Redação: gerar imagem no formato do canal e adaptar a
 * legenda ao contrato dele.
 *
 * Duas regras que atravessam tudo aqui:
 *
 *  - A resposta do modelo é SUGESTÃO. Texto adaptado volta para a tela e só
 *    entra na variante se alguém aceitar. Nada é gravado às escondidas.
 *  - Imagem gerada carrega a etiqueta `ia:openai` na Biblioteca, para sempre.
 *    É o que permite a tela avisar antes de publicar e o conector declarar à
 *    rede que o conteúdo é sintético. Publicar imagem de IA como se fosse
 *    registro fotográfico é, numa organização humanitária, um problema de
 *    credibilidade — não de estilo.
 */

export type ResultadoDaIa = { erro?: string }
export type ResultadoDaLegenda = ResultadoDaIa & { texto?: string }
export type ResultadoDaImagem = ResultadoDaIa & {
  fileId?: string
  nome?: string
  previa?: string
  /** Quantas ainda cabem no teto do mês, depois desta. */
  restantesNoMes?: number
}
export type ResultadoDasIdeias = ResultadoDaIa & { ideias?: string[] }
export type ResultadoDaMelhoria = ResultadoDaIa & { texto?: string; aviso?: string }

const texto = (form: FormData, chave: string) => String(form.get(chave) ?? '').trim()

/** Quantas imagens de IA este espaço já gerou no mês corrente. */
async function geradasNoMes(
  supabase: Awaited<ReturnType<typeof createClient>>,
  workspaceId: string,
): Promise<number> {
  const primeiroDia = new Date()
  primeiroDia.setUTCDate(1)
  primeiroDia.setUTCHours(0, 0, 0, 0)
  const { count } = await supabase
    .from('files').select('id', { count: 'exact', head: true })
    .eq('workspace_id', workspaceId)
    .contains('tags', [ETIQUETA_DE_IA])
    .gte('created_at', primeiroDia.toISOString())
  return count ?? 0
}

/**
 * Gera uma imagem para um destino e a deixa pronta na Biblioteca, já no
 * enquadramento que aquele canal pede.
 */
export async function gerarImagemDoDestino(formData: FormData): Promise<ResultadoDaImagem> {
  try {
    const context = await requireWorkspace()
    const supabase = await createClient()
    const destinoId = texto(formData, 'destinoId')
    const prompt = texto(formData, 'prompt')

    if (prompt.length < 10) throw new Error('Descreva a imagem em pelo menos uma frase.')
    if (prompt.length > 4000) throw new Error('A descrição da imagem está longa demais.')

    const { data: destino } = await supabase
      .from('package_destinations').select('id,package_id,canal,formato,file_ids,estado')
      .eq('id', destinoId).eq('workspace_id', context.workspace.id).maybeSingle()
    if (!destino) throw new Error('Destino não encontrado neste espaço.')
    if (['publicada', 'publicando'].includes(destino.estado)) {
      throw new Error('Este destino já foi publicado.')
    }

    const canal = adapter(destino.canal)
    const formato = canal ? formatoDoAdapter(canal, destino.formato) : undefined
    if (!canal || !formato) throw new Error('Este destino não tem um formato válido.')
    if (formato.midia.max === 0) throw new Error(`${canal.nome} · ${formato.rotulo} não aceita mídia.`)
    if (formato.midia.video === 'obrigatorio') {
      throw new Error(`${canal.nome} · ${formato.rotulo} exige vídeo, e a geração aqui produz imagem.`)
    }

    // O teto é conferido AQUI, no servidor, antes de gastar: o botão da tela
    // não é autoridade sobre a fatura da instituição.
    const teto = tetoMensalDeImagens()
    const jaGeradas = await geradasNoMes(supabase, context.workspace.id)
    if (jaGeradas >= teto) {
      throw new Error(`O limite de ${teto} imagens geradas neste mês foi atingido. O teto vive em OPENAI_IMAGE_LIMITE_MENSAL.`)
    }

    const pedida = texto(formData, 'qualidade')
    const qualidade = (['low', 'medium', 'high'] as const).find((q) => q === pedida) ?? 'medium'
    const imagem = await gerarImagem({ prompt, proporcao: formato.midia.proporcaoPreferida, qualidade })

    const { data: usoAtual } = await supabase
      .from('files').select('size_bytes').eq('workspace_id', context.workspace.id).neq('status', 'deleted')
    const usado = (usoAtual ?? []).reduce((total, linha) => total + Number(linha.size_bytes ?? 0), 0)
    if (usado + imagem.bytes.length > WORKSPACE_STORAGE_LIMIT) {
      throw new Error('O espaço de armazenamento acabou. Apague arquivos na Biblioteca antes de gerar mais.')
    }

    const nome = `ia-${new Date().toISOString().slice(0, 10)}-${imagem.largura}x${imagem.altura}.png`
    const caminho = `workspaces/${context.workspace.id}/library/${crypto.randomUUID()}.png`
    const blob = await put(caminho, imagem.bytes, {
      access: 'private', addRandomSuffix: false, contentType: imagem.contentType,
    })

    const { data: linha, error } = await supabase.from('files').insert({
      workspace_id: context.workspace.id,
      name: nome,
      original_name: nome,
      file_type: 'foto',
      content_type: imagem.contentType,
      storage_path: blob.pathname,
      size_bytes: imagem.bytes.length,
      status: 'available',
      // Não há pessoa real retratada para autorizar — o que esta imagem exige
      // é divulgação, não consentimento. A etiqueta abaixo é essa divulgação.
      authorization_status: 'authorized',
      tags: [ETIQUETA_DE_IA, 'redes'],
      uploaded_by: context.user.id,
    }).select('id').single()

    if (error || !linha) {
      // Blob sem linha no banco é arquivo invisível ocupando espaço para sempre.
      await del(blob.pathname)
      throw new Error('Não foi possível registrar a imagem na Biblioteca.')
    }

    // NÃO entra no destino sozinha: quem gerou vê antes de usar. Anexar às
    // cegas era como uma imagem que não serve virava a capa do post.
    return {
      fileId: linha.id,
      nome,
      previa: `/api/private-blob?pathname=${encodeURIComponent(blob.pathname)}`,
      restantesNoMes: Math.max(0, teto - jaGeradas - 1),
    }
  } catch (causa) {
    return { erro: semChave(mensagemDoErro(causa, 'Não foi possível gerar a imagem.')) }
  }
}

/**
 * Propõe a legenda deste destino a partir do texto-mestre, dentro do limite
 * que o adapter declara. Devolve a sugestão; quem grava é a pessoa.
 */
export async function adaptarLegendaDoDestino(formData: FormData): Promise<ResultadoDaLegenda> {
  try {
    const context = await requireWorkspace()
    const supabase = await createClient()
    const destinoId = texto(formData, 'destinoId')

    const { data: destino } = await supabase
      .from('package_destinations').select('id,package_id,canal,formato,corpo,estado')
      .eq('id', destinoId).eq('workspace_id', context.workspace.id).maybeSingle()
    if (!destino) throw new Error('Destino não encontrado neste espaço.')
    if (destino.canal === 'site_web') {
      throw new Error('A página do site publica o texto inteiro — não há legenda a enxugar.')
    }

    const canal = adapter(destino.canal)
    const formato = canal ? formatoDoAdapter(canal, destino.formato) : undefined
    if (!canal || !formato) throw new Error('Este destino não tem um formato válido.')

    const { data: pacote } = await supabase
      .from('social_packages').select('mestre')
      .eq('id', destino.package_id).eq('workspace_id', context.workspace.id).maybeSingle()
    const mestre = (pacote?.mestre ?? {}) as Record<string, string>

    // Prefere o texto-mestre; sem ele, adapta o que já está na variante. Em
    // qualquer caso vai limpo: marcação da matéria não é assunto do modelo.
    const base = textoParaRede(mestre.corpo || destino.corpo || '').texto
    if (base.length < 20) throw new Error('Escreva a notícia antes de pedir a adaptação.')

    const { texto: proposta } = await adaptarTexto({
      texto: base,
      canal: canal.nome,
      formato: formato.rotulo,
      limite: formato.texto.max,
      dobra: formato.texto.dobra,
      maxHashtags: formato.texto.maxHashtags,
      instituicao: 'Cruz Vermelha Brasileira — Rio de Janeiro',
    })

    return { texto: proposta }
  } catch (causa) {
    return { erro: semChave(mensagemDoErro(causa, 'Não foi possível adaptar a legenda.')) }
  }
}

/**
 * Melhora o texto da matéria num formato predefinido, com o provedor que a
 * pessoa escolher — Claude ou GPT.
 *
 * O texto chega do formulário, não do banco: quem pede a melhoria está com a
 * matéria aberta no editor, possivelmente ainda não salva, e melhorar a versão
 * do banco seria melhorar um texto que a pessoa já mudou. A resposta é
 * SUGESTÃO — volta para a tela e só entra no editor se alguém aceitar.
 */
export async function melhorarTextoDaMateria(formData: FormData): Promise<ResultadoDaMelhoria> {
  try {
    await requireWorkspace()

    const corpo = String(formData.get('corpo') ?? '')
    const titulo = texto(formData, 'titulo')
    const formatoId = texto(formData, 'formato')
    const provedor = texto(formData, 'provedor')

    if (corpo.trim().length < 40) throw new Error('Escreva a matéria antes de pedir a melhoria.')
    if (corpo.length > TETO_DO_CORPO) throw new Error(`O texto passa de ${TETO_DO_CORPO} caracteres — o teto do editor.`)
    if (!['claude', 'gpt'].includes(provedor)) throw new Error('Escolha o provedor: Claude ou GPT.')

    const montado = montarPedidoDeMelhoria({ titulo, corpo, formatoId })
    if (!montado) throw new Error('Formato de texto desconhecido.')

    if (provedor === 'claude' && !claudeConfigurado()) {
      throw new Error('O Claude não está configurado. Cadastre ANTHROPIC_API_KEY na Vercel e republique.')
    }
    if (provedor === 'gpt' && !iaConfigurada()) {
      throw new Error('O GPT não está configurado. Cadastre OPENAI_API_KEY na Vercel e republique.')
    }

    const { texto: proposta } = provedor === 'claude'
      ? await reescreverComClaude({ system: montado.system, texto: montado.pedido })
      : await reescreverComGpt({ system: montado.system, texto: montado.pedido })

    // Foto que o modelo perdeu volta; foto que ele inventou sai.
    const { texto: garantido, aviso } = garantirFotos(corpo, proposta)
    if (garantido.length > TETO_DO_CORPO) {
      throw new Error('A sugestão ficou maior que o teto do editor. Tente outro formato ou encurte a matéria.')
    }

    return { texto: garantido, ...(aviso ? { aviso } : {}) }
  } catch (causa) {
    return { erro: semChaveDoClaude(semChave(mensagemDoErro(causa, 'Não foi possível melhorar o texto.'))) }
  }
}

/**
 * Anexa ao destino uma imagem que já está na Biblioteca.
 *
 * Separado da geração de propósito: entre uma coisa e outra existe alguém
 * olhando a imagem e decidindo. O vínculo com o espaço é reconferido aqui —
 * o id vem do formulário, e formulário é do navegador.
 */
export async function usarImagemNoDestino(formData: FormData): Promise<ResultadoDaIa> {
  try {
    const context = await requireWorkspace()
    const supabase = await createClient()
    const destinoId = texto(formData, 'destinoId')
    const fileId = texto(formData, 'fileId')

    const [{ data: destino }, { data: arquivo }] = await Promise.all([
      supabase.from('package_destinations').select('id,canal,formato,file_ids,estado')
        .eq('id', destinoId).eq('workspace_id', context.workspace.id).maybeSingle(),
      supabase.from('files').select('id,status')
        .eq('id', fileId).eq('workspace_id', context.workspace.id).maybeSingle(),
    ])
    if (!destino) throw new Error('Destino não encontrado neste espaço.')
    if (!arquivo || arquivo.status === 'deleted') throw new Error('Imagem não encontrada na Biblioteca.')
    if (['publicada', 'publicando'].includes(destino.estado)) throw new Error('Este destino já foi publicado.')

    const canal = adapter(destino.canal)
    const formato = canal ? formatoDoAdapter(canal, destino.formato) : undefined
    if (!formato) throw new Error('Este destino não tem um formato válido.')

    const atuais: string[] = destino.file_ids ?? []
    if (atuais.includes(fileId)) return {}
    if (atuais.length >= formato.midia.max) {
      throw new Error(`${canal!.nome} · ${formato.rotulo} aceita no máximo ${formato.midia.max} mídia(s). Tire uma antes.`)
    }

    const { error } = await supabase.from('package_destinations')
      .update({ file_ids: [...atuais, fileId] })
      .eq('id', destinoId).eq('workspace_id', context.workspace.id)
    if (error) throw new Error('Não foi possível anexar a imagem ao destino.')

    revalidatePath(`/redes/${destino.id}`)
    return {}
  } catch (causa) {
    return { erro: mensagemDoErro(causa, 'Não foi possível usar a imagem.') }
  }
}

/**
 * Apaga uma imagem gerada que não serviu.
 *
 * Só apaga o que foi gerado por IA e ainda não está em uso: assim o botão de
 * descartar nunca vira um caminho para remover foto de acervo. O arquivo sai
 * do armazenamento junto — linha sem blob é registro morto, blob sem linha é
 * espaço ocupado para sempre.
 */
export async function descartarImagemDaIa(formData: FormData): Promise<ResultadoDaIa> {
  try {
    const context = await requireWorkspace()
    const supabase = await createClient()
    const fileId = texto(formData, 'fileId')

    const { data: arquivo } = await supabase
      .from('files').select('id,storage_path,tags')
      .eq('id', fileId).eq('workspace_id', context.workspace.id).maybeSingle()
    if (!arquivo) throw new Error('Imagem não encontrada.')
    if (!(arquivo.tags ?? []).includes(ETIQUETA_DE_IA)) {
      throw new Error('Só imagens geradas por IA podem ser descartadas por aqui.')
    }

    const { data: emUso } = await supabase
      .from('package_destinations').select('id')
      .eq('workspace_id', context.workspace.id).contains('file_ids', [fileId]).limit(1)
    if ((emUso ?? []).length) throw new Error('Esta imagem já está em uso num destino. Tire-a de lá antes de apagar.')

    if (arquivo.storage_path) await del(arquivo.storage_path)
    const { error } = await supabase.from('files').delete()
      .eq('id', fileId).eq('workspace_id', context.workspace.id)
    if (error) throw new Error('Não foi possível apagar a imagem.')
    return {}
  } catch (causa) {
    return { erro: mensagemDoErro(causa, 'Não foi possível descartar a imagem.') }
  }
}

/**
 * Pede ao modelo três ideias de imagem para a matéria deste pacote.
 *
 * Os modelos de pedido locais já cobrem o caso comum sem custo nenhum; este
 * caminho existe para quando o assunto pede algo que um molde não alcança.
 */
export async function sugerirIdeiasDeImagem(formData: FormData): Promise<ResultadoDasIdeias> {
  try {
    const context = await requireWorkspace()
    const supabase = await createClient()
    const destinoId = texto(formData, 'destinoId')

    const { data: destino } = await supabase
      .from('package_destinations').select('id,package_id,corpo')
      .eq('id', destinoId).eq('workspace_id', context.workspace.id).maybeSingle()
    if (!destino) throw new Error('Destino não encontrado neste espaço.')

    const { data: pacote } = await supabase
      .from('social_packages').select('mestre')
      .eq('id', destino.package_id).eq('workspace_id', context.workspace.id).maybeSingle()
    const mestre = (pacote?.mestre ?? {}) as Record<string, string>

    const { assunto } = assuntoDaMateria({ titulo: mestre.titulo, corpo: mestre.corpo || destino.corpo || '' })
    if (!assunto) throw new Error('Escreva a matéria antes de pedir ideias de imagem.')

    const ideias = await sugerirBriefings({
      titulo: mestre.titulo || assunto,
      texto: textoParaRede(mestre.corpo || destino.corpo || '').texto,
      proibicoes: REGRAS_FIXAS,
    })
    if (!ideias.length) throw new Error('O modelo não devolveu ideia nenhuma. Tente de novo.')
    return { ideias }
  } catch (causa) {
    return { erro: semChave(mensagemDoErro(causa, 'Não foi possível pedir ideias.')) }
  }
}
