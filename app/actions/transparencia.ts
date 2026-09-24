'use server'

import { createHash, randomUUID } from 'node:crypto'
import { revalidatePath } from 'next/cache'
import { mensagemDoErro } from '@/lib/erro-de-acao'
import { requirePermissao } from '@/lib/session'
import { createAdminClient } from '@/lib/supabase/admin'
import { origemDoSite } from '@/lib/auditoria/consulta'
import { lerCanais, lerDocumento, lerParceria, ehPdf, nomeDoArquivoPublico, NOME_DO_ARQUIVO_PUBLICO, TAMANHO_MAXIMO } from '@/lib/transparencia/regras'
import { regerarCanais, regerarPortal, retirarPdfsDoPortal, subirPdfDoPortal } from '@/lib/transparencia/publicacao'

/**
 * Portal de transparência e canais oficiais (docs/auditoria-publica.md §5).
 * Toda action confere a permissão; toda escrita passa por função do banco,
 * que registra na trilha pública com quem agiu. Os PDFs vão do navegador
 * direto ao Storage (bucket privado "transparencia") por link de uso único;
 * o servidor confere que é PDF, calcula o SHA-256 e só então publica no site.
 */

type Resultado = { erro?: string; aviso?: string }
type Admin = ReturnType<typeof createAdminClient>
const BUCKET = 'transparencia'

function erroDoBanco(error: { message?: string; code?: string } | null, padrao: string): never {
  if (error?.code === 'P0001' && error.message) throw new Error(error.message)
  if (error?.code === '23514') throw new Error('Algum campo passou do tamanho permitido ou está fora da lista.')
  throw new Error(padrao)
}

const contexto = async () => {
  const c = await requirePermissao('transparencia.gerenciar')
  return { workspaceId: c.workspace.id as string, ator: c.user.id as string, admin: createAdminClient() }
}

/**
 * Algumas funções do banco recebem só o id: antes de chamá-las, confere que o
 * documento ou a parceria é deste espaço (o espaço de um registro não muda).
 */
async function doEspaco(admin: Admin, tabela: 'transparencia_documentos' | 'transparencia_parcerias', id: string, workspaceId: string) {
  const { data, error } = await admin.from(tabela).select('id,retirado_em').eq('id', id).eq('workspace_id', workspaceId).maybeSingle()
  if (error) throw new Error('Não foi possível ler o registro.')
  if (!data) throw new Error(tabela === 'transparencia_documentos' ? 'Documento não encontrado.' : 'Parceria não encontrada.')
  return data as { id: string; retirado_em: string | null }
}

/**
 * Documento retirado: apaga do site os PDFs publicados que ainda estão lá,
 * regera a página e só então registra no banco. Lança se o site não responder
 * (o banco não marca, e a tela oferece tentar de novo).
 */
async function tirarPdfsDoSite(admin: Admin, workspaceId: string, documentoId: string): Promise<void> {
  const { data: versoes, error } = await admin.from('transparencia_versoes').select('arquivo_publico')
    .eq('documento_id', documentoId).eq('workspace_id', workspaceId).not('publicado_em', 'is', null).is('removido_do_site_em', null)
  if (error) throw new Error('Não foi possível ler as versões do documento.')
  const nomes = (versoes ?? []).map((v) => String(v.arquivo_publico ?? '').split('/').pop() ?? '').filter((n) => NOME_DO_ARQUIVO_PUBLICO.test(n))
  await retirarPdfsDoPortal(workspaceId, nomes)
  const { error: e2 } = await admin.rpc('transparencia_marcar_removidos', { p_documento_id: documentoId })
  if (e2) console.error('[transparencia] remoção dos arquivos não registrada:', e2.message)
}

/** Publica a mudança no site; se o site não responder, o banco já registrou e a tela avisa. */
async function atualizarSite(regerar: () => Promise<void>, onde: string): Promise<string | undefined> {
  try {
    await regerar()
    return undefined
  } catch (causa) {
    return `Registrado, mas ${onde} no site não foi atualizada agora (${mensagemDoErro(causa, 'o FTP não respondeu')}). Use "Atualizar a página no site".`
  }
}

