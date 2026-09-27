import 'server-only'
import { createAdminClient } from '@/lib/supabase/admin'
import { obterCampos, obterChave } from '@/lib/integracoes/chaves'
import { urlBase } from '@/lib/newsletter/contexto'
import { apiDoGoogle } from './api'

/**
 * A conexão da Redação com o Gmail da conta do Workspace.
 *
 * Uma conta só (a dona dos aliases), autorizada uma vez por um administrador.
 * A autorização (refresh token) mora no cofre; daqui só sai um token de
 * acesso de curta duração, usado no servidor para enviar e para ler a lista
 * de aliases. Nenhum setor recebe token nem senha.
 *
 * Escopos, os mínimos para o trabalho:
 *  - gmail.send: enviar;
 *  - gmail.modify: ler a caixa de entrada dos setores e marcar como lida ou
 *    arquivar. Não apaga nada para sempre (isso seria o escopo total do Gmail).
 *    Cada setor só vê o que é do endereço dele (lib/correio/leitura.ts);
 *  - gmail.settings.basic: ler a lista "enviar como" e as assinaturas;
 *  - openid email: saber QUAL conta foi conectada.
 *
 * A leitura entrou depois do envio: uma conexão feita antes dela continua
 * enviando, mas a caixa de entrada pede para um administrador reconectar
 * (semLeitura).
 */

export const ESCOPOS = [
  'openid',
  'email',
  'https://www.googleapis.com/auth/gmail.send',
  'https://www.googleapis.com/auth/gmail.modify',
  'https://www.googleapis.com/auth/gmail.settings.basic',
]


/** A conexão foi feita antes da leitura existir: o token não tem gmail.modify. */
export const SEM_LEITURA = 'A autorização do Google não inclui a permissão necessária. Reconecte a conta em Configurações.'
export const semLeitura = (causa: unknown) => causa instanceof GmailError && causa.message === SEM_LEITURA

export class GmailError extends Error {
  constructor(message: string, public status = 0, public reconectar = false) {
    super(message)
    this.name = 'GmailError'
  }
}

export const urlDeRetorno = () => `${urlBase()}/api/google/retorno`

export async function clienteOAuth(workspaceId: string): Promise<{ clientId: string; clientSecret: string }> {
  const c = await obterCampos(workspaceId, 'google_oauth')
  if (!c) throw new GmailError('Falta o cliente OAuth do Google: um administrador cola o ID e a chave secreta em Configurações → Integrações.')
  return { clientId: c.clientId, clientSecret: c.clientSecret }
}

export function urlDeAutorizacao(clientId: string, estado: string): string {
  const u = new URL('https://accounts.google.com/o/oauth2/v2/auth')
  u.searchParams.set('client_id', clientId)
  u.searchParams.set('redirect_uri', urlDeRetorno())
  u.searchParams.set('response_type', 'code')
  u.searchParams.set('scope', ESCOPOS.join(' '))
  // offline + consent: é o que garante o refresh token, inclusive numa
  // reconexão (sem consent o Google devolve só token de acesso).
  u.searchParams.set('access_type', 'offline')
  u.searchParams.set('prompt', 'consent')
  u.searchParams.set('include_granted_scopes', 'true')
  u.searchParams.set('state', estado)
  return u.toString()
}

async function chamarToken(corpo: Record<string, string>) {
  const res = await fetch(apiDoGoogle('https://oauth2.googleapis.com/token'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(corpo),
    cache: 'no-store',
    signal: AbortSignal.timeout(15_000),
  })
  const dados = await res.json().catch(() => ({})) as Record<string, unknown>
  if (!res.ok) {
    const codigo = String(dados.error ?? '')
    throw new GmailError(
      codigo === 'invalid_grant'
        ? 'A autorização do Google foi revogada ou expirou. Um administrador precisa reconectar a conta em Configurações.'
        : codigo === 'invalid_client'
          ? 'O Google recusou o cliente OAuth: confira o ID e a chave secreta em Configurações → Integrações.'
          : `O Google recusou a autorização (${codigo || res.status}).`,
      res.status,
      codigo === 'invalid_grant',
    )
  }
  return dados
}

