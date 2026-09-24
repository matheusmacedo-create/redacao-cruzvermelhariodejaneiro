'use server'

import { randomUUID } from 'node:crypto'
import { revalidatePath } from 'next/cache'
import { mensagemDoErro } from '@/lib/erro-de-acao'
import { requirePermissao } from '@/lib/session'
import { createAdminClient } from '@/lib/supabase/admin'
import { apagarObjeto, infoDoObjeto, listarPasta, sha256DoObjeto, urlAssinada, type PastaDoR2 } from '@/lib/armazenamento/r2'
import { bucketDoAcervo } from '@/lib/acervo/dados'
import { guardarNaColecao, lerItemDoAcervo, publicarNoSite, refazerPaginasDoItem, regerarAcervo, tirarDoSite } from '@/lib/acervo/publicacao'
import { ehColecao, lerItem, nomeSeguro, TAMANHO_MAXIMO, TAMANHO_PARA_SHA256, type Colecao } from '@/lib/acervo/regras'

/**
 * O acervo da filial (docs/acervo.md). Os arquivos vão do navegador direto ao bucket do acervo no
 * Cloudflare R2, por link de uso único, e caem na caixa de entrada (entrada/redacao/…); a ficha fica
 * no banco (acervo_itens). Publicar leva o arquivo para a pasta da coleção (com trava) e põe o item
 * em cruzvermelhariodejaneiro.org/acervo/.
 *
 * Ver e baixar: acervo.ver (toda a equipe). Enviar, catalogar, publicar e excluir: acervo.gerenciar.
 */

export type Resultado = { erro?: string; aviso?: string }
export type EnvioPreparado = { nome: string; chave: string; url: string }

const contexto = async (permissao: 'acervo.ver' | 'acervo.gerenciar') => {
  const c = await requirePermissao(permissao)
  return { workspaceId: c.workspace.id as string, ator: c.user.id as string, admin: createAdminClient() }
}

function r2() {
  const b = bucketDoAcervo()
  if (!b) throw new Error('O acervo no R2 não está configurado: faltam R2_BUCKET_ACERVO e as chaves do R2 na Vercel.')
  return b
}

/** Chave do bucket que veio da tela: sem barra no começo, sem "..", sem caractere de controle. */
function chaveValida(chave: unknown): string {
  const c = String(chave ?? '')
  if (!c || c.length > 1024 || c.startsWith('/') || /(^|\/)\.\.(\/|$)/.test(c) || /[\u0000-\u001f\u007f]/.test(c)) throw new Error('Arquivo inválido.')
  return c
}

/** "Curso_de-socorros 2019.jpg" → "Curso de socorros 2019". */
function tituloDoNome(nome: string): string {
  const base = nome.replace(/\.[a-z0-9]{1,10}$/i, '').replace(/[_-]+/g, ' ').replace(/\s+/g, ' ').trim()
  const titulo = base ? base[0].toUpperCase() + base.slice(1) : 'Arquivo sem título'
  return (titulo.length < 3 ? `Arquivo ${titulo}` : titulo).slice(0, 160)
}

async function criarFicha(admin: ReturnType<typeof createAdminClient>, workspaceId: string, ator: string, chave: string, nome: string, tipoInformado: string, colecao: Colecao) {
  const { config, bucket } = r2()
  const info = await infoDoObjeto(config, bucket, chave)
  if (!info) throw new Error('O arquivo não chegou ao acervo. Envie de novo.')
  const hash = info.tamanho <= TAMANHO_PARA_SHA256 ? await sha256DoObjeto(config, bucket, chave) : null
  const tipo = (info.tipo && info.tipo !== 'application/octet-stream' ? info.tipo : tipoInformado) || 'application/octet-stream'
  const { data, error } = await admin.from('acervo_itens').insert({
    workspace_id: workspaceId, colecao, titulo: tituloDoNome(nome), chave_r2: chave, nome_original: nome.slice(0, 255),
    tipo_mime: tipo.slice(0, 120), tamanho: info.tamanho, sha256: hash?.sha256 ?? null, criado_por: ator, atualizado_por: ator,
  }).select('id').single()
  if (error?.code === '23505') throw new Error('Este arquivo já está no catálogo.')
  if (error || !data) throw new Error('Não foi possível criar a ficha do arquivo.')
  return data.id as string
}

