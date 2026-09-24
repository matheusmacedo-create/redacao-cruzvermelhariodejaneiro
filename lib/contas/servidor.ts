import 'server-only'
import { createHash, randomBytes } from 'node:crypto'
import { createAdminClient } from '@/lib/supabase/admin'
import { emailConfigurado, enviarEmailDeConta } from '@/lib/newsletter/resend'
import { urlBase } from '@/lib/newsletter/contexto'
import { emailDeAviso, type AvisoDeSeguranca, type EmailPronto } from './emails'

/**
 * Links de uso único e avisos por e-mail da conta.
 *
 * O código do link são 32 bytes aleatórios (base64url). No banco vai só o
 * sha-256 dele: um vazamento da tabela não entrega nenhum link utilizável.
 */

type Admin = ReturnType<typeof createAdminClient>
export type Finalidade = 'definir_senha' | 'redefinir_senha' | 'confirmar_email'

/** Quanto vale cada link. Convite é longo (a pessoa pode demorar a ver). */
export const VALIDADE_MIN: Record<Finalidade | 'redefinir_pelo_admin', number> = {
  definir_senha: 72 * 60,
  redefinir_senha: 60,
  redefinir_pelo_admin: 24 * 60,
  confirmar_email: 48 * 60,
}

export const hashDoToken = (token: string) => createHash('sha256').update(token, 'utf8').digest('hex')
const tokenValidoNoFormato = (token: string) => /^[A-Za-z0-9_-]{43}$/.test(token)

export const urlDoLink = (caminho: '/redefinir-senha' | '/confirmar-email', token: string) => `${urlBase()}${caminho}?t=${encodeURIComponent(token)}`
export const urlDeLogin = () => `${urlBase()}/`

/**
 * Emite um link novo e invalida os pendentes da mesma finalidade: só o
 * último e-mail enviado funciona, e um link antigo esquecido na caixa de
 * entrada não fica valendo.
 */
export async function emitirToken(admin: Admin, p: { userId: string; finalidade: Finalidade; validadeMin: number; email?: string; criadoPor?: string }) {
  await admin.from('tokens_de_conta').update({ usado_em: new Date().toISOString() })
    .eq('user_id', p.userId).eq('finalidade', p.finalidade).is('usado_em', null)
  const token = randomBytes(32).toString('base64url')
  const { error } = await admin.from('tokens_de_conta').insert({
    user_id: p.userId, finalidade: p.finalidade, token_hash: hashDoToken(token), email: p.email ?? null,
    criado_por: p.criadoPor ?? null, expira_em: new Date(Date.now() + p.validadeMin * 60_000).toISOString(),
  })
  if (error) throw new Error('Não foi possível gerar o link.')
  return token
}

/** Invalida todos os links de senha pendentes (a senha acabou de mudar). */
export async function revogarLinksDeSenha(admin: Admin, userId: string) {
  await admin.from('tokens_de_conta').update({ usado_em: new Date().toISOString() })
    .eq('user_id', userId).in('finalidade', ['definir_senha', 'redefinir_senha']).is('usado_em', null)
}

export type TokenLido = {
  id: string; finalidade: Finalidade; email: string | null; expiraEm: string
  pessoa: { id: string; nome: string; usuario: string; ativo: boolean; email: string | null; emailConfirmado: boolean }
}

/** Só lê (a tela que mostra o formulário). Não consome. */
export async function lerToken(admin: Admin, token: string, finalidades: Finalidade[]): Promise<TokenLido | null> {
  if (!tokenValidoNoFormato(token)) return null
  const { data } = await admin.from('tokens_de_conta')
    .select('id, finalidade, email, expira_em, usado_em, profiles:user_id(id, full_name, username, active, email, email_confirmado_em)')
    .eq('token_hash', hashDoToken(token)).maybeSingle()
  if (!data || data.usado_em || new Date(data.expira_em) <= new Date() || !finalidades.includes(data.finalidade as Finalidade)) return null
  const p = (Array.isArray(data.profiles) ? data.profiles[0] : data.profiles) as { id: string; full_name: string; username: string; active: boolean; email: string | null; email_confirmado_em: string | null } | null
  if (!p) return null
  return {
    id: data.id, finalidade: data.finalidade as Finalidade, email: data.email, expiraEm: data.expira_em,
    pessoa: { id: p.id, nome: p.full_name, usuario: p.username, ativo: p.active, email: p.email, emailConfirmado: Boolean(p.email_confirmado_em) },
  }
}

