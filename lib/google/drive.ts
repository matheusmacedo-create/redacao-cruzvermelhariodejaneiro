import 'server-only'
import { createAdminClient } from '@/lib/supabase/admin'
import { obterChave } from '@/lib/integracoes/chaves'
import { alertarIntegracao } from '@/lib/integracoes/alertas'
import { lerObjeto, type ConfigDoR2 } from '@/lib/armazenamento/r2'
import { apiDoGoogle } from './api'
import { CLIENTE_RECUSADO, chamarToken, clienteOAuth, GmailError } from './gmail'
import {
  PASTA_RAIZ, TAMANHO_MAXIMO_NO_DRIVE, chaveDaPasta, faixaDaConsulta, faixaDoPedaco, linkDaPasta, linkDoArquivo, motivoDaFalhaDoDrive, pedidoDaConta,
  pedidoDeBuscarPasta, pedidoDeConferirPasta, pedidoDeCriarPasta, pedidoDeInicioDoEnvio, proximoInicio, textoDaFalhaDoDrive, type PedidoAoDrive,
} from './drive-regras'

type Admin = ReturnType<typeof createAdminClient>

/**
 * O Google Drive do Palácio: a pasta "Palácio – Arquivos" no Drive da conta da filial, onde caem a cópia dos envios
 * que chegam pelo WhatsApp e os documentos que a equipe guarda por lá (lib/whatsapp/drive.ts). As regras, sem rede,
 * estão em ./drive-regras.ts.
 *
 * Uma conexão própria, no padrão da de administrador (lib/google/diretorio.ts): o mesmo cliente OAuth e a mesma
 * volta (/api/google/retorno, com o state "drive.…"), o refresh token no cofre como `google_drive` e quem e quando
 * em google_drive_conexao (com o id da pasta raiz). Daqui só sai um token de acesso de curta duração, usado no
 * servidor. Escopo ÚNICO: drive.file — o Palácio só enxerga o que ele mesmo criou (a raiz, as subpastas e os
 * arquivos que mandou); nada do resto do Drive da conta. Sem openid: a conta conectada é lida no about do Drive.
 *
 * Três regras, as das outras integrações:
 *  - nunca lança: cada função devolve { ok: true, … } ou { ok: false, erro } com uma frase legível;
 *  - a autorização que expira ou é revogada (invalid_grant na troca, 401 de novo depois do token novo, o escopo que
 *    falta) vira "expirada" na conexão, e só a troca de "ativa" para "expirada" avisa a administração (categoria
 *    "integracoes", um alerta a cada 6 h: lib/integracoes/alertas.ts); o Drive cheio também avisa;
 *  - o envio é em partes (uploadType=resumable, 8 MB por vez, até 64 MB), retomado de onde parou se a rede cair.
 */

export const ESCOPOS_DRIVE = ['https://www.googleapis.com/auth/drive.file']

export type FalhaDoDrive = { ok: false; erro: string; reconectar?: boolean }
/** Uma pasta ou um arquivo no Drive: o id e o link para abrir (webViewLink). */
export type NoDrive = { ok: true; id: string; link: string }

const SEM_CONEXAO = 'O Google Drive ainda não foi conectado. Um administrador conecta em Configurações → E-mail dos setores → Google Drive.'

class ErroDoDrive extends Error {
  constructor(message: string, public reconectar = false) {
    super(message)
    this.name = 'ErroDoDrive'
  }
}

const falha = (erro: string, reconectar = false): FalhaDoDrive => ({ ok: false, erro, ...(reconectar ? { reconectar } : {}) })

// ------------------------------------------------------------------ o token

const cache = new Map<string, { token: string; expira: number }>()

/** A troca de "ativa" para "expirada" (e só ela) avisa a administração. */
async function marcarExpirada(workspaceId: string): Promise<void> {
  try {
    const { data: virou } = await createAdminClient().from('google_drive_conexao').update({ estado: 'expirada' })
      .eq('workspace_id', workspaceId).eq('estado', 'ativa').select('email_conta').maybeSingle()
    if (virou) await alertarIntegracao({ integracao: 'google_drive', workspaceId, conta: (virou.email_conta as string | null) ?? null })
  } catch (causa) {
    console.error('[drive] conexão não marcada como expirada:', causa instanceof Error ? causa.message : causa)
  }
}

