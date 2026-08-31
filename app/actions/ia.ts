'use server'

import { put, del } from '@vercel/blob'
import { requireWorkspace } from '@/lib/session'
import { createClient } from '@/lib/supabase/server'
import { mensagemDoErro } from '@/lib/erro-de-acao'
import { adapter, formatoDoAdapter } from '@/lib/publicacao/canais'
import { textoParaRede } from '@/lib/publicacao/texto-plano'
import { adaptarTexto, gerarImagem, semChave, tetoMensalDeImagens } from '@/lib/ia/openai'
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
export type ResultadoDaImagem = ResultadoDaIa & { fileId?: string; nome?: string; previa?: string }

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

    const imagem = await gerarImagem({ prompt, proporcao: formato.midia.proporcaoPreferida })

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

    const fileIds = [...(destino.file_ids ?? []), linha.id].slice(0, formato.midia.max)
    await supabase.from('package_destinations')
      .update({ file_ids: fileIds })
      .eq('id', destino.id).eq('workspace_id', context.workspace.id)

    return {
      fileId: linha.id,
      nome,
      previa: `/api/private-blob?pathname=${encodeURIComponent(blob.pathname)}`,
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
    if (base.length < 20) throw new Error('Escreva o texto-mestre antes de pedir a adaptação.')

    const proposta = await adaptarTexto({
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
