'use server'

import { revalidatePath } from 'next/cache'
import { get, put } from '@vercel/blob'
import { requirePermissao, requireWorkspace } from '@/lib/session'
import { mensagemDoErro } from '@/lib/erro-de-acao'
import { createClient } from '@/lib/supabase/server'
import { pode } from '@/lib/permissoes'
import { nomeFinal, otimizarImagem } from '@/lib/midia/otimizar-imagem'
import { EXTENSAO_DO_TIPO, TETO_PARA_OTIMIZAR, TIPOS_OTIMIZAVEIS, trocarExtensao } from '@/lib/midia/regras'
import { ETIQUETA_DE_IA } from '@/lib/ia/etiqueta'

/**
 * Autorização de uso de imagem de um arquivo que já está na Biblioteca.
 *
 * Até aqui a autorização só existia no instante do envio: uma caixa de
 * confirmação no formulário de upload. Todo arquivo que chega por outro
 * caminho — a foto do post importado do Cérebro, por exemplo — nascia
 * pendente e ficava assim para sempre, porque não havia onde mudar isso.
 * A tela escondia o pendente, e o que não aparece não se decide.
 *
 * O material de terceiro ('internal') não passa por aqui: aquilo não é falta
 * de confirmação, é imagem de outra instituição. A liberação dele existe,
 * mas é outra decisão, com outro peso — mora em liberarMidiaDeTerceiro,
 * restrita a administrador e registrada no log.
 */
export async function autorizarUsoDeImagem(formData: FormData): Promise<{ erro?: string; ok?: boolean }> {
  try {
    const context = await requireWorkspace()
    const supabase = await createClient()
    const id = String(formData.get('fileId') ?? '').trim()
    if (!id) throw new Error('Arquivo não identificado.')

    const { data: arquivo } = await supabase
      .from('files').select('id,name,authorization_status,status')
      .eq('id', id).eq('workspace_id', context.workspace.id).maybeSingle()
    if (!arquivo || arquivo.status === 'deleted') throw new Error('Arquivo não encontrado na Biblioteca deste espaço.')
    if (arquivo.authorization_status === 'authorized') return { ok: true }
    if (arquivo.authorization_status === 'internal') {
      throw new Error('Este arquivo está marcado como uso interno — material de terceiro não pode ser publicado em nome da Cruz Vermelha.')
    }

    const { error } = await supabase
      .from('files')
      .update({ authorization_status: 'authorized' })
      .eq('id', id).eq('workspace_id', context.workspace.id)
      // A condição vai também na consulta, e não só na conferência acima:
      // entre ler e escrever alguém pode ter marcado o arquivo como interno.
      .eq('authorization_status', 'pending')
    if (error) throw new Error('Não foi possível registrar a autorização.')

    revalidatePath('/biblioteca')
    return { ok: true }
  } catch (causa) {
    return { erro: mensagemDoErro(causa, 'Não foi possível registrar a autorização.') }
  }
}

/**
 * Libera material de terceiro para publicação — decisão de administrador.
 *
 * O 'internal' existe porque imagem importada de conta alheia (o card da
 * Defesa Civil, o aviso do COR) não é da filial. Mas regra sem saída trava a
 * operação: há casos legítimos — material oficial com permissão de
 * reprodução, arte cedida pela instituição parceira. A liberação é explícita,
 * restrita a admin, e fica no log com nome e autor: quem liberou assume que a
 * filial tem permissão da fonte, e o crédito é obrigatório na peça.
 */
