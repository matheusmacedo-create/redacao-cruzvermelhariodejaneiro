'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { createClient as criarClienteAvulso } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { publicSupabaseEnv } from '@/lib/supabase/env'
import { mensagemDoErro } from '@/lib/erro-de-acao'
import { mudarRotulos } from '@/lib/google/gmail'
import { enviarPelaCaixaLiberada } from '@/lib/correio/enviar'
import { abrirConversa, esquecerLeituras as esquecerNoServidor } from '@/lib/correio/caixa-de-entrada'
import { cabecalhosDaResposta, citacao } from '@/lib/correio/leitura'
import { contaQueDeveATroca, obterContextoDoEmail, type ContextoDoEmail } from '@/lib/email-provisorio/sessao'
import { gerarSenhaTemporaria, problemaDaSenha } from '@/lib/usuarios/senha'
import { problemaDeSenhaVazada } from '@/lib/apis-publicas/servidor'
import { revogarLinksDeSenha } from '@/lib/contas/servidor'
import { usuarioSugerido } from '@/lib/equipe'
import type { ContaCriada } from '@/components/email-provisorio/equipe'

/**
 * O app de e-mail (/email): a caixa e a equipe de cada caixa.
 *
 * Toda action confere de novo, aqui, quem pede (obterContextoDoEmail) e se a
 * caixa é dela; a tela esconder um botão é só conforto. As tabelas são
 * escritas pelo cliente administrativo, depois dessas conferências.
 *
 * As cercas da equipe:
 *  - dar e tirar acesso a uma caixa: o responsável dela (ou quem configura o
 *    correio no Palácio);
 *  - escolher o responsável: só quem configura o correio;
 *  - senha provisória: só para conta que é SÓ do e-mail. Conta do Palácio
 *    tem a senha cuidada no Palácio — um responsável de setor nunca troca a
 *    senha de quem entra no Palácio.
 */

type Resultado = { erro?: string; recado?: string }
const texto = (f: FormData, k: string) => String(f.get(k) ?? '').trim()
const emailInterno = (usuario: string) => `${usuario}@usuarios.cvrj.local`
const iniciais = (nome: string) => nome.split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0]).join('').toUpperCase()
const USUARIO_VALIDO = /^[a-z0-9._-]{3,40}$/
const ehUuid = (v: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v)

async function exigir(): Promise<ContextoDoEmail> {
  const ctx = await obterContextoDoEmail()
  if (!ctx) throw new Error('Sua sessão expirou. Entre de novo.')
  return ctx
}

function caixaDe(ctx: ContextoDoEmail, caixaId: string) {
  const caixa = ctx.caixas.find((c) => c.id === caixaId)
  if (!caixa) throw new Error('Você não tem acesso a esta caixa.')
  return caixa
}

function exigirResponsavel(ctx: ContextoDoEmail, caixaId: string) {
  const caixa = caixaDe(ctx, caixaId)
  if (!ctx.responsavelDe.has(caixa.id)) throw new Error('Só o responsável da caixa dá e tira acesso a ela.')
  return caixa
}

const esquecerLeituras = (workspaceId: string) => { esquecerNoServidor(workspaceId); revalidatePath('/email') }

async function registrar(ctx: ContextoDoEmail, acao: string, entidade: string | null, metadata: Record<string, unknown>) {
  await createAdminClient().from('activity_log').insert({
    workspace_id: ctx.workspaceId, actor_id: ctx.userId, action: acao, entity_type: 'email_acesso', entity_id: entidade, metadata,
  })
}

// ---------------------------------------------------------------- a caixa

export async function atualizarEmail(): Promise<Resultado> {
  try {
    const ctx = await exigir()
    esquecerLeituras(ctx.workspaceId)
    return {}
  } catch (causa) {
    return { erro: mensagemDoErro(causa, 'Não foi possível atualizar.') }
  }
}

