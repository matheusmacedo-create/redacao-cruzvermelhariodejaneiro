'use server'

import { revalidatePath } from 'next/cache'
import { requireWorkspace } from '@/lib/session'
import { mensagemDoErro } from '@/lib/erro-de-acao'
import { createClient } from '@/lib/supabase/server'
import { adapter, formatoDoAdapter, ehCanalDeRede, type Mestre } from '@/lib/publicacao/canais'
import { textoParaRede } from '@/lib/publicacao/texto-plano'
import { enviarEdicao } from '@/lib/newsletter/envio'
import { gerarVariante, validarVariante, temErro, type DadosDoArquivo } from '@/lib/publicacao/variantes'
import { corpoComMidias, lerLegendas } from '@/lib/publicacao/legendas'

/**
 * Ações do hub multicanal: pacote (mestre) e destinos (variantes).
 *
 * Todas devolvem { erro } em vez de lançar: o Next apaga a mensagem de uma
 * exceção de server action em produção, e recado apagado já custou duas
 * rodadas de investigação neste projeto.
 */

const texto = (form: FormData, key: string) => String(form.get(key) ?? '').trim()

export type ResultadoDoHub = { erro?: string; id?: string; destinos?: DestinoAtualizado[]; estado?: string }

/** O que a tela precisa saber de um destino regenerado no servidor. */
export type DestinoAtualizado = {
  id: string
  corpo: string
  extras: Record<string, string>
  fileIds: string[]
  estado: string
}

/**
 * datetime-local chega sem fuso ("2026-08-29T10:00") e o servidor roda em UTC:
 * interpretar direto adiantaria todo agendamento em 3 horas. A tela promete
 * horário de Brasília; aqui ele é cumprido.
 */
function deBrasilia(valor: string): Date {
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?$/.test(valor)) {
    return new Date(`${valor}${valor.length === 16 ? ':00' : ''}-03:00`)
  }
  return new Date(valor)
}

/** JSON vindo do formulário: texto quebrado vira objeto vazio, nunca exceção. */
function comoJson(valor: string): unknown {
  if (!valor) return {}
  try { return JSON.parse(valor) } catch { return {} }
}

function comoErro(causa: unknown, padrao: string): ResultadoDoHub {
  return { erro: mensagemDoErro(causa, padrao) }
}

function lerMestre(bruto: unknown): Mestre {
  const m = (bruto ?? {}) as Record<string, unknown>
  return {
    corpo: typeof m.corpo === 'string' ? m.corpo : '',
    titulo: typeof m.titulo === 'string' ? m.titulo : undefined,
    subtitulo: typeof m.subtitulo === 'string' ? m.subtitulo : undefined,
    linkUrl: typeof m.linkUrl === 'string' ? m.linkUrl : undefined,
    slug: typeof m.slug === 'string' ? m.slug : undefined,
    fileIds: [],
  }
}

/**
 * O formato em que a notícia nasce no site. Matéria é o padrão; nota rápida é
 * escolha de quem escreve.
 *
 * Não é exportado: arquivo 'use server' só exporta função assíncrona, e um
 * `export const` aqui derruba o build inteiro — com um erro que o tsc não vê.
 */
const FORMATO_BASE_DO_SITE = 'materia'

/**
 * Garante que o pacote tenha a sua página no site.
 *
 * A base de um pacote é a notícia publicada no site da instituição — não um
 * "texto canônico" abstrato que depois vira página. Eram duas coisas na tela,
 * com o mesmo título e o mesmo texto digitados em lugares diferentes, e a
 * pergunta "qual dos dois é o de verdade?" não tinha resposta boa.
 *
 * Roda também ao abrir um pacote antigo: os que nasceram antes desta mudança
 * ganham a base sem que ninguém precise criá-la na mão.
 */
export async function garantirBaseNoSite(pacoteId: string, workspaceId: string): Promise<void> {
  // Todo export de arquivo 'use server' vira endpoint chamável do navegador,
  // e este recebe o workspaceId como argumento: a sessão é quem diz qual
  // espaço vale, não quem chamou. Sem esta conferência, o RLS seria a única
  // linha de defesa.
  const context = await requireWorkspace()
  if (context.workspace.id !== workspaceId) return

  const supabase = await createClient()
  const { data: jaTem } = await supabase
    .from('package_destinations').select('id')
    .eq('package_id', pacoteId).eq('workspace_id', workspaceId).eq('canal', 'site_web')
    .limit(1)
  if (jaTem?.length) return

  const { data: pacote } = await supabase
    .from('social_packages').select('mestre,mestre_file_ids')
    .eq('id', pacoteId).eq('workspace_id', workspaceId).maybeSingle()
  if (!pacote) return

  const mestre: Mestre = { ...lerMestre(pacote.mestre), fileIds: pacote.mestre_file_ids ?? [] }
  const { variante } = gerarVariante(mestre, 'site_web', FORMATO_BASE_DO_SITE)
  await supabase.from('package_destinations').insert({
    workspace_id: workspaceId,
    package_id: pacoteId,
    canal: 'site_web',
    formato: FORMATO_BASE_DO_SITE,
    corpo: variante.corpo,
    extras: variante.extras,
    file_ids: variante.fileIds,
    // Nasce em 'gerada' mesmo quando a validação já acusa erro: um pacote
    // recém-criado não tem título nem texto ainda, e abrir a tela com a base
    // vermelha seria alarme por estar em branco.
    estado: 'gerada',
  })
}

async function pacoteDoEspaco(id: string, workspaceId: string) {
  const supabase = await createClient()
  const { data } = await supabase
    .from('social_packages')
    .select('id,titulo_interno,mestre,mestre_file_ids,status,agendar_para,content_id,origem_tipo,origem_id')
    .eq('id', id).eq('workspace_id', workspaceId).maybeSingle()
  if (!data) throw new Error('Pacote não encontrado neste espaço.')
  return data
}

export async function criarPacote(formData: FormData): Promise<ResultadoDoHub> {
  try {
    const context = await requireWorkspace()
    const supabase = await createClient()

    const origemTipo = texto(formData, 'origemTipo') || 'livre'
    const origemId = texto(formData, 'origemId') || null
    let mestre: Record<string, string> = {}
    let titulo = texto(formData, 'tituloInterno')

    // Nascendo de uma matéria, o mestre já vem preenchido — é o atalho que
    // evita o copiar/colar que o hub existe para matar.
    if (origemTipo === 'materia' && origemId) {
      const { data: peca } = await supabase
        .from('content_pieces').select('title,subtitle,body,site_url')
        .eq('id', origemId).eq('workspace_id', context.workspace.id).maybeSingle()
      if (!peca) throw new Error('Matéria não encontrada neste espaço.')
      mestre = {
        corpo: peca.body ?? '',
        titulo: peca.title ?? '',
        subtitulo: peca.subtitle ?? '',
        ...(peca.site_url ? { linkUrl: peca.site_url } : {}),
      }
      titulo = titulo || peca.title || ''
    }

    const { data, error } = await supabase
      .from('social_packages')
      .insert({
        workspace_id: context.workspace.id,
        titulo_interno: titulo,
        origem_tipo: ['livre', 'materia', 'pauta'].includes(origemTipo) ? origemTipo : 'livre',
        origem_id: origemId,
        mestre,
        created_by: context.user.id,
      })
      .select('id')
      .single()
    if (error || !data) throw new Error('Não foi possível criar o pacote.')

    // Todo pacote nasce com a sua página no site: é a base, não um destino
    // opcional que alguém lembra de acrescentar.
    await garantirBaseNoSite(data.id, context.workspace.id)

    revalidatePath('/redes')
    return { id: data.id }
  } catch (causa) {
    return comoErro(causa, 'Não foi possível criar o pacote.')
  }
}

