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
    if (agendarPara) {
      const data = new Date(agendarPara)
      if (Number.isNaN(data.getTime())) throw new Error('Data de agendamento inválida.')
    }

    const { error } = await supabase.from('social_packages').update({
      titulo_interno: texto(formData, 'tituloInterno'),
      mestre,
      mestre_file_ids: fileIds,
      agendar_para: agendarPara ? new Date(agendarPara).toISOString() : null,
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
    const fileIds = formData.getAll('fileIds').map((v) => String(v)).filter(Boolean)
    const corpo = String(formData.get('corpo') ?? '')

    const avisos = validarVariante({ corpo, extras, fileIds }, destino.canal, destino.formato)

    const { error } = await supabase.from('package_destinations').update({
      corpo,
      extras,
      file_ids: fileIds,
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
