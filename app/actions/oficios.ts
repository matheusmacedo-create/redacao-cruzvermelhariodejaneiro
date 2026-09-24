'use server'

import { revalidatePath } from 'next/cache'
import { after } from 'next/server'
import { headers } from 'next/headers'
import { redirect } from 'next/navigation'
import { createClient as clienteAvulso } from '@supabase/supabase-js'
import { requireWorkspace } from '@/lib/session'
import { createClient } from '@/lib/supabase/server'
import { publicSupabaseEnv } from '@/lib/supabase/env'
import { mensagemDoErro } from '@/lib/erro-de-acao'
import { lerCanonico } from '@/lib/oficios/documento'
import { processarCarimbo, processarFila } from '@/lib/oficios/carimbo'

/**
 * Ofícios. O rascunho é editado direto na tabela (as políticas só deixam
 * mexer nos campos do texto, e só enquanto é rascunho). Emitir, assinar,
 * recusar e cancelar passam por funções do banco, que dão o número, congelam
 * o texto e registram quem assinou o quê.
 */

type Resultado = { erro?: string }
const texto = (f: FormData, k: string, max: number) => String(f.get(k) ?? '').trim().slice(0, max)
const ouNulo = (s: string) => s || null

// O banco escreve mensagens próprias (P0001) para as recusas de regra; o
// resto (permissão, rede) vira uma mensagem genérica sem detalhe interno.
function erroDoBanco(error: { message?: string; code?: string } | null, padrao: string): never {
  if (error?.code === 'P0001' && error.message) throw new Error(error.message)
  throw new Error(padrao)
}

function revalidar(id?: string) {
  revalidatePath('/oficios')
  if (id) revalidatePath(`/oficios/${id}`)
}

async function registrar(workspaceId: string, autor: string, action: string, oficioId: string, metadata: Record<string, unknown>) {
  const supabase = await createClient()
  await supabase.from('activity_log').insert({ workspace_id: workspaceId, actor_id: autor, action, entity_type: 'oficio', entity_id: oficioId, metadata })
}

export async function criarOficio() {
  const context = await requireWorkspace()
  const supabase = await createClient()
  const { data, error } = await supabase.from('oficios').insert({
    workspace_id: context.workspace.id, criado_por: context.user.id,
    vocativo: 'Prezado(a) Senhor(a),',
  }).select('id').single()
  if (error || !data) throw new Error('Não foi possível criar o ofício.')
  revalidar()
  redirect(`/oficios/${data.id}`)
}

export async function salvarRascunho(id: string, formData: FormData): Promise<Resultado & { salvoEm?: string }> {
  try {
    const context = await requireWorkspace()
    const supabase = await createClient()
    const agora = new Date().toISOString()
    const { data, error } = await supabase.from('oficios').update({
      setor: ouNulo(texto(formData, 'setor', 120)),
      local: texto(formData, 'local', 120) || 'Rio de Janeiro',
      destinatario_nome: ouNulo(texto(formData, 'destinatario_nome', 200)),
      destinatario_cargo: ouNulo(texto(formData, 'destinatario_cargo', 200)),
      destinatario_orgao: ouNulo(texto(formData, 'destinatario_orgao', 200)),
      destinatario_endereco: ouNulo(texto(formData, 'destinatario_endereco', 400)),
      vocativo: ouNulo(texto(formData, 'vocativo', 200)),
      assunto: texto(formData, 'assunto', 300),
      corpo: String(formData.get('corpo') ?? '').replace(/\r\n/g, '\n').trim().slice(0, 30000),
      fecho: texto(formData, 'fecho', 200) || 'Atenciosamente,',
      updated_at: agora,
    }).eq('id', id).eq('workspace_id', context.workspace.id).eq('estado', 'rascunho').select('id')
    if (error) throw new Error('Não foi possível salvar o rascunho.')
    if (!data?.length) throw new Error('Este rascunho não pode ser editado por você, ou já foi emitido.')
    revalidar(id)
    return { salvoEm: agora }
  } catch (causa) {
    return { erro: mensagemDoErro(causa, 'Não foi possível salvar o rascunho.') }
  }
}

