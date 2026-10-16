import 'server-only'
import { createAdminClient } from '@/lib/supabase/admin'
import { obterChave } from '@/lib/integracoes/chaves'
import { PASTA, naConsulta, type ItemDoDrive } from '@/lib/arquivos/regras'
import { apiDoGoogle } from './api'
import { chamarToken, clienteOAuth, GmailError } from './gmail'

/**
 * A API do Google Drive, para os Arquivos do setor (lib/arquivos).
 *
 * Autorizada por uma conta Google da filial numa conexão própria, separada
 * da do Gmail e da de administrador: o refresh token mora no cofre como
 * `google_drive`; daqui só sai um token de acesso de curta duração, usado no
 * servidor. A pessoa do Palácio nunca recebe token: recebe a lista da pasta
 * que pode ver e, no envio, o endereço de UMA sessão de envio do Google,
 * que só aceita aquele arquivo naquela pasta.
 *
 * Toda chamada leva supportsAllDrives: a raiz pode estar num Drive
 * compartilhado.
 */

export class ErroDoDrive extends Error {
  constructor(message: string, public status = 0, public reconectar = false) {
    super(message)
    this.name = 'ErroDoDrive'
  }
}

const SEM_CONEXAO = 'O Google Drive ainda não foi ligado. Um administrador liga em Arquivos do setor → “Conectar o Google Drive”.'
const RECONECTAR = 'A autorização do Google Drive expirou ou foi revogada. Um administrador reconecta em Arquivos do setor.'

const cache = new Map<string, { token: string; expira: number }>()

async function tokenDoDrive(workspaceId: string): Promise<string> {
  const guardado = cache.get(workspaceId)
  if (guardado && guardado.expira > Date.now() + 60_000) return guardado.token
  const refresh = await obterChave(workspaceId, 'google_drive')
  if (!refresh) throw new ErroDoDrive(SEM_CONEXAO, 0, true)
  const { clientId, clientSecret } = await clienteOAuth(workspaceId)
  try {
    const dados = await chamarToken({ refresh_token: refresh, client_id: clientId, client_secret: clientSecret, grant_type: 'refresh_token' })
    const token = String(dados.access_token ?? '')
    cache.set(workspaceId, { token, expira: Date.now() + Number(dados.expires_in ?? 3000) * 1000 })
    return token
  } catch (causa) {
    if (causa instanceof GmailError && causa.reconectar) {
      await createAdminClient().from('drive_conexao').update({ estado: 'expirada', updated_at: new Date().toISOString() }).eq('workspace_id', workspaceId)
      throw new ErroDoDrive(RECONECTAR, 0, true)
    }
    throw causa
  }
}

export const esquecerTokenDoDrive = (workspaceId: string) => cache.delete(workspaceId)

const BASE = () => apiDoGoogle('https://www.googleapis.com/drive/v3')
const BASE_DE_ENVIO = () => apiDoGoogle('https://www.googleapis.com/upload/drive/v3')

type Resposta = { ok: boolean; status: number; dados: Record<string, unknown> }

function comTodosOsDrives(caminho: string, query: Record<string, string> = {}): string {
  const q = new URLSearchParams({ supportsAllDrives: 'true', ...query })
  return `${caminho}${caminho.includes('?') ? '&' : '?'}${q.toString()}`
}

async function drive(workspaceId: string, caminho: string, init?: RequestInit): Promise<Resposta> {
  const token = await tokenDoDrive(workspaceId)
  const res = await fetch(`${BASE()}${caminho}`, {
    ...init,
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', ...(init?.headers ?? {}) },
    cache: 'no-store',
    signal: AbortSignal.timeout(20_000),
  })
  const dados = await res.json().catch(() => ({})) as Record<string, unknown>
  if (res.status === 401) esquecerTokenDoDrive(workspaceId)
  return { ok: res.ok, status: res.status, dados }
}

const motivo = (r: Resposta) => String((r.dados.error as { message?: string } | undefined)?.message ?? `HTTP ${r.status}`)

