'use server'

import { headers } from 'next/headers'
import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { obterWorkspaceSemVerificacao, requireWorkspace } from '@/lib/session'
import { createAdminClient } from '@/lib/supabase/admin'
import { mensagemDoErro } from '@/lib/erro-de-acao'
import { problemaDaSenha } from '@/lib/usuarios/senha'
import { emailConfigurado } from '@/lib/newsletter/resend'
import { urlBase } from '@/lib/newsletter/contexto'
import { emailDeConfirmacao, emailDePedidoDeAjuda, emailDeRedefinicao, emailValido } from '@/lib/contas/emails'
import { problemaDeSenhaVazada } from '@/lib/apis-publicas/servidor'
import {
  auditarConta, avisar, avisarTrocaDeWhatsapp, consumirToken, emitirToken, enviarComSeguranca, hashDoIp, lerToken, revogarLinksDeSenha,
  espacoDaPessoa, urlDoLink, VALIDADE_MIN,
} from '@/lib/contas/servidor'
import { oQueOLinkProva } from '@/lib/contas/convite'
import { entregar } from '@/lib/whatsapp/fila'
import { numeroCanonico, textoDoLinkDeSenha } from '@/lib/whatsapp/regras'

/**
 * O lado de conta que não precisa de administrador: esqueci minha senha,
 * links de senha, confirmação e troca de e-mail, login por e-mail e o pedido
 * de ajuda de quem perdeu o celular do app autenticador.
 *
 * Várias destas actions são PÚBLICAS (a pessoa não está logada). Por isso:
 *  - nenhuma diz se uma conta existe ("se existir, enviamos");
 *  - o pedido de link é limitado por origem e por pessoa;
 *  - quem prova a identidade é o link de uso único, que só chega à caixa de
 *    entrada confirmada da pessoa.
 */

type Resultado = { erro?: string; recado?: string }
const texto = (f: FormData, k: string) => String(f.get(k) ?? '').trim()

async function ipDaRequisicao(): Promise<string> {
  const h = await headers()
  return (h.get('x-forwarded-for')?.split(',')[0] || h.get('x-real-ip') || 'desconhecido').trim()
}

// ------------------------------------------------------------------ esqueci minha senha

const RESPOSTA_NEUTRA = 'Se existir uma conta com esse usuário, e-mail ou WhatsApp e ela tiver um e-mail de recuperação ou um WhatsApp confirmado, enviamos um link para criar uma senha nova (vale por 1 hora; no e-mail, confira também o spam). Não chegou nada em alguns minutos? Provavelmente a conta ainda não tem nenhum dos dois: peça a um administrador uma senha temporária e, ao entrar, cadastre o e-mail em Meu perfil.'

/** Usuário, e-mail confirmado ou WhatsApp confirmado: o id da conta, ou null. */
async function contaDoIdentificador(admin: ReturnType<typeof createAdminClient>, identificador: string): Promise<string | null> {
  if (identificador.includes('@')) {
    const { data } = await admin.from('profiles').select('id').eq('email', identificador).not('email_confirmado_em', 'is', null).maybeSingle()
    return (data?.id as string | undefined) ?? null
  }
  // Só dígitos e sinais de telefone: é um número (usuário sempre tem letra).
  const numero = /^[\d\s()+.-]+$/.test(identificador) ? numeroCanonico(identificador) : null
  if (numero) {
    const { data } = await admin.from('whatsapp_contas').select('user_id').eq('numero', numero).maybeSingle()
    return (data?.user_id as string | undefined) ?? null
  }
  const { data } = await admin.from('profiles').select('id').eq('username', identificador).maybeSingle()
  return (data?.id as string | undefined) ?? null
}

/**
 * O link vai a todos os canais confirmados da conta: o e-mail de recuperação e o WhatsApp (whatsapp_contas só
 * guarda número confirmado). Quem perdeu o acesso ao e-mail, ou nunca cadastrou um, recupera pelo número em que
 * recebeu o convite. O WhatsApp sai como mensagem de segurança (avisos pausados não seguram).
 */
