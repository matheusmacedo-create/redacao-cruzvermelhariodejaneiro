'use server'

import { revalidatePath } from 'next/cache'
import { requireWorkspace } from '@/lib/session'
import { createClient } from '@/lib/supabase/server'
import { adapter, formatoDoAdapter, type Mestre } from '@/lib/publicacao/canais'
import { gerarVariante, validarVariante, temErro } from '@/lib/publicacao/variantes'

/**
 * Ações do hub multicanal: pacote (mestre) e destinos (variantes).
 *
 * Todas devolvem { erro } em vez de lançar: o Next apaga a mensagem de uma
 * exceção de server action em produção, e recado apagado já custou duas
 * rodadas de investigação neste projeto.
 */

const texto = (form: FormData, key: string) => String(form.get(key) ?? '').trim()

export type ResultadoDoHub = { erro?: string; id?: string }

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

function comoErro(causa: unknown, padrao: string): ResultadoDoHub {
  return { erro: (causa instanceof Error ? causa.message : padrao).slice(0, 500) }
}

function lerMestre(bruto: unknown): Mestre {
  const m = (bruto ?? {}) as Record<string, unknown>
  return {
    corpo: typeof m.corpo === 'string' ? m.corpo : '',
    titulo: typeof m.titulo === 'string' ? m.titulo : undefined,
    subtitulo: typeof m.subtitulo === 'string' ? m.subtitulo : undefined,
    linkUrl: typeof m.linkUrl === 'string' ? m.linkUrl : undefined,
    fileIds: [],
  }
}