async function tokenDoDrive(workspaceId: string): Promise<string> {
  const guardado = cache.get(workspaceId)
  if (guardado && guardado.expira > Date.now() + 60_000) return guardado.token
  const refresh = await obterChave(workspaceId, 'google_drive')
  if (!refresh) throw new ErroDoDrive(SEM_CONEXAO, true)
  let cliente: { clientId: string; clientSecret: string }
  try { cliente = await clienteOAuth(workspaceId) } catch (causa) { throw new ErroDoDrive(causa instanceof Error ? causa.message : SEM_CONEXAO) }
  try {
    const dados = await chamarToken({ refresh_token: refresh, client_id: cliente.clientId, client_secret: cliente.clientSecret, grant_type: 'refresh_token' })
    const token = String(dados.access_token ?? '')
    cache.set(workspaceId, { token, expira: Date.now() + Number(dados.expires_in ?? 3000) * 1000 })
    return token
  } catch (causa) {
    if (causa instanceof GmailError && causa.reconectar) {
      await marcarExpirada(workspaceId)
      throw new ErroDoDrive(textoDaFalhaDoDrive('reconectar'), true)
    }
    if (causa instanceof GmailError && causa.message === CLIENTE_RECUSADO) await alertarIntegracao({ integracao: 'google_oauth', workspaceId, motivo: 'chave' })
    throw new ErroDoDrive(causa instanceof Error ? causa.message : textoDaFalhaDoDrive('outro'))
  }
}

/** Esquece o token e a pasta raiz guardados nesta instância (a reconexão e a desconexão chamam). */
export const esquecerTokenDoDrive = (workspaceId: string) => {
  cache.delete(workspaceId)
  raizes.delete(workspaceId)
}

// ------------------------------------------------------------------ os pedidos

type Resposta = { ok: boolean; status: number; dados: Record<string, unknown>; local: string | null; range: string | null }

/** O endereço do pedido; só fora de produção, o servidor de mentira dos testes (GOOGLE_API_TESTE), com a mesma consulta. */
function noServidor(url: string): string {
  const u = new URL(url)
  return `${apiDoGoogle(`${u.origin}${u.pathname}`)}${u.search}`
}

async function pedir(token: string, url: string, p: { metodo: string; cabecalhos?: Record<string, string>; corpo?: string | Uint8Array }, ms = 20_000): Promise<Resposta> {
  try {
    const res = await fetch(url, {
      method: p.metodo,
      headers: { Authorization: `Bearer ${token}`, ...(p.cabecalhos ?? {}) },
      body: p.corpo,
      cache: 'no-store',
      // O 308 do envio em partes é "continue de onde parou", não redirecionamento.
      redirect: 'manual',
      signal: AbortSignal.timeout(ms),
    })
    const dados = await res.json().catch(() => ({})) as Record<string, unknown>
    return { ok: res.ok, status: res.status, dados, local: res.headers.get('location'), range: res.headers.get('range') }
  } catch {
    return { ok: false, status: 0, dados: {}, local: null, range: null }
  }
}

/** O pedido com o token; 401 tenta de novo uma vez com um token novo, e o segundo 401 marca a conexão como expirada. */
async function comToken(workspaceId: string, fazer: (token: string) => Promise<Resposta>): Promise<Resposta> {
  let r = await fazer(await tokenDoDrive(workspaceId))
  if (r.status === 401) {
    cache.delete(workspaceId)
    r = await fazer(await tokenDoDrive(workspaceId))
    if (r.status === 401) await marcarExpirada(workspaceId)
  }
  return r
}

const chamar = (workspaceId: string, p: PedidoAoDrive) =>
  comToken(workspaceId, (token) => pedir(token, noServidor(p.url), { metodo: p.metodo, cabecalhos: p.cabecalhos, corpo: p.corpo }))

const razao = (r: Resposta): string => {
  const e = r.dados.error as { status?: string; errors?: { reason?: string }[] } | undefined
  return String(e?.errors?.[0]?.reason ?? e?.status ?? '')
}

