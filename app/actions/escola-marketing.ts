'use server'

import { randomUUID } from 'node:crypto'
import { revalidatePath } from 'next/cache'
import { mensagemDoErro } from '@/lib/erro-de-acao'
import { createAdminClient } from '@/lib/supabase/admin'
import { conteudoConfere } from '@/lib/rh/regras'
import { BUCKET_DO_MARKETING, contextoDoMarketing } from '@/lib/escola/marketing-servidor'
import { lerFormularioDaCampanha, lerFormularioDaPeca } from '@/lib/escola/marketing'

/**
 * Marketing da escola: campanhas, peças (e referências) e a imagem de cada
 * peça. O banco confere o nível de novo (escola_mkt_*); aqui a leitura do
 * formulário dá a mensagem certa antes.
 */

type Estado = { erro?: string; ok?: number; id?: string }

const TIPOS_DE_IMAGEM: Record<string, string> = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' }
const TAMANHO_MAXIMO = 10 * 1024 * 1024

const erroDoBanco = (error: { code?: string; message?: string } | null, padrao: string) => {
  throw new Error(error?.code === 'P0001' && error.message ? error.message : padrao)
}
const revalidar = (campanhaId?: string | null) => {
  for (const c of ['/escola/marketing', '/escola/marketing/biblioteca']) revalidatePath(c)
  if (campanhaId) revalidatePath(`/escola/marketing/${campanhaId}`)
}

export async function salvarCampanha(id: string | null, _anterior: Estado, formData: FormData): Promise<Estado> {
  try {
    const { context, supabase, nivel } = await contextoDoMarketing()
    if (nivel < 2) throw new Error('Você não tem acesso ao marketing da escola.')
    const { dados, erro } = lerFormularioDaCampanha(formData)
    if (!dados) throw new Error(erro)
    const { data, error } = await supabase.rpc('escola_mkt_salvar_campanha', { p_workspace_id: context.workspace.id, p: id ? { ...dados, id } : dados })
    if (error || !data) erroDoBanco(error, 'Não foi possível salvar a campanha.')
    revalidar(data as string)
    return { ok: Date.now(), id: data as string }
  } catch (causa) {
    return { erro: mensagemDoErro(causa, 'Não foi possível salvar a campanha.') }
  }
}

export async function salvarPeca(id: string | null, _anterior: Estado, formData: FormData): Promise<Estado> {
  try {
    const { context, supabase, nivel } = await contextoDoMarketing()
    if (nivel < 2) throw new Error('Você não tem acesso ao marketing da escola.')
    const { dados, erro } = lerFormularioDaPeca(formData)
    if (!dados) throw new Error(erro)
    const { data, error } = await supabase.rpc('escola_mkt_salvar_peca', { p_workspace_id: context.workspace.id, p: id ? { ...dados, id } : dados })
    if (error || !data) erroDoBanco(error, 'Não foi possível salvar a peça.')
    revalidar(dados.campanha_id as string)
    return { ok: Date.now(), id: data as string }
  } catch (causa) {
    return { erro: mensagemDoErro(causa, 'Não foi possível salvar a peça.') }
  }
}

export async function excluirDoMarketing(tipo: 'campanha' | 'peca', id: string): Promise<Estado> {
  try {
    const { context, supabase } = await contextoDoMarketing()
    const { data, error } = await supabase.rpc('escola_mkt_excluir', { p_workspace_id: context.workspace.id, p_tipo: tipo, p_id: id })
    if (error) erroDoBanco(error, 'Não foi possível excluir.')
    const imagens = (data ?? []) as string[]
    if (imagens.length) await createAdminClient().storage.from(BUCKET_DO_MARKETING).remove(imagens).catch(() => undefined)
    revalidar(tipo === 'campanha' ? id : null)
    return { ok: Date.now() }
  } catch (causa) {
    return { erro: mensagemDoErro(causa, 'Não foi possível excluir.') }
  }
}