/** Envia, responde ou encaminha por uma caixa da pessoa (mesmas regras de enviarEmailDoSetor, no Palácio). */
export async function enviarEmailProvisorio(formData: FormData): Promise<Resultado> {
  try {
    const ctx = await exigir()
    const caixa = caixaDe(ctx, texto(formData, 'caixaId'))
    const mensagemId = texto(formData, 'mensagemId')
    let conversa: Parameters<typeof enviarPelaCaixaLiberada>[3]['conversa']
    if (mensagemId) {
      const mensagens = await abrirConversa(ctx.workspaceId, caixa, texto(formData, 'threadId'))
      const original = mensagens?.find((m) => m.id === mensagemId)
      if (!original) throw new Error('A mensagem original não foi encontrada nesta caixa.')
      const encaminhar = texto(formData, 'modo') === 'encaminhar'
      conversa = {
        threadId: encaminhar ? null : original.threadId,
        emResposta: encaminhar ? null : cabecalhosDaResposta(original),
        citacao: citacao(original, encaminhar ? 'encaminhar' : 'responder'),
      }
    }
    const { de, destinatarios } = await enviarPelaCaixaLiberada(ctx.workspaceId, caixa.id, ctx.userId, {
      para: texto(formData, 'para'), cc: texto(formData, 'cc'), assunto: texto(formData, 'assunto'), corpo: String(formData.get('corpo') ?? ''),
      conversa,
    })
    esquecerLeituras(ctx.workspaceId)
    return { recado: `Enviado de ${de} para ${destinatarios.length} destinatário(s).` }
  } catch (causa) {
    revalidatePath('/email')
    return { erro: mensagemDoErro(causa, 'Não foi possível enviar.') }
  }
}

export async function marcarConversaEmail(caixaId: string, threadId: string, acao: 'lida' | 'nao_lida' | 'arquivar' | 'entrada'): Promise<Resultado> {
  try {
    const ctx = await exigir()
    const caixa = caixaDe(ctx, caixaId)
    const mensagens = await abrirConversa(ctx.workspaceId, caixa, threadId)
    if (!mensagens) throw new Error('Conversa não encontrada nesta caixa.')
    const [por, tira] = acao === 'lida' ? [[], ['UNREAD']] : acao === 'nao_lida' ? [['UNREAD'], []] : acao === 'arquivar' ? [[], ['INBOX']] : [['INBOX'], []]
    await mudarRotulos(ctx.workspaceId, mensagens.map((m) => m.id), por, tira)
    esquecerLeituras(ctx.workspaceId)
    return {}
  } catch (causa) {
    return { erro: mensagemDoErro(causa, 'Não foi possível atualizar a conversa.') }
  }
}

// ---------------------------------------------------------------- a senha da própria pessoa

/**
 * Troca obrigatória do primeiro acesso (e depois de uma senha provisória
 * nova), para quem é só do e-mail. Mesma política e mesmas cautelas de
 * trocarMinhaSenha no Palácio: confere a senha atual, derruba as outras
 * sessões e entra de novo com a nova.
 */
export async function trocarSenhaDoEmail(formData: FormData): Promise<{ erro?: string }> {
  try {
    const conta = await contaQueDeveATroca()
    if (!conta) redirect('/email')
    const atual = String(formData.get('senhaAtual') ?? '')
    const nova = String(formData.get('novaSenha') ?? '')
    if (nova !== String(formData.get('confirmacao') ?? '')) throw new Error('A confirmação não confere com a nova senha.')
    if (nova === atual) throw new Error('A nova senha precisa ser diferente da atual.')
    const problema = problemaDaSenha(nova, { usuario: conta.usuario, nome: conta.nome }) ?? await problemaDeSenhaVazada(nova)
    if (problema) throw new Error(problema)

    const { url, key } = publicSupabaseEnv()
    const avulso = criarClienteAvulso(url!, key!, { auth: { autoRefreshToken: false, persistSession: false } })
    const { data: conferido, error: erroAtual } = await avulso.auth.signInWithPassword({ email: emailInterno(conta.usuario), password: atual })
    if (erroAtual || conferido.user?.id !== conta.userId) throw new Error('A senha atual não confere.')
    await avulso.auth.signOut()

    const admin = createAdminClient()
    const { error } = await admin.auth.admin.updateUserById(conta.userId, { password: nova })
    if (error) throw new Error('Não foi possível trocar a senha.')
    await admin.from('profiles').update({ trocar_senha: false, updated_at: new Date().toISOString() }).eq('id', conta.userId)
    const { error: erroSessoes } = await admin.rpc('encerrar_sessoes_do_usuario', { p_user_id: conta.userId })
    if (erroSessoes) console.error('[email] não foi possível encerrar as sessões:', erroSessoes.message)
    await revogarLinksDeSenha(admin, conta.userId)

    const supabase = await createClient()
    const { error: erroLogin } = await supabase.auth.signInWithPassword({ email: emailInterno(conta.usuario), password: nova })
    if (erroLogin) redirect('/email/entrar')
  } catch (causa) {
    // mensagemDoErro deixa passar o redirect() (que funciona lançando).
    return { erro: mensagemDoErro(causa, 'Não foi possível trocar a senha.') }
  }
  revalidatePath('/email', 'layout')
  redirect('/email')
}

