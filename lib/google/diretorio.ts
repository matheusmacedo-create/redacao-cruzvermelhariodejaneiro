import 'server-only'
import { createAdminClient } from '@/lib/supabase/admin'
import { obterChave } from '@/lib/integracoes/chaves'
import { alertarIntegracao } from '@/lib/integracoes/alertas'
import { apiDoGoogle } from './api'
import { CLIENTE_RECUSADO, chamarToken, clienteOAuth, GmailError } from './gmail'
import { colocarNoGrupo, type Chamar, type PapelNoGrupo } from './grupos-regras'

/**
 * A API de Diretório do Google Workspace (Admin SDK): criar a conta de uma
 * pessoa e pô-la no grupo do setor.
 *
 * Autorizada por uma conta de ADMINISTRADOR do Workspace, numa conexão
 * separada da do Gmail (lib/google/gmail.ts): a do Gmail é a conta dona dos
 * apelidos (contato@), que não precisa — e não deve — ser administradora.
 * O refresh token desta mora no cofre como `google_admin`; daqui só sai um
 * token de acesso de curta duração, usado no servidor. Escopos, os mínimos:
 *  - admin.directory.user: criar e consultar usuários;
 *  - admin.directory.group.member: pôr a pessoa no grupo do setor;
 *  - openid email: saber qual conta administradora autorizou.
 */

export const ESCOPOS_ADMIN = [
  'openid',
  'email',
  'https://www.googleapis.com/auth/admin.directory.user',
  'https://www.googleapis.com/auth/admin.directory.group.member',
  // A troca do apelido de um setor por grupo (lib/google/grupos-regras.ts): criar o grupo e liberar o recebimento de fora.
  'https://www.googleapis.com/auth/admin.directory.group',
  'https://www.googleapis.com/auth/apps.groups.settings',
]

export class ErroDoDiretorio extends Error {
  constructor(message: string, public status = 0, public reconectar = false) {
    super(message)
    this.name = 'ErroDoDiretorio'
  }
}

const SEM_CONEXAO = 'A conta de administrador do Google ainda não foi conectada. Um administrador conecta em Configurações → E-mail dos setores → Criar e-mails pelo link.'

const cache = new Map<string, { token: string; expira: number }>()

async function tokenDeAdmin(workspaceId: string): Promise<string> {
  const guardado = cache.get(workspaceId)
  if (guardado && guardado.expira > Date.now() + 60_000) return guardado.token
  const refresh = await obterChave(workspaceId, 'google_admin')
  if (!refresh) throw new ErroDoDiretorio(SEM_CONEXAO, 0, true)
  const { clientId, clientSecret } = await clienteOAuth(workspaceId)
  try {
    const dados = await chamarToken({ refresh_token: refresh, client_id: clientId, client_secret: clientSecret, grant_type: 'refresh_token' })
    const token = String(dados.access_token ?? '')
    cache.set(workspaceId, { token, expira: Date.now() + Number(dados.expires_in ?? 3000) * 1000 })
    return token
  } catch (causa) {
    if (causa instanceof GmailError && causa.reconectar) {
      // Como no Gmail: só a troca de "ativa" para "expirada" avisa a administração.
      const { data: virou } = await createAdminClient().from('google_admin_conexao').update({ estado: 'expirada' })
        .eq('workspace_id', workspaceId).eq('estado', 'ativa').select('email_conta').maybeSingle()
      if (virou) await alertarIntegracao({ integracao: 'google_admin', workspaceId, conta: (virou.email_conta as string | null) ?? null })
      throw new ErroDoDiretorio('A autorização da conta de administrador do Google expirou ou foi revogada. Reconecte em Configurações → E-mail dos setores.', 0, true)
    }
    if (causa instanceof GmailError && causa.message === CLIENTE_RECUSADO) await alertarIntegracao({ integracao: 'google_oauth', workspaceId, motivo: 'chave' })
    throw causa
  }
}

export const esquecerTokenDeAdmin = (workspaceId: string) => cache.delete(workspaceId)

type Resposta = { ok: boolean; status: number; dados: Record<string, unknown> }

async function diretorio(workspaceId: string, caminho: string, init?: RequestInit): Promise<Resposta> {
  const token = await tokenDeAdmin(workspaceId)
  const res = await fetch(`${apiDoGoogle('https://admin.googleapis.com/admin/directory/v1')}${caminho}`, {
    ...init,
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', ...(init?.headers ?? {}) },
    cache: 'no-store',
    signal: AbortSignal.timeout(20_000),
  })
  const dados = await res.json().catch(() => ({})) as Record<string, unknown>
  if (res.status === 401) esquecerTokenDeAdmin(workspaceId)
  return { ok: res.ok, status: res.status, dados }
}