export async function pedirRedefinicaoDeSenha(formData: FormData): Promise<Resultado> {
  try {
    const identificador = texto(formData, 'identificador').toLowerCase().slice(0, 254)
    if (identificador.length < 3) return { erro: 'Informe seu usuário, e-mail ou WhatsApp.' }

    const admin = createAdminClient()
    // Limite por origem: 5 pedidos a cada 15 minutos. A tela é pública; sem
    // isto, qualquer um usaria o formulário para despejar e-mail na caixa de
    // alguém da equipe.
    const ipHash = hashDoIp(await ipDaRequisicao())
    const desde = new Date(Date.now() - 15 * 60_000).toISOString()
    const { count } = await admin.from('pedidos_de_recuperacao').select('id', { count: 'exact', head: true }).eq('ip_hash', ipHash).gte('criado_em', desde)
    if ((count ?? 0) >= 5) return { erro: 'Muitos pedidos seguidos. Espere alguns minutos e tente de novo.' }
    await admin.from('pedidos_de_recuperacao').insert({ ip_hash: ipHash })

    const userId = await contaDoIdentificador(admin, identificador)
    if (!userId) return { recado: RESPOSTA_NEUTRA }
    const [{ data: pessoa }, { data: whatsapp }] = await Promise.all([
      admin.from('profiles').select('id, username, full_name, email, email_confirmado_em, active').eq('id', userId).maybeSingle(),
      admin.from('whatsapp_contas').select('numero').eq('user_id', userId).maybeSingle(),
    ])

    // Daqui para baixo, qualquer "não" responde igual ao "sim".
    if (!pessoa || !pessoa.active) return { recado: RESPOSTA_NEUTRA }
    const email = pessoa.email && pessoa.email_confirmado_em ? pessoa.email as string : null
    const numero = (whatsapp?.numero as string | undefined) ?? null
    if (!email && !numero) return { recado: RESPOSTA_NEUTRA }

    // Limite por pessoa: 3 links por hora, venha de onde vier.
    const umaHora = new Date(Date.now() - 60 * 60_000).toISOString()
    const { count: recentes } = await admin.from('tokens_de_conta').select('id', { count: 'exact', head: true })
      .eq('user_id', pessoa.id).eq('finalidade', 'redefinir_senha').gte('criado_em', umaHora)
    if ((recentes ?? 0) >= 3) return { recado: RESPOSTA_NEUTRA }

    const token = await emitirToken(admin, { userId: pessoa.id, finalidade: 'redefinir_senha', validadeMin: VALIDADE_MIN.redefinir_senha })
    const url = urlDoLink('/redefinir-senha', token)
    const [enviado, pelaFila] = await Promise.all([
      email ? enviarComSeguranca(email, emailDeRedefinicao({
        nome: pessoa.full_name, usuario: pessoa.username, url, minutos: VALIDADE_MIN.redefinir_senha, pedidoPor: 'pessoa',
      })) : Promise.resolve(false),
      numero ? linkPeloWhatsapp(admin, { userId: pessoa.id, numero, nome: pessoa.full_name, usuario: pessoa.username, url }) : Promise.resolve(null),
    ])
    await auditarConta(admin, { userId: pessoa.id, atorId: null, acao: 'link_de_senha_pedido', detalhes: { enviado, whatsapp: pelaFila } })
    return { recado: RESPOSTA_NEUTRA }
  } catch (causa) {
    return { erro: mensagemDoErro(causa, 'Não foi possível processar o pedido. Tente de novo.') }
  }
}

/** O link pelo WhatsApp confirmado. Devolve a situação da entrega (para a auditoria); nunca lança. */
async function linkPeloWhatsapp(admin: ReturnType<typeof createAdminClient>, p: { userId: string; numero: string; nome: string | null; usuario: string; url: string }): Promise<string | null> {
  try {
    const workspaceId = await espacoDaPessoa(admin, p.userId)
    if (!workspaceId) return null
    const entrega = await entregar(admin, workspaceId, {
      numero: p.numero, tipo: 'seguranca', categoria: 'conta', userId: p.userId,
      texto: textoDoLinkDeSenha({ nome: p.nome, usuario: p.usuario, url: p.url, minutos: VALIDADE_MIN.redefinir_senha }),
    })
    return entrega.situacao
  } catch (causa) {
    console.error('[contas] link de senha pelo WhatsApp não enviado:', causa instanceof Error ? causa.message : causa)
    return null
  }
}

// ------------------------------------------------------------------ definir / redefinir pelo link

