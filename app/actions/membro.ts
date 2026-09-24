'use server'

import { createHash } from 'node:crypto'
import { cookies, headers } from 'next/headers'
import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { createAdminClient } from '@/lib/supabase/admin'
import { emailConfigurado, enviarEmailDeConta } from '@/lib/newsletter/resend'
import { urlBase } from '@/lib/newsletter/contexto'
import { mensagemDoErro } from '@/lib/erro-de-acao'
import { hojeEmSaoPaulo } from '@/components/app/projetos/comum'
import { lerFormulario } from '@/lib/participantes/regras'
import { COOKIE_DO_MEMBRO, DIAS_DE_SESSAO, exigirMembro, hashDoToken, novoToken, sessaoDoMembro } from '@/lib/membro/sessao'
import { emailDoCodigo } from '@/lib/membro/emails'

/**
 * A área do membro do lado do servidor. Tudo usa o cliente de serviço, mas
 * só depois de a sessão dizer quem é o voluntário — e só com o id dela.
 */

export type EstadoDeEntrada = { etapa: 'email' | 'codigo'; email?: string; erro?: string; aviso?: string }

const MINUTOS_DO_CODIGO = 10

async function hashDoIp() {
  const h = await headers()
  const ip = (h.get('x-forwarded-for') ?? '').split(',')[0].trim() || h.get('x-real-ip') || 'desconhecido'
  return createHash('sha256').update(`membro:${ip}`).digest('hex')
}

/** Passo 1: manda o código. A resposta é a mesma com ou sem cadastro. */
export async function pedirCodigo(_anterior: EstadoDeEntrada, formData: FormData): Promise<EstadoDeEntrada> {
  const email = String(formData.get('email') ?? '').trim().toLowerCase().slice(0, 254)
  try {
    if (!emailConfigurado()) throw new Error('O envio de e-mails não está configurado. Avise a coordenação do Voluntariado.')
    const { data, error } = await createAdminClient().rpc('membro_pedir_codigo', { p_email: email, p_ip_hash: await hashDoIp() })
    if (error) {
      if (error.code === 'P0001' && error.message) throw new Error(error.message)
      throw new Error('Não foi possível enviar o código agora. Tente de novo em instantes.')
    }
    const linha = (Array.isArray(data) ? data[0] : data) as { nome: string; email: string; codigo: string } | undefined
    if (linha?.codigo) {
      const m = emailDoCodigo({ nome: linha.nome, codigo: linha.codigo, minutos: MINUTOS_DO_CODIGO, url: `${urlBase()}/membro` })
      await enviarEmailDeConta({ para: linha.email, assunto: m.assunto, html: m.html, texto: m.texto })
    }
    return { etapa: 'codigo', email, aviso: `Se ${email} for o e-mail de um voluntário ativo, o código chega em instantes. Confira também o spam.` }
  } catch (causa) {
    return { etapa: 'email', email, erro: mensagemDoErro(causa, 'Não foi possível enviar o código.') }
  }
}

/** Passo 2: troca o código por uma sessão. */
export async function entrar(_anterior: EstadoDeEntrada, formData: FormData): Promise<EstadoDeEntrada> {
  const email = String(formData.get('email') ?? '').trim().toLowerCase().slice(0, 254)
  const codigo = String(formData.get('codigo') ?? '').replace(/\D/g, '').slice(0, 6)
  try {
    const token = novoToken()
    const agente = (await headers()).get('user-agent') ?? ''
    const { data, error } = await createAdminClient().rpc('membro_entrar', { p_email: email, p_codigo: codigo, p_token_hash: hashDoToken(token), p_user_agent: agente.slice(0, 300) })
    if (error) throw new Error('Não foi possível entrar agora. Tente de novo.')
    const r = (data ?? {}) as { erro?: string; participante_id?: string }
    if (r.erro || !r.participante_id) return { etapa: 'codigo', email, erro: r.erro ?? 'Código inválido.' }
    ;(await cookies()).set(COOKIE_DO_MEMBRO, token, {
      httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax', path: '/', maxAge: DIAS_DE_SESSAO * 86400,
    })
  } catch (causa) {
    return { etapa: 'codigo', email, erro: mensagemDoErro(causa, 'Não foi possível entrar.') }
  }
  redirect('/membro')
}

export async function sair() {
  const m = await sessaoDoMembro()
  if (m) await createAdminClient().rpc('membro_sair', { p_token_hash: m.tokenHash })
  ;(await cookies()).delete(COOKIE_DO_MEMBRO)
  redirect('/membro/entrar')
}

export async function salvarPerfil(_anterior: { erro?: string; ok?: boolean }, formData: FormData): Promise<{ erro?: string; ok?: boolean }> {
  try {
    const m = await exigirMembro()
    const { dados, erros } = lerFormulario(formData, hojeEmSaoPaulo())
    if (erros.length) return { erro: erros.join(' ') }
    const { error } = await createAdminClient().rpc('membro_atualizar_perfil', { p_participante_id: m.participanteId, p: dados })
    if (error) throw new Error(error.code === 'P0001' && error.message ? error.message : 'Não foi possível salvar.')
    revalidatePath('/membro', 'layout')
    return { ok: true }
  } catch (causa) {
    return { erro: mensagemDoErro(causa, 'Não foi possível salvar.') }
  }
}
