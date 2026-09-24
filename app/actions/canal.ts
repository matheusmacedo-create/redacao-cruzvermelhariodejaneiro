'use server'

import { revalidatePath } from 'next/cache'
import { mensagemDoErro } from '@/lib/erro-de-acao'
import { contextoDeParticipantes } from '@/lib/participantes/acesso'
import { emailConfigurado, enviarEmailDeConta } from '@/lib/newsletter/resend'
import { urlBase } from '@/lib/newsletter/contexto'
import { emailDeResposta } from '@/lib/membro/emails'

/**
 * Canal direto e avisos — o lado da equipe. Resposta pela função do banco
 * (nível conferido lá); o voluntário recebe a resposta por e-mail.
 */

type Resultado = { erro?: string }

async function gerente() {
  const c = await contextoDeParticipantes()
  if (c.nivel < 2) throw new Error('Você não tem acesso ao canal do Voluntariado.')
  return c
}

function revalidar(id?: string) {
  revalidatePath('/voluntariado/mensagens')
  if (id) revalidatePath(`/voluntariado/mensagens/${id}`)
  revalidatePath('/voluntariado/avisos')
  revalidatePath('/membro', 'layout')
}

export async function responderMembro(conversaId: string, _anterior: Resultado & { ok?: number }, formData: FormData): Promise<Resultado & { ok?: number }> {
  try {
    const { context, supabase } = await gerente()
    const texto = String(formData.get('texto') ?? '').trim().slice(0, 4000)
    if (!texto) throw new Error('Escreva a resposta.')
    const { error } = await supabase.rpc('equipe_responder_membro', { p_conversa_id: conversaId, p_texto: texto })
    if (error) throw new Error(error.code === 'P0001' && error.message ? error.message : 'Não foi possível responder.')
    if (emailConfigurado()) {
      const { data: c } = await supabase.from('membro_conversas').select('assunto,participantes(nome,nome_social,email)').eq('id', conversaId).single()
      const p = (Array.isArray(c?.participantes) ? c?.participantes[0] : c?.participantes) as { nome: string; nome_social: string | null; email: string | null } | null
      if (c && p?.email) {
        const primeiro = (context.profile?.full_name as string | undefined)?.trim().split(/\s+/)[0] ?? 'A coordenação'
        const e = emailDeResposta({ nome: p.nome_social || p.nome, assunto: c.assunto, resposta: texto, respondidoPor: `${primeiro}, da coordenação do Voluntariado,`, url: `${urlBase()}/membro/mensagens/${conversaId}` })
        await enviarEmailDeConta({ para: p.email, assunto: e.assunto, html: e.html, texto: e.texto }).catch(() => undefined)
      }
    }
    revalidar(conversaId)
    return { ok: Date.now() }
  } catch (causa) {
    return { erro: mensagemDoErro(causa, 'Não foi possível responder.') }
  }
}

export async function marcarConversa(conversaId: string, acao: 'lida' | 'encerrar' | 'reabrir'): Promise<Resultado> {
  try {
    const { supabase } = await gerente()
    const { error } = await supabase.rpc('equipe_marcar_conversa', { p_conversa_id: conversaId, p_acao: acao })
    if (error) throw new Error(error.code === 'P0001' && error.message ? error.message : 'Não foi possível atualizar.')
    revalidar(conversaId)
    return {}
  } catch (causa) {
    return { erro: mensagemDoErro(causa, 'Não foi possível atualizar.') }
  }
}

export async function salvarAviso(id: string | null, _anterior: Resultado & { ok?: number }, formData: FormData): Promise<Resultado & { ok?: number }> {
  try {
    const { context, supabase } = await gerente()
    const titulo = String(formData.get('titulo') ?? '').trim().slice(0, 160)
    const texto = String(formData.get('texto') ?? '').trim().slice(0, 6000)
    const expira = String(formData.get('expira_em') ?? '')
    if (titulo.length < 3) throw new Error('Dê um título ao aviso.')
    if (texto.length < 3) throw new Error('Escreva o aviso.')
    if (expira && !/^\d{4}-\d{2}-\d{2}$/.test(expira)) throw new Error('Data inválida.')
    const dados = { titulo, texto, fixado: formData.get('fixado') === 'sim', expira_em: expira || null, updated_at: new Date().toISOString() }
    const { error } = id
      ? await supabase.from('membro_avisos').update(dados).eq('id', id)
      : await supabase.from('membro_avisos').insert({ ...dados, workspace_id: context.workspace.id, criado_por: context.user.id })
    if (error) throw new Error('Não foi possível salvar o aviso.')
    revalidar()
    return { ok: Date.now() }
  } catch (causa) {
    return { erro: mensagemDoErro(causa, 'Não foi possível salvar o aviso.') }
  }
}

export async function excluirAviso(id: string): Promise<Resultado> {
  try {
    const { supabase } = await gerente()
    const { error } = await supabase.from('membro_avisos').delete().eq('id', id)
    if (error) throw new Error('Não foi possível excluir.')
    revalidar()
    return {}
  } catch (causa) {
    return { erro: mensagemDoErro(causa, 'Não foi possível excluir.') }
  }
}
