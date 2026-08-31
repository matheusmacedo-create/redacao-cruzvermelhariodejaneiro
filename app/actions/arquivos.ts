'use server'

import { revalidatePath } from 'next/cache'
import { requireWorkspace } from '@/lib/session'
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
 * O que NÃO tem conserto por aqui é o material de terceiro ('internal'):
 * aquilo não é falta de confirmação, é imagem de outra instituição. Serve de
 * referência na tela e não sai publicado em nome da Cruz Vermelha. Promover
 * isso a autorizado seria decisão de direito de imagem, e não cabe num botão.
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