/**
 * Consome o link: UPDATE condicional, atômico. Se dois pedidos chegarem ao
 * mesmo tempo, só um recebe a linha de volta.
 */
export async function consumirToken(admin: Admin, token: string, finalidades: Finalidade[]): Promise<TokenLido | null> {
  const lido = await lerToken(admin, token, finalidades)
  if (!lido) return null
  const { data } = await admin.from('tokens_de_conta').update({ usado_em: new Date().toISOString() })
    .eq('id', lido.id).is('usado_em', null).gt('expira_em', new Date().toISOString())
    .select('id').maybeSingle()
  return data ? lido : null
}

/** O espaço da pessoa (para a auditoria). Prefere a Produção. */
export async function espacoDaPessoa(admin: Admin, userId: string): Promise<string | null> {
  const { data } = await admin.from('workspace_members').select('workspace_id, workspaces(kind)').eq('user_id', userId)
  const lista = (data ?? []) as { workspace_id: string; workspaces: { kind?: string } | { kind?: string }[] | null }[]
  const kind = (l: (typeof lista)[number]) => (Array.isArray(l.workspaces) ? l.workspaces[0] : l.workspaces)?.kind
  return (lista.find((l) => kind(l) === 'production') ?? lista[0])?.workspace_id ?? null
}

export async function auditarConta(admin: Admin, linha: { userId: string; atorId: string | null; acao: string; detalhes?: Record<string, unknown>; workspaceId?: string | null }) {
  const workspaceId = linha.workspaceId ?? await espacoDaPessoa(admin, linha.userId)
  if (!workspaceId) return
  const { error } = await admin.from('auditoria_de_acesso').insert({
    workspace_id: workspaceId, ator_id: linha.atorId, alvo_id: linha.userId, acao: linha.acao, detalhes: linha.detalhes ?? {},
  })
  if (error) console.error('[contas] auditoria não gravada:', linha.acao, error.message)
}

/**
 * Envia um e-mail de conta. Nunca lança: o e-mail é aviso, não a ação.
 * Senha trocada continua trocada se o Resend estiver fora do ar — mas o
 * motivo vai para o log, e quem chamou fica sabendo que não saiu.
 */
export async function enviarComSeguranca(para: string, email: EmailPronto): Promise<boolean> {
  if (!emailConfigurado()) {
    console.error('[contas] RESEND_API_KEY ausente: e-mail de conta não enviado.')
    return false
  }
  try {
    await enviarEmailDeConta({ para, ...email })
    return true
  } catch (causa) {
    console.error('[contas] e-mail não enviado:', causa instanceof Error ? causa.message : causa)
    return false
  }
}

/** Aviso de segurança para o e-mail CONFIRMADO da pessoa. Sem e-mail, nada. */
export async function avisar(admin: Admin, userId: string, aviso: AvisoDeSeguranca, paraEmail?: string): Promise<boolean> {
  const { data: p } = await admin.from('profiles').select('full_name, email, email_confirmado_em').eq('id', userId).maybeSingle()
  const destino = paraEmail ?? (p?.email && p.email_confirmado_em ? p.email : null)
  if (!p || !destino) return false
  return enviarComSeguranca(destino, emailDeAviso({ nome: p.full_name, quando: new Date(), aviso, urlDeLogin: urlDeLogin() }))
}

/** Hash do IP para o limite de pedidos. Com sal: o hash sozinho não revela o IP. */
export function hashDoIp(ip: string): string {
  // O sal é derivado (não é a chave nem um pedaço dela) e nunca sai daqui.
  const sal = createHash('sha256').update(`ip:${process.env.SUPABASE_SERVICE_ROLE_KEY ?? 'redacao'}`).digest('hex')
  return createHash('sha256').update(`${sal}:${ip}`, 'utf8').digest('hex')
}