// ---------------------------------------------------------------- documentos

export async function salvarDocumento(id: string | null, formData: FormData): Promise<Resultado & { id?: string }> {
  try {
    const { workspaceId, ator, admin } = await contexto()
    const { dados, erros } = lerDocumento(formData)
    if (!dados) throw new Error(erros.join(' '))
    const { data, error } = await admin.rpc('transparencia_salvar_documento', { p_workspace_id: workspaceId, p_id: id, p: dados, p_ator: ator })
    if (error) erroDoBanco(error, 'Não foi possível salvar o documento.')
    let aviso: string | undefined
    if (id) {
      const { count } = await admin.from('transparencia_versoes').select('id', { count: 'exact', head: true }).eq('documento_id', id).not('publicado_em', 'is', null)
      if (count) aviso = await atualizarSite(() => regerarPortal(workspaceId), 'a página do portal')
    }
    revalidatePath('/transparencia')
    return { id: data as string, aviso }
  } catch (causa) {
    return { erro: mensagemDoErro(causa, 'Não foi possível salvar o documento.') }
  }
}

/** Primeiro passo do envio: link de uso único para o PDF ir direto ao Storage. */
export async function prepararEnvioDoPdf(documentoId: string, tipo: string, tamanho: number): Promise<Resultado & { caminho?: string; token?: string }> {
  try {
    const { workspaceId, admin } = await contexto()
    if (tipo !== 'application/pdf') throw new Error('Envie o documento em PDF.')
    if (!Number.isFinite(tamanho) || tamanho <= 0 || tamanho > TAMANHO_MAXIMO) throw new Error('O PDF pode ter até 20 MB.')
    const { data: doc } = await admin.from('transparencia_documentos').select('id').eq('id', documentoId).eq('workspace_id', workspaceId).maybeSingle()
    if (!doc) throw new Error('Documento não encontrado.')
    const caminho = `${workspaceId}/${documentoId}/${randomUUID()}.pdf`
    const { data, error } = await admin.storage.from(BUCKET).createSignedUploadUrl(caminho)
    if (error || !data) throw new Error('Não foi possível preparar o envio.')
    return { caminho, token: data.token }
  } catch (causa) {
    return { erro: mensagemDoErro(causa, 'Não foi possível preparar o envio.') }
  }
}

/** Segundo passo: o servidor lê o arquivo enviado, confere que é PDF e registra a versão com o SHA-256. */
export async function registrarVersaoDoPdf(documentoId: string, caminho: string, nomeOriginal: string): Promise<Resultado & { versaoId?: string }> {
  try {
    const { workspaceId, ator, admin } = await contexto()
    if (!caminho.startsWith(`${workspaceId}/${documentoId}/`)) throw new Error('Caminho inválido.')
    const { data: blob, error } = await admin.storage.from(BUCKET).download(caminho)
    const bytes = blob ? new Uint8Array(await blob.arrayBuffer()) : null
    if (error || !bytes) throw new Error('O arquivo não chegou ao armazenamento. Envie de novo.')
    if (!ehPdf(bytes)) {
      await admin.storage.from(BUCKET).remove([caminho]).catch(() => undefined)
      throw new Error('O arquivo não é um PDF de verdade. Envie o PDF original.')
    }
    const sha256 = createHash('sha256').update(bytes).digest('hex')
    const { data, error: e2 } = await admin.rpc('transparencia_registrar_versao', {
      p_documento_id: documentoId, p_caminho: caminho, p_nome: nomeOriginal.slice(0, 200), p_tamanho: bytes.length, p_sha256: sha256, p_ator: ator,
    })
    if (e2) {
      await admin.storage.from(BUCKET).remove([caminho]).catch(() => undefined)
      erroDoBanco(e2, 'Não foi possível registrar o arquivo.')
    }
    revalidatePath('/transparencia')
    return { versaoId: data as string }
  } catch (causa) {
    return { erro: mensagemDoErro(causa, 'Não foi possível registrar o arquivo.') }
  }
}