export async function liberarMidiaDeTerceiro(formData: FormData): Promise<{ erro?: string; ok?: boolean }> {
  try {
    const context = await requirePermissao('biblioteca.liberar_terceiros')
    const supabase = await createClient()
    const id = String(formData.get('fileId') ?? '').trim()
    if (!id) throw new Error('Arquivo não identificado.')

    const { data: arquivo } = await supabase
      .from('files').select('id,name,authorization_status,status')
      .eq('id', id).eq('workspace_id', context.workspace.id).maybeSingle()
    if (!arquivo || arquivo.status === 'deleted') throw new Error('Arquivo não encontrado na Biblioteca deste espaço.')
    if (arquivo.authorization_status === 'authorized') return { ok: true }
    if (arquivo.authorization_status !== 'internal') {
      throw new Error('Este arquivo não está marcado como uso interno — use o fluxo normal de autorização.')
    }

    const { error } = await supabase
      .from('files')
      .update({ authorization_status: 'authorized' })
      .eq('id', id).eq('workspace_id', context.workspace.id)
      .eq('authorization_status', 'internal')
    if (error) throw new Error('Não foi possível registrar a liberação.')

    // A liberação é um ato com dono. O log é o que a torna auditável.
    await supabase.from('activity_log').insert({
      workspace_id: context.workspace.id,
      actor_id: context.user.id,
      action: 'midia_de_terceiro_liberada',
      entity_type: 'file',
      entity_id: arquivo.id,
      metadata: { nome: arquivo.name },
    })

    revalidatePath('/biblioteca')
    return { ok: true }
  } catch (causa) {
    return { erro: mensagemDoErro(causa, 'Não foi possível liberar a mídia.') }
  }
}

export type ResultadoDaOtimizacao = {
  erro?: string
  /** Fotos conferidas nesta rodada (otimizadas ou que já estavam leves). */
  processados: number
  /** Candidatas que ainda faltam, sem contar as que falharam (`pular` + `falhas`). */
  restantes: number
  /** Soma dos tamanhos antes e depois, só das processadas nesta rodada. */
  antes: number
  depois: number
  /** Ids que falharam nesta rodada: a tela devolve em `pular` na próxima. */
  falhas: string[]
}

/** Poucas por rodada: cada foto é baixada inteira, decodificada e regravada. */
const FOTOS_POR_RODADA = 4
/** A página declara maxDuration = 120; a rodada para de começar foto nova antes da metade. */
const TEMPO_DA_RODADA_MS = 50_000
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/**
 * "Otimizar fotos antigas": passa pelo mesmo otimizador do servidor as fotos
 * enviadas antes de a Biblioteca otimizar na entrada (otimizado_em nulo).
 *
 * A foto é regravada no MESMO caminho: o corpo das matérias guarda
 * '/api/private-blob?pathname=<storage_path>', e trocar o caminho quebraria
 * a imagem em cada matéria que a usa. O tipo novo vai no próprio Blob (é ele
 * que o /api/private-blob devolve), então "foto.png" com JPEG dentro é servida
 * certa. O original não fica guardado — por isso é decisão de quem já pode
 * apagar arquivo dos outros.
 *
 * Trabalha em rodadas curtas; a tela chama de novo até `restantes` zerar.
 * Foto que falha não é marcada (não perde a chance de ser otimizada depois):
 * volta como `falhas`, e a tela a devolve em `pular` para a rodada seguinte
 * não tropeçar sempre na mesma.
 */
