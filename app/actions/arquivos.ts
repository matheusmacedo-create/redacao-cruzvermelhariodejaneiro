'use server'

import { revalidatePath } from 'next/cache'
import { requireAdmin, requireWorkspace } from '@/lib/session'
import { mensagemDoErro } from '@/lib/erro-de-acao'
import { createClient } from '@/lib/supabase/server'

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
    const context = await requireAdmin()
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
