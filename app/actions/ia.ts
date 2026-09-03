'use server'

import { put, del, get } from '@vercel/blob'
import { revalidatePath } from 'next/cache'
import { requireWorkspace } from '@/lib/session'
import { createClient } from '@/lib/supabase/server'
import { mensagemDoErro } from '@/lib/erro-de-acao'
import { adapter, formatoDoAdapter } from '@/lib/publicacao/canais'
import { textoParaRede } from '@/lib/publicacao/texto-plano'
import { adaptarTexto, gerarImagem, gerarImagemComBase, iaConfigurada, reescreverComGpt, semChave, sugerirBriefings, tetoMensalDeImagens, verImagensComGpt } from '@/lib/ia/openai'
import { carregarArquivo } from '@/lib/publicacao/arquivos'
import { claudeConfigurado, reescreverComClaude, semChaveDoClaude, verImagensComClaude, type ImagemParaVer } from '@/lib/ia/anthropic'
import { TETO_DE_FOTOS, montarPedidoDeLegendas, parsearLegendas } from '@/lib/ia/fotos'
import { formatoDeImagem } from '@/lib/ia/formatos-de-imagem'
import sharp from 'sharp'
import { TETO_DO_CORPO, conferirLinks, garantirFotos, montarPedidoDeMelhoria, separarProposta, type PaginaDoSite } from '@/lib/ia/formatos'
import { noticiasPublicadas } from '@/lib/site/vitrine'
import { ORIGEM_DO_SITE } from '@/lib/site/sitemap'
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
export type ResultadoDaMelhoria = ResultadoDaIa & {
  texto?: string
  /** Título proposto, pensado para busca e alcance orgânico. */
  titulo?: string
  /** Linha fina proposta — o que o Google e as redes mostram sob o título. */
  linhaFina?: string
  aviso?: string
}
export type ResultadoDasLegendas = ResultadoDaIa & { legendas?: Record<string, string> }
export type ImagemDaMateria = {
  fileId: string
  nome: string
  tamanho: number
  previa: string
  formato: string
}
export type ResultadoDasImagens = ResultadoDaIa & {
  imagens?: ImagemDaMateria[]
  restantesNoMes?: number
  aviso?: string
}

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
 * Prepara a imagem-base para a geração: carrega da Biblioteca (com a mesma
 * conferência de autorização do disparo) e reduz no servidor — mandar a arte
 * em resolução cheia seria pagar upload e tokens por pixels que o modelo vai
 * reamostrar de qualquer jeito.
 */