// ---------------------------------------------------------------- envio e catálogo

/** Links de uso único (1 hora) para o navegador mandar os arquivos direto ao R2, na caixa de entrada. */
export async function prepararEnvioAoAcervo(arquivos: { nome: string; tipo: string; tamanho: number }[]): Promise<Resultado & { envios?: EnvioPreparado[] }> {
  try {
    await contexto('acervo.gerenciar')
    const { config, bucket } = r2()
    if (!Array.isArray(arquivos) || !arquivos.length || arquivos.length > 50) throw new Error('Envie de 1 a 50 arquivos por vez.')
    const mes = new Date().toISOString().slice(0, 7)
    const envios = arquivos.map((a) => {
      const tamanho = Number(a?.tamanho)
      const nome = nomeSeguro(String(a?.nome ?? 'arquivo'))
      if (!Number.isFinite(tamanho) || tamanho <= 0) throw new Error(`"${nome}" está vazio.`)
      if (tamanho > TAMANHO_MAXIMO) throw new Error(`"${nome}" passa de 2 GB.`)
      const chave = `entrada/redacao/${mes}/${randomUUID().slice(0, 8)}-${nome}`
      return { nome, chave, url: urlAssinada(config, bucket, chave, 'PUT', 3600) }
    })
    return { envios }
  } catch (causa) {
    return { erro: mensagemDoErro(causa, 'Não foi possível preparar o envio.') }
  }
}

/** Depois do envio: confere que o arquivo chegou e cria a ficha, privada, no catálogo. */
export async function registrarNoAcervo(envio: { chave: string; nome: string; tipo: string; colecao: string }): Promise<Resultado & { id?: string }> {
  try {
    const { workspaceId, ator, admin } = await contexto('acervo.gerenciar')
    if (!ehColecao(envio?.colecao)) throw new Error('Escolha a coleção.')
    const chave = chaveValida(envio.chave)
    if (!/^entrada\/redacao\/\d{4}-\d{2}\/[0-9a-f]{8}-[^/]{1,130}$/.test(chave)) throw new Error('Envio inválido.')
    const id = await criarFicha(admin, workspaceId, ator, chave, nomeSeguro(String(envio.nome ?? '')), String(envio.tipo ?? ''), envio.colecao)
    // Sem revalidatePath: a tela pede a lista de novo uma vez, no fim da rodada (até 50 arquivos).
    return { id }
  } catch (causa) {
    return { erro: mensagemDoErro(causa, 'Não foi possível registrar o arquivo.') }
  }
}

/** Um arquivo que já estava no bucket (enviado pelo painel da Cloudflare, por exemplo) ganha ficha. */
export async function catalogarArquivoDoBucket(chave: string, colecao: string): Promise<Resultado & { id?: string }> {
  try {
    const { workspaceId, ator, admin } = await contexto('acervo.gerenciar')
    if (!ehColecao(colecao)) throw new Error('Escolha a coleção.')
    const c = chaveValida(chave)
    if (c.startsWith('site/') || /(^|\/)(LEIA-ME\.txt|_sobre-esta-pasta\.txt)$/.test(c) || c.endsWith('/')) throw new Error('Este arquivo não é item de catálogo.')
    const id = await criarFicha(admin, workspaceId, ator, c, c.split('/').pop() ?? 'arquivo', '', colecao)
    revalidatePath('/acervo')
    return { id }
  } catch (causa) {
    return { erro: mensagemDoErro(causa, 'Não foi possível catalogar o arquivo.') }
  }
}