export async function excluirRascunho(id: string): Promise<Resultado> {
  try {
    const context = await requireWorkspace()
    const supabase = await createClient()
    const { data, error } = await supabase.from('oficios').delete().eq('id', id).eq('workspace_id', context.workspace.id).eq('estado', 'rascunho').select('id')
    if (error) throw new Error('Não foi possível apagar o rascunho.')
    if (!data?.length) throw new Error('Só quem criou o rascunho, ou um admin, pode apagá-lo.')
  } catch (causa) {
    return { erro: mensagemDoErro(causa, 'Não foi possível apagar o rascunho.') }
  }
  revalidar()
  redirect('/oficios')
}

export async function emitirOficio(id: string, assinantes: { userId: string; cargo: string }[]): Promise<Resultado & { numero?: string }> {
  try {
    const context = await requireWorkspace()
    const supabase = await createClient()
    const lista = assinantes.map((a) => ({ user_id: String(a.userId), cargo: String(a.cargo ?? '').trim().slice(0, 120) }))
    const { data, error } = await supabase.rpc('emitir_oficio', { p_oficio_id: id, p_assinantes: lista })
    if (error) erroDoBanco(error, 'Não foi possível emitir o ofício.')
    const { data: o } = await supabase.from('oficios').select('assunto').eq('id', id).maybeSingle()
    await registrar(context.workspace.id, context.user.id, 'oficio_emitido', id, { numero: data, assunto: o?.assunto ?? '' })
    revalidar(id)
    return { numero: String(data) }
  } catch (causa) {
    return { erro: mensagemDoErro(causa, 'Não foi possível emitir o ofício.') }
  }
}

/**
 * Confirma que é a própria pessoa: a senha é conferida num cliente avulso,
 * sem mexer na sessão do navegador, e a sessão aberta para isso é encerrada
 * logo em seguida.
 */
async function conferirSenha(email: string, userId: string, senha: string) {
  const { url, key } = publicSupabaseEnv()
  if (!url || !key) throw new Error('Configuração do Supabase incompleta.')
  const avulso = clienteAvulso(url, key, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } })
  const { data, error } = await avulso.auth.signInWithPassword({ email, password: senha })
  if (error || data.user?.id !== userId) throw new Error('Senha incorreta. A assinatura não foi registrada.')
  await avulso.auth.signOut({ scope: 'local' }).catch(() => undefined)
}

export async function assinarOficio(id: string, hash: string, senha: string, concordo: boolean): Promise<Resultado & { concluido?: boolean }> {
  try {
    if (!concordo) throw new Error('Marque a confirmação de que leu o documento.')
    if (!/^[0-9a-f]{64}$/.test(hash)) throw new Error('Documento inválido. Recarregue a página.')
    if (!senha) throw new Error('Digite a sua senha para assinar.')
    const context = await requireWorkspace()
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user?.email || user.id !== context.user.id) throw new Error('Sessão expirada. Entre de novo para assinar.')
    await conferirSenha(user.email, user.id, senha)

    const h = await headers()
    const ip = (h.get('x-forwarded-for') ?? '').split(',')[0].trim() || h.get('x-real-ip') || ''
    const { data: concluido, error } = await supabase.rpc('assinar_oficio', {
      p_oficio_id: id, p_hash: hash, p_ip: ip.slice(0, 64), p_user_agent: (h.get('user-agent') ?? '').slice(0, 300),
    })
    if (error) erroDoBanco(error, 'Não foi possível registrar a assinatura.')
    const { data: o } = await supabase.from('oficios').select('ano,numero,assunto').eq('id', id).maybeSingle()
    const numero = o?.numero ? `${String(o.numero).padStart(3, '0')}/${o.ano}` : ''
    await registrar(context.workspace.id, context.user.id, 'oficio_assinado', id, { numero, assunto: o?.assunto ?? '', concluido: Boolean(concluido) })
    // Última assinatura: o carimbo no Bitcoin sai depois da resposta, sem
    // fazer a pessoa esperar os calendários.
    if (concluido) after(async () => { await processarFila(1, id).catch(() => undefined) })
    revalidar(id)
    return { concluido: Boolean(concluido) }
  } catch (causa) {
    return { erro: mensagemDoErro(causa, 'Não foi possível registrar a assinatura.') }
  }
}