// ---------------------------------------------------------------- a equipe de cada caixa

/** A conta é só do e-mail (sem vínculo com o Palácio)? Só nela um responsável mexe na senha. */
async function soDoEmail(userId: string): Promise<boolean> {
  const { count } = await createAdminClient().from('workspace_members').select('user_id', { count: 'exact', head: true }).eq('user_id', userId)
  return !count
}

async function usuarioLivre(base: string): Promise<string> {
  const admin = createAdminClient()
  const raiz = (base || 'pessoa').slice(0, 36)
  for (let i = 0; i < 50; i++) {
    const tentativa = i === 0 ? raiz : `${raiz}${i + 1}`
    const { data } = await admin.from('profiles').select('id').eq('username', tentativa).maybeSingle()
    if (!data) return tentativa
  }
  throw new Error('Não achei um usuário livre para esse nome. Escolha um à mão.')
}

/**
 * Cria a conta de uma pessoa (só do e-mail) com acesso a uma caixa. A senha
 * provisória vale só para o primeiro acesso: na entrada, a pessoa escolhe a
 * dela. Lança com a mensagem para a tela; quem chama já conferiu que pede o
 * responsável da caixa.
 */
async function criarConta(ctx: ContextoDoEmail, caixa: { id: string; email: string }, nomeBruto: string, pedido: string): Promise<{ userId: string; usuario: string; senha: string }> {
  const nome = nomeBruto.replace(/\s+/g, ' ').trim()
  if (nome.length < 3 || nome.length > 120) throw new Error('Escreva o nome completo da pessoa (3 a 120 caracteres).')
  const escolhido = pedido.trim().toLowerCase()
  if (escolhido && !USUARIO_VALIDO.test(escolhido)) throw new Error('Usuário: de 3 a 40 letras minúsculas, números, ponto, hífen ou sublinhado.')
  const usuario = escolhido || await usuarioLivre(usuarioSugerido(nome))
  const admin = createAdminClient()
  const { data: existente } = await admin.from('profiles').select('id').eq('username', usuario).maybeSingle()
  if (existente) throw new Error(`O usuário ${usuario} já existe. Se for a mesma pessoa, use "Dar acesso a quem já tem conta".`)

  const senha = gerarSenhaTemporaria()
  const { data: criado, error: erroAuth } = await admin.auth.admin.createUser({
    email: emailInterno(usuario), password: senha, email_confirm: true, user_metadata: { username: usuario, full_name: nome },
  })
  if (erroAuth || !criado.user) throw new Error('Não foi possível criar a conta. Confira se o usuário já não existe.')
  const userId = criado.user.id
  const { error: erroPerfil } = await admin.from('profiles').insert({ id: userId, username: usuario, full_name: nome, initials: iniciais(nome), trocar_senha: true })
  if (erroPerfil) {
    await admin.auth.admin.deleteUser(userId)
    throw new Error('Não foi possível criar o perfil.')
  }
  const { error: erroAcesso } = await admin.from('email_acessos').insert({ caixa_id: caixa.id, user_id: userId, workspace_id: ctx.workspaceId, criado_por: ctx.userId })
  if (erroAcesso) {
    await admin.auth.admin.deleteUser(userId)
    throw new Error('Não foi possível dar o acesso à caixa.')
  }
  await registrar(ctx, 'email_conta_criada', userId, { caixa: caixa.email, usuario })
  return { userId, usuario, senha }
}

/** Uma pessoa: a senha provisória aparece uma vez para quem criou. */
export async function criarContaDoEmail(formData: FormData): Promise<Resultado & { nome?: string; usuario?: string; senhaTemporaria?: string }> {
  try {
    const ctx = await exigir()
    const caixa = exigirResponsavel(ctx, texto(formData, 'caixaId'))
    const nome = texto(formData, 'nome').replace(/\s+/g, ' ')
    const { usuario, senha } = await criarConta(ctx, caixa, nome, texto(formData, 'usuario'))
    revalidatePath('/email/equipe')
    return { recado: `Conta criada com acesso a ${caixa.email}.`, nome, usuario, senhaTemporaria: senha }
  } catch (causa) {
    return { erro: mensagemDoErro(causa, 'Não foi possível criar a conta.') }
  }
}