async function baseParaGeracao(fileId: string, workspaceId: string) {
  const arquivo = await carregarArquivo(fileId, workspaceId)
  if (!arquivo.contentType.startsWith('image/')) {
    throw new Error('A imagem de base precisa ser uma foto — vídeo não serve de base para gerar imagem.')
  }
  const bytes = Buffer.from(await arquivo.blob.arrayBuffer())
  const reduzida = await sharp(bytes, { failOn: 'none' })
    .resize({ width: 1536, height: 1536, fit: 'inside', withoutEnlargement: true })
    .jpeg({ quality: 88 })
    .toBuffer()
  return { bytes: reduzida, contentType: 'image/jpeg' as const, nome: 'base.jpg' }
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

    // Com imagem-base, a geração parte dela (endpoint de edição) em vez de
    // partir do zero. A base nunca é alterada — sai uma imagem NOVA.
    const baseFileId = texto(formData, 'baseFileId')
    const imagem = baseFileId
      ? await gerarImagemComBase({
          prompt,
          proporcao: formato.midia.proporcaoPreferida,
          qualidade,
          base: await baseParaGeracao(baseFileId, context.workspace.id),
        })
      : await gerarImagem({ prompt, proporcao: formato.midia.proporcaoPreferida, qualidade })

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
/**
 * As páginas do site que o modelo pode ligar no texto: as fixas com nome
 * editorial e as últimas matérias publicadas. Falha aqui não derruba a
 * melhoria — sem repertório, o texto sai sem links, que é como sempre saiu.
 */
async function paginasParaLinkar(workspaceId: string): Promise<PaginaDoSite[]> {
  const fixas: PaginaDoSite[] = [
    { titulo: 'Central de notícias', url: `${ORIGEM_DO_SITE}/noticias/` },
    { titulo: 'Como doar para a Cruz Vermelha do Rio', url: `${ORIGEM_DO_SITE}/doacao.html` },
    { titulo: 'Cursos e capacitações', url: `${ORIGEM_DO_SITE}/cursos.html` },
    { titulo: 'Nossa equipe', url: `${ORIGEM_DO_SITE}/equipe.html` },
    { titulo: 'Campanha do Agasalho', url: `${ORIGEM_DO_SITE}/campanha-agasalho.html` },
  ]
  try {
    const noticias = await noticiasPublicadas(workspaceId)
    return [...fixas, ...noticias.slice(0, 12).map((n) => ({ titulo: n.titulo, url: n.url }))]
  } catch {
    return fixas
  }
}

export async function melhorarTextoDaMateria(formData: FormData): Promise<ResultadoDaMelhoria> {
  try {
    const context = await requireWorkspace()

    const corpo = String(formData.get('corpo') ?? '')
    const titulo = texto(formData, 'titulo')
    const formatoId = texto(formData, 'formato')
    const provedor = texto(formData, 'provedor')

    if (corpo.trim().length < 40) throw new Error('Escreva a matéria antes de pedir a melhoria.')
    if (corpo.length > TETO_DO_CORPO) throw new Error(`O texto passa de ${TETO_DO_CORPO} caracteres — o teto do editor.`)
    if (!['claude', 'gpt'].includes(provedor)) throw new Error('Escolha o provedor: Claude ou GPT.')

    const paginas = await paginasParaLinkar(context.workspace.id)
    const montado = montarPedidoDeMelhoria({ titulo, corpo, formatoId, paginas })
    if (!montado) throw new Error('Formato de texto desconhecido.')

    if (provedor === 'claude' && !claudeConfigurado()) {
      throw new Error('O Claude não está configurado. Cadastre ANTHROPIC_API_KEY na Vercel e republique.')
    }
    if (provedor === 'gpt' && !iaConfigurada()) {
      throw new Error('O GPT não está configurado. Cadastre OPENAI_API_KEY na Vercel e republique.')
    }

    const { texto: bruto, medida } = provedor === 'claude'
      ? await reescreverComClaude({ system: montado.system, texto: montado.pedido })
      : await reescreverComGpt({ system: montado.system, texto: montado.pedido })
    console.info('[ia] melhoria', provedor, montado.formato.id, JSON.stringify(medida))

    // A resposta vem em três partes: título e linha fina para busca, corpo.
    const partes = separarProposta(bruto)

    // Foto que o modelo perdeu volta; foto que ele inventou sai; link para
    // endereço que não existe vira texto simples.
    const fotos = garantirFotos(corpo, partes.corpo)
    const links = conferirLinks(fotos.texto, paginas, corpo)
    if (links.texto.length > TETO_DO_CORPO) {
      throw new Error('A sugestão ficou maior que o teto do editor. Tente outro formato ou encurte a matéria.')
    }

    const aviso = [fotos.aviso, links.aviso].filter(Boolean).join(' ')
    return {
      texto: links.texto,
      ...(partes.titulo ? { titulo: partes.titulo } : {}),
      ...(partes.linhaFina ? { linhaFina: partes.linhaFina } : {}),
      ...(aviso ? { aviso } : {}),
    }
  } catch (causa) {
    return { erro: semChaveDoClaude(semChave(mensagemDoErro(causa, 'Não foi possível melhorar o texto.'))) }
  }
}

/**
 * Ideias de imagem a partir da matéria do pacote, sem depender de destino.
 *
 * Igual à versão por destino, mas o texto vem da tela: quem está escrevendo
 * a matéria pede ideias para a arte dela, não para um canal específico.
 */
export async function sugerirIdeiasDaMateria(formData: FormData): Promise<ResultadoDasIdeias> {
  try {
    await requireWorkspace()
    const titulo = texto(formData, 'titulo')
    const corpo = String(formData.get('corpo') ?? '')

    const { assunto } = assuntoDaMateria({ titulo, corpo })
    if (!assunto) throw new Error('Escreva a matéria antes de pedir ideias de imagem.')

    const ideias = await sugerirBriefings({
      titulo: titulo || assunto,
      texto: textoParaRede(corpo).texto,
      proibicoes: REGRAS_FIXAS,
    })
    if (!ideias.length) throw new Error('O modelo não devolveu ideia nenhuma. Tente de novo.')
    return { ideias }
  } catch (causa) {
    return { erro: semChave(mensagemDoErro(causa, 'Não foi possível pedir ideias.')) }
  }
}

/**
 * Gera a arte da matéria nos formatos escolhidos — site, feed, stories.
 *
 * Uma descrição, até três enquadramentos, geração em paralelo (três em série
 * estourariam o tempo da função). Cada imagem nasce na Biblioteca com a
 * etiqueta de IA, como as demais; nenhuma entra em post sozinha. O teto
 * mensal conta CADA imagem — pedir três consome três.
 */
export async function gerarImagensDaMateria(formData: FormData): Promise<ResultadoDasImagens> {
  try {
    const context = await requireWorkspace()
    const supabase = await createClient()

    const prompt = texto(formData, 'prompt')
    if (prompt.length < 10) throw new Error('Descreva a imagem em pelo menos uma frase.')
    if (prompt.length > 4000) throw new Error('A descrição da imagem está longa demais.')

    const pedida = texto(formData, 'qualidade')
    const qualidade = (['low', 'medium', 'high'] as const).find((q) => q === pedida) ?? 'medium'

    let idsDeFormato: string[]
    try {
      const bruto = JSON.parse(String(formData.get('formatos') ?? '[]'))
      idsDeFormato = Array.isArray(bruto) ? [...new Set(bruto.filter((x): x is string => typeof x === 'string'))] : []
    } catch {
      idsDeFormato = []
    }
    const formatos = idsDeFormato.map(formatoDeImagem).filter((f): f is NonNullable<typeof f> => Boolean(f))
    if (!formatos.length) throw new Error('Escolha ao menos um formato: site, feed ou stories.')

    // O teto conta cada imagem. Conferido AQUI, antes de gastar.
    const teto = tetoMensalDeImagens()
    const jaGeradas = await geradasNoMes(supabase, context.workspace.id)
    if (jaGeradas + formatos.length > teto) {
      const cabem = Math.max(0, teto - jaGeradas)
      throw new Error(
        cabem === 0
          ? `O limite de ${teto} imagens geradas neste mês foi atingido.`
          : `Pedir ${formatos.length} imagens passaria o teto do mês: cabem só ${cabem}. Desmarque formato(s) ou espere o mês virar.`,
      )
    }

    // A mesma imagem-base (quando escolhida) alimenta todos os formatos: é o
    // caso "temos a arte do podcast, cria as variações dela".
    const baseFileId = texto(formData, 'baseFileId')
    const base = baseFileId ? await baseParaGeracao(baseFileId, context.workspace.id) : null

    const geradas = await Promise.allSettled(
      formatos.map((f) => base
        ? gerarImagemComBase({ prompt, proporcao: f.proporcao, qualidade, base })
        : gerarImagem({ prompt, proporcao: f.proporcao, qualidade })),
    )

    const { data: usoAtual } = await supabase
      .from('files').select('size_bytes').eq('workspace_id', context.workspace.id).neq('status', 'deleted')
    let usado = (usoAtual ?? []).reduce((total, linha) => total + Number(linha.size_bytes ?? 0), 0)

    const imagens: ImagemDaMateria[] = []
    const problemas: string[] = []
    for (let i = 0; i < formatos.length; i++) {
      const formato = formatos[i]
      const resultado = geradas[i]
      if (resultado.status === 'rejected') {
        problemas.push(`${formato.rotulo}: ${semChave(mensagemDoErro(resultado.reason, 'a geração falhou'))}`)
        continue
      }
      const imagem = resultado.value
      if (usado + imagem.bytes.length > WORKSPACE_STORAGE_LIMIT) {
        problemas.push(`${formato.rotulo}: o espaço de armazenamento acabou antes desta.`)
        continue
      }

      const nome = `ia-${formato.id}-${new Date().toISOString().slice(0, 10)}-${imagem.largura}x${imagem.altura}.png`
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
        // Não há pessoa real retratada; o que esta imagem exige é divulgação,
        // e a etiqueta abaixo é essa divulgação.
        authorization_status: 'authorized',
        tags: [ETIQUETA_DE_IA, 'materia'],
        uploaded_by: context.user.id,
      }).select('id').single()
      if (error || !linha) {
        await del(blob.pathname)
        problemas.push(`${formato.rotulo}: não foi possível registrar na Biblioteca.`)
        continue
      }
      usado += imagem.bytes.length
      imagens.push({
        fileId: linha.id,
        nome,
        tamanho: imagem.bytes.length,
        previa: `/api/private-blob?pathname=${encodeURIComponent(blob.pathname)}`,
        formato: formato.id,
      })
    }

    if (!imagens.length) {
      throw new Error(problemas.join(' ') || 'Nenhuma imagem pôde ser gerada.')
    }
    return {
      imagens,
      restantesNoMes: Math.max(0, teto - jaGeradas - imagens.length),
      ...(problemas.length ? { aviso: problemas.join(' ') } : {}),
    }
  } catch (causa) {
    return { erro: semChave(mensagemDoErro(causa, 'Não foi possível gerar as imagens.')) }
  }
}

