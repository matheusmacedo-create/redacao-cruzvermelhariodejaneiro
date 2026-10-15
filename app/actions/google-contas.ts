'use server'

import { randomBytes } from 'node:crypto'
import { headers } from 'next/headers'
import { revalidatePath } from 'next/cache'
import { requirePermissao } from '@/lib/session'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { mensagemDoErro } from '@/lib/erro-de-acao'
import { enviarComSeguranca, hashDoIp, hashDoToken } from '@/lib/contas/servidor'
import { emailDeContaDoGoogle } from '@/lib/google/contas-emails'
import { gerarSenhaTemporaria } from '@/lib/usuarios/senha'
import { ENDERECO_DO_EMAIL } from '@/lib/dominio'
import { adicionarAoGrupo, criarUsuarioNoGoogle, enderecoOcupadoNoGoogle, esquecerTokenDeAdmin } from '@/lib/google/diretorio'
import {
  CONTAS_POR_IP_POR_HORA, DOMINIO_DAS_CONTAS, VALIDADE_PADRAO_DIAS, celularEmE164, problemaDoConvite, problemaDoEmailPessoal,
  problemaDoUsuario, separarNome, vencimentoDoConvite,
} from '@/lib/google/contas-regras'

/**
 * Contas do Google criadas pelo link (lib/google/diretorio.ts).
 *
 * Dois lados:
 *  - o administrador (correio.configurar) gera links, revoga e desconecta a
 *    conta de administrador do Google. Conferido em cada action, não só na
 *    tela;
 *  - quem abre o link (sem sessão: a pessoa ainda não tem conta nenhuma)
 *    preenche o formulário e a conta nasce no Google na hora. As cercas:
 *    o link vale (vencimento, usos, não revogado), o e-mail é válido e livre,
 *    o setor existe no espaço do link, e um mesmo IP cria no máximo
 *    CONTAS_POR_IP_POR_HORA por hora. A senha provisória não é gravada em
 *    lugar nenhum: o Google obriga a troca no primeiro acesso. Ela vai num
 *    e-mail só, para o e-mail pessoal, com o endereço e o passo a passo
 *    (lib/google/contas-emails.ts); a tela só a mostra se o e-mail não saiu,
 *    para a pessoa nunca ficar sem ela. O envio não pode derrubar a criação:
 *    a conta já existe.
 */

type Resultado = { erro?: string; recado?: string }
const texto = (f: FormData, k: string) => String(f.get(k) ?? '').trim()
const ehUuid = (v: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v)

async function ipDaRequisicao(): Promise<string> {
  const h = await headers()
  return (h.get('x-forwarded-for')?.split(',')[0] || h.get('x-real-ip') || 'desconhecido').trim()
}

const revalidar = () => revalidatePath('/configuracoes/email')

// ---------------------------------------------------------------- o administrador

const linkDoConvite = (token: string) => `${ENDERECO_DO_EMAIL}/email/criar/${token}`

/** Gera um link. De um setor (quem abre já cai nele) ou de qualquer setor (a pessoa escolhe). O link aparece uma vez. */
export async function criarConviteGoogle(formData: FormData): Promise<Resultado & { link?: string }> {
  try {
    const ctx = await requirePermissao('correio.configurar')
    const setorId = texto(formData, 'setorId')
    if (setorId && !ehUuid(setorId)) throw new Error('Setor inválido.')
    const dias = Number(texto(formData, 'dias') || VALIDADE_PADRAO_DIAS)
    const vence = vencimentoDoConvite(dias)
    if ('erro' in vence) throw new Error(vence.erro)
    const maxUsos = Number(texto(formData, 'maxUsos') || 30)
    if (!Number.isInteger(maxUsos) || maxUsos < 1 || maxUsos > 500) throw new Error('Usos: de 1 a 500.')
    const rotulo = texto(formData, 'rotulo').slice(0, 80)

    const admin = createAdminClient()
    if (setorId) {
      const { data: setor } = await admin.from('setores').select('id').eq('id', setorId).eq('workspace_id', ctx.workspace.id).maybeSingle()
      if (!setor) throw new Error('Setor não encontrado.')
    }
    const token = randomBytes(24).toString('base64url')
    const { data, error } = await admin.from('google_convites').insert({
      workspace_id: ctx.workspace.id, token_hash: hashDoToken(token), setor_id: setorId || null, rotulo,
      criado_por: ctx.user.id, expira_em: vence.toISOString(), max_usos: maxUsos,
    }).select('id').single()
    if (error || !data) throw new Error('Não foi possível gerar o link.')
    await admin.from('activity_log').insert({
      workspace_id: ctx.workspace.id, actor_id: ctx.user.id, action: 'google_convite_criado', entity_type: 'google_convite', entity_id: data.id,
      metadata: { setor_id: setorId || null, dias, max_usos: maxUsos },
    })
    revalidar()
    return { recado: `Link gerado. Vale ${dias} dia${dias === 1 ? '' : 's'}, para até ${maxUsos} pessoa${maxUsos === 1 ? '' : 's'}.`, link: linkDoConvite(token) }
  } catch (causa) {
    return { erro: mensagemDoErro(causa, 'Não foi possível gerar o link.') }
  }
}