/** A ficha do item. Se ele está no site, a página é refeita na hora. */
export async function salvarFichaDoAcervo(id: string, formData: FormData): Promise<Resultado> {
  try {
    const { workspaceId, ator, admin } = await contexto('acervo.gerenciar')
    const { dados, erros } = lerItem(formData)
    if (!dados) throw new Error(erros.join(' '))
    const atual = await lerItemDoAcervo(admin, workspaceId, id)
    if (atual.publicado_em && dados.colecao !== atual.colecao) throw new Error('Item que já foi ao site mantém a coleção (o endereço dele é permanente).')
    const { error } = await admin.from('acervo_itens').update({ ...dados, atualizado_por: ator }).eq('id', id).eq('workspace_id', workspaceId)
    if (error?.code === 'P0001' && error.message) throw new Error(error.message)
    if (error) throw new Error('Não foi possível salvar a ficha.')
    let aviso: string | undefined
    if (atual.visibilidade === 'publico') {
      try {
        await refazerPaginasDoItem(workspaceId, id)
      } catch (causa) {
        aviso = `Ficha salva, mas a página no site não foi refeita agora (${mensagemDoErro(causa, 'o FTP não respondeu')}). Use "Atualizar as páginas do acervo".`
      }
    }
    revalidatePath('/acervo')
    return { aviso }
  } catch (causa) {
    return { erro: mensagemDoErro(causa, 'Não foi possível salvar a ficha.') }
  }
}

/** Leva o arquivo da caixa de entrada para a pasta da coleção (onde vale a trava de 30 dias). */
export async function guardarNaColecaoDoAcervo(id: string): Promise<Resultado> {
  try {
    const { workspaceId, admin } = await contexto('acervo.gerenciar')
    const item = await lerItemDoAcervo(admin, workspaceId, id)
    if (!item.chave_r2?.startsWith('entrada/')) throw new Error('O arquivo já está numa pasta do acervo.')
    await guardarNaColecao(admin, item)
    revalidatePath('/acervo')
    return {}
  } catch (causa) {
    return { erro: mensagemDoErro(causa, 'Não foi possível guardar o arquivo na coleção.') }
  }
}

// ---------------------------------------------------------------- site

/** Põe o item em cruzvermelhariodejaneiro.org/acervo/ (ou atualiza o arquivo e a página). */
export async function publicarItemDoAcervo(id: string): Promise<Resultado & { url?: string }> {
  try {
    const { workspaceId, ator } = await contexto('acervo.gerenciar')
    const r = await publicarNoSite(workspaceId, id, ator)
    revalidatePath('/acervo')
    return r
  } catch (causa) {
    return { erro: mensagemDoErro(causa, 'Não foi possível publicar o item.') }
  }
}

/** Tira o item do site; a ficha e o arquivo continuam no acervo, e o endereço fica guardado. */
export async function tirarItemDoSite(id: string): Promise<Resultado> {
  try {
    const { workspaceId, ator } = await contexto('acervo.gerenciar')
    const r = await tirarDoSite(workspaceId, id, ator)
    revalidatePath('/acervo')
    return r
  } catch (causa) {
    return { erro: mensagemDoErro(causa, 'Não foi possível tirar o item do site.') }
  }
}

/** Refaz as páginas do acervo no site a partir do cadastro (e limpa o que saiu do ar). */
export async function atualizarPaginasDoAcervo(aPartirDe = 0): Promise<Resultado & { itens?: number; proximo?: number }> {
  try {
    const { workspaceId } = await contexto('acervo.gerenciar')
    const r = await regerarAcervo(workspaceId, Number.isInteger(aPartirDe) ? aPartirDe : 0)
    revalidatePath('/acervo')
    return r
  } catch (causa) {
    return { erro: mensagemDoErro(causa, 'Não foi possível atualizar as páginas do acervo.') }
  }
}