/** Autosave do mestre e dos metadados do pacote. */
export async function salvarMestre(formData: FormData): Promise<ResultadoDoHub> {
  try {
    const context = await requireWorkspace()
    const supabase = await createClient()
    const id = texto(formData, 'pacoteId')
    const pacote = await pacoteDoEspaco(id, context.workspace.id)
    if (['publicado', 'arquivado'].includes(pacote.status)) {
      throw new Error('Este pacote já foi encerrado. Duplique-o para reaproveitar o conteúdo.')
    }

    const fileIds = formData.getAll('fileIds').map((v) => String(v)).filter(Boolean)
    const mestre = {
      corpo: texto(formData, 'corpo'),
      titulo: texto(formData, 'titulo'),
      subtitulo: texto(formData, 'subtitulo'),
      linkUrl: texto(formData, 'linkUrl'),
      slug: texto(formData, 'slug'),
      notas: texto(formData, 'notas'),
      // Chega como JSON porque é um mapa, não um campo. O que não couber no
      // formato é descartado por lerLegendas — o corpo vem do navegador.
      legendas: lerLegendas(comoJson(texto(formData, 'legendas'))),
    }
    const agendarPara = texto(formData, 'agendarPara')
    if (agendarPara && Number.isNaN(deBrasilia(agendarPara).getTime())) {
      throw new Error('Data de agendamento inválida.')
    }

    // O mestre guarda chaves que esta tela não edita — a origem no Cérebro,
    // por exemplo. Substituir o objeto inteiro apagava essas chaves em silêncio
    // no primeiro autosave, e com elas a proteção contra importar duas vezes.
    const { data: guardado } = await supabase
      .from('social_packages').select('mestre')
      .eq('id', id).eq('workspace_id', context.workspace.id).maybeSingle()
    const mestreCompleto = { ...((guardado?.mestre ?? {}) as Record<string, unknown>), ...mestre }

    const { error } = await supabase.from('social_packages').update({
      titulo_interno: texto(formData, 'tituloInterno'),
      mestre: mestreCompleto,
      mestre_file_ids: fileIds,
      agendar_para: agendarPara ? deBrasilia(agendarPara).toISOString() : null,
    }).eq('id', id).eq('workspace_id', context.workspace.id)
    if (error) throw new Error('Não foi possível salvar o pacote.')

    // Salvar o mestre e deixar as variantes como estavam era a origem do pior
    // defeito desta tela: o painel "como vai sair nas outras" mostrava o texto
    // de uma versão anterior da matéria — e continuava mostrando até alguém
    // lembrar de clicar num botão. Uma prévia que mente é pior do que prévia
    // nenhuma, porque ninguém confere o que acredita já ter visto.
    const atualizados = await regerarAcompanhantes(
      id,
      context.workspace.id,
      { ...lerMestre(mestreCompleto), fileIds },
    )

    return { id, destinos: atualizados }
  } catch (causa) {
    return comoErro(causa, 'Não foi possível salvar o pacote.')
  }
}

/**
 * Regenera as variantes que ainda acompanham o mestre.
 *
 * Não toca nas descoladas (alguém escreveu aquilo à mão), nem no que já saiu
 * ou está saindo. Devolve as linhas atualizadas para a tela refletir a
 * mudança sem recarregar — recarregar no meio da digitação perderia o cursor.
 */
async function regerarAcompanhantes(pacoteId: string, workspaceId: string, mestre: Mestre): Promise<DestinoAtualizado[]> {
  const supabase = await createClient()
  const { data: destinos } = await supabase
    .from('package_destinations').select('id,canal,formato,descolada,estado,corpo,extras,file_ids')
    .eq('package_id', pacoteId).eq('workspace_id', workspaceId)

  const atualizados: DestinoAtualizado[] = []
  for (const destino of destinos ?? []) {
    if (destino.descolada) continue
    if (['publicada', 'publicando', 'na_fila'].includes(destino.estado)) continue
    const { variante, avisos } = gerarVariante(mestre, destino.canal, destino.formato)
    // O contentId é o vínculo do destino do site com a peça de conteúdo — foi
    // gravado pelo servidor, não pela geração. Sobrescrever os extras sem ele
    // faria a próxima publicação criar uma matéria duplicada.
    const guardados = (destino.extras ?? {}) as Record<string, string>
    const extras = guardados.contentId ? { ...variante.extras, contentId: guardados.contentId } : variante.extras
    // 'ignorada' é decisão de quem opera ("desta vez não sai no site"), e o
    // conteúdo continua acompanhando o mestre: só o estado é preservado.
    const estado = destino.estado === 'ignorada' ? 'ignorada'
      : temErro(avisos) ? 'bloqueada' : 'gerada'
    // Nada mudou de verdade? Nada é gravado — e um destino 'pronta' continua
    // pronto. Sem isto, editar as notas internas (que nem entram na variante)
    // reescrevia todas as linhas e desfazia o "pronta" de todo mundo.
    const igual = (destino.corpo ?? '') === variante.corpo
      && JSON.stringify(guardados) === JSON.stringify(extras)
      && JSON.stringify(destino.file_ids ?? []) === JSON.stringify(variante.fileIds)
    if (igual) continue
    await supabase.from('package_destinations').update({
      corpo: variante.corpo,
      extras,
      file_ids: variante.fileIds,
      estado,
    }).eq('id', destino.id).eq('workspace_id', workspaceId)
    atualizados.push({ id: destino.id, corpo: variante.corpo, extras, fileIds: variante.fileIds, estado })
  }
  return atualizados
}

export async function adicionarDestino(formData: FormData): Promise<ResultadoDoHub> {
  try {
    const context = await requireWorkspace()
    const supabase = await createClient()
    const pacoteId = texto(formData, 'pacoteId')
    const canalId = texto(formData, 'canal')
    const formatoId = texto(formData, 'formato')

    const canal = adapter(canalId)
    if (!canal || !formatoDoAdapter(canal, formatoId)) {
      throw new Error('Canal ou formato desconhecido.')
    }

    const pacote = await pacoteDoEspaco(pacoteId, context.workspace.id)
    const mestre: Mestre = { ...lerMestre(pacote.mestre), fileIds: pacote.mestre_file_ids ?? [] }
    const { variante, avisos } = gerarVariante(mestre, canalId, formatoId)

    const { data, error } = await supabase
      .from('package_destinations')
      .insert({
        workspace_id: context.workspace.id,
        package_id: pacoteId,
        canal: canalId,
        formato: formatoId,
        corpo: variante.corpo,
        extras: variante.extras,
        file_ids: variante.fileIds,
        estado: temErro(avisos) ? 'bloqueada' : 'gerada',
      })
      .select('id')
      .single()
    if (error) {
      if (error.code === '23505') throw new Error(`${canal.nome} ${formatoId} já está neste pacote.`)
      throw new Error('Não foi possível adicionar o destino.')
    }

    revalidatePath(`/redes/${pacoteId}`)
    return { id: data.id }
  } catch (causa) {
    return comoErro(causa, 'Não foi possível adicionar o destino.')
  }
}

export async function removerDestino(formData: FormData): Promise<ResultadoDoHub> {
  try {
    const context = await requireWorkspace()
    const supabase = await createClient()
    const id = texto(formData, 'destinoId')

    const { data: destino } = await supabase
      .from('package_destinations').select('id,package_id,estado,canal')
      .eq('id', id).eq('workspace_id', context.workspace.id).maybeSingle()
    if (!destino) throw new Error('Destino não encontrado.')
    // Publicado é história, não rascunho: sai da tela via "ignorada"? Não —
    // removê-lo apagaria o registro do que saiu. Trava.
    if (destino.estado === 'publicada' || destino.estado === 'publicando') {
      throw new Error('Este destino já foi publicado e não pode ser removido do pacote.')
    }
    // A página do site é a base do pacote: é onde a notícia é escrita, e as
    // outras variantes nascem dela. Apagá-la deixaria o pacote sem texto.
    // Quem não quer publicá-la desta vez usa "não publicar no site".
    if (destino.canal === 'site_web') {
      throw new Error('A notícia no site é a base do pacote. Se não quiser publicá-la agora, use "não publicar no site desta vez".')
    }

    const { error } = await supabase.from('package_destinations')
      .delete().eq('id', id).eq('workspace_id', context.workspace.id)
    if (error) throw new Error('Não foi possível remover o destino.')

    revalidatePath(`/redes/${destino.package_id}`)
    return {}
  } catch (causa) {
    return comoErro(causa, 'Não foi possível remover o destino.')
  }
}

/**
 * Liga e desliga a publicação de um destino sem apagá-lo.
 *
 * Existe pela base: nem toda notícia precisa virar página no site, mas o texto
 * dela continua sendo escrito ali. "Ignorada" guarda o conteúdo e tira o
 * destino da fila de publicação — apagar perderia a matéria inteira.
 */