export async function revogarConviteGoogle(id: string): Promise<Resultado> {
  try {
    const ctx = await requirePermissao('correio.configurar')
    if (!ehUuid(id)) throw new Error('Link não encontrado.')
    const admin = createAdminClient()
    const { data } = await admin.from('google_convites').update({ revogado_em: new Date().toISOString() })
      .eq('id', id).eq('workspace_id', ctx.workspace.id).is('revogado_em', null).select('id')
    if (!data?.length) throw new Error('Link não encontrado ou já cancelado.')
    await admin.from('activity_log').insert({
      workspace_id: ctx.workspace.id, actor_id: ctx.user.id, action: 'google_convite_revogado', entity_type: 'google_convite', entity_id: id, metadata: {},
    })
    revalidar()
    return { recado: 'Link cancelado. Quem abrir agora vê que ele não vale mais.' }
  } catch (causa) {
    return { erro: mensagemDoErro(causa, 'Não foi possível cancelar o link.') }
  }
}

export async function desconectarGoogleAdmin(): Promise<Resultado> {
  try {
    const ctx = await requirePermissao('integracoes.configurar')
    const supabase = await createClient()
    const { error } = await supabase.rpc('remover_chave_de_integracao', { p_workspace_id: ctx.workspace.id, p_servico: 'google_admin' })
    if (error) throw new Error('Não foi possível remover a autorização.')
    esquecerTokenDeAdmin(ctx.workspace.id)
    const admin = createAdminClient()
    await admin.from('google_admin_conexao').delete().eq('workspace_id', ctx.workspace.id)
    await admin.from('activity_log').insert({
      workspace_id: ctx.workspace.id, actor_id: ctx.user.id, action: 'google_admin_desconectado', entity_type: 'integracao', metadata: {},
    })
    revalidar()
    return { recado: 'Conta de administrador desconectada. Os links existentes param de funcionar até reconectar. Para revogar também do lado do Google: myaccount.google.com/permissions.' }
  } catch (causa) {
    return { erro: mensagemDoErro(causa, 'Não foi possível desconectar.') }
  }
}

// ---------------------------------------------------------------- quem abre o link

export type ContaCriadaNoGoogle = {
  email: string
  /** Só quando o e-mail não saiu: a tela mostra para a pessoa anotar. */
  senha: string | null
  /** O endereço do setor, quando a pessoa entrou no grupo dele. */
  grupo: string | null
  /** O setor tem endereço, mas ele ainda é apelido (não grupo): a pessoa não entrou. */
  grupoPendente: string | null
  /** Para onde foi o e-mail com tudo, e se saiu. */
  avisos: { email: string; emailEnviado: boolean }
}

/**
 * Cria a conta da pessoa no Google. Sem sessão: a pessoa ainda não tem
 * conta. Devolve a senha provisória para a tela mostrar uma vez.
 */
