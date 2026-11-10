'use server'

import { revalidatePath } from 'next/cache'
import { requireWorkspace } from '@/lib/session'
import { pode } from '@/lib/permissoes'
import { mensagemDoErro } from '@/lib/erro-de-acao'
import { createAdminClient } from '@/lib/supabase/admin'
import { comoRelevancia, comoTipoDeVeiculo, lerPraca, limparNome } from '@/lib/imprensa/vocabulario'

/**
 * O cadastro de veículos da Imprensa (press_veiculos).
 *
 * A tabela só aceita escrita do servidor: cada ação confere o espaço e grava
 * com a chave de serviço, sempre filtrando por workspace_id. Criar e editar é
 * de todo membro, como os contatos; juntar e apagar é de administradores e
 * editores (imprensa.organizar). Quem liga contato e veículo é o banco: o
 * contato acha ou cria o veículo pelo nome, e renomear aqui renomeia lá
 * (migração cvrj_veiculos_e_listas).
 */

const texto = (form: FormData, chave: string) => String(form.get(chave) ?? '').trim()
const comoErro = (causa: unknown, padrao: string): { erro: string } => ({ erro: mensagemDoErro(causa, padrao) })
const ehId = (valor: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(valor)

/** "https://www.oglobo.globo.com/rio" → "oglobo.globo.com". */
function limparDominio(bruto: string): string {
  return bruto.toLowerCase().replace(/^https?:\/\//, '').replace(/^www\./, '').replace(/[/?#].*$/, '').replace(/\s+/g, '').slice(0, 200)
}

const NOME_REPETIDO = 'Já existe um veículo com este nome. Para unir os dois, use “Juntar a outro veículo ou apagar”.'

/** Cria um veículo ou salva as mudanças de um que existe (quando vem o id). */
export async function salvarVeiculo(formData: FormData): Promise<{ erro?: string; id?: string }> {
  try {
    const context = await requireWorkspace()
    const id = texto(formData, 'id')
    const nome = limparNome(texto(formData, 'nome'))
    if (!nome) throw new Error('Informe o nome do veículo.')

    const linha = {
      nome,
      tipo: comoTipoDeVeiculo(texto(formData, 'tipo')),
      praca: lerPraca(texto(formData, 'praca')),
      dominio: limparDominio(texto(formData, 'dominio')),
      relevancia: comoRelevancia(texto(formData, 'relevancia')),
      notas: texto(formData, 'notas').slice(0, 4000),
    }
    const admin = createAdminClient()

    if (id) {
      if (!ehId(id)) throw new Error('Veículo não informado.')
      const { data, error } = await admin.from('press_veiculos').update(linha)
        .eq('id', id).eq('workspace_id', context.workspace.id).select('id')
      if (error) throw new Error(error.code === '23505' ? NOME_REPETIDO : 'Não foi possível salvar o veículo.')
      if (!data?.length) throw new Error('Este veículo não existe mais.')
      revalidatePath('/imprensa')
      return { id }
    }

    const { data, error } = await admin.from('press_veiculos')
      .insert({ ...linha, workspace_id: context.workspace.id, created_by: context.user.id })
      .select('id').single()
    if (error || !data) throw new Error(error?.code === '23505' ? 'Já existe um veículo com este nome.' : 'Não foi possível salvar o veículo.')
    revalidatePath('/imprensa')
    return { id: data.id }
  } catch (causa) {
    return comoErro(causa, 'Não foi possível salvar o veículo.')
  }
}

/**
 * Junta dois veículos que são o mesmo ("Globo" e "O Globo"): os contatos do
 * primeiro passam para o segundo, e o primeiro some. O texto do veículo em
 * cada contato acompanha, pelo gatilho do banco.
 */
export async function juntarVeiculos(formData: FormData): Promise<{ erro?: string; movidos?: number }> {
  try {
    const context = await requireWorkspace()
    if (!pode(context.role, 'imprensa.organizar')) throw new Error('Juntar veículos é para administradores e editores.')
    const origem = texto(formData, 'origem')
    const destino = texto(formData, 'destino')
    if (!ehId(origem) || !ehId(destino)) throw new Error('Escolha o veículo que fica.')
    if (origem === destino) throw new Error('Escolha outro veículo: este é o mesmo.')

    const admin = createAdminClient()
    const workspaceId = context.workspace.id
    const { data: dois } = await admin.from('press_veiculos').select('id, nome')
      .eq('workspace_id', workspaceId).in('id', [origem, destino])
    const some = dois?.find((v) => v.id === origem)
    const fica = dois?.find((v) => v.id === destino)
    if (!some || !fica) throw new Error('Um dos veículos não existe mais. Atualize a página.')

    const { count, error } = await admin.from('press_contacts').update({ veiculo_id: destino }, { count: 'exact' })
      .eq('workspace_id', workspaceId).eq('veiculo_id', origem)
    if (error) throw new Error('Não foi possível mudar os contatos de veículo.')

    const { error: erroAoApagar } = await admin.from('press_veiculos').delete().eq('id', origem).eq('workspace_id', workspaceId)
    if (erroAoApagar) {
      // Os contatos já mudaram de veículo: a tela precisa reler antes de oferecer o "Apagar veículo".
      revalidatePath('/imprensa')
      throw new Error(`Os contatos passaram para ${fica.nome}, mas ${some.nome} não pôde ser apagado. Atualize a página e apague-o em “Juntar a outro veículo ou apagar”.`)
    }

    await admin.from('activity_log').insert({
      workspace_id: workspaceId,
      actor_id: context.user.id,
      action: 'veiculos_juntados',
      entity_type: 'press_veiculos',
      entity_id: destino,
      metadata: { de: some.nome, para: fica.nome, contatos: count ?? 0 },
    })
    revalidatePath('/imprensa')
    return { movidos: count ?? 0 }
  } catch (causa) {
    return comoErro(causa, 'Não foi possível juntar os veículos.')
  }
}

/** Apaga um veículo sem contatos. Com contatos, o caminho é juntar a outro. */
export async function excluirVeiculo(formData: FormData): Promise<{ erro?: string }> {
  try {
    const context = await requireWorkspace()
    if (!pode(context.role, 'imprensa.organizar')) throw new Error('Apagar veículo é para administradores e editores.')
    const id = texto(formData, 'id')
    if (!ehId(id)) throw new Error('Veículo não informado.')

    const admin = createAdminClient()
    const workspaceId = context.workspace.id
    const COM_CONTATOS = 'Este veículo ainda tem contatos. Junte-o a outro veículo, ou troque o veículo dos contatos, antes de apagar.'
    const { count } = await admin.from('press_contacts').select('id', { count: 'exact', head: true })
      .eq('workspace_id', workspaceId).eq('veiculo_id', id)
    if (count) throw new Error(COM_CONTATOS)

    const { data, error } = await admin.from('press_veiculos').delete()
      .eq('id', id).eq('workspace_id', workspaceId).select('nome')
    // 23503: alguém ligou um contato a ele entre a contagem e o delete.
    if (error) throw new Error(error.code === '23503' ? COM_CONTATOS : 'Não foi possível apagar o veículo.')
    if (!data?.length) throw new Error('Este veículo não existe mais.')

    await admin.from('activity_log').insert({
      workspace_id: workspaceId,
      actor_id: context.user.id,
      action: 'veiculo_apagado',
      entity_type: 'press_veiculos',
      metadata: { nome: data[0].nome },
    })
    revalidatePath('/imprensa')
    return {}
  } catch (causa) {
    return comoErro(causa, 'Não foi possível apagar o veículo.')
  }
}
