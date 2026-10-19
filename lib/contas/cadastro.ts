import 'server-only'
import { randomBytes } from 'node:crypto'
import { revalidatePath } from 'next/cache'
import type { SupabaseClient } from '@supabase/supabase-js'
import { createAdminClient } from '@/lib/supabase/admin'
import { mensagemDoErro } from '@/lib/erro-de-acao'
import type { Papel } from '@/lib/permissoes'
import { nomesDosSetores } from '@/lib/setores'
import { emailConfigurado } from '@/lib/newsletter/resend'
import { emailDeConvite } from '@/lib/contas/emails'
import { emitirToken, enviarComSeguranca, urlDoLink, VALIDADE_MIN } from '@/lib/contas/servidor'
import { marcaDoConvite } from '@/lib/contas/convite'
import { entregar } from '@/lib/whatsapp/fila'
import { configDoWhatsapp } from '@/lib/whatsapp/servidor'
import { formatarNumero, textoDoConviteDoPalacio } from '@/lib/whatsapp/regras'
import { criarConviteDaFicha } from '@/lib/rh/convites'
import {
  baseDoUsuario, campoDoEmailNaFicha, conferirCadastro, mensagemDoCadastro, modoDoConvite, problemaDoUsuario, saiu, usuarioLivreEntre,
  type CadastroConferido, type CanaisLigados, type EnvioDoConvite, type PedidoDeCadastro,
} from './cadastro-regras'

/**
 * O núcleo do cadastro de contas, no servidor: um caminho só para criar a
 * conta, ligar ou criar a ficha do RH e mandar o convite, seja pela tela
 * ("Adicionar pessoas" e o quadro "Acesso ao Palácio Virtual" da ficha, em
 * convidarEmLote; "Novo usuário" em Usuários, em criarUsuario), seja pelo
 * pedido feito pelo WhatsApp e confirmado no Palácio (app/confirmar/[token]).
 * As conferências e os textos são puros (./cadastro-regras.ts).
 *
 * Quem chama já conferiu a permissão (requirePermissao('usuarios.gerenciar')
 * ou a mesma conferência na página de confirmar) e passa a SESSÃO de quem está
 * logado: o vínculo com o espaço e a ficha do RH vão por ela — o RLS confere de
 * novo que é um administrador, e os gatilhos de auditoria registram quem fez.
 * O service role só entra no que o RLS não alcança por desenho (criar a conta
 * no Auth, o perfil, os links de senha e a auditoria de acesso).
 *
 * O link de senha nunca volta para quem chama (o primeiro acesso prova o canal
 * que o recebeu: lib/contas/convite.ts), e o contato da pessoa nova não vai a
 * log nenhum.
 */

type Admin = ReturnType<typeof createAdminClient>

/** O e-mail do Auth: o login é por usuário (ARQUITETURA §5, "Conta por e-mail"). */
export const emailInterno = (usuario: string) => `${usuario}@usuarios.cvrj.local`
export const iniciais = (nome: string) => nome.split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0]).join('').toUpperCase()

/** Senha que ninguém conhece: a conta existe, mas só entra quem abrir o link. */
export const senhaInacessivel = () => `${randomBytes(24).toString('base64url')}A1`

export async function emailEmUso(admin: Admin, email: string, excetoId?: string) {
  let q = admin.from('profiles').select('id').eq('email', email)
  if (excetoId) q = q.neq('id', excetoId)
  const { data } = await q.maybeSingle()
  return Boolean(data)
}

/** O número já está confirmado em outra conta (whatsapp_contas: um número, uma conta)? É só aviso: o convite sai igual. */
export async function numeroEmUso(admin: Admin, numero: string): Promise<boolean> {
  const { data } = await admin.from('whatsapp_contas').select('user_id').eq('numero', numero).maybeSingle()
  return Boolean(data)
}

export async function auditarAcesso(admin: Admin, linha: { workspace_id: string; ator_id: string; alvo_id: string | null; acao: string; detalhes?: Record<string, unknown> }) {
  const { error } = await admin.from('auditoria_de_acesso').insert({ ...linha, detalhes: linha.detalhes ?? {} })
  // Auditoria que falha não desfaz a ação já feita, mas não pode sumir calada.
  if (error) console.error('[usuarios] auditoria não gravada:', linha.acao, error.message)
}

/**
 * O Correio usa `setor_membros` para decidir por qual caixa cada pessoa envia.
 * Quando a coordenação muda, o setor de mesmo nome acompanha — só ele: outros
 * vínculos de setor que o admin fez à mão no Correio ficam como estão.
 */
