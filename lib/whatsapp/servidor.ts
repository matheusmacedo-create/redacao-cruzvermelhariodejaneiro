import 'server-only'
import { createHash, createHmac, randomInt, timingSafeEqual } from 'node:crypto'
import { createAdminClient } from '@/lib/supabase/admin'
import { obterCampos } from '@/lib/integracoes/chaves'
import { urlBase } from '@/lib/newsletter/contexto'
import { estadoDaEvolution, instanciaValida, numeroCanonico, urlDoServidor, type EstadoDaConexao } from './regras'

/**
 * O WhatsApp do Palácio Virtual, pela Evolution API (v2).
 *
 * Três regras, as mesmas das outras integrações:
 *  - Nunca lança. WhatsApp fora do ar não derruba o que chamou (o aviso é
 *    consequência de algo que já foi salvo).
 *  - A chave nunca sai daqui: nem para a tela, nem para o log, nem no texto
 *    de erro (limparErro tira a chave e a URL antes).
 *  - Diagnóstico só lê. Criar instância, conectar, desconectar e ligar o
 *    webhook são ações que alguém pediu na tela de conexão (ARQUITETURA §10.4).
 *
 * Contrato da Evolution conferido no código da v2.3.7: cabeçalho `apikey`
 * (a chave global ou o token da instância; só /instance/create exige a
 * global); corpo do /webhook/set ANINHADO em `webhook` e `events` obrigatório.
 */

type Admin = ReturnType<typeof createAdminClient>

export type ConfigDoWhatsapp = { url: string; instancia: string; chave: string }

/** A configuração do espaço: cofre (Configurações → Integrações) primeiro, ambiente depois. */
export async function configDoWhatsapp(workspaceId: string): Promise<ConfigDoWhatsapp | null> {
  try {
    const doCofre = await obterCampos(workspaceId, 'evolution_api')
    const bruto = doCofre ?? {
      url: process.env.EVOLUTION_API_URL ?? '',
      instancia: process.env.EVOLUTION_INSTANCIA ?? '',
      chave: process.env.EVOLUTION_API_KEY ?? '',
    }
    const url = urlDoServidor(bruto.url)
    const instancia = String(bruto.instancia ?? '').trim()
    const chave = String(bruto.chave ?? '').trim()
    if (!url || !instanciaValida(instancia) || chave.length < 8) return null
    return { url, instancia, chave }
  } catch {
    return null
  }
}

const TEMPO_MAXIMO_MS = 15_000

type Resposta = { ok: boolean; status: number; dados: unknown; erro: string | null }

function limparErro(config: ConfigDoWhatsapp, texto: string): string {
  return texto.split(config.chave).join('[chave]').split(config.url).join('[servidor]').slice(0, 300)
}

/** Mensagem legível de um corpo de erro da Evolution ({ response: { message } }, { message }, { error }). */
function mensagemDoCorpo(dados: unknown): string | null {
  const d = dados && typeof dados === 'object' ? dados as Record<string, unknown> : null
  if (!d) return null
  const resposta = d.response && typeof d.response === 'object' ? d.response as Record<string, unknown> : null
  const candidata = resposta?.message ?? d.message ?? d.error
  if (Array.isArray(candidata)) {
    const primeiro = candidata[0]
    if (primeiro && typeof primeiro === 'object' && (primeiro as Record<string, unknown>).exists === false) return 'Esse número não tem WhatsApp.'
    return candidata.map((c) => (typeof c === 'string' ? c : JSON.stringify(c))).join('; ')
  }
  return typeof candidata === 'string' ? candidata : null
}