export async function definirSenhaPeloLink(formData: FormData): Promise<Resultado> {
  let destino = '/?senha=redefinida'
  try {
    const token = texto(formData, 't')
    const nova = String(formData.get('novaSenha') ?? '')
    if (nova !== String(formData.get('confirmacao') ?? '')) throw new Error('A confirmação não confere com a nova senha.')

    const admin = createAdminClient()
    const previa = await lerToken(admin, token, ['definir_senha', 'redefinir_senha'])
    if (!previa) throw new Error('Este link expirou ou já foi usado. Peça um novo em "Esqueci minha senha".')
    if (!previa.pessoa.ativo) throw new Error('Esta conta está desativada. Fale com um administrador.')
    const problema = problemaDaSenha(nova, { usuario: previa.pessoa.usuario, nome: previa.pessoa.nome }) ?? await problemaDeSenhaVazada(nova)
    if (problema) throw new Error(problema)

    // Consome ANTES de trocar a senha: se dois envios chegarem juntos, só um passa.
    const lido = await consumirToken(admin, token, ['definir_senha', 'redefinir_senha'])
    if (!lido) throw new Error('Este link expirou ou já foi usado. Peça um novo em "Esqueci minha senha".')
    const userId = lido.pessoa.id

    const { error } = await admin.auth.admin.updateUserById(userId, { password: nova })
    if (error) throw new Error('Não foi possível salvar a senha. Peça um novo link.')

    // O convite foi aberto: fica provado o canal que o recebeu (lib/contas/convite.ts).
    // Só por e-mail, o endereço; só pelo WhatsApp, o número; pelos dois, nada.
    const convite = lido.finalidade === 'definir_senha'
    const prova = convite ? oQueOLinkProva(lido.email) : { email: false, whatsapp: null }
    await admin.from('profiles').update({
      trocar_senha: false, updated_at: new Date().toISOString(),
      ...(prova.email && lido.pessoa.email && !lido.pessoa.emailConfirmado ? { email_confirmado_em: new Date().toISOString() } : {}),
    }).eq('id', userId)
    if (prova.whatsapp) {
      // Os avisos passam a chegar por lá desde o primeiro dia. Número já confirmado em outra conta: fica de fora.
      // Se a conta já tinha outro número (um convite anterior aberto), o antigo fica sabendo da troca.
      const agora = new Date().toISOString()
      const { data: antes } = await admin.from('whatsapp_contas').select('numero').eq('user_id', userId).maybeSingle()
      const { error: erroDoNumero } = await admin.from('whatsapp_contas')
        .upsert({ user_id: userId, numero: prova.whatsapp, confirmado_em: agora, pausado_em: null, atualizado_em: agora }, { onConflict: 'user_id' })
      if (erroDoNumero && erroDoNumero.code !== '23505') console.error('[contas] WhatsApp do convite não ligado:', erroDoNumero.message)
      if (!erroDoNumero) await avisarTrocaDeWhatsapp(admin, userId, { anterior: (antes?.numero as string | undefined) ?? null, novo: prova.whatsapp })
    }
    await revogarLinksDeSenha(admin, userId)
    await admin.rpc('encerrar_sessoes_do_usuario', { p_user_id: userId })
    await auditarConta(admin, { userId, atorId: userId, acao: convite ? 'senha_definida_pelo_convite' : 'senha_redefinida_pelo_link' })
    if (!convite) await avisar(admin, userId, { tipo: 'senha_alterada', como: 'link' })
    destino = convite ? '/?senha=definida' : '/?senha=redefinida'
  } catch (causa) {
    return { erro: mensagemDoErro(causa, 'Não foi possível salvar a senha.') }
  }
  redirect(destino)
}

// ------------------------------------------------------------------ e-mail da conta

/**
 * A própria pessoa informa (ou troca) o e-mail. Nada muda até ela abrir o
 * link no endereço novo — senão uma sessão esquecida aberta bastaria para
 * desviar os links de senha para a caixa de outra pessoa.
 */
export async function pedirTrocaDeEmail(formData: FormData): Promise<Resultado> {
  try {
    const context = await requireWorkspace({ escola: true })
    const email = emailValido(texto(formData, 'email'))
    if (!email) throw new Error('Informe um e-mail válido.')
    if (!emailConfigurado()) throw new Error('O envio de e-mail não está configurado (falta RESEND_API_KEY). Fale com um administrador.')
    const admin = createAdminClient()
    const { data: eu } = await admin.from('profiles').select('full_name, email, email_confirmado_em').eq('id', context.user.id).single()
    if (eu?.email === email && eu.email_confirmado_em) return { recado: 'Este já é o e-mail confirmado da sua conta.' }
    const { data: outro } = await admin.from('profiles').select('id').eq('email', email).neq('id', context.user.id).maybeSingle()
    if (outro) throw new Error('Este e-mail já está em uso por outra conta.')

    const token = await emitirToken(admin, { userId: context.user.id, finalidade: 'confirmar_email', validadeMin: VALIDADE_MIN.confirmar_email, email, criadoPor: context.user.id })
    const enviado = await enviarComSeguranca(email, emailDeConfirmacao({ nome: eu?.full_name ?? '', email, url: urlDoLink('/confirmar-email', token), horas: VALIDADE_MIN.confirmar_email / 60 }))
    if (!enviado) throw new Error('Não foi possível enviar o e-mail de confirmação. Tente de novo em alguns minutos.')
    await auditarConta(admin, { userId: context.user.id, atorId: context.user.id, acao: 'confirmacao_de_email_enviada', workspaceId: context.workspace.id })
    return { recado: `Enviamos um link para ${email}. O e-mail passa a valer quando você abrir o link (vale por 48 horas).` }
  } catch (causa) {
    return { erro: mensagemDoErro(causa, 'Não foi possível enviar a confirmação.') }
  }
}