export async function sincronizarSetor(admin: Admin, workspaceId: string, userId: string, antiga: string, nova: string) {
  if (antiga === nova) return
  const { data: setores } = await admin.from('setores').select('id, nome').eq('workspace_id', workspaceId)
  const achar = (nome: string) => nome ? (setores ?? []).find((s) => s.nome.toLowerCase() === nome.toLowerCase()) : undefined
  const velho = achar(antiga)
  const novo = achar(nova)
  if (velho) await admin.from('setor_membros').delete().eq('setor_id', velho.id).eq('user_id', userId)
  if (novo) await admin.from('setor_membros').upsert({ setor_id: novo.id, user_id: userId, workspace_id: workspaceId }, { onConflict: 'setor_id,user_id' })
}

/** As telas que mostram contas e convites; `equipe`: também a Equipe (o cadastro liga ou cria a ficha do RH). */
export function revalidarContas(opcoes: { equipe?: boolean } = {}) {
  revalidatePath('/usuarios')
  revalidatePath('/pessoas')
  revalidatePath('/pessoas/adicionar')
  revalidatePath('/configuracoes', 'layout')
  if (opcoes.equipe) revalidatePath('/equipe')
}

// ------------------------------------------------------------------ criar

/**
 * Cria a conta: Auth, perfil, vínculo com o espaço e setor do Correio. Sem
 * mandar nada. Qualquer falha no meio desfaz a conta: conta sem perfil ou
 * sem vínculo existe no Auth e não entra em lugar nenhum. O vínculo vai pela
 * `sessao` de quem está logado (o RLS confere o admin; o gatilho audita).
 */
export async function criarConta(admin: Admin, sessao: SupabaseClient, workspaceId: string, d: {
  nome: string; usuario: string; papel: Papel; coordenacao: string; cargo: string; email: string | null; senha: string; convite: boolean
}): Promise<string> {
  const { data: existente } = await admin.from('profiles').select('id').eq('username', d.usuario).maybeSingle()
  if (existente) throw new Error(`O usuário @${d.usuario} já existe.`)
  if (d.email && await emailEmUso(admin, d.email)) throw new Error('Este e-mail já está em uso por outra conta.')

  const { data: criado, error: erroAuth } = await admin.auth.admin.createUser({
    email: emailInterno(d.usuario), password: d.senha, email_confirm: true,
    user_metadata: { username: d.usuario, full_name: d.nome },
  })
  if (erroAuth || !criado.user) throw new Error('Não foi possível criar a conta. Confira se o usuário já não existe.')
  const userId = criado.user.id

  const { error: erroPerfil } = await admin.from('profiles').insert({
    id: userId, username: d.usuario, full_name: d.nome, job_title: d.cargo, initials: iniciais(d.nome),
    // Convite: a pessoa escolhe a senha no link, não há provisória a trocar.
    trocar_senha: !d.convite, email: d.email,
  })
  if (erroPerfil) {
    await admin.auth.admin.deleteUser(userId)
    throw new Error('Não foi possível criar o perfil.')
  }

  const { error: erroVinculo } = await sessao.from('workspace_members').insert({
    workspace_id: workspaceId, user_id: userId, role: d.papel, coordination: d.coordenacao || null,
  })
  if (erroVinculo) {
    await admin.auth.admin.deleteUser(userId)
    throw new Error('Não foi possível vincular a pessoa ao espaço.')
  }

  await sincronizarSetor(admin, workspaceId, userId, '', d.coordenacao)
  return userId
}

/**
 * Manda o link para criar a senha por e-mail e/ou WhatsApp. O link é um só;
 * a marca do canal vai junto dele (lib/contas/convite.ts), e é ela que decide
 * o que o primeiro acesso prova. Pelo WhatsApp, a mensagem pode levar também o
 * link da ficha do RH.
 */
export async function mandarConvite(admin: Admin, p: {
  workspaceId: string; userId: string; nome: string; usuario: string; email: string | null; numero: string | null
  adminId: string; convidadoPor: string; urlDaFicha?: string | null
}): Promise<EnvioDoConvite> {
  const porEmail = Boolean(p.email && emailConfigurado())
  const token = await emitirToken(admin, {
    userId: p.userId, finalidade: 'definir_senha', validadeMin: VALIDADE_MIN.definir_senha, criadoPor: p.adminId,
    email: marcaDoConvite({ porEmail, numero: p.numero }) ?? undefined,
  })
  const url = urlDoLink('/redefinir-senha', token)
  const horas = VALIDADE_MIN.definir_senha / 60
  const envio: EnvioDoConvite = { email: false, whatsapp: null }
  if (porEmail && p.email) envio.email = await enviarComSeguranca(p.email, emailDeConvite({ nome: p.nome, usuario: p.usuario, url, horas, convidadoPor: p.convidadoPor }))
  if (p.numero) {
    // Sem userId: a conta acabou de nascer e ainda não tem WhatsApp confirmado; a fila apaga o texto depois do envio.
    const entrega = await entregar(admin, p.workspaceId, {
      numero: p.numero, tipo: 'aviso', categoria: 'conta', userId: null,
      texto: textoDoConviteDoPalacio({ nome: p.nome, usuario: p.usuario, url, horas, convidadoPor: p.convidadoPor, urlDaFicha: p.urlDaFicha }),
    })
    envio.whatsapp = entrega.situacao
    if (entrega.situacao === 'falhou') envio.erroDoWhatsapp = entrega.erro
    if (entrega.situacao === 'na_fila' && entrega.motivo === 'cota') envio.pelaCota = true
  }
  return envio
}