async function pacoteDoEspaco(id: string, workspaceId: string) {
  const supabase = await createClient()
  const { data } = await supabase
    .from('social_packages')
    .select('id,titulo_interno,mestre,mestre_file_ids,status,agendar_para,content_id')
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
      notas: texto(formData, 'notas'),
    }
    const agendarPara = texto(formData, 'agendarPara')
    if (agendarPara && Number.isNaN(deBrasilia(agendarPara).getTime())) {
      throw new Error('Data de agendamento inválida.')
    }

    const { error } = await supabase.from('social_packages').update({
      titulo_interno: texto(formData, 'tituloInterno'),
      mestre,
      mestre_file_ids: fileIds,
      agendar_para: agendarPara ? deBrasilia(agendarPara).toISOString() : null,
    }).eq('id', id).eq('workspace_id', context.workspace.id)
    if (error) throw new Error('Não foi possível salvar o pacote.')

    return { id }
  } catch (causa) {
    return comoErro(causa, 'Não foi possível salvar o pacote.')
  }
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
      .from('package_destinations').select('id,package_id,estado')
      .eq('id', id).eq('workspace_id', context.workspace.id).maybeSingle()
    if (!destino) throw new Error('Destino não encontrado.')
    // Publicado é história, não rascunho: sai da tela via "ignorada"? Não —
    // removê-lo apagaria o registro do que saiu. Trava.
    if (destino.estado === 'publicada' || destino.estado === 'publicando') {
      throw new Error('Este destino já foi publicado e não pode ser removido do pacote.')
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

    const { error } = await supabase.from('package_destinations').update({
      corpo,
      extras,
      file_ids: fileIds,
      crops,
      agendar_para: agendarPara ? deBrasilia(agendarPara).toISOString() : null,
      descolada: true,
      estado: temErro(avisos) ? 'em_ajuste' : 'gerada',
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
    const supabase = await createClient()
    const pacoteId = texto(formData, 'pacoteId')
    const pacote = await pacoteDoEspaco(pacoteId, context.workspace.id)
    const mestre: Mestre = { ...lerMestre(pacote.mestre), fileIds: pacote.mestre_file_ids ?? [] }

    const { data: destinos } = await supabase
      .from('package_destinations').select('id,canal,formato,descolada,estado')
      .eq('package_id', pacoteId).eq('workspace_id', context.workspace.id)

    for (const destino of destinos ?? []) {
      if (destino.descolada) continue
      if (['publicada', 'publicando', 'ignorada'].includes(destino.estado)) continue
      const { variante, avisos } = gerarVariante(mestre, destino.canal, destino.formato)
      await supabase.from('package_destinations').update({
        corpo: variante.corpo,
        extras: variante.extras,
        file_ids: variante.fileIds,
        estado: temErro(avisos) ? 'bloqueada' : 'gerada',
      }).eq('id', destino.id).eq('workspace_id', context.workspace.id)
    }

    revalidatePath(`/redes/${pacoteId}`)
    return {}
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
import { publicarFotos, publicarTexto, publicarVideo, semSegredo, type Formato as FormatoConector } from '@/lib/publicacao/upload-post'
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

    const { data: destinos } = await supabase
      .from('package_destinations')
      .select('id,canal,formato,corpo,extras,file_ids,crops,agendar_para')
      .eq('package_id', pacoteId).eq('workspace_id', context.workspace.id)
      .eq('estado', 'pronta')

    const sociais = (destinos ?? []).filter((d) => d.canal !== 'site_web') as DestinoParaDisparo[]
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

    if (pacote.status === 'em_aprovacao') {
      throw new Error('Este pacote está em aprovação. Aguarde a decisão ou cancele o ciclo antes de publicar.')
    }

    const { data: linhas } = await supabase
      .from('package_destinations')
      .select('id,canal,formato,corpo,extras,file_ids,crops,agendar_para,estado')
      .eq('package_id', pacoteId).eq('workspace_id', context.workspace.id)
      .eq('estado', 'pronta')
    const prontos = (linhas ?? []) as (DestinoParaDisparo & { estado: string })[]
    if (!prontos.length) throw new Error('Nenhum destino pronto para publicar. Marque ao menos um como pronto.')

    const marcar = async (ids: string[], campos: Record<string, unknown>) => {
      if (!ids.length) return
      await supabase.from('package_destinations').update(campos).in('id', ids)
        .eq('workspace_id', context.workspace.id)
    }

    let publicados = 0
    let falhas = 0
    const mestre = lerMestre(pacote.mestre)
    let linkDaMateria = mestre.linkUrl ?? ''

    // ---- 1. Site primeiro ----
    const site = prontos.find((d) => d.canal === 'site_web')
    if (site) {
      await marcar([site.id], { estado: 'publicando' })
      const resultado = await publicarSiteDoPacote(site, pacote, context.workspace.id, context.user.id)
      if (resultado.erro) {
        falhas++
        await marcar([site.id], { estado: 'falhou', erro: resultado.erro.slice(0, 500) })
      } else {
        publicados++
        linkDaMateria = resultado.url ?? linkDaMateria
        await marcar([site.id], { estado: 'publicada', external_url: resultado.url ?? null, erro: resultado.aviso?.slice(0, 500) ?? null })
      }
    }

    // ---- 2. Redes, agrupadas por payload idêntico ----
    const sociais = prontos.filter((d) => d.canal !== 'site_web')
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

    for (const [, grupo] of grupos) {
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
        const midias = daBiblioteca.map((a) => a.blob)

        const comum = {
          redes,
          texto: corpo,
          externalId: registro.id,
          idempotencyKey: registro.id,
          agendarPara: quando,
          timezone: 'America/Sao_Paulo',
          formato: modelo.formato as FormatoConector,
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
        await marcar(ids, { estado: 'publicada', request_id: registro.id, erro: null })
      } catch (causa) {
        const mensagem = semSegredo(causa instanceof Error ? causa.message : String(causa)).slice(0, 500)
        falhas += grupo.length
        await supabase.from('social_publications').update({ status: 'failed', error: mensagem }).eq('id', registro.id)
        await marcar(ids, { estado: 'falhou', erro: mensagem })
      }
    }

    const statusFinal = falhas === 0 ? 'publicado' : publicados > 0 ? 'parcial' : 'falhou'
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
      .from('package_destinations').select('id,package_id,estado')
      .eq('id', id).eq('workspace_id', context.workspace.id).maybeSingle()
    if (!destino) throw new Error('Destino não encontrado.')
    if (destino.estado !== 'falhou') throw new Error('Só destinos que falharam podem ser reprocessados.')

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
 * O destino site_web publica pela mesma engrenagem das matérias: se o pacote
 * nasceu de uma matéria, publica NELA (checklist do spec: não criar
 * duplicata); senão, cria a peça de conteúdo na primeira publicação e guarda
 * o vínculo nos extras do destino.
 */
async function publicarSiteDoPacote(
  destino: DestinoParaDisparo,
  pacote: { id?: string; content_id?: string | null; mestre?: unknown },
  workspaceId: string,
  userId: string,
) {
  const supabase = await createClient()
  const extras = destino.extras ?? {}

  // Corpo da página: o texto da variante + as mídias como blocos, porque o
  // gerador de página lê tokens de mídia do corpo.
  let corpoDaPagina = destino.corpo
  if (destino.file_ids.length) {
    const { data: arquivos } = await supabase
      .from('files').select('id,name,storage_path')
      .in('id', destino.file_ids).eq('workspace_id', workspaceId)
    const porId = new Map((arquivos ?? []).map((a) => [a.id, a]))
    const tokens = destino.file_ids
      .map((id) => porId.get(id))
      .filter((a): a is NonNullable<typeof a> => Boolean(a?.storage_path))
      .map((a) => `![${a.name ?? ''}](/api/private-blob?pathname=${encodeURIComponent(a.storage_path!)})`)
    if (tokens.length) corpoDaPagina = `${tokens[0]}\n\n${corpoDaPagina}${tokens.length > 1 ? `\n\n${tokens.slice(1).join('\n\n')}` : ''}`
  }

  let contentId = String(extras.contentId ?? '')
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
  })
}