export async function otimizarFotosAntigas(pular: string[] = []): Promise<ResultadoDaOtimizacao> {
  const nada = { processados: 0, restantes: 0, antes: 0, depois: 0, falhas: [] }
  try {
    const context = await requireWorkspace()
    if (!pode(context.role, 'biblioteca.apagar_de_outros')) throw new Error('Só administradores e editores otimizam as fotos antigas.')
    const workspaceId = context.workspace.id
    const supabase = await createClient()
    // Vai para o filtro da consulta: só id de verdade, e poucos (a URL tem limite).
    const ignorar = (Array.isArray(pular) ? pular : []).filter((id) => typeof id === 'string' && UUID.test(id)).slice(0, 100)

    const candidatas = (colunas: string, contar = false) => {
      let consulta = supabase
        .from('files').select(colunas, contar ? { count: 'exact', head: true } : undefined)
        .eq('workspace_id', workspaceId).neq('status', 'deleted').eq('file_type', 'foto')
        .is('otimizado_em', null).not('storage_path', 'is', null)
        .in('content_type', [...TIPOS_OTIMIZAVEIS]).lte('size_bytes', TETO_PARA_OTIMIZAR)
      if (ignorar.length) consulta = consulta.not('id', 'in', `(${ignorar.join(',')})`)
      return consulta
    }

    const { data, error } = await candidatas('id,name,content_type,storage_path,size_bytes,tags')
      .order('size_bytes', { ascending: false }).limit(FOTOS_POR_RODADA)
    if (error) throw new Error('Não foi possível listar as fotos a otimizar.')
    const lista = (data ?? []) as unknown as { id: string; name: string; content_type: string; storage_path: string; size_bytes: number | null; tags: string[] | null }[]

    const inicio = Date.now()
    const falhas: string[] = []
    let processados = 0
    let antes = 0
    let depois = 0
    for (const arquivo of lista) {
      if (Date.now() - inicio > TEMPO_DA_RODADA_MS) break
      try {
        const caminho = arquivo.storage_path
        if (!caminho.startsWith(`workspaces/${workspaceId}/library/`)) throw new Error('caminho fora da Biblioteca do espaço')
        const baixado = await get(caminho, { access: 'private' })
        if (!baixado || baixado.statusCode !== 200) throw new Error('não está no armazenamento')
        const entrada = Buffer.from(await new Response(baixado.stream).arrayBuffer())
        const tipoNoBlob = baixado.blob.contentType || arquivo.content_type
        // Imagem da IA e PNG costumam ser arte com texto: qualidade maior, sem borrar o vermelho.
        const arte = (arquivo.tags ?? []).includes(ETIQUETA_DE_IA) || tipoNoBlob === 'image/png'
        const imagem = await otimizarImagem(entrada, tipoNoBlob, arte ? 'arte' : 'padrao')
        const agora = new Date().toISOString()

        if (imagem.mudou) {
          // ifMatch: se alguém regravou o arquivo no meio do caminho, não passa por cima.
          await put(caminho, imagem.bytes, {
            access: 'private', contentType: imagem.tipo, addRandomSuffix: false, allowOverwrite: true, ifMatch: baixado.blob.etag,
          })
          const { data: gravada, error: erroNoBanco } = await supabase.from('files').update({
            size_bytes: imagem.bytes.length,
            content_type: imagem.tipo,
            name: nomeFinal(arquivo.name, imagem),
            otimizado_em: agora,
            tamanho_original: entrada.length,
          }).eq('id', arquivo.id).eq('workspace_id', workspaceId).select('id')
          if (erroNoBanco || !gravada?.length) throw new Error(`o arquivo foi regravado, mas o registro não: ${erroNoBanco?.message ?? 'nenhuma linha'}`)
          antes += entrada.length
          depois += imagem.bytes.length
        } else {
          // Já estava leve (ou é animada): marca para não voltar à fila. Linha
          // nenhuma atualizada sem erro (RLS) a deixaria na fila para sempre: vira falha.
          // O registro passa a dizer o que o Blob tem de fato — corrige uma
          // rodada anterior que regravou o arquivo e não conseguiu atualizar a linha.
          const tamanho = entrada.length
          const { data: marcada, error: erroNoBanco } = await supabase.from('files')
            .update({
              otimizado_em: agora, tamanho_original: tamanho, size_bytes: tamanho, content_type: tipoNoBlob,
              ...(tipoNoBlob !== arquivo.content_type && EXTENSAO_DO_TIPO[tipoNoBlob] ? { name: trocarExtensao(arquivo.name, EXTENSAO_DO_TIPO[tipoNoBlob]) } : {}),
            })
            .eq('id', arquivo.id).eq('workspace_id', workspaceId).select('id')
          if (erroNoBanco || !marcada?.length) throw new Error(erroNoBanco?.message ?? 'nenhuma linha atualizada')
          antes += tamanho
          depois += tamanho
        }
        processados++
      } catch (causa) {
        console.error('[biblioteca] não foi possível otimizar a foto antiga', arquivo.id, causa)
        falhas.push(arquivo.id)
      }
    }

    // O que falta, fora as que falharam (senão a tela pediria a mesma foto para sempre).
    const { count } = await candidatas('id', true)
    const restantes = Math.max(0, (count ?? 0) - falhas.length)

    if (processados) {
      await supabase.from('activity_log').insert({
        workspace_id: workspaceId,
        actor_id: context.user.id,
        action: 'fotos_antigas_otimizadas',
        entity_type: 'file',
        metadata: { processados, antes, depois, falhas: falhas.length },
      })
      revalidatePath('/biblioteca')
    }
    return { processados, restantes, antes, depois, falhas }
  } catch (causa) {
    return { ...nada, erro: mensagemDoErro(causa, 'Não foi possível otimizar as fotos antigas.') }
  }
}