const motivo = (r: Resposta) => String((r.dados.error as { message?: string } | undefined)?.message ?? `HTTP ${r.status}`)

function falha(r: Resposta, padrao: string): never {
  if (r.status === 401) throw new ErroDoDiretorio('O Google recusou a autorização de administrador. Reconecte em Configurações → E-mail dos setores.', 401, true)
  if (r.status === 403) throw new ErroDoDiretorio('A conta conectada não tem permissão de administrador no Google Workspace para isto. Conecte com uma conta de superadministrador.', 403, true)
  throw new ErroDoDiretorio(`${padrao}: ${motivo(r)}`, r.status)
}

/** A conta já existe no Google (usuário, apelido ou grupo com esse endereço)? */
export async function enderecoOcupadoNoGoogle(workspaceId: string, email: string): Promise<boolean> {
  const r = await diretorio(workspaceId, `/users/${encodeURIComponent(email)}`)
  if (r.ok) return true
  if (r.status === 404) return false
  return falha(r, 'Não foi possível consultar o Google')
}

export type NovaContaDoGoogle = {
  email: string
  primeiroNome: string
  sobrenome: string
  senha: string
  emailDeRecuperacao?: string
  celularDeRecuperacao?: string
  setor?: string
}

/** Cria a conta com senha provisória: o Google obriga a trocar no primeiro acesso. Devolve o id do usuário no Google. */
export async function criarUsuarioNoGoogle(workspaceId: string, c: NovaContaDoGoogle): Promise<string> {
  const corpo: Record<string, unknown> = {
    primaryEmail: c.email,
    name: { givenName: c.primeiroNome, familyName: c.sobrenome },
    password: c.senha,
    changePasswordAtNextLogin: true,
    orgUnitPath: '/',
  }
  if (c.emailDeRecuperacao) corpo.recoveryEmail = c.emailDeRecuperacao
  if (c.celularDeRecuperacao) corpo.recoveryPhone = c.celularDeRecuperacao
  if (c.setor) corpo.organizations = [{ department: c.setor, primary: true }]
  const r = await diretorio(workspaceId, '/users', { method: 'POST', body: JSON.stringify(corpo) })
  if (r.ok) return String(r.dados.id ?? '')
  if (r.status === 409) throw new ErroDoDiretorio('Esse e-mail já existe no Google (como conta, apelido ou grupo). Escolha outro.', 409)
  if (r.status === 412 || /limit|licens/i.test(motivo(r))) throw new ErroDoDiretorio('O Google não deixou criar mais contas: a filial chegou ao limite de usuários do Workspace. Um administrador pede aumento ao suporte do Google.', r.status)
  return falha(r, 'O Google não criou a conta')
}

/**
 * Põe a pessoa no grupo do setor. Devolve false quando o endereço do setor
 * ainda não é um grupo (é apelido do contato@): a conta existe mesmo assim,
 * e a tela de acompanhamento mostra quem ficou de fora.
 */
export async function adicionarAoGrupo(workspaceId: string, grupo: string, email: string, papel: PapelNoGrupo = 'MEMBER'): Promise<boolean> {
  return colocarNoGrupo(chamarGoogleAdmin(workspaceId), grupo, email, papel)
}

/**
 * A chamada ao Google que a lógica da troca de grupos (lib/google/grupos-regras.ts, testada contra um Google de mentira)
 * recebe: o Directory (Admin SDK) e as Configurações de grupo. Mesma conta de administrador, mesmo token.
 */
export function chamarGoogleAdmin(workspaceId: string): Chamar {
  return async (api, caminho, init) => {
    if (api === 'diretorio') {
      return diretorio(workspaceId, caminho, { method: init?.method, ...(init?.corpo !== undefined ? { body: JSON.stringify(init.corpo) } : {}) })
    }
    const token = await tokenDeAdmin(workspaceId)
    // O servidor de teste (GOOGLE_API_TESTE) troca só o endereço; o caminho de /groups/v1 continua o mesmo.
    const base = apiDoGoogle('https://www.googleapis.com/groups/v1').replace(/\/groups\/v1$/, '')
    const res = await fetch(`${base}${caminho}`, {
      method: init?.method ?? 'GET',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      ...(init?.corpo !== undefined ? { body: JSON.stringify(init.corpo) } : {}),
      cache: 'no-store',
      signal: AbortSignal.timeout(20_000),
    })
    const dados = await res.json().catch(() => ({})) as Record<string, unknown>
    if (res.status === 401) esquecerTokenDeAdmin(workspaceId)
    return { ok: res.ok, status: res.status, dados }
  }
}