/** Usuário livre a partir do nome: nome.sobrenome, e nome.sobrenome2, 3… se já existir (ou já reservado nesta leva). */
export async function usuarioLivre(admin: Admin, nome: string, reservados: Set<string>): Promise<string> {
  const base = baseDoUsuario(nome)
  const { data } = await admin.from('profiles').select('username').like('username', `${base}%`)
  const livre = usuarioLivreEntre(base, new Set([...(data ?? []).map((p) => p.username as string), ...reservados]))
  if (!livre) throw new Error(`Não há usuário livre para ${nome}.`)
  return livre
}

// ------------------------------------------------------------------ o cadastro de uma pessoa

/** O que vale para todas as pessoas de uma leva: quem convida, os setores e os canais ligados agora. */
export type AmbienteDoCadastro = {
  workspaceId: string
  adminId: string
  convidadoPor: string
  setores: string[]
  canais: CanaisLigados
  /** Os usuários já dados nesta leva (duas pessoas com o mesmo nome no mesmo envio). */
  reservados: Set<string>
}

export async function ambienteDoCadastro(admin: Admin, p: { workspaceId: string; adminId: string; convidadoPor: string }): Promise<AmbienteDoCadastro> {
  const [setores, whatsapp] = await Promise.all([nomesDosSetores(admin, p.workspaceId), configDoWhatsapp(p.workspaceId)])
  // Sem o WhatsApp do Palácio ligado, o número ainda vai para a ficha, mas o convite não sai por ele.
  return { ...p, setores, canais: { whatsapp: Boolean(whatsapp), email: emailConfigurado() }, reservados: new Set() }
}

/** O resultado de uma pessoa: a linha da tela e, se a conta nasceu, o que o retorno pelo WhatsApp e o sino contam. */
export type ResultadoDoCadastro = {
  nome: string
  /** O convite saiu (por e-mail, pelo WhatsApp ou na fila). A conta pode ter nascido com `ok` falso: veja `conta`. */
  ok: boolean
  mensagem: string
  conta?: { userId: string; usuario: string; email: string | null; numeroDoConvite: string | null; envio: EnvioDoConvite; sobreAFicha: string; fichaId: string | null }
}

/**
 * O cadastro de quem entra na equipe, de uma pessoa: confere o pedido (as regras da tela; `semAdmin` para o que veio
 * do WhatsApp), cria a conta em modo convite (usuário livre a partir do nome, ou `usuario`, o que foi escolhido na
 * confirmação), liga a ficha do RH que existia ou cria uma (pela mesma função do RH, salvar_membro_equipe, pela
 * sessão — ela audita), põe o pedido para completar a ficha na mesma mensagem do convite, se pedido, manda o convite
 * e registra "usuario_criado" na auditoria de acesso (`origem: 'whatsapp'`: o pedido veio do WhatsApp e foi
 * confirmado no Palácio; a auditoria diz). A ficha que não sai não desfaz o acesso: a linha diz o que faltou. Nunca
 * lança (menos o controle do Next): o que não deu volta em `mensagem`.
 */
export async function cadastrar(admin: Admin, sessao: SupabaseClient, ambiente: AmbienteDoCadastro, pedido: PedidoDeCadastro, opcoes: { usuario?: string; semAdmin?: boolean; origem?: 'whatsapp' } = {}): Promise<ResultadoDoCadastro> {
  const conferido = conferirCadastro(pedido, { setores: ambiente.setores, canais: ambiente.canais, semAdmin: opcoes.semAdmin })
  if (!conferido.ok) return { nome: conferido.nome || '(sem nome)', ok: false, mensagem: conferido.erro }
  const c = conferido.cadastro
  try {
    return await criarComFichaEConvite(admin, sessao, ambiente, c, opcoes.usuario, opcoes.origem)
  } catch (causa) {
    return { nome: c.nome || '(sem nome)', ok: false, mensagem: mensagemDoErro(causa, 'não foi possível convidar') }
  }
}