function falha(r: Resposta, padrao: string): never {
  if (r.status === 401) throw new ErroDoDrive(RECONECTAR, 401, true)
  if (r.status === 403 && /insufficient|scope/i.test(motivo(r))) throw new ErroDoDrive('A autorização do Google não inclui o Drive. Um administrador reconecta em Arquivos do setor.', 403, true)
  if (r.status === 403 && /has not been used|disabled/i.test(motivo(r))) throw new ErroDoDrive('A API do Google Drive não está ativada no projeto do Google Cloud do Palácio. Um administrador ativa em console.cloud.google.com → APIs e serviços → Biblioteca → Google Drive API.', 403)
  if (r.status === 403 && /quota|rate ?limit/i.test(motivo(r))) throw new ErroDoDrive('O Google limitou os pedidos por um instante. Espere um pouco e tente de novo.', 403)
  if (r.status === 403) throw new ErroDoDrive('A conta do Google conectada não tem permissão para isto nesta pasta.', 403)
  if (r.status === 404) throw new ErroDoDrive('O item não existe mais no Drive ou a conta conectada perdeu o acesso a ele.', 404)
  throw new ErroDoDrive(`${padrao}: ${motivo(r)}`, r.status)
}

const CAMPOS = 'id,name,mimeType,parents,size,modifiedTime,webViewLink,trashed,capabilities(canEdit,canAddChildren)'

function paraItem(d: Record<string, unknown>): ItemDoDrive & { naLixeira: boolean; podeAcrescentar: boolean } {
  const capacidades = (d.capabilities ?? {}) as { canEdit?: boolean; canAddChildren?: boolean }
  const tamanho = d.size === undefined ? null : Number(d.size)
  return {
    id: String(d.id ?? ''),
    nome: String(d.name ?? ''),
    mime: String(d.mimeType ?? ''),
    pais: Array.isArray(d.parents) ? d.parents.map(String) : [],
    tamanho: tamanho !== null && Number.isFinite(tamanho) ? tamanho : null,
    modificadoEm: typeof d.modifiedTime === 'string' ? d.modifiedTime : null,
    linkNoGoogle: typeof d.webViewLink === 'string' ? d.webViewLink : null,
    podeEditar: Boolean(capacidades.canEdit),
    podeAcrescentar: Boolean(capacidades.canAddChildren),
    naLixeira: Boolean(d.trashed),
  }
}

/** Um item pelo id; null quando não existe (ou a conta não vê). */
export async function obterItemDoDrive(workspaceId: string, id: string) {
  const r = await drive(workspaceId, comTodosOsDrives(`/files/${encodeURIComponent(id)}`, { fields: CAMPOS }))
  if (r.status === 404) return null
  if (!r.ok) falha(r, 'Não foi possível consultar o Drive')
  return paraItem(r.dados)
}

/** O que está dentro de uma pasta, fora da lixeira: até 200 por página. */
export async function listarPastaDoDrive(workspaceId: string, pastaId: string, continuacao?: string) {
  const query: Record<string, string> = {
    q: `'${naConsulta(pastaId)}' in parents and trashed = false`,
    fields: `nextPageToken,files(${CAMPOS})`,
    orderBy: 'folder,name_natural',
    pageSize: '200',
    includeItemsFromAllDrives: 'true',
  }
  if (continuacao) query.pageToken = continuacao
  const r = await drive(workspaceId, comTodosOsDrives('/files', query))
  if (!r.ok) falha(r, 'Não foi possível abrir a pasta no Drive')
  const arquivos = Array.isArray(r.dados.files) ? r.dados.files as Record<string, unknown>[] : []
  return { itens: arquivos.map(paraItem), continuacao: typeof r.dados.nextPageToken === 'string' ? r.dados.nextPageToken : null }
}

export async function criarPastaNoDrive(workspaceId: string, nome: string, paiId: string) {
  const r = await drive(workspaceId, comTodosOsDrives('/files', { fields: CAMPOS }), {
    method: 'POST', body: JSON.stringify({ name: nome, mimeType: PASTA, parents: [paiId] }),
  })
  if (!r.ok) falha(r, 'O Drive não criou a pasta')
  return paraItem(r.dados)
}