export async function alternarPublicacao(formData: FormData): Promise<ResultadoDoHub> {
  try {
    const context = await requireWorkspace()
    const supabase = await createClient()
    const id = texto(formData, 'destinoId')
    const ignorar = formData.get('ignorar') === '1'

    const { data: destino } = await supabase
      .from('package_destinations').select('id,package_id,estado,canal,formato,descolada,corpo,extras,file_ids')
      .eq('id', id).eq('workspace_id', context.workspace.id).maybeSingle()
    if (!destino) throw new Error('Destino não encontrado.')
    if (['publicada', 'publicando', 'na_fila'].includes(destino.estado)) {
      throw new Error('Este destino já saiu — não dá para desligá-lo agora.')
    }

    // Ao voltar para a fila, o estado real vem da validação: um destino que
    // estava bloqueado antes de ser ignorado continua bloqueado depois.
    let estado = 'ignorada'
    if (!ignorar) {
      let avisos
      if (destino.descolada) {
        // Descolada não segue o mestre: o que vale é o conteúdo gravado, não
        // o que o mestre geraria — validar o mestre condenaria (ou liberaria)
        // um texto que não é o desta peça.
        avisos = validarVariante(
          { corpo: destino.corpo ?? '', extras: (destino.extras ?? {}) as Record<string, string>, fileIds: destino.file_ids ?? [] },
          destino.canal, destino.formato,
        )
      } else {
        const pacote = await pacoteDoEspaco(destino.package_id, context.workspace.id)
        const mestre: Mestre = { ...lerMestre(pacote.mestre), fileIds: pacote.mestre_file_ids ?? [] }
        avisos = gerarVariante(mestre, destino.canal, destino.formato).avisos
      }
      estado = temErro(avisos) ? 'bloqueada' : 'gerada'
    }

    const { error } = await supabase.from('package_destinations')
      .update({ estado }).eq('id', id).eq('workspace_id', context.workspace.id)
    if (error) throw new Error('Não foi possível mudar a publicação deste destino.')

    revalidatePath(`/redes/${destino.package_id}`)
    return { estado }
  } catch (causa) {
    return comoErro(causa, 'Não foi possível mudar a publicação deste destino.')
  }
}

/** Salva a edição de uma variante. Editar descola do mestre. */
export async function salvarVariante(formData: FormData): Promise<ResultadoDoHub> {
  try {
    const context = await requireWorkspace()
    const supabase = await createClient()
    const id = texto(formData, 'destinoId')

    const { data: destino } = await supabase
      .from('package_destinations').select('id,package_id,canal,formato,estado')
      .eq('id', id).eq('workspace_id', context.workspace.id).maybeSingle()
    if (!destino) throw new Error('Destino não encontrado.')
    if (['publicada', 'publicando'].includes(destino.estado)) {
      throw new Error('Este destino já foi publicado; a variante ficou congelada como registro.')
    }

    const extrasBruto = texto(formData, 'extras')
    let extras: Record<string, string> = {}
    if (extrasBruto) {
      try { extras = JSON.parse(extrasBruto) } catch { throw new Error('Campos extras ilegíveis.') }
    }
    const cropsBruto = texto(formData, 'crops')
    let crops: Record<string, unknown> = {}
    if (cropsBruto) {
      try { crops = JSON.parse(cropsBruto) } catch { throw new Error('Recortes ilegíveis.') }
    }
    const fileIds = formData.getAll('fileIds').map((v) => String(v)).filter(Boolean)
    const corpo = String(formData.get('corpo') ?? '')
    const agendarPara = texto(formData, 'agendarPara')
    if (agendarPara && Number.isNaN(deBrasilia(agendarPara).getTime())) {
      throw new Error('Horário do destino inválido.')
    }

    const avisos = validarVariante({ corpo, extras, fileIds }, destino.canal, destino.formato)

    // Salvar não pode desmarcar o "pronta" de um destino que continua válido.
    // Foi a corrida do segundo teste real: o clique em Publicar salvava a
    // variante ativa "por garantia", o salvamento rebaixava para gerada, e o
    // disparo não achava mais nenhum destino pronto — com a tela dizendo o
    // contrário. Com erro, aí sim: pronta nenhuma sobrevive a um erro.
    const estadoNovo = temErro(avisos)
      ? 'em_ajuste'
      : destino.estado === 'pronta' ? 'pronta' : 'gerada'

    const { error } = await supabase.from('package_destinations').update({
      corpo,
      extras,
      file_ids: fileIds,
      crops,
      agendar_para: agendarPara ? deBrasilia(agendarPara).toISOString() : null,
      descolada: true,
      estado: estadoNovo,
    }).eq('id', id).eq('workspace_id', context.workspace.id)
    if (error) throw new Error('Não foi possível salvar a variante.')

    return { id }
  } catch (causa) {
    return comoErro(causa, 'Não foi possível salvar a variante.')
  }
}

/**
 * Regenera do mestre as variantes NÃO descoladas — regra de ouro do spec:
 * regenerar nunca sobrescreve trabalho humano. Uma descolada só volta ao
 * mestre por pedido explícito (realimentarDestino).
 */
export async function regenerarVariantes(formData: FormData): Promise<ResultadoDoHub> {
  try {
    const context = await requireWorkspace()
    const pacoteId = texto(formData, 'pacoteId')
    const pacote = await pacoteDoEspaco(pacoteId, context.workspace.id)
    const mestre: Mestre = { ...lerMestre(pacote.mestre), fileIds: pacote.mestre_file_ids ?? [] }

    const atualizados = await regerarAcompanhantes(pacoteId, context.workspace.id, mestre)

    revalidatePath(`/redes/${pacoteId}`)
    return { destinos: atualizados }
  } catch (causa) {
    return comoErro(causa, 'Não foi possível regenerar as variantes.')
  }
}

/** Volta uma variante descolada a acompanhar o mestre — pedido explícito. */
export async function realimentarDestino(formData: FormData): Promise<ResultadoDoHub> {
  try {
    const context = await requireWorkspace()
    const supabase = await createClient()
    const id = texto(formData, 'destinoId')

    const { data: destino } = await supabase
      .from('package_destinations').select('id,package_id,canal,formato,estado')
      .eq('id', id).eq('workspace_id', context.workspace.id).maybeSingle()
    if (!destino) throw new Error('Destino não encontrado.')
    if (['publicada', 'publicando'].includes(destino.estado)) {
      throw new Error('Este destino já foi publicado.')
    }

    const pacote = await pacoteDoEspaco(destino.package_id, context.workspace.id)
    const mestre: Mestre = { ...lerMestre(pacote.mestre), fileIds: pacote.mestre_file_ids ?? [] }
    const { variante, avisos } = gerarVariante(mestre, destino.canal, destino.formato)

    const { error } = await supabase.from('package_destinations').update({
      corpo: variante.corpo,
      extras: variante.extras,
      file_ids: variante.fileIds,
      descolada: false,
      estado: temErro(avisos) ? 'bloqueada' : 'gerada',
    }).eq('id', id).eq('workspace_id', context.workspace.id)
    if (error) throw new Error('Não foi possível realimentar a variante.')

    revalidatePath(`/redes/${destino.package_id}`)
    return {}
  } catch (causa) {
    return comoErro(causa, 'Não foi possível realimentar a variante.')
  }
}

/**
 * Tipo de cada arquivo, para a validação saber se a mídia serve ao formato.
 *
 * Sem isto, mandar vídeo a um formato que só aceita foto — ou o contrário —
 * só falharia na resposta da API, com uma mensagem que ninguém decifra.
 */
/**
 * O que a Biblioteca sabe das mídias escolhidas: tipo e autorização de uso.
 *
 * Os dois juntos porque a validação precisa dos dois, e ir ao banco duas
 * vezes pela mesma linha seria só custo.
 */
async function dadosDosArquivos(
  supabase: Awaited<ReturnType<typeof createClient>>,
  workspaceId: string,
  ids: string[],
): Promise<Record<string, DadosDoArquivo>> {
  const unicos = [...new Set(ids)].filter(Boolean)
  if (!unicos.length) return {}
  const { data } = await supabase
    .from('files').select('id,file_type,authorization_status')
    .eq('workspace_id', workspaceId).in('id', unicos)
  return Object.fromEntries((data ?? []).map((f) => [f.id, {
    tipo: f.file_type === 'foto' || f.file_type === 'video' ? f.file_type : undefined,
    // Sem valor no banco, trata como pendente: o campo em branco não é
    // permissão, e presumir o contrário publicaria o que ninguém liberou.
    autorizacao: (f.authorization_status as string | null) ?? 'pending',
  }]))
}