/** Troca o código da volta do consentimento pela autorização duradoura. */
export async function trocarCodigo(workspaceId: string, codigo: string): Promise<{ refreshToken: string; email: string }> {
  const { clientId, clientSecret } = await clienteOAuth(workspaceId)
  const dados = await chamarToken({
    code: codigo, client_id: clientId, client_secret: clientSecret,
    redirect_uri: urlDeRetorno(), grant_type: 'authorization_code',
  })
  const refreshToken = typeof dados.refresh_token === 'string' ? dados.refresh_token : ''
  if (!refreshToken) throw new GmailError('O Google não devolveu autorização duradoura. Remova o acesso do Palácio Virtual em myaccount.google.com/permissions e conecte de novo.')
  // O id_token veio direto do Google, pela conexão TLS da troca: basta ler.
  const idToken = typeof dados.id_token === 'string' ? dados.id_token : ''
  let email = ''
  try { email = String(JSON.parse(Buffer.from(idToken.split('.')[1] ?? '', 'base64url').toString('utf8')).email ?? '') } catch { email = '' }
  return { refreshToken, email }
}

const cache = new Map<string, { token: string; expira: number }>()

/** Token de acesso de curta duração, renovado quando falta 1 minuto. */
export async function tokenDeAcesso(workspaceId: string): Promise<string> {
  const guardado = cache.get(workspaceId)
  if (guardado && guardado.expira > Date.now() + 60_000) return guardado.token

  const refresh = await obterChave(workspaceId, 'google_gmail')
  if (!refresh) throw new GmailError('A conta do Google ainda não foi conectada. Um administrador conecta em Configurações → E-mail do setor.', 0, true)
  const { clientId, clientSecret } = await clienteOAuth(workspaceId)
  try {
    const dados = await chamarToken({ refresh_token: refresh, client_id: clientId, client_secret: clientSecret, grant_type: 'refresh_token' })
    const token = String(dados.access_token ?? '')
    cache.set(workspaceId, { token, expira: Date.now() + Number(dados.expires_in ?? 3000) * 1000 })
    return token
  } catch (causa) {
    if (causa instanceof GmailError && causa.reconectar) {
      await createAdminClient().from('google_conexao').update({ estado: 'expirada' }).eq('workspace_id', workspaceId)
    }
    throw causa
  }
}

export const esquecerToken = (workspaceId: string) => cache.delete(workspaceId)

async function gmail<T>(workspaceId: string, caminho: string, init?: RequestInit): Promise<T> {
  const token = await tokenDeAcesso(workspaceId)
  const res = await fetch(`${apiDoGoogle('https://gmail.googleapis.com/gmail/v1/users/me')}${caminho}`, {
    ...init,
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', ...(init?.headers ?? {}) },
    cache: 'no-store',
    signal: AbortSignal.timeout(20_000),
  })
  const dados = await res.json().catch(() => ({})) as { error?: { message?: string } }
  if (!res.ok) {
    if (res.status === 401) esquecerToken(workspaceId)
    const motivo = dados.error?.message ?? `HTTP ${res.status}`
    throw new GmailError(
      res.status === 403 && /scope|insufficient/i.test(motivo)
        ? SEM_LEITURA
        : res.status === 429 ? 'Limite de envio do Gmail atingido. Tente mais tarde.'
          : `O Gmail recusou: ${motivo}`,
      res.status,
      res.status === 401 || res.status === 403,
    )
  }
  return dados as T
}

export type AliasDoGmail = {
  email: string
  nome: string
  assinatura: string
  responderPara: string
  principal: boolean
  verificado: boolean
}

/** A lista "enviar como" da conta, com assinatura de cada endereço. */
export async function listarAliases(workspaceId: string): Promise<AliasDoGmail[]> {
  const dados = await gmail<{ sendAs?: Record<string, unknown>[] }>(workspaceId, '/settings/sendAs')
  return (dados.sendAs ?? []).map((a) => ({
    email: String(a.sendAsEmail ?? '').toLowerCase(),
    nome: String(a.displayName ?? ''),
    assinatura: String(a.signature ?? ''),
    responderPara: String(a.replyToAddress ?? ''),
    principal: Boolean(a.isPrimary),
    // O principal não tem verificação; alias precisa estar "accepted".
    verificado: Boolean(a.isPrimary) || a.verificationStatus === 'accepted',
  })).filter((a) => a.email)
}