export async function confirmarEmail(formData: FormData): Promise<Resultado> {
  try {
    const token = texto(formData, 't')
    const admin = createAdminClient()
    const lido = await consumirToken(admin, token, ['confirmar_email'])
    if (!lido || !lido.email) throw new Error('Este link expirou ou já foi usado. Peça outro em Meu perfil.')
    if (!lido.pessoa.ativo) throw new Error('Esta conta está desativada.')

    const anterior = lido.pessoa.emailConfirmado ? lido.pessoa.email : null
    const { error } = await admin.from('profiles')
      .update({ email: lido.email, email_confirmado_em: new Date().toISOString(), updated_at: new Date().toISOString() })
      .eq('id', lido.pessoa.id)
    if (error) throw new Error(error.code === '23505' ? 'Este e-mail passou a ser usado por outra conta. Peça um novo link com outro endereço.' : 'Não foi possível confirmar o e-mail.')

    await auditarConta(admin, { userId: lido.pessoa.id, atorId: lido.pessoa.id, acao: 'email_confirmado', detalhes: { trocou: Boolean(anterior && anterior !== lido.email) } })
    // O endereço antigo fica sabendo: se não foi a pessoa, é por ele que ela descobre.
    if (anterior && anterior !== lido.email) await avisar(admin, lido.pessoa.id, { tipo: 'email_alterado', novo: lido.email }, { email: anterior })
    revalidatePath('/perfil')
    revalidatePath('/usuarios')
    return { recado: `E-mail ${lido.email} confirmado. Os avisos da sua conta passam a chegar nele.` }
  } catch (causa) {
    return { erro: mensagemDoErro(causa, 'Não foi possível confirmar o e-mail.') }
  }
}

// ------------------------------------------------------------------ login por e-mail

// A tradução do login (usuário ou e-mail → conta) mora em lib/contas/login.ts
// e só a action de entrar (app/actions/entrada.ts) a usa: exportada daqui,
// virava um endpoint público que dizia quem tem conta.

// ------------------------------------------------------------------ perdi o celular (2FA)

/**
 * Quem perdeu o celular do app autenticador pede ajuda da própria tela de
 * código. Não remove nada: avisa por e-mail os administradores, que devem
 * confirmar por outro canal antes de remover. Um "perdi o celular" que
 * desligasse a verificação sozinho faria a segunda etapa valer tanto quanto
 * a senha.
 */
export async function pedirAjudaComVerificacao(): Promise<Resultado> {
  try {
    const context = await obterWorkspaceSemVerificacao()
    if (!context) redirect('/')
    const admin = createAdminClient()
    const umaHora = new Date(Date.now() - 60 * 60_000).toISOString()
    const { count } = await admin.from('auditoria_de_acesso').select('id', { count: 'exact', head: true })
      .eq('alvo_id', context.user.id).eq('acao', 'ajuda_com_verificacao_pedida').gte('criado_em', umaHora)
    if ((count ?? 0) > 0) return { recado: 'Os administradores já foram avisados há pouco. Aguarde o contato de um deles.' }

    const { data: admins } = await admin.from('workspace_members')
      .select('user_id, profiles(full_name, email, email_confirmado_em, active)')
      .eq('workspace_id', context.workspace.id).eq('role', 'admin').neq('user_id', context.user.id)
    const destinos = (admins ?? []).map((a) => (Array.isArray(a.profiles) ? a.profiles[0] : a.profiles) as { full_name: string; email: string | null; email_confirmado_em: string | null; active: boolean } | null)
      .filter((p): p is { full_name: string; email: string; email_confirmado_em: string; active: boolean } => Boolean(p?.active && p.email && p.email_confirmado_em))
    let enviados = 0
    for (const d of destinos) {
      const ok = await enviarComSeguranca(d.email, emailDePedidoDeAjuda({
        adminNome: d.full_name, pessoaNome: context.profile?.full_name ?? '', usuario: context.profile?.username ?? '', urlDeUsuarios: `${urlBase()}/usuarios`,
      }))
      if (ok) enviados++
    }
    await auditarConta(admin, { userId: context.user.id, atorId: context.user.id, acao: 'ajuda_com_verificacao_pedida', detalhes: { avisados: enviados }, workspaceId: context.workspace.id })
    return enviados
      ? { recado: `Avisamos ${enviados === 1 ? '1 administrador' : `${enviados} administradores`} por e-mail. Um deles vai confirmar com você e remover a verificação para você cadastrar o app no celular novo.` }
      : { erro: 'Nenhum administrador tem e-mail confirmado para receber o aviso. Fale com um deles pessoalmente.' }
  } catch (causa) {
    return { erro: mensagemDoErro(causa, 'Não foi possível avisar os administradores.') }
  }
}