/**
 * Marca um destino como pronto para disparo. A conferência roda AQUI, com o
 * mesmo validar() do adapter que a tela usa — o botão desabilitado do
 * navegador não é autoridade.
 */
export async function marcarPronta(formData: FormData): Promise<ResultadoDoHub> {
  try {
    const context = await requireWorkspace()
    const supabase = await createClient()
    const id = texto(formData, 'destinoId')

    const { data: destino } = await supabase
      .from('package_destinations').select('id,package_id,canal,formato,corpo,extras,file_ids,estado')
      .eq('id', id).eq('workspace_id', context.workspace.id).maybeSingle()
    if (!destino) throw new Error('Destino não encontrado.')
    if (['publicada', 'publicando'].includes(destino.estado)) {
      throw new Error('Este destino já foi publicado.')
    }

    const avisos = validarVariante(
      { corpo: destino.corpo ?? '', extras: (destino.extras ?? {}) as Record<string, string>, fileIds: destino.file_ids ?? [] },
      destino.canal,
      destino.formato,
      await dadosDosArquivos(supabase, context.workspace.id, destino.file_ids ?? []),
    )
    if (temErro(avisos)) {
      const erros = avisos.filter((a) => a.nivel === 'erro').map((a) => a.mensagem).join(' · ')
      throw new Error(`Ainda não dá para marcar como pronta: ${erros}`)
    }

    const { error } = await supabase.from('package_destinations')
      .update({ estado: 'pronta' })
      .eq('id', id).eq('workspace_id', context.workspace.id)
    if (error) throw new Error('Não foi possível marcar como pronta.')

    revalidatePath(`/redes/${destino.package_id}`)
    return {}
  } catch (causa) {
    return comoErro(causa, 'Não foi possível marcar como pronta.')
  }
}

export async function arquivarPacote(formData: FormData): Promise<ResultadoDoHub> {
  try {
    const context = await requireWorkspace()
    const supabase = await createClient()
    const id = texto(formData, 'pacoteId')
    await pacoteDoEspaco(id, context.workspace.id)

    const { error } = await supabase.from('social_packages')
      .update({ status: 'arquivado' })
      .eq('id', id).eq('workspace_id', context.workspace.id)
    if (error) throw new Error('Não foi possível arquivar.')

    revalidatePath('/redes')
    return {}
  } catch (causa) {
    return comoErro(causa, 'Não foi possível arquivar.')
  }
}

// ---------------------------------------------------------------- disparo

import { createAdminClient } from '@/lib/supabase/admin'
import { obterPerfil, perfilPadrao, publicarFotos, publicarTexto, publicarVideo, redesConectadas, semSegredo, statusDoEnvio, type Formato as FormatoConector, type RespostaDeEnvio } from '@/lib/publicacao/upload-post'
import { explicarRecusaDaRede, motivoDaRecusa, traduzirSeConhecida } from '@/lib/publicacao/recusa'
import { conformarImagem } from '@/lib/publicacao/imagem-para-redes'
import { carregarArquivos } from '@/lib/publicacao/arquivos'
import { publicarMateria } from '@/lib/site/publicar-materia'
import type { CaixaDeRecorte } from '@/lib/publicacao/recorte'

type DestinoParaDisparo = {
  id: string
  canal: string
  formato: string
  corpo: string
  extras: Record<string, string>
  file_ids: string[]
  crops: Record<string, CaixaDeRecorte>
  agendar_para: string | null
}

/**
 * Chave de agrupamento: destinos com o MESMO payload saem numa chamada só.
 *
 * É a decisão de conviver com o plano gratuito do Upload-Post: uma chamada
 * com várias redes conta como 1 publicação da cota. Quem editou a variante
 * (corpo ou mídia diferentes) ganha chamada própria — e paga 1 a mais.
 */
function chaveDoGrupo(d: DestinoParaDisparo, agendaDoPacote: string | null): string {
  return JSON.stringify({
    corpo: d.corpo,
    formato: d.formato,
    fileIds: d.file_ids,
    crops: d.crops,
    extras: d.extras,
    quando: d.agendar_para ?? agendaDoPacote,
  })
}

/** Quantas chamadas (publicações do plano) um conjunto de destinos consome. */
export async function estimarCota(formData: FormData): Promise<ResultadoDoHub & { grupos?: number }> {
  try {
    const context = await requireWorkspace()
    const supabase = await createClient()
    const pacoteId = texto(formData, 'pacoteId')
    const pacote = await pacoteDoEspaco(pacoteId, context.workspace.id)

    const incluirIds = new Set(formData.getAll('incluir').map((v) => String(v)).filter(Boolean))
    const { data: destinos } = await supabase
      .from('package_destinations')
      .select('id,canal,formato,corpo,extras,file_ids,crops,agendar_para,estado')
      .eq('package_id', pacoteId).eq('workspace_id', context.workspace.id)
      .in('estado', ['pronta', 'gerada', 'em_ajuste'])

    const sociais = (destinos ?? [])
      .filter((d) => d.estado === 'pronta' || incluirIds.has(d.id))
      // Só rede consome cota: site e newsletter são canais próprios.
      .filter((d) => ehCanalDeRede(d.canal)) as DestinoParaDisparo[]
    const grupos = new Set(sociais.map((d) => chaveDoGrupo(d, pacote.agendar_para))).size
    return { grupos }
  } catch (causa) {
    return comoErro(causa, 'Não foi possível estimar a cota.')
  }
}

/**
 * Dispara os destinos prontos do pacote.
 *
 * Ordem: o site primeiro, quando presente — a URL da matéria alimenta os
 * posts, e rede publicada com link quebrado não se desfaz. Se o site falhar,
 * os destinos sociais que dependem da URL ficam parados com o motivo; os que
 * não usam link seguem.
 *
 * Falha parcial é fluxo normal: cada destino guarda seu resultado, e
 * reprocessar um que falhou não republica os que já saíram.
 */