/** Apaga a ficha de um item privado. Arquivo na caixa de entrada sai junto; o que já foi guardado numa coleção fica (a trava do bucket não deixa apagar antes do prazo). */
export async function excluirItemDoAcervo(id: string): Promise<Resultado> {
  try {
    const { workspaceId, admin } = await contexto('acervo.gerenciar')
    const item = await lerItemDoAcervo(admin, workspaceId, id)
    if (item.visibilidade === 'publico') throw new Error('Item no site não se apaga: tire do site antes.')
    const { error } = await admin.from('acervo_itens').delete().eq('id', id).eq('workspace_id', workspaceId)
    if (error?.code === 'P0001' && error.message) throw new Error(error.message)
    if (error) throw new Error('Não foi possível excluir o item.')
    let aviso: string | undefined
    if (item.chave_r2?.startsWith('entrada/')) {
      const { config, bucket } = r2()
      await apagarObjeto(config, bucket, item.chave_r2).catch(() => { aviso = 'Ficha excluída; o arquivo continua na caixa de entrada do bucket.' })
    } else if (item.chave_r2) {
      aviso = 'Ficha excluída. O arquivo continua na pasta da coleção no R2 (lá nada se apaga antes de 30 dias).'
    }
    revalidatePath('/acervo')
    return { aviso }
  } catch (causa) {
    return { erro: mensagemDoErro(causa, 'Não foi possível excluir o item.') }
  }
}

// ---------------------------------------------------------------- consulta

/** Link de 5 minutos para baixar o arquivo original de um item. */
export async function linkDoItemDoAcervo(id: string): Promise<Resultado & { url?: string }> {
  try {
    const { workspaceId, admin } = await contexto('acervo.ver')
    const item = await lerItemDoAcervo(admin, workspaceId, id)
    if (!item.chave_r2) throw new Error('O item não tem arquivo.')
    const { config, bucket } = r2()
    return { url: urlAssinada(config, bucket, item.chave_r2, 'GET', 300, { nomeParaBaixar: item.nome_original ?? item.chave_r2.split('/').pop() }) }
  } catch (causa) {
    return { erro: mensagemDoErro(causa, 'Não foi possível abrir o arquivo.') }
  }
}

/** Link de 5 minutos para baixar qualquer arquivo do bucket (navegação pelas pastas). */
export async function linkDoArquivoDoBucket(chave: string): Promise<Resultado & { url?: string }> {
  try {
    await contexto('acervo.ver')
    const c = chaveValida(chave)
    const { config, bucket } = r2()
    return { url: urlAssinada(config, bucket, c, 'GET', 300, { nomeParaBaixar: c.split('/').pop() }) }
  } catch (causa) {
    return { erro: mensagemDoErro(causa, 'Não foi possível abrir o arquivo.') }
  }
}

export type PastaDoAcervo = PastaDoR2 & { prefixo: string; catalogados: Record<string, string> }

/** Uma pasta do bucket: subpastas, arquivos e quais deles já têm ficha no catálogo. */
export async function navegarNoAcervo(prefixo: string, continuacao?: string | null): Promise<Resultado & { pasta?: PastaDoAcervo }> {
  try {
    const { workspaceId, admin } = await contexto('acervo.ver')
    const p = String(prefixo ?? '')
    if (p && (!p.endsWith('/') || p.startsWith('/') || /(^|\/)\.\.(\/|$)/.test(p) || p.length > 900)) throw new Error('Pasta inválida.')
    const { config, bucket } = r2()
    const pasta = await listarPasta(config, bucket, p, { continuacao: continuacao ?? null, maximo: 200 })
    const catalogados: Record<string, string> = {}
    if (pasta.arquivos.length) {
      const { data } = await admin.from('acervo_itens').select('id,chave_r2').eq('workspace_id', workspaceId).in('chave_r2', pasta.arquivos.map((a) => a.chave))
      for (const l of data ?? []) catalogados[l.chave_r2 as string] = l.id as string
    }
    return { pasta: { ...pasta, prefixo: p, catalogados } }
  } catch (causa) {
    return { erro: mensagemDoErro(causa, 'Não foi possível abrir a pasta.') }
  }
}