/**
 * Publica a versão: sobe o PDF ao site com nome que carrega o SHA-256, registra
 * no banco (a trilha registra junto) e regera a página do portal.
 */
export async function publicarVersao(versaoId: string): Promise<Resultado> {
  try {
    const { workspaceId, ator, admin } = await contexto()
    const { data: v } = await admin.from('transparencia_versoes')
      .select('id,caminho,sha256,publicado_em,workspace_id,transparencia_documentos(titulo)')
      .eq('id', versaoId).eq('workspace_id', workspaceId).maybeSingle()
    if (!v) throw new Error('Versão não encontrada.')
    if (v.publicado_em) throw new Error('Esta versão já está publicada.')
    const doc = Array.isArray(v.transparencia_documentos) ? v.transparencia_documentos[0] : v.transparencia_documentos
    const { data: blob, error } = await admin.storage.from(BUCKET).download(v.caminho as string)
    const bytes = blob ? Buffer.from(await blob.arrayBuffer()) : null
    if (error || !bytes) throw new Error('O arquivo da versão não foi encontrado no armazenamento.')
    const sha256 = createHash('sha256').update(bytes).digest('hex')
    if (sha256 !== v.sha256) throw new Error('O arquivo guardado não confere com o SHA-256 registrado. Envie de novo.')
    const nome = nomeDoArquivoPublico(String((doc as { titulo?: string } | null)?.titulo ?? 'documento'), sha256)
    await subirPdfDoPortal(nome, bytes)
    const { error: e2 } = await admin.rpc('transparencia_publicar_versao', {
      p_versao_id: versaoId, p_arquivo_publico: `${origemDoSite()}/transparencia/arquivos/${nome}`, p_ator: ator,
    })
    if (e2) erroDoBanco(e2, 'O PDF subiu, mas não consegui registrar a publicação.')
    const aviso = await atualizarSite(() => regerarPortal(workspaceId), 'a página do portal')
    revalidatePath('/transparencia')
    return { aviso }
  } catch (causa) {
    return { erro: mensagemDoErro(causa, 'Não foi possível publicar.') }
  }
}

export async function descartarVersao(versaoId: string): Promise<Resultado> {
  try {
    const { workspaceId, admin } = await contexto()
    const { data: v } = await admin.from('transparencia_versoes').select('caminho').eq('id', versaoId).eq('workspace_id', workspaceId).maybeSingle()
    if (!v) throw new Error('Versão não encontrada.')
    const { error } = await admin.rpc('transparencia_descartar_versao', { p_versao_id: versaoId })
    if (error) erroDoBanco(error, 'Não foi possível descartar a versão.')
    await admin.storage.from(BUCKET).remove([v.caminho as string]).catch(() => undefined)
    revalidatePath('/transparencia')
    return {}
  } catch (causa) {
    return { erro: mensagemDoErro(causa, 'Não foi possível descartar a versão.') }
  }
}

/**
 * Retira o documento do portal: a trilha registra a retirada, os PDFs dele saem
 * do servidor do site (publicado por engano pode ter dado pessoal) e a página é
 * refeita. O registro do que foi publicado continua na trilha.
 */
export async function retirarDocumento(documentoId: string, motivo: string): Promise<Resultado> {
  try {
    const { workspaceId, ator, admin } = await contexto()
    await doEspaco(admin, 'transparencia_documentos', documentoId, workspaceId)
    const { error } = await admin.rpc('transparencia_retirar_documento', { p_documento_id: documentoId, p_motivo: motivo, p_ator: ator })
    if (error) erroDoBanco(error, 'Não foi possível retirar o documento.')
    let aviso: string | undefined
    try {
      await tirarPdfsDoSite(admin, workspaceId, documentoId)
    } catch (causa) {
      aviso = `Retirado do portal, mas o site não respondeu agora (${mensagemDoErro(causa, 'o FTP não respondeu')}): o PDF ainda pode estar no endereço público. Use "Apagar os PDFs do site", no cartão do documento, para tentar de novo.`
    }
    revalidatePath('/transparencia')
    return { aviso }
  } catch (causa) {
    return { erro: mensagemDoErro(causa, 'Não foi possível retirar o documento.') }
  }
}

