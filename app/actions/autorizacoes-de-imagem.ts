'use server'

import { randomBytes } from 'node:crypto'
import { revalidatePath } from 'next/cache'
import { requireWorkspace } from '@/lib/session'
import { pode } from '@/lib/permissoes'
import { mensagemDoErro } from '@/lib/erro-de-acao'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { expiraEm, lerNovaColeta } from '@/lib/imagem/regras'
import { coletaDoEnvio } from '@/lib/imagem/servidor'
import { avaliaEnvios } from '@/lib/envios/servidor'

/**
 * Autorização de uso de imagem pelo link (docs em ARQUITETURA.md). As tabelas
 * não aceitam escrita de quem está logado: tudo passa por aqui, que confere a
 * sessão e o espaço, e grava com a chave de serviço. As assinaturas em si
 * vêm da página pública (lib/imagem/servidor.ts).
 */

type Resultado = { erro?: string; ok?: boolean; id?: string }

/** Cria o link de uma ação com as fotos escolhidas na Biblioteca. */
export async function criarColeta(formData: FormData): Promise<Resultado> {
  try {
    const context = await requireWorkspace()
    const ws = context.workspace.id
    const { dados, erros } = lerNovaColeta({
      titulo: formData.get('titulo'), descricao: formData.get('descricao'), validade: formData.get('validade'), arquivos: formData.getAll('arquivos'),
    })
    if (!dados) throw new Error(erros.join(' '))
    // As fotos têm de ser deste espaço (lidas com a sessão de quem pede: vale o RLS).
    const supabase = await createClient()
    const { data: arquivos } = await supabase.from('files').select('id').eq('workspace_id', ws).neq('status', 'deleted').in('id', dados.arquivos)
    const validos = new Set((arquivos ?? []).map((a) => a.id as string))
    const ids = dados.arquivos.filter((id) => validos.has(id))
    if (!ids.length) throw new Error('Nenhuma das fotos escolhidas está na Biblioteca deste espaço.')
    const { data, error } = await createAdminClient().from('imagem_coletas').insert({
      workspace_id: ws, titulo: dados.titulo, descricao: dados.descricao, token: randomBytes(32).toString('base64url'),
      file_ids: ids, criado_por: context.user.id, expira_em: expiraEm(dados.validadeDias),
    }).select('id').single()
    if (error || !data) throw new Error('Não foi possível criar o link agora.')
    revalidatePath('/biblioteca/autorizacoes')
    return { ok: true, id: data.id as string }
  } catch (e) {
    return { erro: mensagemDoErro(e, 'Não foi possível concluir agora.') }
  }
}

/** Quem criou o link, quem avalia os envios (link de um envio), ou quem pode mexer no que é dos outros na Biblioteca. */
async function coletaQuePosso(id: string) {
  const context = await requireWorkspace()
  const supabase = await createClient()
  const { data: c } = await supabase.from('imagem_coletas').select('id, workspace_id, criado_por, file_ids, envio_id, encerrada_em')
    .eq('id', id).eq('workspace_id', context.workspace.id).maybeSingle()
  if (!c) throw new Error('Link não encontrado neste espaço.')
  const permitido = c.criado_por === context.user.id || pode(context.role, 'biblioteca.apagar_de_outros')
    || (Boolean(c.envio_id) && await avaliaEnvios(context.user.id, context.workspace.id))
  if (!permitido) throw new Error('Só quem criou o link (ou um editor) pode fazer isso.')
  return { context, coleta: c }
}

/** As fotos do link na Biblioteca: as escolhidas, ou as do envio que já foram copiadas para lá. */
async function arquivosDaColeta(coleta: { file_ids: unknown; envio_id: unknown }): Promise<string[]> {
  if (!coleta.envio_id) return (coleta.file_ids as string[]) ?? []
  const supabase = await createClient()
  const { data } = await supabase.from('envio_arquivos').select('file_id').eq('envio_id', coleta.envio_id as string).not('file_id', 'is', null)
  return (data ?? []).map((a) => a.file_id as string)
}

/** Quem avalia os envios gera, pela tela do envio, o link que quem mandou não gerou. */
export async function gerarLinkDoEnvio(formData: FormData): Promise<Resultado> {
  try {
    const context = await requireWorkspace()
    const envioId = String(formData.get('envioId') ?? '')
    if (!(await avaliaEnvios(context.user.id, context.workspace.id))) throw new Error('Só quem avalia os envios pode fazer isso.')
    const supabase = await createClient()
    const { data: envio } = await supabase.from('envios').select('id, workspace_id, titulo, nome').eq('id', envioId).eq('workspace_id', context.workspace.id).maybeSingle()
    if (!envio) throw new Error('Envio não encontrado.')
    const r = await coletaDoEnvio(envio as { id: string; workspace_id: string; titulo: string; nome: string })
    if (!r.token) throw new Error(r.erro ?? 'Não foi possível gerar o link.')
    const { data: c } = await supabase.from('imagem_coletas').select('id').eq('envio_id', envioId).maybeSingle()
    revalidatePath(`/envios/${envioId}`)
    return { ok: true, id: c?.id as string | undefined }
  } catch (e) {
    return { erro: mensagemDoErro(e, 'Não foi possível concluir agora.') }
  }
}