export async function criarContaPeloConvite(formData: FormData): Promise<{ erro?: string; conta?: ContaCriadaNoGoogle }> {
  try {
    const token = texto(formData, 'token')
    if (!/^[A-Za-z0-9_-]{20,64}$/.test(token)) throw new Error('Link inválido.')
    const admin = createAdminClient()
    const { data: convite } = await admin.from('google_convites')
      .select('id,workspace_id,setor_id,expira_em,max_usos,usos,revogado_em').eq('token_hash', hashDoToken(token)).maybeSingle()
    if (!convite) throw new Error('Este link não existe. Confira se copiou inteiro.')
    const problema = problemaDoConvite({ expiraEm: convite.expira_em, usos: convite.usos, maxUsos: convite.max_usos, revogadoEm: convite.revogado_em })
    if (problema) throw new Error(problema)
    const workspaceId = convite.workspace_id as string

    const nome = separarNome(texto(formData, 'nome'))
    if ('erro' in nome) throw new Error(nome.erro)
    const usuario = texto(formData, 'usuario').toLowerCase()
    const problemaUsuario = problemaDoUsuario(usuario)
    if (problemaUsuario) throw new Error(problemaUsuario)
    const emailPessoal = texto(formData, 'emailPessoal').toLowerCase()
    const problemaEmail = problemaDoEmailPessoal(emailPessoal)
    if (problemaEmail) throw new Error(problemaEmail)
    const celular = celularEmE164(texto(formData, 'celular'))
    if (typeof celular !== 'string') throw new Error(celular.erro)

    const setorId = (convite.setor_id as string | null) ?? texto(formData, 'setorId')
    if (!setorId || !ehUuid(setorId)) throw new Error('Escolha o seu setor.')
    const { data: setor } = await admin.from('setores').select('id,nome,email').eq('id', setorId).eq('workspace_id', workspaceId).eq('ativo', true).maybeSingle()
    if (!setor) throw new Error('Setor não encontrado.')

    const ipHash = hashDoIp(await ipDaRequisicao())
    const desde = new Date(Date.now() - 60 * 60_000).toISOString()
    const { count } = await admin.from('google_contas').select('id', { count: 'exact', head: true }).eq('ip_hash', ipHash).gte('created_at', desde)
    if ((count ?? 0) >= CONTAS_POR_IP_POR_HORA) throw new Error('Muitas contas criadas deste lugar em pouco tempo. Espere uma hora ou peça ao responsável para criar a sua.')

    const email = `${usuario}@${DOMINIO_DAS_CONTAS}`
    const { data: apelido } = await admin.from('caixas_de_email').select('id').eq('workspace_id', workspaceId).eq('email', email).maybeSingle()
    if (apelido) throw new Error('Esse endereço é de um setor, não pode ser de uma pessoa. Escolha outro.')
    if (await enderecoOcupadoNoGoogle(workspaceId, email)) throw new Error('Esse e-mail já existe. Se é seu, fale com o responsável do setor; se não, escolha outro.')

    const senha = gerarSenhaTemporaria()
    const googleId = await criarUsuarioNoGoogle(workspaceId, {
      email, primeiroNome: nome.primeiro, sobrenome: nome.resto, senha,
      emailDeRecuperacao: emailPessoal || undefined, celularDeRecuperacao: celular || undefined, setor: String(setor.nome),
    })

    const grupo = typeof setor.email === 'string' && setor.email.includes('@') ? setor.email.toLowerCase() : null
    let grupoOk = false
    if (grupo) {
      try { grupoOk = await adicionarAoGrupo(workspaceId, grupo, email) } catch (causa) { console.error('[google-contas] grupo:', causa instanceof Error ? causa.message : causa) }
    }

    const nomeCompleto = `${nome.primeiro} ${nome.resto}`
    await admin.from('google_contas').insert({
      workspace_id: workspaceId, convite_id: convite.id, email, nome: nomeCompleto, setor_id: setor.id,
      grupo_email: grupo, grupo_ok: grupoOk, google_id: googleId || null, ip_hash: ipHash,
    })
    await admin.from('google_convites').update({ usos: (convite.usos as number) + 1 }).eq('id', convite.id)

    // Um e-mail só, com tudo. Nunca lança; se não saiu, a senha vai para a tela.
    const emailEnviado = await enviarComSeguranca(emailPessoal, emailDeContaDoGoogle({ nome: nomeCompleto, email, senha, setor: String(setor.nome), grupo: grupoOk ? grupo : null }))
    const avisos: ContaCriadaNoGoogle['avisos'] = { email: emailPessoal, emailEnviado }

    await admin.from('activity_log').insert({
      workspace_id: workspaceId, actor_id: null, action: 'google_conta_criada', entity_type: 'google_conta', entity_id: null,
      metadata: { email, setor: setor.nome, grupo, grupo_ok: grupoOk, convite_id: convite.id, email_enviado: emailEnviado },
    })
    revalidar()
    return { conta: { email, senha: emailEnviado ? null : senha, grupo: grupoOk ? grupo : null, grupoPendente: grupo && !grupoOk ? grupo : null, avisos } }
  } catch (causa) {
    return { erro: mensagemDoErro(causa, 'Não foi possível criar a conta.') }
  }
}