export async function publicarPacote(formData: FormData): Promise<ResultadoDoHub & { publicados?: number; falhas?: number }> {
  try {
    const context = await requireWorkspace()
    const supabase = await createClient()
    const pacoteId = texto(formData, 'pacoteId')
    const pacote = await pacoteDoEspaco(pacoteId, context.workspace.id)

    // Passou por aprovação? A decisão é conferida AQUI, no servidor — a tela
    // pode estar desatualizada, e publicar em nome da instituição algo que
    // ninguém aprovou é o que o fluxo existe para impedir.
    if (pacote.content_id) {
      const { data: aprovacao } = await supabase
        .from('approvals').select('status')
        .eq('content_id', pacote.content_id)
        .order('created_at', { ascending: false })
        .limit(1).maybeSingle()
      if (aprovacao && aprovacao.status !== 'approved') {
        throw new Error(
          aprovacao.status === 'pending'
            ? 'Este pacote está em aprovação. Aguarde a decisão antes de publicar.'
            : 'A aprovação deste pacote pediu ajustes. Revise as variantes e envie de novo.',
        )
      }
    } else if (pacote.status === 'em_aprovacao') {
      throw new Error('Este pacote está em aprovação. Aguarde a decisão antes de publicar.')
    }

    // Além dos já marcados como prontos, a tela pode pedir para levar juntos
    // destinos ainda em "gerada" — desde que passem AGORA na validação do
    // adapter, no servidor. Foi o buraco do primeiro teste real: o Facebook
    // saiu e o site ficou para trás em silêncio, só porque ninguém tinha
    // clicado no ritual de "marcar como pronta".
    const incluirIds = new Set(formData.getAll('incluir').map((v) => String(v)).filter(Boolean))

    const { data: linhas } = await supabase
      .from('package_destinations')
      .select('id,canal,formato,corpo,extras,file_ids,crops,agendar_para,estado')
      .eq('package_id', pacoteId).eq('workspace_id', context.workspace.id)
      .in('estado', ['pronta', 'gerada', 'em_ajuste'])
    const todas = (linhas ?? []) as (DestinoParaDisparo & { estado: string })[]

    const arquivos = await dadosDosArquivos(
      supabase,
      context.workspace.id,
      todas.flatMap((d) => d.file_ids ?? []),
    )

    const prontos: typeof todas = []
    for (const d of todas) {
      if (d.estado === 'pronta') { prontos.push(d); continue }
      if (!incluirIds.has(d.id)) continue
      const avisos = validarVariante(
        { corpo: d.corpo ?? '', extras: (d.extras ?? {}) as Record<string, string>, fileIds: d.file_ids ?? [] },
        d.canal, d.formato, arquivos,
      )
      if (temErro(avisos)) continue   // com erro não vai, mesmo pedido
      await supabase.from('package_destinations').update({ estado: 'pronta' })
        .eq('id', d.id).eq('workspace_id', context.workspace.id)
      prontos.push(d)
    }
    if (!prontos.length) throw new Error('Nenhum destino pronto para publicar. Marque ao menos um como pronto.')

    // Gravar em silêncio é como um destino fica preso em "publicando" para
    // sempre: o post saiu, a linha não acompanhou, e o reprocesso nem aparece
    // porque o estado nunca chegou a "falhou".
    const marcar = async (ids: string[], campos: Record<string, unknown>) => {
      if (!ids.length) return
      const { error } = await supabase.from('package_destinations').update(campos).in('id', ids)
        .eq('workspace_id', context.workspace.id)
      if (error) console.error('[pacotes] não foi possível gravar o estado dos destinos', ids.join(','), error.message)
    }

    let publicados = 0
    let falhas = 0
    const mestre = lerMestre(pacote.mestre)
    let linkDaMateria = mestre.linkUrl ?? ''
    // A capa da newsletter só pode ser uma imagem PÚBLICA — cliente de e-mail
    // não autentica, e a Biblioteca é privada. Publicar no site é o que torna
    // essas imagens públicas, então é de lá que a capa sai.
    let imagensDoSite: string[] = []

    // ---- 1. Site primeiro ----
    const site = prontos.find((d) => d.canal === 'site_web')
    if (site) {
      await marcar([site.id], { estado: 'publicando' })
      const resultado = await publicarSiteDoPacote(site, pacote, context.workspace.id, context.user.id)
      if (resultado.erro) {
        falhas++
        await marcar([site.id], { estado: 'falhou', erro: resultado.erro.slice(0, 500) })
      } else if (resultado.paginaNoAr === false) {
        // O FTP aceitou os arquivos, mas o endereço público respondeu erro:
        // para quem publica, página fora do ar É falha — e marcar "publicada"
        // esconderia o aviso e travaria o reprocesso. Sem linkDaMateria, os
        // posts que dependem da URL também não saem com link morto.
        falhas++
        await marcar([site.id], {
          estado: 'falhou',
          external_url: resultado.url ?? null,
          erro: (resultado.aviso ?? `A página não respondeu em ${resultado.url ?? 'seu endereço'}.`).slice(0, 500),
        })
      } else {
        publicados++
        linkDaMateria = resultado.url ?? linkDaMateria
        imagensDoSite = resultado.imagens ?? []
        await marcar([site.id], { estado: 'publicada', external_url: resultado.url ?? null, erro: resultado.aviso?.slice(0, 500) ?? null })
      }
    }

    // ---- 1.5. Newsletter, depois do site ----
    // A ordem importa: o botão "ler a matéria completa" precisa de uma página
    // que já esteja no ar. Antes do site, o e-mail sairia com link morto — e
    // e-mail, ao contrário de post, não dá para editar depois de enviado.
    const boletim = prontos.find((d) => d.canal === 'newsletter')
    if (boletim) {
      await marcar([boletim.id], { estado: 'publicando' })
      const extras = (boletim.extras ?? {}) as Record<string, string>
      const { texto } = textoParaRede(boletim.corpo || mestre.corpo || '')
      // Destino com horário próprio manda; senão vale o do pacote.
      const quandoOBoletim = boletim.agendar_para ?? pacote.agendar_para ?? undefined

      const remessa = await enviarEdicao(context.workspace.id, {
        assunto: extras.assunto || mestre.titulo || 'Novidades da Cruz Vermelha RJ',
        chamada: extras.chamada,
        paragrafos: texto.split(/\n{2,}/).map((p: string) => p.replace(/\n/g, ' ').trim()).filter(Boolean),
        // Só oferece o botão quando há página de verdade para ele apontar.
        urlDaMateria: linkDaMateria || undefined,
        rotuloDoBotao: extras.rotuloDoBotao,
        // Sem site publicado não há imagem pública, e a edição sai sem capa —
        // melhor do que sair com um quadro quebrado em toda caixa de entrada.
        imagemUrl: imagensDoSite[0],
        // Sem isto, um destino agendado sairia na hora. E-mail enviado não volta.
        agendarPara: quandoOBoletim,
      })

      if (remessa.erro) {
        falhas++
        await marcar([boletim.id], { estado: 'falhou', erro: remessa.erro.slice(0, 500) })
      } else {
        publicados++
        await marcar([boletim.id], {
          // Agendada fica na fila: dizer "publicada" antes da hora seria uma
          // mentira que o calendário repetiria.
          estado: remessa.agendada ? 'na_fila' : 'publicada',
          erro: null,
          // Não há URL externa numa remessa de e-mail; o que importa registrar
          // é para quantas pessoas ela foi.
          external_url: `${remessa.enviados} destinatário${remessa.enviados === 1 ? '' : 's'}`,
        })

        if (quandoOBoletim) {
          const dia = new Date(quandoOBoletim)
          const dataLocal = new Date(dia.getTime() - 3 * 60 * 60 * 1000)
          await supabase.from('calendar_events').insert({
            workspace_id: context.workspace.id,
            title: pacote.titulo_interno || extras.assunto || 'Newsletter agendada',
            event_date: dataLocal.toISOString().slice(0, 10),
            event_time: dataLocal.toISOString().slice(11, 16),
            type: 'publicacao',
            channel: adapter('newsletter')?.nome ?? 'Newsletter',
            created_by: context.user.id,
          })
        }
      }
    }

    // ---- 2. Redes, agrupadas por payload idêntico ----
    const sociais = prontos.filter((d) => ehCanalDeRede(d.canal))

    // Conta desconectada falha ANTES de gastar. Sem esta pergunta, a rede sem
    // conta voltava como "skipped" depois do aceite — com a cota do plano e o
    // registro já queimados. Se a consulta falhar, segue como antes: o
    // acompanhamento acusa depois.
    let conectadas: Set<string> | null = null
    if (sociais.length) {
      try {
        const { dados } = await obterPerfil(perfilPadrao())
        if (dados.profile) conectadas = new Set(redesConectadas(dados.profile))
      } catch {
        conectadas = null
      }
    }

    const grupos = new Map<string, DestinoParaDisparo[]>()
    for (const d of sociais) {
      // Rede que usa a URL da matéria espera o site sair. Se o site falhou,
      // este destino não dispara com link quebrado.
      if (site && d.corpo.includes('{{URL_DA_MATERIA}}')) {
        // placeholder resolvido adiante; aqui só garante que há URL
      }
      const chave = chaveDoGrupo(d, pacote.agendar_para)
      grupos.set(chave, [...(grupos.get(chave) ?? []), d])
    }

    for (const [, todosDoGrupo] of grupos) {
      // Destino de rede desconectada sai do grupo com o motivo certo, sem
      // derrubar os irmãos que têm conta.
      const semConta = conectadas ? todosDoGrupo.filter((d) => !conectadas.has(d.canal)) : []
      if (semConta.length) {
        falhas += semConta.length
        for (const d of semConta) {
          await marcar([d.id], {
            estado: 'falhou',
            erro: `A conta de ${adapter(d.canal)?.nome ?? d.canal} não está conectada no Upload-Post.`
              + ' Conecte em Configurações → Redes sociais e reprocesse — nada foi gasto do plano.',
          })
        }
      }
      const grupo = semConta.length ? todosDoGrupo.filter((d) => !semConta.includes(d)) : todosDoGrupo
      if (!grupo.length) continue

      const modelo = grupo[0]
      const ids = grupo.map((d) => d.id)
      const redes = grupo.map((d) => d.canal)

      // Corpo final: o marcador da URL vira o endereço real da matéria.
      let corpo = modelo.corpo
      if (corpo.includes('{{URL_DA_MATERIA}}')) {
        if (!linkDaMateria) {
          falhas += grupo.length
          await marcar(ids, { estado: 'falhou', erro: 'Este post usa a URL da matéria, e a página do site não foi publicada. Reprocesse o site primeiro.' })
          continue
        }
        corpo = corpo.split('{{URL_DA_MATERIA}}').join(linkDaMateria)
      }

      const quando = modelo.agendar_para ?? pacote.agendar_para ?? undefined

      // A linha em social_publications nasce antes do envio (é ela que conta a
      // cota e guarda o rastro), como no fluxo antigo.
      const { data: registro, error: erroRegistro } = await supabase
        .from('social_publications')
        .insert({
          workspace_id: context.workspace.id,
          networks: redes,
          body: corpo,
          file_ids: modelo.file_ids,
          format: modelo.formato,
          scheduled_for: quando ?? null,
          created_by: context.user.id,
          status: 'pending',
        })
        .select('id')
        .single()
      if (erroRegistro || !registro) {
        falhas += grupo.length
        await marcar(ids, { estado: 'falhou', erro: 'Não foi possível registrar a chamada.' })
        continue
      }

      await marcar(ids, { estado: 'publicando' })
      try {
        const daBiblioteca = modelo.file_ids.length
          ? await carregarArquivos(modelo.file_ids, context.workspace.id, modelo.crops)
          : []
        const eVideo = daBiblioteca.length > 0 && daBiblioteca[0].contentType.startsWith('video/')
        // Foto grande demais para a rede mais exigente do grupo é recusa
        // certa — a cópia que viaja é conformada aqui; o original não muda.
        const midias = eVideo
          ? daBiblioteca.map((a) => a.blob)
          : await Promise.all(daBiblioteca.map((a) => conformarImagem(a.blob, redes)))
        const iaGerada = daBiblioteca.some((a) => a.geradaPorIa)

        const comum = {
          redes,
          texto: corpo,
          externalId: registro.id,
          idempotencyKey: registro.id,
          agendarPara: quando,
          timezone: 'America/Sao_Paulo',
          formato: modelo.formato as FormatoConector,
          extras: modelo.extras,
          iaGerada,
        }

        const { dados } = eVideo
          ? await publicarVideo({ ...comum, video: midias[0] })
          : midias.length
            ? await publicarFotos({ ...comum, fotos: midias })
            : await publicarTexto(comum)

        await supabase.from('social_publications').update({
          request_id: dados.request_id ?? null,
          job_id: dados.job_id ?? null,
          external_id: dados.external_id ?? registro.id,
          status: dados.status && dados.status !== 'not_found' ? dados.status : 'queued',
          error: null,
        }).eq('id', registro.id)

        publicados += grupo.length
        // Agendado fica na fila — dizer "publicada" antes da hora seria mentira
        // que o calendário repetiria.
        await marcar(ids, { estado: quando ? 'na_fila' : 'publicada', request_id: registro.id, erro: null })

        if (quando) {
          // Cada destino agendado vira um evento no calendário editorial, com
          // o canal visível — integração pedida no cap. 14 do spec.
          const dia = new Date(quando)
          const dataLocal = new Date(dia.getTime() - 3 * 60 * 60 * 1000)
          await supabase.from('calendar_events').insert(grupo.map((d) => ({
            workspace_id: context.workspace.id,
            title: pacote.titulo_interno || corpo.slice(0, 60) || 'Publicação agendada',
            event_date: dataLocal.toISOString().slice(0, 10),
            event_time: dataLocal.toISOString().slice(11, 16),
            type: 'publicacao',
            channel: adapter(d.canal)?.nome ?? d.canal,
            created_by: context.user.id,
          })))
        }
      } catch (causa) {
        // O 429 do plano, o 401 da chave e afins chegam por aqui, em inglês.
        // A mesma tradução das recusas por rede serve — e quando o motivo não
        // é conhecido, o texto original fica como está (pode já ser português).
        const bruta = causa instanceof Error ? causa.message : String(causa)
        const nomes = grupo.map((d) => adapter(d.canal)?.nome ?? d.canal).join(', ')
        const mensagem = semSegredo(traduzirSeConhecida(bruta, nomes) ?? bruta).slice(0, 500)
        falhas += grupo.length
        await supabase.from('social_publications').update({ status: 'failed', error: mensagem }).eq('id', registro.id)
        await marcar(ids, { estado: 'falhou', erro: mensagem })
      }
    }

    // "Publicado" encerra e congela o pacote. Um destino deixado para trás —
    // gerado, em ajuste, bloqueado — mantém o pacote em "parcial", editável,
    // para ninguém repetir o pacote trancado do primeiro teste.
    const { data: restantes } = await supabase
      .from('package_destinations').select('estado')
      .eq('package_id', pacoteId).eq('workspace_id', context.workspace.id)
    const pendentes = (restantes ?? []).filter((d) => !['publicada', 'na_fila', 'ignorada'].includes(d.estado)).length
    const statusFinal = falhas > 0 || pendentes > 0
      ? (publicados > 0 ? 'parcial' : 'falhou')
      : 'publicado'
    await supabase.from('social_packages').update({ status: statusFinal })
      .eq('id', pacoteId).eq('workspace_id', context.workspace.id)

    revalidatePath(`/redes/${pacoteId}`)
    revalidatePath('/redes')
    revalidatePath('/calendario')
    return { publicados, falhas }
  } catch (causa) {
    return comoErro(causa, 'Não foi possível publicar o pacote.')
  }
}