/** A falha do pedido, legível; a autorização que caiu marca a conexão, e o Drive cheio avisa a administração. */
async function falhaDe(workspaceId: string, r: Resposta): Promise<FalhaDoDrive> {
  const motivo = motivoDaFalhaDoDrive(r.status, razao(r))
  if (motivo === 'reconectar') await marcarExpirada(workspaceId)
  if (motivo === 'cota') await alertarIntegracao({ integracao: 'google_drive', workspaceId, motivo: 'servico' })
  return falha(textoDaFalhaDoDrive(motivo), motivo === 'reconectar')
}

/** Roda e transforma o erro de token (sem conexão, expirada, cliente recusado) em falha legível. */
async function semLancar<T>(fazer: () => Promise<T | FalhaDoDrive>): Promise<T | FalhaDoDrive> {
  try {
    return await fazer()
  } catch (causa) {
    if (causa instanceof ErroDoDrive) return falha(causa.message, causa.reconectar)
    console.error('[drive] pedido falhou:', causa instanceof Error ? causa.message : causa)
    return falha(textoDaFalhaDoDrive('outro'))
  }
}

const noDrive = (dados: Record<string, unknown>, link: (id: string) => string): NoDrive | null => {
  const id = typeof dados.id === 'string' ? dados.id : ''
  if (!id) return null
  return { ok: true, id, link: typeof dados.webViewLink === 'string' && dados.webViewLink.startsWith('https://') ? dados.webViewLink : link(id) }
}

// ------------------------------------------------------------------ as pastas

/** A pasta raiz de cada espaço, por 10 minutos nesta instância (sem conferir a cada arquivo de um envio). */
const raizes = new Map<string, { pasta: NoDrive; ate: number }>()
/** Duas cópias ao mesmo tempo não criam a mesma pasta duas vezes (nesta instância). */
const criando = new Map<string, Promise<NoDrive | FalhaDoDrive>>()

/**
 * A pasta "Palácio – Arquivos": a guardada em google_drive_conexao, se ainda existe; senão a que o Palácio já tinha
 * criado no Meu Drive (a reconexão da mesma conta a acha de novo); senão, uma nova. O id fica guardado.
 */
export async function garantirPastaRaiz(workspaceId: string): Promise<NoDrive | FalhaDoDrive> {
  const lembrada = raizes.get(workspaceId)
  if (lembrada && lembrada.ate > Date.now()) return lembrada.pasta
  return semLancar(async () => {
    const admin = createAdminClient()
    const { data: conexao } = await admin.from('google_drive_conexao').select('pasta_raiz_id').eq('workspace_id', workspaceId).maybeSingle()
    let pasta: NoDrive | null = null
    const guardada = typeof conexao?.pasta_raiz_id === 'string' ? conexao.pasta_raiz_id : ''
    if (guardada) {
      const r = await chamar(workspaceId, pedidoDeConferirPasta(guardada))
      if (r.ok && r.dados.trashed !== true) pasta = noDrive(r.dados, linkDaPasta)
      else if (!r.ok && r.status !== 404 && motivoDaFalhaDoDrive(r.status, razao(r)) !== 'sem_acesso') return falhaDe(workspaceId, r)
    }
    if (!pasta) {
      const busca = await chamar(workspaceId, pedidoDeBuscarPasta(PASTA_RAIZ, 'root'))
      if (!busca.ok) return falhaDe(workspaceId, busca)
      const achada = (Array.isArray(busca.dados.files) ? busca.dados.files : [])[0] as Record<string, unknown> | undefined
      pasta = achada ? noDrive(achada, linkDaPasta) : null
    }
    if (!pasta) {
      const criada = await chamar(workspaceId, pedidoDeCriarPasta(PASTA_RAIZ, null))
      if (!criada.ok) return falhaDe(workspaceId, criada)
      pasta = noDrive(criada.dados, linkDaPasta)
      if (!pasta) return falha(textoDaFalhaDoDrive('outro'))
    }
    if (pasta.id !== guardada) {
      const { error } = await admin.from('google_drive_conexao').update({ pasta_raiz_id: pasta.id, pasta_raiz_link: pasta.link }).eq('workspace_id', workspaceId)
      if (error) console.error('[drive] pasta raiz não guardada:', error.code)
    }
    raizes.set(workspaceId, { pasta, ate: Date.now() + 10 * 60_000 })
    return pasta
  })
}