/**
 * Propõe legendas para as fotos do pacote — olhando as fotos de verdade.
 *
 * O modelo recebe as imagens (reduzidas no servidor: mandar a foto de célula
 * inteira seria pagar tokens por pixels que não mudam a legenda) e o contexto
 * da matéria. A resposta preenche só campo VAZIO na tela, nunca o que uma
 * pessoa escreveu — e a legenda vira também o alt e o nome SEO do arquivo na
 * página, então errar aqui custaria em três lugares.
 */
export async function sugerirLegendasDasFotos(formData: FormData): Promise<ResultadoDasLegendas> {
  try {
    const context = await requireWorkspace()
    const supabase = await createClient()

    let fileIds: string[]
    try {
      const bruto = JSON.parse(String(formData.get('fileIds') ?? '[]'))
      fileIds = Array.isArray(bruto) ? bruto.filter((x): x is string => typeof x === 'string') : []
    } catch {
      fileIds = []
    }
    fileIds = fileIds.slice(0, TETO_DE_FOTOS)
    if (!fileIds.length) throw new Error('Nenhuma foto sem legenda para propor.')

    const titulo = texto(formData, 'titulo')
    const corpo = String(formData.get('corpo') ?? '')
    const provedor = texto(formData, 'provedor')
    if (!['claude', 'gpt'].includes(provedor)) throw new Error('Escolha o provedor: Claude ou GPT.')
    if (provedor === 'claude' && !claudeConfigurado()) throw new Error('O Claude não está configurado.')
    if (provedor === 'gpt' && !iaConfigurada()) throw new Error('O GPT não está configurado.')

    const { data: linhas } = await supabase
      .from('files').select('id,storage_path,content_type,file_type,status')
      .eq('workspace_id', context.workspace.id).in('id', fileIds)
    const porId = new Map((linhas ?? []).map((l) => [l.id, l]))

    // Na ordem pedida pela tela — a resposta vem por índice, e índice trocado
    // seria a legenda de uma foto na outra.
    const prontas: { fileId: string; imagem: ImagemParaVer }[] = []
    for (const id of fileIds) {
      const linha = porId.get(id)
      if (!linha || linha.status === 'deleted' || linha.file_type !== 'foto') continue
      if (!linha.content_type?.startsWith('image/')) continue
      if (!linha.storage_path) continue
      try {
        const blob = await get(linha.storage_path, { access: 'private' })
        if (!blob) continue
        const bytes = Buffer.from(await new Response(blob.stream).arrayBuffer())
        // 768px é o suficiente para legendar (inclusive texto de card) e
        // corta ~30% dos tokens de imagem em relação aos 896px de antes —
        // pixel é o que mais custa numa chamada de visão.
        const reduzida = await sharp(bytes)
          .rotate()
          .resize({ width: 768, withoutEnlargement: true })
          .jpeg({ quality: 74 })
          .toBuffer()
        prontas.push({ fileId: id, imagem: { b64: reduzida.toString('base64'), mediaType: 'image/jpeg' } })
      } catch {
        // Foto que não abre fica sem proposta; as outras seguem.
      }
    }
    if (!prontas.length) throw new Error('Não consegui ler nenhuma das fotos.')

    // 800 caracteres de contexto bastam para legendar; o resto é custo.
    const resumo = textoParaRede(corpo).texto.slice(0, 800)
    const pedido = montarPedidoDeLegendas({ titulo, resumo, quantidade: prontas.length })

    const { texto: bruto, medida } = provedor === 'claude'
      ? await verImagensComClaude({ system: pedido.system, texto: pedido.texto, imagens: prontas.map((p) => p.imagem) })
      : await verImagensComGpt({ system: pedido.system, texto: pedido.texto, imagens: prontas.map((p) => p.imagem) })
    // O custo visível em vez de suposto: é por aqui que se afere se os
    // ajustes de gasto estão valendo.
    console.info('[ia] legendas', provedor, JSON.stringify(medida))

    const lidas = parsearLegendas(bruto, prontas.length)
    const legendas: Record<string, string> = {}
    prontas.forEach((p, i) => {
      if (lidas[i]) legendas[p.fileId] = lidas[i]
    })
    if (!Object.keys(legendas).length) throw new Error('O modelo não devolveu legenda nenhuma. Tente de novo.')

    return { legendas }
  } catch (causa) {
    return { erro: semChaveDoClaude(semChave(mensagemDoErro(causa, 'Não foi possível propor as legendas.'))) }
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
      supabase.from('package_destinations').select('id,package_id,canal,formato,file_ids,estado')
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

    // A página do hub é a do PACOTE (/redes/[pacoteId]), não a do destino.
    revalidatePath(`/redes/${destino.package_id}`)
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

    // A imagem gerada entra sozinha nas mídias do pacote (e o autosave a
    // propaga aos destinos que seguem o mestre). Descartar precisa desfazer
    // esses vínculos automáticos — senão sobra um id morto em mestre_file_ids
    // e em file_ids, e a publicação falha com "arquivo não encontrado". O que
    // continua barrado é o que JÁ SAIU (ou está saindo): aí não há o que
    // desanexar.
    const { data: emUso } = await supabase
      .from('package_destinations').select('id,file_ids,estado')
      .eq('workspace_id', context.workspace.id).contains('file_ids', [fileId])
    const publicados = (emUso ?? []).filter((d) => ['publicada', 'publicando', 'na_fila'].includes(d.estado))
    if (publicados.length) throw new Error('Esta imagem já saiu (ou está saindo) num destino publicado e não pode ser apagada.')
    for (const d of emUso ?? []) {
      await supabase.from('package_destinations')
        .update({ file_ids: ((d.file_ids ?? []) as string[]).filter((id) => id !== fileId) })
        .eq('id', d.id).eq('workspace_id', context.workspace.id)
    }
    const { data: pacotesComEla } = await supabase
      .from('social_packages').select('id,mestre_file_ids')
      .eq('workspace_id', context.workspace.id).contains('mestre_file_ids', [fileId])
    for (const p of pacotesComEla ?? []) {
      await supabase.from('social_packages')
        .update({ mestre_file_ids: ((p.mestre_file_ids ?? []) as string[]).filter((id) => id !== fileId) })
        .eq('id', p.id).eq('workspace_id', context.workspace.id)
    }

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