/** Reprocessa um destino que falhou, sem tocar nos que já saíram. */
export async function reprocessarDestino(formData: FormData): Promise<ResultadoDoHub> {
  try {
    const context = await requireWorkspace()
    const supabase = await createClient()
    const id = texto(formData, 'destinoId')

    const { data: destino } = await supabase
      .from('package_destinations').select('id,package_id,estado,canal,request_id')
      .eq('id', id).eq('workspace_id', context.workspace.id).maybeSingle()
    if (!destino) throw new Error('Destino não encontrado.')
    if (destino.estado !== 'falhou') throw new Error('Só destinos que falharam podem ser reprocessados.')

    // Antes de disparar de novo, pergunta ao conector o que houve com o
    // disparo anterior. Foi assim que nasceu o post duplicado na página do
    // Facebook: um "falhou" gravado por engano, e o reprocesso republicou o
    // que já estava no ar. Se o post saiu, o conserto é corrigir o estado.
    if (destino.request_id && ehCanalDeRede(destino.canal)) {
      const { data: registro } = await supabase
        .from('social_publications').select('request_id,job_id')
        .eq('id', destino.request_id).eq('workspace_id', context.workspace.id).maybeSingle()
      if (registro?.request_id || registro?.job_id) {
        try {
          const { dados } = await statusDoEnvio({
            requestId: registro.request_id ?? undefined,
            jobId: registro.job_id ?? undefined,
          })
          const resultado = (dados.results ?? []).find((r) => r.platform === destino.canal)
          if (resultado?.success === true) {
            await supabase.from('package_destinations')
              .update({ estado: 'publicada', external_url: resultado.post_url ?? null, erro: null })
              .eq('id', id).eq('workspace_id', context.workspace.id)
            await recalcularStatusDoPacote(supabase, destino.package_id, context.workspace.id)
            revalidatePath(`/redes/${destino.package_id}`)
            revalidatePath('/redes')
            return {}
          }
        } catch {
          // Sem resposta do conector, segue para o reprocesso normal.
        }
      }
    }

    // Volta a pronto e dispara de novo só ele, pelo mesmo caminho.
    await supabase.from('package_destinations').update({ estado: 'pronta', erro: null })
      .eq('id', id).eq('workspace_id', context.workspace.id)

    const form = new FormData()
    form.set('pacoteId', destino.package_id)
    return await publicarPacote(form)
  } catch (causa) {
    return comoErro(causa, 'Não foi possível reprocessar.')
  }
}

/**
 * Confere no conector o que aconteceu de fato com cada destino já disparado.
 *
 * O envio é assíncrono por obrigação: a documentação avisa que o modo síncrono
 * vira assíncrono aos 59s, e a função da Vercel morre antes disso. Ou seja, a
 * API responde "aceito" e publica depois. Sem esta conferência o hub ficava
 * com a resposta do aceite como se fosse o resultado — e três coisas nunca
 * chegavam:
 *
 *  - o endereço do post (era por isso que o Registro dizia "sem link do canal");
 *  - a falha que acontece DEPOIS do aceite, que ficava marcada como publicada;
 *  - a rede sem conta conectada, que o conector devolve como `skipped` e conta
 *    como sucesso — o destino aparecia publicado sem nada ter saído.
 *
 * O agendado é o mesmo caso: ficava em "na fila" para sempre, porque nada
 * voltava para dizer que a hora chegou.
 */