/** Primeiro passo da imagem: link de envio de uso único, direto do navegador ao Storage. */
export async function prepararImagem(pecaId: string, tipo: string, tamanho: number): Promise<Estado & { caminho?: string; token?: string }> {
  try {
    const { context, supabase, nivel } = await contextoDoMarketing()
    if (nivel < 2) throw new Error('Você não tem acesso ao marketing da escola.')
    if (!TIPOS_DE_IMAGEM[tipo]) throw new Error('Envie JPG, PNG ou WEBP.')
    if (!Number.isFinite(tamanho) || tamanho <= 0 || tamanho > TAMANHO_MAXIMO) throw new Error('A imagem pode ter até 10 MB.')
    const { data: p } = await supabase.from('escola_pecas').select('id').eq('id', pecaId).eq('workspace_id', context.workspace.id).maybeSingle()
    if (!p) throw new Error('Peça não encontrada.')
    const caminho = `${context.workspace.id}/${pecaId}/${randomUUID()}.${TIPOS_DE_IMAGEM[tipo]}`
    const { data, error } = await createAdminClient().storage.from(BUCKET_DO_MARKETING).createSignedUploadUrl(caminho)
    if (error || !data) throw new Error('Não foi possível preparar o envio.')
    return { caminho, token: data.token }
  } catch (causa) {
    return { erro: mensagemDoErro(causa, 'Não foi possível preparar o envio.') }
  }
}

/** Segundo passo: confere o conteúdo (não só a extensão), liga à peça e apaga a imagem antiga. */
export async function registrarImagem(pecaId: string, caminho: string, mime: string): Promise<Estado> {
  const admin = createAdminClient()
  try {
    const { context, supabase } = await contextoDoMarketing()
    if (!caminho.startsWith(`${context.workspace.id}/${pecaId}/`)) throw new Error('Caminho inválido.')
    const { data: blob, error: e1 } = await admin.storage.from(BUCKET_DO_MARKETING).download(caminho)
    const bytes = blob ? new Uint8Array(await blob.arrayBuffer()) : null
    if (e1 || !bytes || !conteudoConfere(mime, bytes)) {
      await admin.storage.from(BUCKET_DO_MARKETING).remove([caminho]).catch(() => undefined)
      throw new Error('O conteúdo do arquivo não é uma imagem JPG, PNG ou WEBP. Envie a imagem original.')
    }
    const { data: antigo, error } = await supabase.rpc('escola_mkt_imagem', { p_workspace_id: context.workspace.id, p_peca_id: pecaId, p_caminho: caminho })
    if (error) {
      await admin.storage.from(BUCKET_DO_MARKETING).remove([caminho]).catch(() => undefined)
      erroDoBanco(error, 'Não foi possível ligar a imagem.')
    }
    if (antigo) await admin.storage.from(BUCKET_DO_MARKETING).remove([String(antigo)]).catch(() => undefined)
    const { data: p } = await supabase.from('escola_pecas').select('campanha_id').eq('id', pecaId).maybeSingle()
    revalidar(p?.campanha_id as string | null)
    return { ok: Date.now() }
  } catch (causa) {
    return { erro: mensagemDoErro(causa, 'Não foi possível guardar a imagem.') }
  }
}

export async function removerImagem(pecaId: string): Promise<Estado> {
  try {
    const { context, supabase } = await contextoDoMarketing()
    const { data: antigo, error } = await supabase.rpc('escola_mkt_imagem', { p_workspace_id: context.workspace.id, p_peca_id: pecaId, p_caminho: null })
    if (error) erroDoBanco(error, 'Não foi possível tirar a imagem.')
    if (antigo) await createAdminClient().storage.from(BUCKET_DO_MARKETING).remove([String(antigo)]).catch(() => undefined)
    revalidar()
    return { ok: Date.now() }
  } catch (causa) {
    return { erro: mensagemDoErro(causa, 'Não foi possível tirar a imagem.') }
  }
}