async function chamar(config: ConfigDoWhatsapp, metodo: 'GET' | 'POST' | 'DELETE', caminho: string, corpo?: unknown): Promise<Resposta> {
  try {
    const resposta = await fetch(`${config.url}${caminho}`, {
      method: metodo,
      headers: { apikey: config.chave, ...(corpo === undefined ? {} : { 'content-type': 'application/json' }) },
      body: corpo === undefined ? undefined : JSON.stringify(corpo),
      signal: AbortSignal.timeout(TEMPO_MAXIMO_MS),
      cache: 'no-store',
    })
    const bruto = await resposta.text()
    let dados: unknown = null
    try { dados = bruto ? JSON.parse(bruto) : null } catch { dados = bruto }
    // A Evolution devolve alguns erros com 200 e { error: true, message }.
    const erroNoCorpo = dados && typeof dados === 'object' && (dados as Record<string, unknown>).error === true
    if (resposta.ok && !erroNoCorpo) return { ok: true, status: resposta.status, dados, erro: null }
    const motivo = resposta.status === 401 || resposta.status === 403
      ? 'O servidor recusou a chave. Confira a chave da API em Configurações → Integrações.'
      : resposta.status === 404 ? `Não encontrado no servidor (${mensagemDoCorpo(dados) ?? 'confira o nome da instância'}).`
        : mensagemDoCorpo(dados) ?? `O servidor respondeu ${resposta.status}.`
    return { ok: false, status: resposta.status, dados, erro: limparErro(config, motivo) }
  } catch (causa) {
    const nome = causa instanceof Error ? causa.name : ''
    const motivo = nome === 'TimeoutError' || nome === 'AbortError'
      ? 'O servidor da Evolution não respondeu a tempo.'
      : `Não consegui falar com o servidor da Evolution (${causa instanceof Error ? causa.message : 'erro de rede'}).`
    return { ok: false, status: 0, dados: null, erro: limparErro(config, motivo) }
  }
}

const inst = (config: ConfigDoWhatsapp) => encodeURIComponent(config.instancia)
const objeto = (v: unknown): Record<string, unknown> | null => (v && typeof v === 'object' && !Array.isArray(v) ? v as Record<string, unknown> : null)

// ------------------------------------------------------------------ mensagens

export type Envio = { ok: true; id: string | null } | { ok: false; erro: string }

/** Manda um texto. `numero` em dígitos (a Evolution resolve o nono dígito). */
export async function enviarTexto(config: ConfigDoWhatsapp, numero: string, texto: string): Promise<Envio> {
  const r = await chamar(config, 'POST', `/message/sendText/${inst(config)}`, { number: numero, text: texto, linkPreview: false })
  if (!r.ok) return { ok: false, erro: r.erro ?? 'Não foi possível enviar.' }
  const id = objeto(objeto(r.dados)?.key)?.id
  return { ok: true, id: typeof id === 'string' ? id.slice(0, 128) : null }
}

/** O número tem WhatsApp? null = não deu para conferir (segue e deixa o envio dizer). */
export async function temWhatsapp(config: ConfigDoWhatsapp, numero: string): Promise<boolean | null> {
  const r = await chamar(config, 'POST', `/chat/whatsappNumbers/${inst(config)}`, { numbers: [numero] })
  if (!r.ok || !Array.isArray(r.dados)) return null
  const primeiro = objeto(r.dados[0])
  return typeof primeiro?.exists === 'boolean' ? primeiro.exists : null
}

// ------------------------------------------------------------------ conexão

export type SituacaoDaConexao = { estado: EstadoDaConexao; erro: string | null }

export async function situacaoDaConexao(config: ConfigDoWhatsapp): Promise<SituacaoDaConexao> {
  const r = await chamar(config, 'GET', `/instance/connectionState/${inst(config)}`)
  if (!r.ok) return { estado: r.status === 404 ? 'sem_instancia' : 'erro', erro: r.status === 404 ? null : r.erro }
  const state = objeto(objeto(r.dados)?.instance)?.state
  return { estado: state === undefined ? 'sem_instancia' : estadoDaEvolution(state), erro: null }
}

/** Número e nome do WhatsApp conectado. Com o token da instância, depende de o servidor guardar as instâncias; na falta, vazio. */
export async function perfilConectado(config: ConfigDoWhatsapp): Promise<{ numero: string | null; nome: string | null }> {
  const r = await chamar(config, 'GET', `/instance/fetchInstances?instanceName=${inst(config)}`)
  const linha = r.ok && Array.isArray(r.dados) ? objeto(r.dados.find((l) => objeto(l)?.name === config.instancia) ?? r.dados[0]) : null
  const jid = typeof linha?.ownerJid === 'string' ? linha.ownerJid : ''
  const numero = numeroCanonico(`+${jid.split('@')[0].split(':')[0]}`) ?? (typeof linha?.number === 'string' ? numeroCanonico(`+${linha.number}`) : null)
  return { numero, nome: typeof linha?.profileName === 'string' ? linha.profileName.slice(0, 80) : null }
}