export async function recusarAssinatura(id: string, motivo: string): Promise<Resultado> {
  try {
    const context = await requireWorkspace()
    const supabase = await createClient()
    const { error } = await supabase.rpc('recusar_assinatura_de_oficio', { p_oficio_id: id, p_motivo: String(motivo ?? '').slice(0, 600) })
    if (error) erroDoBanco(error, 'Não foi possível registrar a recusa.')
    await registrar(context.workspace.id, context.user.id, 'oficio_recusado', id, {})
    revalidar(id)
    return {}
  } catch (causa) {
    return { erro: mensagemDoErro(causa, 'Não foi possível registrar a recusa.') }
  }
}

export async function cancelarOficio(id: string, motivo: string): Promise<Resultado> {
  try {
    const context = await requireWorkspace()
    const supabase = await createClient()
    const { error } = await supabase.rpc('cancelar_oficio', { p_oficio_id: id, p_motivo: String(motivo ?? '').slice(0, 600) })
    if (error) erroDoBanco(error, 'Não foi possível cancelar o ofício.')
    await registrar(context.workspace.id, context.user.id, 'oficio_cancelado', id, {})
    revalidar(id)
    return {}
  } catch (causa) {
    return { erro: mensagemDoErro(causa, 'Não foi possível cancelar o ofício.') }
  }
}

/** Um novo rascunho com o texto de um ofício existente (para refazer um cancelado, por exemplo). */
export async function duplicarComoRascunho(id: string) {
  const context = await requireWorkspace()
  const supabase = await createClient()
  const { data: o } = await supabase.from('oficios')
    .select('conteudo_canonico,setor,local,destinatario_nome,destinatario_cargo,destinatario_orgao,destinatario_endereco,vocativo,assunto,corpo,fecho')
    .eq('id', id).eq('workspace_id', context.workspace.id).maybeSingle()
  if (!o) throw new Error('Ofício não encontrado.')
  const doc = lerCanonico(o.conteudo_canonico)
  const { data, error } = await supabase.from('oficios').insert({
    workspace_id: context.workspace.id, criado_por: context.user.id,
    setor: doc?.setor ?? o.setor, local: doc?.local ?? o.local,
    destinatario_nome: doc?.destinatario.nome ?? o.destinatario_nome, destinatario_cargo: doc?.destinatario.cargo ?? o.destinatario_cargo,
    destinatario_orgao: doc?.destinatario.orgao ?? o.destinatario_orgao, destinatario_endereco: doc?.destinatario.endereco ?? o.destinatario_endereco,
    vocativo: doc?.vocativo ?? o.vocativo, assunto: doc?.assunto ?? o.assunto, corpo: doc?.corpo ?? o.corpo, fecho: doc?.fecho ?? o.fecho,
  }).select('id').single()
  if (error || !data) throw new Error('Não foi possível duplicar o ofício.')
  revalidar()
  redirect(`/oficios/${data.id}`)
}

/** "Verificar agora": uma rodada no carimbo deste ofício, no máximo a cada 2 minutos. */
export async function verificarCarimboAgora(oficioId: string): Promise<Resultado & { estado?: string }> {
  try {
    const context = await requireWorkspace()
    const supabase = await createClient()
    const { data: c } = await supabase.from('oficio_carimbos').select('id,hash,estado,prova,tentativas,updated_at')
      .eq('oficio_id', oficioId).eq('workspace_id', context.workspace.id).order('created_at', { ascending: false }).limit(1).maybeSingle()
    if (!c) throw new Error('Este ofício ainda não tem carimbo.')
    if (c.estado === 'confirmado') return { estado: 'confirmado' }
    if (Date.now() - Date.parse(c.updated_at) < 120_000 && c.estado !== 'pendente') throw new Error('Verificado há pouco. Tente de novo em alguns minutos.')
    const estado = await processarCarimbo(c)
    revalidar(oficioId)
    return { estado }
  } catch (causa) {
    return { erro: mensagemDoErro(causa, 'Não foi possível verificar o carimbo.') }
  }
}
