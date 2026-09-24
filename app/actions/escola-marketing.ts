'use server'

import { randomUUID } from 'node:crypto'
import { after } from 'next/server'
import { revalidatePath } from 'next/cache'
import { mensagemDoErro } from '@/lib/erro-de-acao'
import { createAdminClient } from '@/lib/supabase/admin'
import { conteudoConfere } from '@/lib/rh/regras'
import { BUCKET_DO_MARKETING, contextoDoMarketing } from '@/lib/escola/marketing-servidor'
import { lerFormularioDaCampanha, lerFormularioDaPeca } from '@/lib/escola/marketing'
import { lerActId } from '@/lib/escola/meta'
import { linkDoBotao, modeloDoTexto } from '@/lib/escola/advertoriais'
import { urlBase } from '@/lib/newsletter/contexto'
import { sincronizarMetaDoEspaco, testarMeta } from '@/lib/escola/meta-servidor'
import { obterChave } from '@/lib/integracoes/chaves'

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
  for (const c of ['/escola/marketing', '/escola/marketing/biblioteca', '/escola/marketing/advertoriais']) revalidatePath(c)
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

// ---------------------------------------------------------------- Meta Ads

/**
 * Liga (ou muda) a conta de anúncios do Meta. O token do usuário do sistema
 * é testado contra a conta antes de ir para o cofre; sem token novo, testa
 * com o que já está guardado.
 */
export async function ligarMeta(id: string | null, _anterior: Estado & { recado?: string }, formData: FormData): Promise<Estado & { recado?: string }> {
  try {
    const { context, supabase, nivel } = await contextoDoMarketing()
    if (nivel < 3) throw new Error('Só um admin liga a conta de anúncios.')
    const act = lerActId(String(formData.get('act_id') ?? ''))
    if (!act) throw new Error('O ID da conta de anúncios é um número (ex.: act_1234567890). Ele aparece no Gerenciador de Anúncios, ao lado do nome da conta.')
    const token = String(formData.get('token') ?? '').trim()
    if (token && (token.length < 40 || /\s/.test(token))) throw new Error('O token parece incompleto. Cole o token inteiro, sem espaços.')
    const usar = token || (await obterChave(context.workspace.id, 'meta_ads'))
    if (!usar) throw new Error('Cole o token do usuário do sistema (com a permissão ads_read).')
    const teste = await testarMeta(usar, act)
    if ('erro' in teste) throw new Error(teste.erro)
    const filtro = String(formData.get('filtro') ?? '').trim().slice(0, 80)
    const p: Record<string, unknown> = { act_id: act, nome: teste.nome, filtro }
    if (id) { p.id = id; p.ativa = formData.get('ativa') !== 'nao' }
    const { data: contaId, error } = await supabase.rpc('escola_meta_salvar_conta', { p_workspace_id: context.workspace.id, p })
    if (error || !contaId) erroDoBanco(error, 'Não foi possível ligar a conta.')
    if (token) {
      const { error: e2 } = await supabase.rpc('definir_chave_de_integracao', { p_workspace_id: context.workspace.id, p_servico: 'meta_ads', p_valor: token })
      if (e2) throw new Error('A conta foi ligada, mas não foi possível guardar o token no cofre. Tente de novo.')
      await createAdminClient().from('activity_log').insert({ workspace_id: context.workspace.id, actor_id: context.user.id, action: 'integracao_chave_definida', entity_type: 'integracao', metadata: { servico: 'meta_ads' } })
    }
    after(() => sincronizarMetaDoEspaco(context.workspace.id, contaId as string).then(() => undefined))
    revalidar()
    revalidatePath('/configuracoes')
    return { ok: Date.now(), recado: `Conta "${teste.nome}" ligada. Os anúncios estão sendo lidos — atualize a página em um minuto.` }
  } catch (causa) {
    return { erro: mensagemDoErro(causa, 'Não foi possível ligar a conta de anúncios.') }
  }
}

export async function desligarMeta(id: string): Promise<Estado> {
  try {
    const { context, supabase, nivel } = await contextoDoMarketing()
    if (nivel < 3) throw new Error('Só um admin desliga a conta de anúncios.')
    const { error } = await supabase.rpc('escola_meta_excluir_conta', { p_workspace_id: context.workspace.id, p_id: id })
    if (error) erroDoBanco(error, 'Não foi possível desligar.')
    revalidar()
    return { ok: Date.now() }
  } catch (causa) {
    return { erro: mensagemDoErro(causa, 'Não foi possível desligar.') }
  }
}