export type Qr = { imagem: string | null; codigo: string | null; conectado: boolean; erro: string | null }

/**
 * Pede o QR code (e, com número, o código de pareamento de 8 caracteres,
 * para quem não consegue ler QR). Se já estiver conectado, diz isso.
 */
export async function pedirQr(config: ConfigDoWhatsapp, numero?: string | null): Promise<Qr> {
  const consulta = numero ? `?number=${encodeURIComponent(numero)}` : ''
  const r = await chamar(config, 'GET', `/instance/connect/${inst(config)}${consulta}`)
  if (!r.ok) return { imagem: null, codigo: null, conectado: false, erro: r.erro }
  const d = objeto(r.dados) ?? {}
  if (objeto(d.instance)?.state === 'open') return { imagem: null, codigo: null, conectado: true, erro: null }
  const base64 = typeof d.base64 === 'string' && d.base64.startsWith('data:image/') ? d.base64 : null
  const codigo = typeof d.pairingCode === 'string' && /^[A-Z0-9-]{4,16}$/i.test(d.pairingCode) ? d.pairingCode : null
  if (!base64 && !codigo) return { imagem: null, codigo: null, conectado: false, erro: 'O servidor não devolveu o QR code. Tente de novo em alguns segundos.' }
  return { imagem: base64, codigo, conectado: false, erro: null }
}

/** Cria a instância no servidor. Exige a chave GLOBAL da Evolution (o token de uma instância não cria outra). */
export async function criarInstancia(config: ConfigDoWhatsapp): Promise<{ erro: string | null }> {
  const r = await chamar(config, 'POST', '/instance/create', { instanceName: config.instancia, qrcode: false, integration: 'WHATSAPP-BAILEYS' })
  if (r.ok) return { erro: null }
  if (r.status === 401 || r.status === 403) return { erro: 'Para criar a instância, a chave precisa ser a chave global do servidor (AUTHENTICATION_API_KEY), não o token de uma instância. Ou crie a instância no painel da Evolution (/manager).' }
  return { erro: r.erro }
}

export async function desconectar(config: ConfigDoWhatsapp): Promise<{ erro: string | null }> {
  const r = await chamar(config, 'DELETE', `/instance/logout/${inst(config)}`)
  return { erro: r.ok ? null : r.erro }
}

// ------------------------------------------------------------------ webhook

/** Nome do cabeçalho que a Evolution manda em toda entrega (configurado no /webhook/set). */
export const CABECALHO_DO_WEBHOOK = 'x-palacio-whatsapp'

/**
 * A senha do webhook, derivada da chave (nada novo para guardar). Trocou a
 * chave, a senha muda: é preciso ligar o recebimento de novo na tela.
 */
export function segredoDoWebhook(config: ConfigDoWhatsapp, workspaceId: string): string {
  return createHmac('sha256', config.chave).update(`palacio-whatsapp-webhook:${workspaceId}:${config.instancia}`).digest('hex')
}

export function segredoConfere(config: ConfigDoWhatsapp, workspaceId: string, recebido: string | null): boolean {
  if (!recebido) return false
  const a = Buffer.from(recebido)
  const b = Buffer.from(segredoDoWebhook(config, workspaceId))
  return a.length === b.length && timingSafeEqual(a, b)
}

export const urlDoWebhook = (workspaceId: string) => `${urlBase()}/api/webhooks/whatsapp?w=${encodeURIComponent(workspaceId)}`

const EVENTOS = ['MESSAGES_UPSERT', 'CONNECTION_UPDATE']

export async function ligarWebhook(config: ConfigDoWhatsapp, workspaceId: string): Promise<{ erro: string | null }> {
  const r = await chamar(config, 'POST', `/webhook/set/${inst(config)}`, {
    webhook: {
      enabled: true,
      url: urlDoWebhook(workspaceId),
      headers: { [CABECALHO_DO_WEBHOOK]: segredoDoWebhook(config, workspaceId) },
      byEvents: false,
      base64: false,
      events: EVENTOS,
    },
  })
  return { erro: r.ok ? null : r.erro }
}