export async function renomearNoDrive(workspaceId: string, id: string, nome: string) {
  const r = await drive(workspaceId, comTodosOsDrives(`/files/${encodeURIComponent(id)}`, { fields: CAMPOS }), {
    method: 'PATCH', body: JSON.stringify({ name: nome }),
  })
  if (!r.ok) falha(r, 'O Drive não renomeou')
  return paraItem(r.dados)
}

/** Para a lixeira do Drive (volta por lá em até 30 dias), nunca apagado de vez. */
export async function moverParaLixeiraDoDrive(workspaceId: string, id: string) {
  const r = await drive(workspaceId, comTodosOsDrives(`/files/${encodeURIComponent(id)}`, { fields: 'id' }), {
    method: 'PATCH', body: JSON.stringify({ trashed: true }),
  })
  if (!r.ok) falha(r, 'O Drive não moveu para a lixeira')
}

/**
 * Compartilha com um endereço (pessoa ou grupo do Google), sem mandar
 * e-mail. Devolve false quando o Google recusa o endereço (por exemplo, um
 * apelido que não é conta nem grupo): a pasta continua funcionando pelo
 * Palácio.
 */
export async function compartilharNoDrive(workspaceId: string, id: string, email: string, papel: 'writer' | 'reader' = 'writer'): Promise<boolean> {
  const r = await drive(workspaceId, comTodosOsDrives(`/files/${encodeURIComponent(id)}/permissions`, { sendNotificationEmail: 'false', fields: 'id' }), {
    method: 'POST', body: JSON.stringify({ type: 'user', role: papel, emailAddress: email }),
  })
  if (r.ok) return true
  if (r.status === 400 || r.status === 404) return false
  falha(r, 'O Drive não compartilhou a pasta')
}

/**
 * Abre uma sessão de envio retomável e devolve o endereço dela. O navegador
 * manda o arquivo direto ao Google por esse endereço (PUT), sem passar pela
 * Vercel, que não aceita corpo grande. O cabeçalho Origin na abertura é o que
 * faz o Google aceitar o PUT vindo do navegador (CORS).
 */
export async function abrirEnvioNoDrive(workspaceId: string, a: { nome: string; tipo: string; tamanho: number; paiId: string; origem: string }): Promise<string> {
  const token = await tokenDoDrive(workspaceId)
  const res = await fetch(comTodosOsDrives(`${BASE_DE_ENVIO()}/files`, { uploadType: 'resumable', fields: 'id' }), {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json; charset=UTF-8',
      'X-Upload-Content-Type': a.tipo,
      'X-Upload-Content-Length': String(a.tamanho),
      Origin: a.origem,
    },
    body: JSON.stringify({ name: a.nome, parents: [a.paiId] }),
    cache: 'no-store',
    signal: AbortSignal.timeout(20_000),
  })
  const sessao = res.headers.get('location')
  if (res.ok && sessao) return sessao
  const dados = await res.json().catch(() => ({})) as Record<string, unknown>
  if (res.status === 401) esquecerTokenDoDrive(workspaceId)
  return falha({ ok: false, status: res.status, dados }, 'O Drive não abriu o envio')
}

/** O conteúdo do arquivo (alt=media) ou a exportação de um documento do Google, como resposta crua para repassar. */
export async function conteudoDoDrive(workspaceId: string, id: string, exportarComo?: string): Promise<Response> {
  const token = await tokenDoDrive(workspaceId)
  const caminho = exportarComo
    ? `/files/${encodeURIComponent(id)}/export?mimeType=${encodeURIComponent(exportarComo)}`
    : comTodosOsDrives(`/files/${encodeURIComponent(id)}`, { alt: 'media' })
  const res = await fetch(`${BASE()}${caminho}`, { headers: { Authorization: `Bearer ${token}` }, cache: 'no-store' })
  if (res.ok) return res
  const dados = await res.json().catch(() => ({})) as Record<string, unknown>
  if (res.status === 401) esquecerTokenDoDrive(workspaceId)
  if (res.status === 403 && /exportSizeLimitExceeded|too large/i.test(motivo({ ok: false, status: 403, dados }))) {
    throw new ErroDoDrive('O documento é grande demais para o Google exportar. Abra no Google e baixe por lá.', 403)
  }
  return falha({ ok: false, status: res.status, dados }, 'O Drive não entregou o arquivo')
}