/** "Atualizar do Meta": relê campanhas, anúncios e números agora (o cron faz isso uma vez por dia). */
export async function atualizarMetaAgora(): Promise<{ erro?: string; recado?: string }> {
  try {
    const { context, nivel } = await contextoDoMarketing()
    if (nivel < 2) throw new Error('Você não tem acesso ao marketing da escola.')
    const r = await sincronizarMetaDoEspaco(context.workspace.id)
    revalidar()
    if (!r.length) return { recado: 'Nenhuma conta de anúncios ligada.' }
    const falhas = r.filter((x) => !x.ok)
    if (falhas.length) return { erro: falhas.map((f) => `${f.conta}: ${f.mensagem}`).join(' ') }
    return { recado: r.map((x) => x.mensagem).join(' ') }
  } catch (causa) {
    return { erro: mensagemDoErro(causa, 'Não foi possível ler o Meta.') }
  }
}

// ---------------------------------------------------------------- advertoriais

/**
 * Novo advertorial: a matéria nasce em rascunho, já com a estrutura do texto
 * e o botão de matrícula rastreado no lugar, e a pessoa segue para o editor
 * de sempre — de lá, publica como qualquer notícia.
 */
export async function criarAdvertorial(_anterior: Estado, formData: FormData): Promise<Estado & { contentId?: string }> {
  try {
    const { context, supabase, nivel } = await contextoDoMarketing()
    if (nivel < 2) throw new Error('Você não tem acesso ao marketing da escola.')
    const t = (k: string, max: number) => String(formData.get(k) ?? '').trim().slice(0, max)
    const titulo = t('titulo', 160), destino = t('destino_url', 800), campanha = t('campanha_id', 40)
    if (titulo.length < 5) throw new Error('Dê um título ao advertorial (a manchete da matéria).')
    if (!/^https:\/\/\S+$/.test(destino)) throw new Error('Informe para onde o botão de matrícula leva (endereço com https://).')
    const { data, error } = await supabase.rpc('escola_adv_criar', {
      p_workspace_id: context.workspace.id,
      p: { titulo, destino_url: destino, angulo: t('angulo', 60), campanha_id: /^[0-9a-f-]{36}$/.test(campanha) ? campanha : '' },
    })
    if (error || !data) erroDoBanco(error, 'Não foi possível criar o advertorial.')
    const { peca_id: pecaId, content_id: contentId } = data as { peca_id: string; content_id: string }
    const curso = campanha ? ((await supabase.from('escola_campanhas').select('curso').eq('id', campanha).maybeSingle()).data?.curso as string | null) : null
    await createAdminClient().from('content_pieces').update({ body: modeloDoTexto(linkDoBotao(urlBase(), pecaId), curso ?? null) })
      .eq('id', contentId).eq('workspace_id', context.workspace.id)
    revalidar()
    revalidatePath('/escola/marketing/advertoriais')
    return { ok: Date.now(), id: pecaId, contentId }
  } catch (causa) {
    return { erro: mensagemDoErro(causa, 'Não foi possível criar o advertorial.') }
  }
}

export async function salvarAdvertorial(pecaId: string, _anterior: Estado, formData: FormData): Promise<Estado> {
  try {
    const { context, supabase, nivel } = await contextoDoMarketing()
    if (nivel < 2) throw new Error('Você não tem acesso ao marketing da escola.')
    const t = (k: string, max: number) => String(formData.get(k) ?? '').trim().slice(0, max)
    const destino = t('destino_url', 800), campanha = t('campanha_id', 40), status = t('status', 20)
    if (!/^https:\/\/\S+$/.test(destino)) throw new Error('Informe para onde o botão de matrícula leva (endereço com https://).')
    const { error } = await supabase.rpc('escola_adv_salvar', {
      p_workspace_id: context.workspace.id, p_peca_id: pecaId,
      p: { destino_url: destino, campanha_id: /^[0-9a-f-]{36}$/.test(campanha) ? campanha : '', angulo: t('angulo', 60), nota: t('nota', 2000),
        status: ['rascunho', 'no_ar', 'pausada', 'encerrada'].includes(status) ? status : '', vencedora: formData.get('vencedora') === 'sim' },
    })
    if (error) erroDoBanco(error, 'Não foi possível salvar o advertorial.')
    revalidar()
    revalidatePath('/escola/marketing/advertoriais')
    return { ok: Date.now() }
  } catch (causa) {
    return { erro: mensagemDoErro(causa, 'Não foi possível salvar o advertorial.') }
  }
}