export type SituacaoDoWebhook = 'ligado' | 'outro_endereco' | 'desligado' | 'desconhecido'

/** O webhook da instância aponta para cá, ligado e com a senha certa? */
export async function situacaoDoWebhook(config: ConfigDoWhatsapp, workspaceId: string): Promise<SituacaoDoWebhook> {
  const r = await chamar(config, 'GET', `/webhook/find/${inst(config)}`)
  if (!r.ok) return 'desconhecido'
  const w = objeto(r.dados)
  if (!w || w.enabled !== true) return 'desligado'
  if (w.url !== urlDoWebhook(workspaceId)) return 'outro_endereco'
  const cabecalhos = objeto(w.headers)
  const eventos = Array.isArray(w.events) ? w.events : []
  const temEventos = eventos.length === 0 || eventos.includes('MESSAGES_UPSERT')
  return cabecalhos?.[CABECALHO_DO_WEBHOOK] === segredoDoWebhook(config, workspaceId) && temEventos ? 'ligado' : 'outro_endereco'
}

// ------------------------------------------------------------------ registro e envio com registro

export type LinhaDoRegistro = {
  workspaceId: string
  direcao: 'entrada' | 'saida'
  tipo: 'aviso' | 'seguranca' | 'codigo' | 'bot' | 'teste'
  situacao: 'recebida' | 'enviada' | 'falhou' | 'ignorada'
  numero?: string | null
  userId?: string | null
  mensagemId?: string | null
  comando?: string | null
  notificacaoId?: string | null
  erro?: string | null
}

/**
 * Grava no registro. Devolve false se a mensagem de entrada já estava lá
 * (reentrega do webhook) — é o que evita responder duas vezes. Nunca lança.
 */
export async function registrar(admin: Admin, l: LinhaDoRegistro): Promise<boolean> {
  try {
    const { error } = await admin.from('whatsapp_mensagens').insert({
      workspace_id: l.workspaceId, direcao: l.direcao, tipo: l.tipo, situacao: l.situacao,
      numero: l.numero ?? null, user_id: l.userId ?? null, mensagem_id: l.mensagemId ?? null,
      comando: l.comando?.slice(0, 40) ?? null, notificacao_id: l.notificacaoId ?? null, erro: l.erro?.slice(0, 500) ?? null,
    })
    if (error?.code === '23505') return false
    if (error) console.error('[whatsapp] registro não gravado:', error.message)
    return true
  } catch (causa) {
    console.error('[whatsapp] registro não gravado:', causa instanceof Error ? causa.message : causa)
    return true
  }
}

/** Envia e registra. Sem configuração, não faz nada (e diz). */
export async function mandar(admin: Admin, workspaceId: string, p: {
  numero: string; texto: string; tipo: LinhaDoRegistro['tipo']; userId?: string | null; notificacaoId?: string | null; config?: ConfigDoWhatsapp | null
}): Promise<Envio> {
  const config = p.config ?? await configDoWhatsapp(workspaceId)
  if (!config) return { ok: false, erro: 'O WhatsApp do Palácio Virtual não está configurado.' }
  const envio = await enviarTexto(config, p.numero, p.texto)
  await registrar(admin, {
    workspaceId, direcao: 'saida', tipo: p.tipo, situacao: envio.ok ? 'enviada' : 'falhou', numero: p.numero,
    userId: p.userId, mensagemId: envio.ok ? envio.id : null, notificacaoId: p.notificacaoId, erro: envio.ok ? null : envio.erro,
  })
  return envio
}

// ------------------------------------------------------------------ código de confirmação

export const gerarCodigo = () => String(randomInt(0, 1_000_000)).padStart(6, '0')

/** No banco vai só o hash, amarrado à pessoa e ao número. */
export const hashDoCodigo = (userId: string, numero: string, codigo: string) =>
  createHash('sha256').update(`whatsapp:${userId}:${numero}:${codigo}`, 'utf8').digest('hex')

export function codigoConfere(esperado: string, userId: string, numero: string, codigo: string): boolean {
  const a = Buffer.from(esperado, 'hex')
  const b = Buffer.from(hashDoCodigo(userId, numero, codigo), 'hex')
  return a.length === b.length && timingSafeEqual(a, b)
}