export async function atualizarStatusDoPacote(formData: FormData): Promise<ResultadoDoHub & { mudou?: number }> {
  try {
    const context = await requireWorkspace()
    const supabase = await createClient()
    // Sem pacoteId, confere o espaço inteiro — é o que o Registro precisa,
    // porque lá as linhas vêm de pacotes diferentes.
    const pacoteId = texto(formData, 'pacoteId')
    if (pacoteId) await pacoteDoEspaco(pacoteId, context.workspace.id)

    // Tudo que já foi disparado — INCLUSIVE o que consta como falho. O caso
    // real que exigiu isso: o conector foi consultado no meio do processamento,
    // a entrada ainda sem success virou "falhou", e o post SAIU na página
    // depois — mas o destino nunca era reconferido, o erro ficava eterno e o
    // "Reprocessar" publicava de novo (post duplicado no Facebook). A verdade
    // do conector corrige o estado nas duas direções.
    let consulta = supabase
      .from('package_destinations')
      .select('id,package_id,canal,estado,request_id,external_url,erro')
      .eq('workspace_id', context.workspace.id)
      .in('estado', ['publicada', 'publicando', 'na_fila', 'falhou'])
      .not('request_id', 'is', null)
      .limit(200)
    if (pacoteId) consulta = consulta.eq('package_id', pacoteId)
    const { data: destinos } = await consulta

    // Canal próprio não tem job no Upload-Post para consultar.
    const pendentes = (destinos ?? []).filter((d) => ehCanalDeRede(d.canal))
    if (!pendentes.length) return { mudou: 0 }

    // Gravar em silêncio é como um destino fica preso em "publicando" para
    // sempre: o post saiu, a linha não acompanhou e ninguém fica sabendo.
    const aplicar = async (id: string, campos: Record<string, unknown>) => {
      const { error } = await supabase.from('package_destinations')
        .update(campos).eq('id', id).eq('workspace_id', context.workspace.id)
      if (error) console.error('[pacotes] não foi possível gravar o status do destino', id, error.message)
    }

    let mudou = 0
    const registroIds = [...new Set(pendentes.map((d) => d.request_id as string))]

    for (const registroId of registroIds) {
      const { data: registro } = await supabase
        .from('social_publications')
        .select('id,request_id,job_id,status')
        .eq('id', registroId).eq('workspace_id', context.workspace.id).maybeSingle()
      if (!registro?.request_id && !registro?.job_id) continue

      let dados: RespostaDeEnvio & { completed?: number; total?: number }
      try {
        ;({ dados } = await statusDoEnvio({
          requestId: registro.request_id ?? undefined,
          jobId: registro.job_id ?? undefined,
        }))
      } catch (causa) {
        // Consultar e falhar não muda o que já foi publicado. Registrar o
        // motivo e seguir é melhor do que marcar como falha um envio que pode
        // estar correndo bem.
        const motivo = semSegredo(causa instanceof Error ? causa.message : String(causa)).slice(0, 500)
        await supabase.from('social_publications').update({ error: motivo }).eq('id', registro.id)
        continue
      }

      // "not_found" é o conector dizendo que não conhece este envio — pode ser
      // propagação. Apagar o estado por causa disso seria pior do que esperar.
      if (dados.status === 'not_found') continue

      await supabase.from('social_publications').update({
        status: dados.status ?? registro.status,
        results: (dados.results ?? []).map((r) => ({
          rede: r.platform, ok: r.success, estado: r.status ?? null, mensagem: motivoDaRecusa(r),
          url: r.post_url ?? null, pulada: r.skipped ?? false,
        })),
      }).eq('id', registro.id)

      const porRede = new Map((dados.results ?? []).map((r) => [r.platform, r]))
      for (const destino of pendentes.filter((d) => d.request_id === registro.id)) {
        const resultado = porRede.get(destino.canal)

        if (!resultado) {
          // Sem linha para esta rede: ou ainda está na fila do conector, ou o
          // envio inteiro morreu. Só o segundo caso é notícia — e não para um
          // destino que já consta como falho.
          if (dados.status === 'failed' && destino.estado !== 'falhou') {
            await aplicar(destino.id, { estado: 'falhou', erro: (dados.message ?? 'O envio falhou no conector.').slice(0, 500) })
            mudou++
          }
          continue
        }

        // O sucesso vence qualquer estado anterior — inclusive um "falhou"
        // gravado por engano no meio do processamento. É esta linha que
        // conserta sozinha o destino cujo post na verdade saiu.
        if (resultado.success === true) {
          const url = resultado.post_url ?? null
          const virou = destino.estado !== 'publicada' || (url && url !== destino.external_url)
          if (!virou) continue
          await aplicar(destino.id, { estado: 'publicada', external_url: url, erro: null })
          mudou++
          continue
        }

        if (resultado.skipped) {
          if (destino.estado !== 'falhou') {
            await aplicar(destino.id, {
              estado: 'falhou',
              erro: `A conta de ${adapter(destino.canal)?.nome ?? destino.canal} não está conectada no Upload-Post — nada foi publicado.`,
            })
            mudou++
          }
          continue
        }

        // Falha só quando é TERMINAL. Uma entrada ainda em fila/processamento
        // vem com success falso e sem erro — tratá-la como recusa foi
        // exatamente o bug do falso "A rede recusou": o post saiu depois e o
        // hub ficou com o erro gravado.
        const estadoDaEntrada = resultado.status
        const aindaRodando = estadoDaEntrada
          ? ['queued', 'processing', 'retryable', 'pending'].includes(estadoDaEntrada)
          : dados.status !== 'completed' && dados.status !== 'failed'
        if (aindaRodando) continue

        if (destino.estado !== 'falhou') {
          // O motivo vem em error_message/error/message; a tradução diz o que
          // aconteceu E o que fazer, sem apagar a resposta original.
          const erro = semSegredo(explicarRecusaDaRede(resultado, adapter(destino.canal)?.nome ?? destino.canal))
          await aplicar(destino.id, { estado: 'falhou', erro: erro.slice(0, 500) })
          mudou++
        }
      }
    }

    if (mudou) {
      for (const id of [...new Set(pendentes.map((d) => d.package_id))]) {
        await recalcularStatusDoPacote(supabase, id, context.workspace.id)
        revalidatePath(`/redes/${id}`)
      }
      revalidatePath('/redes')
      revalidatePath('/registro')
      revalidatePath('/dashboard')
    }
    return { mudou }
  } catch (causa) {
    return comoErro(causa, 'Não foi possível conferir a situação das publicações.')
  }
}

/** O status do pacote é consequência do estado dos destinos, nunca ao contrário. */
async function recalcularStatusDoPacote(
  supabase: Awaited<ReturnType<typeof createClient>>,
  pacoteId: string,
  workspaceId: string,
) {
  const { data: estados } = await supabase
    .from('package_destinations').select('estado')
    .eq('package_id', pacoteId).eq('workspace_id', workspaceId)
  const lista = (estados ?? []).map((e) => e.estado)
  if (!lista.length) return

  const publicados = lista.filter((e) => e === 'publicada').length
  const falhas = lista.filter((e) => e === 'falhou').length
  const pendentes = lista.filter((e) => !['publicada', 'na_fila', 'ignorada', 'falhou'].includes(e)).length

  const status = falhas > 0 || pendentes > 0
    ? (publicados > 0 ? 'parcial' : falhas > 0 ? 'falhou' : 'rascunho')
    : 'publicado'
  await supabase.from('social_packages').update({ status })
    .eq('id', pacoteId).eq('workspace_id', workspaceId)
}

/**
 * O destino site_web publica pela mesma engrenagem das matérias: se o pacote
 * nasceu de uma matéria, publica NELA (checklist do spec: não criar
 * duplicata); senão, cria a peça de conteúdo na primeira publicação e guarda
 * o vínculo nos extras do destino.
 */