/** Documento retirado cujo PDF ficou no site (o site não respondeu na retirada): tenta apagar de novo. */
export async function apagarPdfsDoSite(documentoId: string): Promise<Resultado> {
  try {
    const { workspaceId, admin } = await contexto()
    const doc = await doEspaco(admin, 'transparencia_documentos', documentoId, workspaceId)
    if (!doc.retirado_em) throw new Error('O documento está no ar: para tirar o PDF do site, retire o documento do portal.')
    try {
      await tirarPdfsDoSite(admin, workspaceId, documentoId)
    } catch (causa) {
      throw new Error(`O site não respondeu agora (${mensagemDoErro(causa, 'o FTP não respondeu')}). Tente de novo em alguns minutos.`)
    }
    revalidatePath('/transparencia')
    return {}
  } catch (causa) {
    return { erro: mensagemDoErro(causa, 'Não foi possível apagar os PDFs do site.') }
  }
}

/** Rascunho (nada publicado): apaga o documento e os arquivos enviados. */
export async function excluirRascunhoDeDocumento(documentoId: string): Promise<Resultado> {
  try {
    const { workspaceId, admin } = await contexto()
    await doEspaco(admin, 'transparencia_documentos', documentoId, workspaceId)
    const { data: versoes } = await admin.from('transparencia_versoes').select('caminho,publicado_em').eq('documento_id', documentoId).eq('workspace_id', workspaceId)
    if ((versoes ?? []).some((v) => v.publicado_em)) throw new Error('Documento com versão publicada não se apaga: retire-o do portal com um motivo.')
    const { error } = await admin.rpc('transparencia_excluir_rascunho', { p_documento_id: documentoId, p_parceria_id: null })
    if (error) erroDoBanco(error, 'Não foi possível excluir o rascunho.')
    const caminhos = (versoes ?? []).map((v) => v.caminho as string)
    if (caminhos.length) await admin.storage.from(BUCKET).remove(caminhos).catch(() => undefined)
    revalidatePath('/transparencia')
    return {}
  } catch (causa) {
    return { erro: mensagemDoErro(causa, 'Não foi possível excluir o rascunho.') }
  }
}

/** Link de um minuto para a administração conferir o PDF guardado. */
export async function linkDoPdf(versaoId: string): Promise<Resultado & { url?: string }> {
  try {
    const { workspaceId, admin } = await contexto()
    const { data: v } = await admin.from('transparencia_versoes').select('caminho').eq('id', versaoId).eq('workspace_id', workspaceId).maybeSingle()
    if (!v) throw new Error('Versão não encontrada.')
    const { data, error } = await admin.storage.from(BUCKET).createSignedUrl(v.caminho as string, 60)
    if (error || !data) throw new Error('Não foi possível abrir o arquivo.')
    return { url: data.signedUrl }
  } catch (causa) {
    return { erro: mensagemDoErro(causa, 'Não foi possível abrir o arquivo.') }
  }
}

// ---------------------------------------------------------------- parcerias

export async function salvarParceria(id: string | null, formData: FormData): Promise<Resultado & { id?: string }> {
  try {
    const { workspaceId, ator, admin } = await contexto()
    const { dados, erros } = lerParceria(formData)
    if (!dados) throw new Error(erros.join(' '))
    const { data, error } = await admin.rpc('transparencia_salvar_parceria', { p_workspace_id: workspaceId, p_id: id, p: dados, p_ator: ator })
    if (error) erroDoBanco(error, 'Não foi possível salvar a parceria.')
    let aviso: string | undefined
    if (id) {
      const { data: p } = await admin.from('transparencia_parcerias').select('publicado_em').eq('id', id).eq('workspace_id', workspaceId).maybeSingle()
      if (p?.publicado_em) aviso = await atualizarSite(() => regerarPortal(workspaceId), 'a página do portal')
    }
    revalidatePath('/transparencia')
    return { id: data as string, aviso }
  } catch (causa) {
    return { erro: mensagemDoErro(causa, 'Não foi possível salvar a parceria.') }
  }
}