/** Encerra o link: ninguém mais assina por ele. As assinaturas já feitas continuam valendo. */
export async function encerrarColeta(formData: FormData): Promise<Resultado> {
  try {
    const { context, coleta } = await coletaQuePosso(String(formData.get('id') ?? ''))
    if (coleta.encerrada_em) return { ok: true }
    const { error } = await createAdminClient().from('imagem_coletas')
      .update({ encerrada_em: new Date().toISOString(), encerrada_por: context.user.id })
      .eq('id', coleta.id).eq('workspace_id', context.workspace.id).is('encerrada_em', null)
    if (error) throw new Error('Não foi possível encerrar o link.')
    revalidatePath(`/biblioteca/autorizacoes/${coleta.id}`)
    revalidatePath('/biblioteca/autorizacoes')
    return { ok: true }
  } catch (e) {
    return { erro: mensagemDoErro(e, 'Não foi possível concluir agora.') }
  }
}

/** A equipe registra a revogação que a pessoa pediu por outro canal (e-mail, telefone, pessoalmente). */
export async function revogarAutorizacao(formData: FormData): Promise<Resultado> {
  try {
    const context = await requireWorkspace()
    const id = String(formData.get('id') ?? '')
    const motivo = String(formData.get('motivo') ?? '').replace(/\s+/g, ' ').trim().slice(0, 500)
    if (motivo.length < 5) throw new Error('Conte como a pessoa pediu a revogação (ex.: "pediu por e-mail em 12/10").')
    const supabase = await createClient()
    const { data: a } = await supabase.from('imagem_autorizacoes').select('id, coleta_id, revogada_em')
      .eq('id', id).eq('workspace_id', context.workspace.id).maybeSingle()
    if (!a) throw new Error('Autorização não encontrada neste espaço.')
    if (a.revogada_em) return { ok: true }
    await coletaQuePosso(a.coleta_id as string)
    const { error } = await createAdminClient().from('imagem_autorizacoes')
      .update({ revogada_em: new Date().toISOString(), revogada_por: 'equipe', revogada_por_usuario: context.user.id, revogacao_motivo: motivo })
      .eq('id', id).eq('workspace_id', context.workspace.id).is('revogada_em', null)
    if (error) throw new Error('Não foi possível registrar a revogação.')
    revalidatePath(`/biblioteca/autorizacoes/${a.coleta_id}`)
    revalidatePath('/biblioteca/autorizacoes')
    return { ok: true }
  } catch (e) {
    return { erro: mensagemDoErro(e, 'Não foi possível concluir agora.') }
  }
}

/**
 * Marca as fotos do link como "Uso autorizado" na Biblioteca. É uma decisão
 * de quem conhece as fotos: todas as pessoas que aparecem precisam ter
 * assinado. Só mexe no que está pendente (material de terceiro fica como está).
 */
export async function marcarFotosAutorizadas(formData: FormData): Promise<Resultado> {
  try {
    const { context, coleta } = await coletaQuePosso(String(formData.get('id') ?? ''))
    const supabase = await createClient()
    const { count } = await supabase.from('imagem_autorizacoes').select('id', { count: 'exact', head: true })
      .eq('coleta_id', coleta.id).is('revogada_em', null)
    if (!count) throw new Error('Ainda não há assinatura válida neste link.')
    const ids = await arquivosDaColeta(coleta)
    if (!ids.length) throw new Error('As fotos deste envio ainda não foram copiadas para a Biblioteca (isso acontece ao virar pauta).')
    const { error } = await supabase.from('files').update({ authorization_status: 'authorized' })
      .eq('workspace_id', context.workspace.id).in('id', ids).eq('authorization_status', 'pending')
    if (error) throw new Error('Não foi possível marcar as fotos.')
    revalidatePath('/biblioteca')
    revalidatePath(`/biblioteca/autorizacoes/${coleta.id}`)
    return { ok: true }
  } catch (e) {
    return { erro: mensagemDoErro(e, 'Não foi possível concluir agora.') }
  }
}

/** Os traços de uma assinatura, para conferir na tela (lidos com a sessão: vale o RLS). */
export async function assinaturaDe(id: string): Promise<{ tracos?: [number, number][][]; erro?: string }> {
  const context = await requireWorkspace()
  const supabase = await createClient()
  const { data } = await supabase.from('imagem_autorizacoes').select('assinatura').eq('id', id).eq('workspace_id', context.workspace.id).maybeSingle()
  return data ? { tracos: data.assinatura as [number, number][][] } : { erro: 'Assinatura não encontrada.' }
}