async function criarComFichaEConvite(admin: Admin, sessao: SupabaseClient, ambiente: AmbienteDoCadastro, c: CadastroConferido, escolhido?: string, origem?: 'whatsapp'): Promise<ResultadoDoCadastro> {
  const ws = ambiente.workspaceId
  const { nome, email, numero, numeroDoConvite } = c
  let usuario: string
  if (escolhido !== undefined) {
    usuario = escolhido.trim().toLowerCase()
    const problema = problemaDoUsuario(usuario)
    if (problema) throw new Error(problema)
  } else {
    usuario = await usuarioLivre(admin, nome, ambiente.reservados)
  }
  ambiente.reservados.add(usuario)
  const userId = await criarConta(admin, sessao, ws, { nome, usuario, papel: c.papel, coordenacao: c.coordenacao, cargo: c.cargo, email, senha: senhaInacessivel(), convite: true })

  // A ficha do RH: a que já existia ganha o login; sem ficha, nasce agora (pela mesma função do RH, que audita).
  let fichaId: string | null = null
  let sobreAFicha = ''
  const doRh = (p: Record<string, unknown>, id: string | null) => sessao.rpc('salvar_membro_equipe', { p_workspace_id: ws, p_id: id, p })
  try {
    if (c.fichaId) {
      const [{ data: ficha }, { data: pessoais }] = await Promise.all([
        admin.from('equipe_membros').select('id, user_id').eq('id', c.fichaId).eq('workspace_id', ws).maybeSingle(),
        admin.from('equipe_pessoais').select('telefone_pessoal').eq('membro_id', c.fichaId).maybeSingle(),
      ])
      if (ficha && !ficha.user_id) {
        const p: Record<string, unknown> = { user_id: userId }
        if (numero && !String(pessoais?.telefone_pessoal ?? '').trim()) p.telefone_pessoal = formatarNumero(numero)
        const { error } = await doRh(p, ficha.id as string)
        if (error) throw error
        fichaId = ficha.id as string
        sobreAFicha = 'ficha do RH ligada'
      } else {
        sobreAFicha = ficha ? 'a ficha do RH já estava ligada a outro login: confira em Recursos humanos' : 'a ficha do RH não foi achada'
      }
    } else if (c.criarFicha) {
      const { data: novaFicha, error } = await doRh({
        // "Outro / a definir": a ficha entra em "sem admissão ou vínculo" até o RH completar o contrato.
        nome, cargo: c.cargo, setor: c.coordenacao, user_id: userId, vinculo: 'outro',
        ...(email ? { [campoDoEmailNaFicha(email)]: email } : {}),
        ...(numero ? { telefone_pessoal: formatarNumero(numero) } : {}),
      }, null)
      if (error || !novaFicha) throw error ?? new Error('ficha não criada')
      fichaId = novaFicha as string
      sobreAFicha = 'ficha do RH criada'
    }
  } catch (causa) {
    const detalhe = (causa as { code?: string; message?: string })?.code === 'P0001' ? (causa as { message: string }).message : 'erro no RH'
    sobreAFicha = `a ficha do RH não saiu (${detalhe}): cadastre em Recursos humanos`
  }

  // O pedido para completar a ficha vai junto do convite, na mesma mensagem do WhatsApp.
  let urlDaFicha: string | null = null
  if (c.pedirFicha && fichaId && numeroDoConvite) {
    try {
      const r = await criarConviteDaFicha({ workspaceId: ws, membroId: fichaId, criadoPor: ambiente.adminId, incluiDocumentos: false, porWhatsapp: false, numeroDoConvite })
      urlDaFicha = r.link
      if (urlDaFicha) sobreAFicha = [sobreAFicha, 'pedido para completar a ficha junto'].filter(Boolean).join('; ')
    } catch {
      sobreAFicha = [sobreAFicha, 'o pedido da ficha não saiu'].filter(Boolean).join('; ')
    }
  }

  const envio = await mandarConvite(admin, { workspaceId: ws, userId, nome, usuario, email, numero: numeroDoConvite, adminId: ambiente.adminId, convidadoPor: ambiente.convidadoPor, urlDaFicha })
  await auditarAcesso(admin, {
    workspace_id: ws, ator_id: ambiente.adminId, alvo_id: userId, acao: 'usuario_criado',
    detalhes: {
      usuario, papel: c.papel, coordenacao: c.coordenacao, senha: modoDoConvite(email, numeroDoConvite),
      email_enviado: envio.email, whatsapp: envio.whatsapp, ficha: sobreAFicha || null, ...(origem ? { origem } : {}),
    },
  })
  return {
    nome, ok: saiu(envio), mensagem: mensagemDoCadastro({ envio, email, numeroDoConvite, usuario, sobreAFicha }),
    conta: { userId, usuario, email, numeroDoConvite, envio, sobreAFicha, fichaId },
  }
}