/** A subpasta com esse nome dentro da pasta-mãe: a que já existe (criada pelo Palácio), ou uma nova. */
function filha(workspaceId: string, paiId: string, nome: string): Promise<NoDrive | FalhaDoDrive> {
  const chave = `${workspaceId}:${paiId}:${chaveDaPasta(nome)}`
  const emCurso = criando.get(chave)
  if (emCurso) return emCurso
  const promessa = semLancar(async () => {
    const busca = await chamar(workspaceId, pedidoDeBuscarPasta(nome, paiId))
    if (!busca.ok) return falhaDe(workspaceId, busca)
    const achada = (Array.isArray(busca.dados.files) ? busca.dados.files : [])[0] as Record<string, unknown> | undefined
    const existente = achada ? noDrive(achada, linkDaPasta) : null
    if (existente) return existente
    const criada = await chamar(workspaceId, pedidoDeCriarPasta(nome, paiId))
    if (!criada.ok) return falhaDe(workspaceId, criada)
    return noDrive(criada.dados, linkDaPasta) ?? falha(textoDaFalhaDoDrive('outro'))
  }).finally(() => criando.delete(chave))
  criando.set(chave, promessa)
  return promessa
}

/**
 * A pasta do caminho (já normalizado e conferido: drive-regras.ts, normalizarCaminho e podeGuardarEm), dentro da
 * raiz, criando o que faltar. Sem partes, a própria raiz.
 */
export async function garantirPasta(workspaceId: string, partes: readonly string[]): Promise<NoDrive | FalhaDoDrive> {
  const raiz = await garantirPastaRaiz(workspaceId)
  if (!raiz.ok) return raiz
  let atual: NoDrive = raiz
  for (const nome of partes) {
    let proxima = await filha(workspaceId, atual.id, nome)
    // A raiz guardada sumiu no meio do caminho (alguém a apagou): uma volta só, com a raiz de novo.
    if (!proxima.ok && atual === raiz && proxima.erro === textoDaFalhaDoDrive('nao_existe')) {
      raizes.delete(workspaceId)
      const outra = await garantirPastaRaiz(workspaceId)
      if (!outra.ok) return outra
      atual = outra
      proxima = await filha(workspaceId, atual.id, nome)
    }
    if (!proxima.ok) return proxima
    atual = proxima
  }
  return atual
}

// ------------------------------------------------------------------ o envio do arquivo

const esperar = (ms: number) => new Promise((r) => setTimeout(r, ms))

/**
 * Manda os bytes para a pasta, em partes (uploadType=resumable): começa a sessão, manda 8 MB por vez e, se a rede
 * cair ou o Google responder 5xx, pergunta até onde chegou e continua dali (3 tentativas por parte). A sessão vencida
 * (404/410) recomeça uma vez. Devolve o id e o link do arquivo.
 */
export async function enviarAoDrive(workspaceId: string, a: { pastaId: string; nome: string; mime: string; conteudo: Buffer; descricao?: string | null }): Promise<NoDrive | FalhaDoDrive> {
  const total = a.conteudo.length
  if (!total) return falha('O arquivo veio vazio.')
  if (total > TAMANHO_MAXIMO_NO_DRIVE) return falha('Arquivo grande demais para guardar no Drive por aqui (até 64 MB).')
  return semLancar(async () => {
    const iniciar = async (): Promise<string | FalhaDoDrive> => {
      const r = await chamar(workspaceId, pedidoDeInicioDoEnvio({ nome: a.nome, mime: a.mime, tamanho: total, pastaId: a.pastaId, descricao: a.descricao }))
      if (!r.ok) return falhaDe(workspaceId, r)
      return r.local?.startsWith('https://') || r.local?.startsWith('http://') ? r.local : falha(textoDaFalhaDoDrive('outro'))
    }
    let sessao = await iniciar()
    if (typeof sessao !== 'string') return sessao
    let inicio = 0
    let tentativas = 0
    let recomecou = false
    while (inicio < total) {
      const { fim, cabecalho } = faixaDoPedaco(inicio, total)
      const url = sessao
      const r = await comToken(workspaceId, (token) => pedir(token, url, {
        metodo: 'PUT', cabecalhos: { 'Content-Type': a.mime || 'application/octet-stream', 'Content-Range': cabecalho }, corpo: new Uint8Array(a.conteudo.subarray(inicio, fim + 1)),
      }, 120_000))
      if (r.status === 200 || r.status === 201) return noDrive(r.dados, linkDoArquivo) ?? falha(textoDaFalhaDoDrive('outro'))
      if (r.status === 308) {
        inicio = proximoInicio(r.range)
        tentativas = 0
        continue
      }
      if ((r.status === 404 || r.status === 410) && !recomecou) {
        recomecou = true
        sessao = await iniciar()
        if (typeof sessao !== 'string') return sessao
        inicio = 0
        continue
      }
      if (r.status === 0 || r.status >= 500 || r.status === 429) {
        if (++tentativas > 3) return falhaDe(workspaceId, r)
        await esperar(tentativas * 1_000)
        const consulta = await comToken(workspaceId, (token) => pedir(token, url, { metodo: 'PUT', cabecalhos: { 'Content-Range': faixaDaConsulta(total) } }))
        if (consulta.status === 200 || consulta.status === 201) return noDrive(consulta.dados, linkDoArquivo) ?? falha(textoDaFalhaDoDrive('outro'))
        if (consulta.status === 308) inicio = proximoInicio(consulta.range)
        continue
      }
      return falhaDe(workspaceId, r)
    }
    return falha(textoDaFalhaDoDrive('outro'))
  })
}