export async function publicarParceria(id: string): Promise<Resultado> {
  try {
    const { workspaceId, ator, admin } = await contexto()
    await doEspaco(admin, 'transparencia_parcerias', id, workspaceId)
    const { error } = await admin.rpc('transparencia_publicar_parceria', { p_id: id, p_ator: ator })
    if (error) erroDoBanco(error, 'Não foi possível publicar a parceria.')
    const aviso = await atualizarSite(() => regerarPortal(workspaceId), 'a página do portal')
    revalidatePath('/transparencia')
    return { aviso }
  } catch (causa) {
    return { erro: mensagemDoErro(causa, 'Não foi possível publicar a parceria.') }
  }
}

export async function retirarParceria(id: string, motivo: string): Promise<Resultado> {
  try {
    const { workspaceId, ator, admin } = await contexto()
    await doEspaco(admin, 'transparencia_parcerias', id, workspaceId)
    const { error } = await admin.rpc('transparencia_retirar_parceria', { p_id: id, p_motivo: motivo, p_ator: ator })
    if (error) erroDoBanco(error, 'Não foi possível retirar a parceria.')
    const aviso = await atualizarSite(() => regerarPortal(workspaceId), 'a página do portal')
    revalidatePath('/transparencia')
    return { aviso }
  } catch (causa) {
    return { erro: mensagemDoErro(causa, 'Não foi possível retirar a parceria.') }
  }
}

export async function excluirRascunhoDeParceria(id: string): Promise<Resultado> {
  try {
    const { workspaceId, admin } = await contexto()
    await doEspaco(admin, 'transparencia_parcerias', id, workspaceId)
    const { error } = await admin.rpc('transparencia_excluir_rascunho', { p_documento_id: null, p_parceria_id: id })
    if (error) erroDoBanco(error, 'Não foi possível excluir o rascunho.')
    revalidatePath('/transparencia')
    return {}
  } catch (causa) {
    return { erro: mensagemDoErro(causa, 'Não foi possível excluir o rascunho.') }
  }
}

export async function atualizarPaginaDoPortal(): Promise<Resultado> {
  try {
    const { workspaceId } = await contexto()
    await regerarPortal(workspaceId)
    return {}
  } catch (causa) {
    return { erro: mensagemDoErro(causa, 'Não foi possível atualizar a página do portal.') }
  }
}

// ---------------------------------------------------------------- canais oficiais

/** Publica uma versão nova e inteira da lista (a anterior fica na trilha como substituída). */
export async function publicarCanais(lista: unknown, observacao: string): Promise<Resultado & { versao?: number }> {
  try {
    const { workspaceId, ator, admin } = await contexto()
    const { canais, erros } = lerCanais(lista)
    if (!canais) throw new Error(erros.join(' '))
    if (observacao.length > 1000) throw new Error('A observação pode ter até 1.000 caracteres.')
    const { data, error } = await admin.rpc('canais_publicar_versao', { p_workspace_id: workspaceId, p_canais: canais, p_observacao: observacao.trim(), p_ator: ator })
    if (error) erroDoBanco(error, 'Não foi possível publicar a lista.')
    const versao = (Array.isArray(data) ? data[0] : data)?.versao as number | undefined
    const aviso = await atualizarSite(() => regerarCanais(workspaceId), 'a página de canais oficiais')
    revalidatePath('/canais-oficiais')
    return { versao, aviso }
  } catch (causa) {
    return { erro: mensagemDoErro(causa, 'Não foi possível publicar a lista.') }
  }
}

export async function atualizarPaginaDosCanais(): Promise<Resultado> {
  try {
    const { workspaceId } = await contexto()
    await regerarCanais(workspaceId)
    return {}
  } catch (causa) {
    return { erro: mensagemDoErro(causa, 'Não foi possível atualizar a página de canais oficiais.') }
  }
}
