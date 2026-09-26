'use server'

import { randomUUID } from 'node:crypto'
import { revalidatePath } from 'next/cache'
import { mensagemDoErro } from '@/lib/erro-de-acao'
import { contextoDeParticipantes } from '@/lib/participantes/acesso'
import { createAdminClient } from '@/lib/supabase/admin'
import { TAMANHO_MAXIMO, TIPOS_DE_IMAGEM, caminhoValido, lerLink } from '@/lib/banners/regras'

/**
 * Banners do Início da Área do Voluntário — o lado da equipe. Escrita direto
 * na tabela, sob as políticas do nível do Voluntariado (gerenciar); o banco
 * confere de novo. A imagem sobe por link de envio de uso único, como as
 * capas dos cursos.
 */

type Resultado = { erro?: string }

async function gerente() {
  const c = await contextoDeParticipantes()
  if (c.nivel < 2) throw new Error('Você não tem acesso para editar os banners.')
  return c
}

function erroDoBanco(error: { message?: string; code?: string } | null, padrao: string): never {
  if (error?.code === '23514') throw new Error('Algum campo está fora do formato permitido.')
  if (error?.code === '42501') throw new Error('Você não tem acesso para esta alteração.')
  throw new Error(padrao)
}

function revalidar() {
  revalidatePath('/voluntariado/banners')
  revalidatePath('/membro', 'layout')
}

const apagarImagem = (caminho: string) => createAdminClient().storage.from('membro-banners').remove([caminho]).then(() => undefined, () => undefined)

/** Link de envio de uso único para o bucket público dos banners. */
export async function prepararEnvioDeBanner(tipo: string, tamanho: number): Promise<Resultado & { caminho?: string; token?: string }> {
  try {
    const { context } = await gerente()
    if (!Object.hasOwn(TIPOS_DE_IMAGEM, tipo)) throw new Error('Envie JPG, PNG ou WEBP.')
    if (!(tamanho > 0 && tamanho <= TAMANHO_MAXIMO)) throw new Error('A imagem pode ter até 5 MB.')
    const caminho = `${context.workspace.id}/${randomUUID()}.${TIPOS_DE_IMAGEM[tipo as keyof typeof TIPOS_DE_IMAGEM]}`
    const { data, error } = await createAdminClient().storage.from('membro-banners').createSignedUploadUrl(caminho)
    if (error || !data) throw new Error('Não foi possível preparar o envio.')
    return { caminho, token: data.token }
  } catch (causa) {
    return { erro: mensagemDoErro(causa, 'Não foi possível preparar o envio.') }
  }
}

const DATA = /^\d{4}-\d{2}-\d{2}$/

export async function salvarBanner(id: string | null, _anterior: Resultado & { ok?: number }, formData: FormData): Promise<Resultado & { ok?: number }> {
  try {
    const { context, supabase } = await gerente()
    const ws = context.workspace.id
    const titulo = String(formData.get('titulo') ?? '').trim().slice(0, 80)
    const texto = String(formData.get('texto') ?? '').trim().slice(0, 200)
    const imagem = String(formData.get('imagem_caminho') ?? '')
    const link = lerLink(String(formData.get('link_url') ?? ''))
    const rotulo = String(formData.get('link_rotulo') ?? '').trim().slice(0, 30)
    const inicio = String(formData.get('inicio') ?? '')
    const fim = String(formData.get('fim') ?? '')
    const ordem = Number(formData.get('ordem') ?? 0)
    if (titulo.length < 3) throw new Error('Dê um título ao banner.')
    if (!imagem) throw new Error('Envie a imagem do banner.')
    if (!caminhoValido(imagem, ws)) throw new Error('Imagem inválida. Envie de novo.')
    if (link.erro) throw new Error(link.erro)
    if (link.url && rotulo.length < 2) throw new Error('Escreva o texto do botão (ex.: “Saiba mais”).')
    if ((inicio && !DATA.test(inicio)) || (fim && !DATA.test(fim))) throw new Error('Data inválida.')
    if (inicio && fim && fim < inicio) throw new Error('O fim precisa ser depois do início.')
    if (!Number.isInteger(ordem) || ordem < 0 || ordem > 99) throw new Error('A ordem vai de 0 a 99.')
    const dados = {
      titulo, texto: texto || null, imagem_caminho: imagem,
      link_url: link.url, link_rotulo: link.url ? rotulo : null,
      inicio: inicio || null, fim: fim || null, ordem,
      ativo: formData.get('ativo') === 'sim',
      updated_at: new Date().toISOString(),
    }
    if (id) {
      const { data: antes } = await supabase.from('membro_banners').select('imagem_caminho').eq('id', id).eq('workspace_id', ws).maybeSingle()
      if (!antes) throw new Error('Banner não encontrado.')
      const { error } = await supabase.from('membro_banners').update(dados).eq('id', id).eq('workspace_id', ws)
      if (error) erroDoBanco(error, 'Não foi possível salvar o banner.')
      if (antes.imagem_caminho !== imagem) await apagarImagem(antes.imagem_caminho as string)
    } else {
      const { error } = await supabase.from('membro_banners').insert({ ...dados, workspace_id: ws, criado_por: context.user.id })
      if (error) erroDoBanco(error, 'Não foi possível salvar o banner.')
    }
    revalidar()
    return { ok: Date.now() }
  } catch (causa) {
    return { erro: mensagemDoErro(causa, 'Não foi possível salvar o banner.') }
  }
}

export async function ligarBanner(id: string, ativo: boolean): Promise<Resultado> {
  try {
    const { context, supabase } = await gerente()
    const { error } = await supabase.from('membro_banners').update({ ativo, updated_at: new Date().toISOString() }).eq('id', id).eq('workspace_id', context.workspace.id)
    if (error) erroDoBanco(error, 'Não foi possível atualizar.')
    revalidar()
    return {}
  } catch (causa) {
    return { erro: mensagemDoErro(causa, 'Não foi possível atualizar.') }
  }
}

export async function excluirBanner(id: string): Promise<Resultado> {
  try {
    const { context, supabase } = await gerente()
    const { data: b } = await supabase.from('membro_banners').select('imagem_caminho').eq('id', id).eq('workspace_id', context.workspace.id).maybeSingle()
    if (!b) throw new Error('Banner não encontrado.')
    const { error } = await supabase.from('membro_banners').delete().eq('id', id).eq('workspace_id', context.workspace.id)
    if (error) erroDoBanco(error, 'Não foi possível excluir.')
    await apagarImagem(b.imagem_caminho as string)
    revalidar()
    return {}
  } catch (causa) {
    return { erro: mensagemDoErro(causa, 'Não foi possível excluir.') }
  }
}