/** Envia; com `threadId`, a mensagem entra na conversa (a resposta fica junto da original no Gmail). */
export async function enviarPeloGmail(workspaceId: string, raw: string, threadId: string | null = null): Promise<{ id: string; threadId: string }> {
  const r = await gmail<{ id?: string; threadId?: string }>(workspaceId, '/messages/send', {
    method: 'POST',
    body: JSON.stringify(threadId ? { raw, threadId } : { raw }),
  })
  return { id: r.id ?? '', threadId: r.threadId ?? '' }
}

// ---------------------------------------------------------------- leitura (caixa de entrada)

export type ConversaResumida = { id: string; historyId?: string }

/** As conversas de uma busca (a busca já vem presa ao endereço do setor: lib/correio/leitura.ts). */
export async function listarConversas(workspaceId: string, q: string, pagina: string | null, quantas = 25): Promise<{ conversas: ConversaResumida[]; proxima: string | null; estimativa: number }> {
  const u = new URLSearchParams({ q, maxResults: String(quantas) })
  if (pagina) u.set('pageToken', pagina)
  const r = await gmail<{ threads?: ConversaResumida[]; nextPageToken?: string; resultSizeEstimate?: number }>(workspaceId, `/threads?${u}`)
  return { conversas: r.threads ?? [], proxima: r.nextPageToken ?? null, estimativa: r.resultSizeEstimate ?? 0 }
}

/** Quantas mensagens batem com a busca (estimativa do Gmail: serve para o contador de não lidas). */
export async function contarMensagens(workspaceId: string, q: string): Promise<number> {
  const u = new URLSearchParams({ q, maxResults: '100', fields: 'messages/id,resultSizeEstimate' })
  const r = await gmail<{ messages?: unknown[]; resultSizeEstimate?: number }>(workspaceId, `/messages?${u}`)
  return Math.max(r.messages?.length ?? 0, r.resultSizeEstimate ?? 0)
}

/** Uma conversa inteira. `metadata` traz só os cabeçalhos (para a lista); `full`, os corpos. */
export async function lerConversa(workspaceId: string, threadId: string, formato: 'metadata' | 'full'): Promise<{ id: string; messages: import('@/lib/correio/leitura').MensagemDoGmail[] }> {
  const u = new URLSearchParams({ format: formato })
  if (formato === 'metadata') for (const h of ['From', 'To', 'Cc', 'Subject', 'Date', 'Delivered-To', 'X-Original-To', 'Content-Type']) u.append('metadataHeaders', h)
  const r = await gmail<{ id?: string; messages?: import('@/lib/correio/leitura').MensagemDoGmail[] }>(workspaceId, `/threads/${encodeURIComponent(threadId)}?${u}`)
  return { id: r.id ?? threadId, messages: r.messages ?? [] }
}

/** Uma mensagem só (para conferir de quem é antes de entregar um anexo). */
export async function lerMensagemDoGmail(workspaceId: string, id: string, formato: 'metadata' | 'full'): Promise<import('@/lib/correio/leitura').MensagemDoGmail> {
  return gmail(workspaceId, `/messages/${encodeURIComponent(id)}?format=${formato}`)
}

/** Os bytes de um anexo. */
export async function baixarAnexo(workspaceId: string, mensagemId: string, anexoId: string): Promise<Uint8Array> {
  const r = await gmail<{ data?: string }>(workspaceId, `/messages/${encodeURIComponent(mensagemId)}/attachments/${encodeURIComponent(anexoId)}`)
  return new Uint8Array(Buffer.from((r.data ?? '').replace(/-/g, '+').replace(/_/g, '/'), 'base64'))
}

/** Põe e tira rótulos das mensagens (UNREAD para lida/não lida, INBOX para arquivar). */
export async function mudarRotulos(workspaceId: string, ids: string[], por: string[], tira: string[]): Promise<void> {
  if (!ids.length) return
  await gmail(workspaceId, '/messages/batchModify', {
    method: 'POST',
    body: JSON.stringify({ ids: ids.slice(0, 1000), addLabelIds: por, removeLabelIds: tira }),
  })
}