async function publicarSiteDoPacote(
  destino: DestinoParaDisparo,
  pacote: { id?: string; content_id?: string | null; mestre?: unknown; origem_tipo?: string | null; origem_id?: string | null },
  workspaceId: string,
  userId: string,
) {
  const supabase = await createClient()
  const extras = destino.extras ?? {}

  // Corpo da página: o texto da variante + as mídias como blocos, porque o
  // gerador de página lê tokens de mídia do corpo. A legenda e o crédito vêm
  // do que foi escrito no pacote — antes daqui saía o NOME DO ARQUIVO como
  // legenda, e a página publicada mostrava "cerebro-9093f620.jpg" embaixo da
  // foto.
  let corpoDaPagina = destino.corpo
  if (destino.file_ids.length) {
    const { data: arquivos } = await supabase
      .from('files').select('id,storage_path')
      .in('id', destino.file_ids).eq('workspace_id', workspaceId)
    const porId = new Map((arquivos ?? []).map((a) => [a.id, a]))
    const midias = destino.file_ids
      .map((id) => ({ id, arquivo: porId.get(id) }))
      .filter((m): m is { id: string; arquivo: { id: string; storage_path: string } } => Boolean(m.arquivo?.storage_path))
      .map((m) => ({ id: m.id, url: `/api/private-blob?pathname=${encodeURIComponent(m.arquivo.storage_path)}` }))
    corpoDaPagina = corpoComMidias(corpoDaPagina, midias, lerLegendas((pacote.mestre as Record<string, unknown> | null)?.legendas))
  }

  let contentId = String(extras.contentId ?? '')

  // Pacote que nasceu de uma matéria publica NELA. Sem isto, cada publicação
  // criava uma segunda peça com o mesmo texto: a matéria aparecia duplicada em
  // Conteúdos e a original nunca recebia site_url, continuando "não publicada"
  // na tela de quem a escreveu.
  if (!contentId && pacote.origem_tipo === 'materia' && pacote.origem_id) {
    const { data: origem } = await supabase
      .from('content_pieces').select('id')
      .eq('id', pacote.origem_id).eq('workspace_id', workspaceId).maybeSingle()
    if (origem) contentId = origem.id
  }

  if (!contentId) {
    const { data: peca, error } = await supabase
      .from('content_pieces')
      .insert({
        workspace_id: workspaceId,
        title: extras.titulo ?? 'Sem título',
        subtitle: extras.subtitulo || null,
        body: corpoDaPagina,
        format: 'Matéria editorial',
        status: 'draft',
        responsible_id: userId,
        created_by: userId,
      })
      .select('id')
      .single()
    if (error || !peca) return { erro: 'Não foi possível criar a matéria para o site.' }
    contentId = peca.id
  }

  // Guarda o vínculo mesmo quando veio da origem: da segunda publicação em
  // diante ninguém precisa reencontrar a peça.
  if (contentId && extras.contentId !== contentId) {
    await supabase.from('package_destinations')
      .update({ extras: { ...extras, contentId } })
      .eq('id', destino.id).eq('workspace_id', workspaceId)
  }

  return publicarMateria({
    workspaceId,
    userId,
    contentId,
    titulo: String(extras.titulo ?? ''),
    subtitulo: String(extras.subtitulo ?? ''),
    corpo: corpoDaPagina,
    slug: String(extras.slug ?? ''),
  })
}

// ---------------------------------------------------------------- aprovação

/**
 * Envia o pacote para o fluxo de aprovação existente.
 *
 * O snapshot é uma peça de conteúdo com o resumo legível de TODAS as
 * variantes: o aprovador decide sobre o pacote inteiro — site e cada rede —
 * numa rodada só (decisão do usuário no planejamento). Quem aprova entra pelo
 * mesmo /aprovacoes de sempre.
 */
export async function enviarPacoteParaAprovacao(formData: FormData): Promise<ResultadoDoHub> {
  try {
    const context = await requireWorkspace()
    const supabase = await createClient()
    const pacoteId = texto(formData, 'pacoteId')
    const pacote = await pacoteDoEspaco(pacoteId, context.workspace.id)

    const aprovadores = [...new Set(formData.getAll('aprovadores').map((v) => String(v)).filter(Boolean))]
      .filter((id) => id !== context.user.id)
    if (!aprovadores.length) throw new Error('Escolha quem precisa aprovar este pacote.')

    const { data: membros } = await supabase
      .from('workspace_members').select('user_id')
      .eq('workspace_id', context.workspace.id).in('user_id', aprovadores)
    const validos = (membros ?? []).map((m) => m.user_id)
    if (!validos.length) throw new Error('Nenhuma das pessoas escolhidas pertence a este espaço.')

    const { data: destinos } = await supabase
      .from('package_destinations')
      .select('canal,formato,corpo,extras,file_ids,estado')
      .eq('package_id', pacoteId).eq('workspace_id', context.workspace.id)
      .not('estado', 'in', '("ignorada")')
      .order('created_at')
    if (!(destinos ?? []).length) throw new Error('Adicione ao menos um destino antes de pedir aprovação.')

    const mestre = lerMestre(pacote.mestre)
    const titulo = (pacote.titulo_interno || mestre.titulo || mestre.corpo.split('\n')[0] || 'Pacote de redes').slice(0, 120)

    // O corpo do snapshot mostra cada variante como vai sair — o aprovador lê
    // o pacote, não um texto genérico.
    const secoes = (destinos ?? []).map((d) => {
      const canal = adapter(d.canal)
      const nome = `${canal?.nome ?? d.canal} · ${formatoDoAdapter(canal!, d.formato)?.rotulo ?? d.formato}`
      const extras = (d.extras ?? {}) as Record<string, string>
      const linhas = [`## ${nome}`]
      if (d.canal === 'site_web') {
        linhas.push(`**${extras.titulo ?? ''}**`)
        if (extras.subtitulo) linhas.push(extras.subtitulo)
      }
      linhas.push(d.corpo || '(sem texto)')
      if (extras.firstComment) linhas.push(`> Primeiro comentário: ${extras.firstComment}`)
      if ((d.file_ids ?? []).length) linhas.push(`(${d.file_ids.length} mídia${d.file_ids.length === 1 ? '' : 's'})`)
      return linhas.join('\n\n')
    })
    const notas = String((pacote.mestre as Record<string, unknown>)?.notas ?? '')
    const corpoSnapshot = [
      notas ? `> Nota de quem enviou: ${notas}` : '',
      ...secoes,
    ].filter(Boolean).join('\n\n')

    let contentId = pacote.content_id
    if (contentId) {
      await supabase.from('content_pieces')
        .update({ title: titulo, body: corpoSnapshot, status: 'review', updated_at: new Date().toISOString() })
        .eq('id', contentId).eq('workspace_id', context.workspace.id)
    } else {
      const { data: peca, error } = await supabase
        .from('content_pieces')
        .insert({
          workspace_id: context.workspace.id,
          title: titulo,
          subtitle: `Pacote multicanal · ${(destinos ?? []).length} destino${(destinos ?? []).length === 1 ? '' : 's'}`,
          body: corpoSnapshot,
          format: 'Pacote de redes',
          status: 'review',
          responsible_id: context.user.id,
          created_by: context.user.id,
        })
        .select('id')
        .single()
      if (error || !peca) throw new Error('Não foi possível criar o item de aprovação.')
      contentId = peca.id
    }

    const { data: approvalId, error: erroEnvio } = await supabase
      .rpc('submit_content_for_approval', { p_content_id: contentId })
    if (erroEnvio || !approvalId) throw new Error(erroEnvio?.message || 'Não foi possível abrir a aprovação.')

    const admin = createAdminClient()
    // Acrescenta quem ainda não está na rodada; votos já dados ficam.
    const { data: jaConvidados } = await supabase
      .from('approval_voters').select('user_id').eq('approval_id', approvalId)
    const existentes = new Set((jaConvidados ?? []).map((v) => v.user_id))
    const novos = validos.filter((id) => !existentes.has(id))
    if (novos.length) {
      await admin.from('approval_voters').insert(
        novos.map((user_id) => ({ approval_id: approvalId as string, workspace_id: context.workspace.id, user_id })),
      )
      await admin.from('notifications').insert(
        novos.map((user_id) => ({
          workspace_id: context.workspace.id,
          user_id,
          title: `${context.profile?.full_name || 'Um colega'} pediu sua aprovação`,
          message: titulo,
          link: `/aprovacoes/${approvalId}`,
        })),
      )
    }

    await supabase.from('social_packages')
      .update({ status: 'em_aprovacao', content_id: contentId })
      .eq('id', pacoteId).eq('workspace_id', context.workspace.id)

    revalidatePath(`/redes/${pacoteId}`)
    revalidatePath('/aprovacoes')
    return {}
  } catch (causa) {
    return comoErro(causa, 'Não foi possível enviar para aprovação.')
  }
}