/** Uma linha da lista de "Liberar o setor de uma vez": "Nome Completo" ou "Nome Completo; usuario". Marcador de lista na frente é ignorado. */
function lerLinhaDePessoa(linha: string): { nome: string; pedido: string } {
  const limpa = linha.replace(/^\s*(?:[-*•]|\d+[.)])\s*/, '').trim()
  const [nome = '', pedido = ''] = limpa.split(/\s*[;|]\s*/)
  return { nome, pedido }
}

/**
 * Libera o setor de uma vez: uma conta por linha, cada uma com a própria
 * senha provisória, para o responsável (ou o administrador) passar à equipe
 * sem criar pessoa por pessoa. Linha com problema não derruba as outras:
 * volta com o erro ao lado do nome. Quem configura o correio pode marcar a
 * primeira pessoa criada como responsável pela caixa — é o caminho para
 * abrir um setor que ainda não tem ninguém no e-mail.
 */
export async function liberarSetorDoEmail(formData: FormData): Promise<Resultado & { criadas?: ContaCriada[] }> {
  try {
    const ctx = await exigir()
    const caixa = exigirResponsavel(ctx, texto(formData, 'caixaId'))
    const linhas = String(formData.get('pessoas') ?? '').split(/\r?\n/).map((l) => l.trim()).filter(Boolean)
    if (!linhas.length) throw new Error('Escreva um nome completo por linha.')
    if (linhas.length > 30) throw new Error('No máximo 30 pessoas por vez. Divida a lista.')
    const primeiraResponsavel = formData.get('primeiraResponsavel') === '1' && ctx.administra

    const criadas: (ContaCriada & { userId?: string })[] = []
    for (const linha of linhas) {
      const { nome, pedido } = lerLinhaDePessoa(linha)
      try {
        const c = await criarConta(ctx, caixa, nome, pedido)
        criadas.push({ nome: nome.replace(/\s+/g, ' ').trim(), usuario: c.usuario, senha: c.senha, userId: c.userId })
      } catch (causa) {
        criadas.push({ nome: nome || linha, erro: mensagemDoErro(causa, 'Não foi possível criar a conta.') })
      }
    }
    const primeira = criadas.find((c) => c.userId)
    if (primeiraResponsavel && primeira?.userId) {
      await createAdminClient().from('email_acessos').update({ responsavel: true }).eq('caixa_id', caixa.id).eq('user_id', primeira.userId)
      await registrar(ctx, 'email_responsavel_definido', primeira.userId, { caixa: caixa.email })
    }
    revalidatePath('/email/equipe')
    const ok = criadas.filter((c) => c.usuario).length
    const falhas = criadas.length - ok
    return {
      recado: `${ok} acesso${ok === 1 ? '' : 's'} criado${ok === 1 ? '' : 's'} para ${caixa.email}${falhas ? `. ${falhas} linha${falhas === 1 ? '' : 's'} com problema, veja abaixo` : ''}.`,
      criadas: criadas.map(({ userId: _userId, ...c }) => c),
    }
  } catch (causa) {
    return { erro: mensagemDoErro(causa, 'Não foi possível criar os acessos.') }
  }
}

/** Dá acesso a uma caixa para quem já tem conta (do e-mail ou do Palácio), pelo usuário. */
export async function darAcessoAoEmail(formData: FormData): Promise<Resultado> {
  try {
    const ctx = await exigir()
    const caixa = exigirResponsavel(ctx, texto(formData, 'caixaId'))
    const usuario = texto(formData, 'usuario').toLowerCase().replace(/^@/, '')
    if (!USUARIO_VALIDO.test(usuario)) throw new Error('Informe o usuário da pessoa (ex.: nome.sobrenome).')
    const admin = createAdminClient()
    const { data: perfil } = await admin.from('profiles').select('id,full_name,active').eq('username', usuario).maybeSingle()
    if (!perfil || perfil.active === false) throw new Error(`Não há conta ativa com o usuário ${usuario}.`)
    const { error } = await admin.from('email_acessos').upsert(
      { caixa_id: caixa.id, user_id: perfil.id, workspace_id: ctx.workspaceId, criado_por: ctx.userId },
      { onConflict: 'caixa_id,user_id', ignoreDuplicates: true },
    )
    if (error) throw new Error('Não foi possível dar o acesso.')
    await registrar(ctx, 'email_acesso_dado', perfil.id as string, { caixa: caixa.email, usuario })
    revalidatePath('/email/equipe')
    return { recado: `${perfil.full_name || usuario} agora vê ${caixa.email}.` }
  } catch (causa) {
    return { erro: mensagemDoErro(causa, 'Não foi possível dar o acesso.') }
  }
}