/** Um arquivo que já está no R2 (os envios), copiado para a pasta. */
export async function copiarDoR2ParaODrive(workspaceId: string, r2: { config: ConfigDoR2; bucket: string }, chave: string, destino: { pastaId: string; nome: string; mime: string; descricao?: string | null }): Promise<NoDrive | FalhaDoDrive> {
  let conteudo: Buffer | null
  try {
    conteudo = await lerObjeto(r2.config, r2.bucket, chave)
  } catch (causa) {
    console.error('[drive] arquivo não lido do R2:', causa instanceof Error ? causa.message : causa)
    return falha('Não consegui ler o arquivo no armazenamento agora.')
  }
  if (!conteudo) return falha('O arquivo não está mais no armazenamento.')
  return enviarAoDrive(workspaceId, { ...destino, conteudo })
}

// ------------------------------------------------------------------ a conexão

/** A conta que autorizou, pelo about do Drive, com o token de acesso da volta do consentimento; "" se não deu. */
export async function contaDoDrive(accessToken: string): Promise<string> {
  if (!accessToken) return ''
  const p = pedidoDaConta()
  const r = await pedir(accessToken, noServidor(p.url), { metodo: p.metodo })
  const usuario = r.ok ? r.dados.user as { emailAddress?: unknown } | undefined : undefined
  return typeof usuario?.emailAddress === 'string' ? usuario.emailAddress.slice(0, 200) : ''
}

export type ConexaoDoDrive = { email: string; estado: 'ativa' | 'expirada'; pastaRaizLink: string | null; conectadaEm: string }

/**
 * A conexão do espaço: null sem conexão — e também sem a tabela (a migração do Drive ainda não foi aplicada: não há
 * como ter conectado); ok: false quando não deu para ler por outro motivo.
 */
export async function conexaoDoDrive(admin: Admin, workspaceId: string): Promise<{ ok: true; conexao: ConexaoDoDrive | null } | { ok: false }> {
  try {
    const { data, error } = await admin.from('google_drive_conexao').select('email_conta, estado, pasta_raiz_link, conectada_em').eq('workspace_id', workspaceId).maybeSingle()
    if (error?.code === '42P01' || error?.code === 'PGRST205') return { ok: true, conexao: null }
    if (error) return { ok: false }
    if (!data) return { ok: true, conexao: null }
    return {
      ok: true,
      conexao: {
        email: String(data.email_conta ?? ''), estado: data.estado === 'expirada' ? 'expirada' : 'ativa',
        pastaRaizLink: typeof data.pasta_raiz_link === 'string' ? data.pasta_raiz_link : null, conectadaEm: String(data.conectada_em ?? ''),
      },
    }
  } catch {
    return { ok: false }
  }
}

/** O Drive está conectado e com a autorização em dia? Sem a tabela, sem a linha ou expirada: não (e nada muda no WhatsApp). */
export async function driveConectado(admin: Admin, workspaceId: string): Promise<boolean> {
  const c = await conexaoDoDrive(admin, workspaceId)
  return c.ok && c.conexao?.estado === 'ativa'
}
