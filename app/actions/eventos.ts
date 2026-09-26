'use server'

import { revalidatePath } from 'next/cache'
import { requireWorkspace } from '@/lib/session'
import { createAdminClient } from '@/lib/supabase/admin'
import { mensagemDoErro } from '@/lib/erro-de-acao'
import { avaliaEnvios } from '@/lib/envios/servidor'
import { lerEvento } from '@/lib/envios/album'
import { novoCodigo, novoTokenDoAlbum } from '@/lib/envios/eventos'

/**
 * O Álbum do evento (docs/envio-de-acoes.md §9): criar o evento, ligar e
 * desligar o link do álbum e o de envio, juntar envios e esconder fotos. Só
 * quem avalia os envios (decisão de 26/09/2026); a tabela não aceita escrita
 * direta, e tudo filtra pelo espaço de quem está logado.
 */

type Resultado = { erro?: string; id?: string }
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/

async function contexto() {
  const context = await requireWorkspace()
  if (!(await avaliaEnvios(context.user.id, context.workspace.id))) throw new Error('Só quem avalia os envios da equipe pode fazer isso.')
  return { context, admin: createAdminClient() }
}

async function eventoDoEspaco(admin: ReturnType<typeof createAdminClient>, id: string, workspaceId: string) {
  if (!UUID.test(id)) throw new Error('Evento não encontrado.')
  const { data } = await admin.from('envio_eventos').select('id, album_token').eq('id', id).eq('workspace_id', workspaceId).maybeSingle()
  if (!data) throw new Error('Evento não encontrado.')
  return data as { id: string; album_token: string | null }
}

const revalidar = (id?: string) => { revalidatePath('/envios'); revalidatePath('/envios/eventos'); if (id) revalidatePath(`/envios/eventos/${id}`) }

/** Cria o evento já com o link de envio e o do álbum ligados. */
export async function criarEvento(formData: FormData): Promise<Resultado> {
  try {
    const { context, admin } = await contexto()
    const { dados, erro } = lerEvento({ nome: formData.get('nome'), data: formData.get('data'), local: formData.get('local') })
    if (!dados) throw new Error(erro)
    // Código repetido é quase impossível (32^10); se acontecer, tenta de novo uma vez.
    for (let tentativa = 0; tentativa < 2; tentativa++) {
      const { data, error } = await admin.from('envio_eventos').insert({
        ...dados, workspace_id: context.workspace.id, codigo: novoCodigo(), album_token: novoTokenDoAlbum(), criado_por: context.user.id,
      }).select('id').single()
      if (!error && data) { revalidar(); return { id: data.id } }
      if (error?.code !== '23505') throw new Error('Não foi possível criar o evento.')
    }
    throw new Error('Não foi possível criar o evento. Tente de novo.')
  } catch (causa) {
    return { erro: mensagemDoErro(causa, 'Não foi possível criar o evento.') }
  }
}

export async function salvarEvento(id: string, formData: FormData): Promise<Resultado> {
  try {
    const { context, admin } = await contexto()
    const evento = await eventoDoEspaco(admin, id, context.workspace.id)
    const { dados, erro } = lerEvento({ nome: formData.get('nome'), data: formData.get('data'), local: formData.get('local') })
    if (!dados) throw new Error(erro)
    await admin.from('envio_eventos').update(dados).eq('id', evento.id)
    revalidar(evento.id)
    return {}
  } catch (causa) {
    return { erro: mensagemDoErro(causa, 'Não foi possível salvar o evento.') }
  }
}

/** Liga (com um link novo) ou desliga o álbum. Desligar derruba o link na hora; religar cria outro. */
export async function alternarAlbum(id: string, ligado: boolean): Promise<Resultado> {
  try {
    const { context, admin } = await contexto()
    const evento = await eventoDoEspaco(admin, id, context.workspace.id)
    await admin.from('envio_eventos').update({ album_token: ligado ? novoTokenDoAlbum() : null }).eq('id', evento.id)
    revalidar(evento.id)
    return {}
  } catch (causa) {
    return { erro: mensagemDoErro(causa, 'Não foi possível mudar o link do álbum.') }
  }
}

/** Abre ou encerra o link de envio do evento (o álbum continua como está). */
export async function alternarEnvioDoEvento(id: string, aberto: boolean): Promise<Resultado> {
  try {
    const { context, admin } = await contexto()
    const evento = await eventoDoEspaco(admin, id, context.workspace.id)
    await admin.from('envio_eventos').update({ envio_aberto: aberto }).eq('id', evento.id)
    revalidar(evento.id)
    return {}
  } catch (causa) {
    return { erro: mensagemDoErro(causa, 'Não foi possível mudar o link de envio.') }
  }
}

/** Junta um envio a um evento (ou tira, com eventoId vazio). */
export async function definirEventoDoEnvio(envioId: string, eventoId: string): Promise<Resultado> {
  try {
    const { context, admin } = await contexto()
    if (!UUID.test(envioId)) throw new Error('Envio não encontrado.')
    const evento = eventoId ? await eventoDoEspaco(admin, eventoId, context.workspace.id) : null
    const { data, error } = await admin.from('envios').update({ evento_id: evento?.id ?? null })
      .eq('id', envioId).eq('workspace_id', context.workspace.id).select('id').maybeSingle()
    if (error || !data) throw new Error('Envio não encontrado.')
    revalidar(evento?.id); revalidatePath(`/envios/${envioId}`)
    return {}
  } catch (causa) {
    return { erro: mensagemDoErro(causa, 'Não foi possível mudar o evento do envio.') }
  }
}

/** Esconde (ou mostra de novo) uma foto no álbum. Não apaga nem tira do envio. */
export async function esconderDoAlbum(arquivoId: string, oculto: boolean): Promise<Resultado> {
  try {
    const { context, admin } = await contexto()
    if (!UUID.test(arquivoId)) throw new Error('Arquivo não encontrado.')
    const { data, error } = await admin.from('envio_arquivos').update({ oculto_no_album: oculto === true })
      .eq('id', arquivoId).eq('workspace_id', context.workspace.id).select('id').maybeSingle()
    if (error || !data) throw new Error('Arquivo não encontrado.')
    return {}
  } catch (causa) {
    return { erro: mensagemDoErro(causa, 'Não foi possível mudar a foto.') }
  }
}