/** Tira o acesso de alguém a uma caixa. Tirar um responsável é só de quem configura o correio. */
export async function tirarAcessoDoEmail(caixaId: string, userId: string): Promise<Resultado> {
  try {
    const ctx = await exigir()
    const caixa = exigirResponsavel(ctx, caixaId)
    if (!ehUuid(userId)) throw new Error('Pessoa não encontrada.')
    const admin = createAdminClient()
    const { data: acesso } = await admin.from('email_acessos').select('responsavel').eq('caixa_id', caixa.id).eq('user_id', userId).maybeSingle()
    if (!acesso) throw new Error('Essa pessoa não tem acesso a esta caixa.')
    if (acesso.responsavel && !ctx.administra) throw new Error('Só um administrador tira o responsável de uma caixa.')
    await admin.from('email_acessos').delete().eq('caixa_id', caixa.id).eq('user_id', userId)
    await registrar(ctx, 'email_acesso_tirado', userId, { caixa: caixa.email })
    revalidatePath('/email/equipe')
    return { recado: 'Acesso tirado.' }
  } catch (causa) {
    return { erro: mensagemDoErro(causa, 'Não foi possível tirar o acesso.') }
  }
}

/** Nova senha provisória para quem esqueceu (só conta que é só do e-mail e tem acesso a esta caixa). */
export async function novaSenhaDoEmail(caixaId: string, userId: string): Promise<Resultado & { nome?: string; usuario?: string; senhaTemporaria?: string }> {
  try {
    const ctx = await exigir()
    const caixa = exigirResponsavel(ctx, caixaId)
    if (!ehUuid(userId) || userId === ctx.userId) throw new Error('Para trocar a sua própria senha, use "Trocar minha senha".')
    const admin = createAdminClient()
    const { data: acesso } = await admin.from('email_acessos').select('user_id').eq('caixa_id', caixa.id).eq('user_id', userId).maybeSingle()
    if (!acesso) throw new Error('Essa pessoa não tem acesso a esta caixa.')
    if (!await soDoEmail(userId)) throw new Error('Essa pessoa entra no Palácio Virtual: a senha dela é redefinida lá, por um administrador.')
    const { data: perfil } = await admin.from('profiles').select('username,full_name').eq('id', userId).maybeSingle()
    const senha = gerarSenhaTemporaria()
    const { error } = await admin.auth.admin.updateUserById(userId, { password: senha })
    if (error) throw new Error('Não foi possível gerar a senha.')
    await admin.from('profiles').update({ trocar_senha: true, updated_at: new Date().toISOString() }).eq('id', userId)
    await admin.rpc('encerrar_sessoes_do_usuario', { p_user_id: userId })
    await registrar(ctx, 'email_senha_provisoria', userId, { caixa: caixa.email })
    return { recado: 'Senha provisória gerada. As sessões abertas dessa pessoa foram encerradas.', nome: String(perfil?.full_name ?? ''), usuario: String(perfil?.username ?? ''), senhaTemporaria: senha }
  } catch (causa) {
    return { erro: mensagemDoErro(causa, 'Não foi possível gerar a senha.') }
  }
}

/** Escolhe (ou tira) o responsável de uma caixa. Só quem configura o correio no Palácio. */
export async function definirResponsavelDoEmail(caixaId: string, userId: string, responsavel: boolean): Promise<Resultado> {
  try {
    const ctx = await exigir()
    const caixa = caixaDe(ctx, caixaId)
    if (!ctx.administra) throw new Error('Só um administrador escolhe o responsável da caixa.')
    if (!ehUuid(userId)) throw new Error('Pessoa não encontrada.')
    const { data, error } = await createAdminClient().from('email_acessos').update({ responsavel })
      .eq('caixa_id', caixa.id).eq('user_id', userId).select('user_id')
    if (error || !data?.length) throw new Error('Dê acesso à caixa antes de fazer a pessoa responsável.')
    await registrar(ctx, responsavel ? 'email_responsavel_definido' : 'email_responsavel_tirado', userId, { caixa: caixa.email })
    revalidatePath('/email/equipe')
    return {}
  } catch (causa) {
    return { erro: mensagemDoErro(causa, 'Não foi possível salvar.') }
  }
}
