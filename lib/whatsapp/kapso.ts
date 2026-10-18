import 'server-only'
import { createHmac, timingSafeEqual } from 'node:crypto'
import { estadoDoNumeroNaKapso, numeroCanonico, type MotivoDaFalha } from './regras'
import type { Envio, MidiaBaixada, SituacaoDaConexao, SituacaoDoWebhook } from './servidor'

/**
 * O WhatsApp do Palácio pela Kapso (API oficial da Meta, número gerenciado
 * pela Kapso). Quem chama usa servidor.ts. As mesmas três regras de lá: nunca lança, a chave
 * não sai daqui, e só a tela de conexão liga o webhook.
 *
 * Contrato conferido em docs.kapso.ai (outubro de 2026):
 *  - envio pelo proxy da Meta, com o cabeçalho X-API-Key, no formato da Cloud
 *    API (POST /{phone_number_id}/messages);
 *  - texto livre só dentro da janela de 24 h desde a última mensagem da
 *    pessoa; fora dela a Meta recusa (131047) e só sai modelo aprovado;
 *  - webhook por número (kind "kapso", payload v2), assinado com HMAC-SHA256
 *    do corpo cru no cabeçalho X-Webhook-Signature;
 *  - mídia recebida: GET /{media_id} devolve um download_url de 4 minutos.
 *
 * Não há QR code nem instância: o número fica conectado no painel da Kapso.
 */

export type ConfigDaKapso = { provedor: 'kapso'; numeroId: string; chave: string; modelo: string | null }

const META = 'https://api.kapso.ai/meta/whatsapp/v24.0'
const PLATAFORMA = 'https://api.kapso.ai/platform/v1'
const TEMPO_MAXIMO_MS = 15_000
const TEMPO_DO_ENVIO_MS = 30_000
/** Idioma dos modelos aprovados do Palácio. */
const IDIOMA_DO_MODELO = 'pt_BR'

/** O id do número na Meta: só dígitos. */
export const numeroIdValido = (v: string) => /^\d{5,30}$/.test(v)

type Resposta = {
  ok: boolean; status: number; dados: unknown; erro: string | null
  semResposta?: boolean; motivo?: MotivoDaFalha; foraDaJanela?: boolean
}

const objeto = (v: unknown): Record<string, unknown> | null => (v && typeof v === 'object' && !Array.isArray(v) ? v as Record<string, unknown> : null)
const texto = (v: unknown): string | null => (typeof v === 'string' && v.trim() ? v : null)

/** O erro no formato da Meta ({ error: { message, code, error_subcode } }) ou da plataforma ({ error: "…" }). */
function erroDoCorpo(dados: unknown): { mensagem: string | null; codigo: number | null; subcodigo: number | null } {
  const d = objeto(dados)
  const e = objeto(d?.error)
  if (e) {
    const detalhe = texto(objeto(e.error_data)?.details)
    return {
      mensagem: detalhe ?? texto(e.message) ?? texto(e.error_user_msg),
      codigo: typeof e.code === 'number' ? e.code : null,
      subcodigo: typeof e.error_subcode === 'number' ? e.error_subcode : null,
    }
  }
  const lista = Array.isArray(d?.errors) ? d.errors.filter((x): x is string => typeof x === 'string').join('; ') : null
  return { mensagem: texto(d?.error) ?? texto(d?.message) ?? lista, codigo: null, subcodigo: null }
}

function limparErro(config: ConfigDaKapso, t: string): string {
  return t.split(config.chave).join('[chave]').slice(0, 300)
}

async function chamar(config: ConfigDaKapso, metodo: 'GET' | 'POST' | 'PATCH', url: string, corpo?: unknown, tempoMs = TEMPO_MAXIMO_MS): Promise<Resposta> {
  try {
    const resposta = await fetch(url, {
      method: metodo,
      headers: { 'X-API-Key': config.chave, ...(corpo === undefined ? {} : { 'content-type': 'application/json' }) },
      body: corpo === undefined ? undefined : JSON.stringify(corpo),
      signal: AbortSignal.timeout(tempoMs),
      cache: 'no-store',
    })
    const bruto = await resposta.text()
    let dados: unknown = null
    try { dados = bruto ? JSON.parse(bruto) : null } catch { dados = bruto }
    if (resposta.ok && !objeto(dados)?.error) return { ok: true, status: resposta.status, dados, erro: null }

    const { mensagem, codigo, subcodigo } = erroDoCorpo(dados)
    const s = resposta.status
    const foraDaJanela = codigo === 131047 || /24.?h|window|janela/i.test(mensagem ?? '') && s === 422
    let motivo: MotivoDaFalha = 'outro'
    let legivel = mensagem ?? `A Kapso respondeu ${s}.`
    if (s === 401 || s === 403) { motivo = 'chave'; legivel = 'A Kapso recusou a chave. Confira a chave da API em Configurações → Integrações.' }
    else if (s === 402) { motivo = 'chave'; legivel = 'A Kapso recusou o envio por falta de créditos. Confira o plano no painel da Kapso.' }
    else if (s === 404) { motivo = 'instancia'; legivel = `A Kapso não achou o número (${mensagem ?? 'confira o Phone number ID'}).` }
    else if (s === 409 || s === 429 || s >= 500) motivo = 'servidor'
    else if (foraDaJanela) legivel = 'Fora da janela de 24 horas do WhatsApp: a pessoa não escreveu para o número do Palácio nas últimas 24 horas.'
    else if (subcodigo === 1001 || codigo === 131026 || codigo === 131030 || codigo === 100 && /phone|number|to\b/i.test(mensagem ?? '')) motivo = 'numero'
    return { ok: false, status: s, dados, erro: limparErro(config, legivel), motivo, foraDaJanela }
  } catch (causa) {
    const nome = causa instanceof Error ? causa.name : ''
    const semResposta = nome === 'TimeoutError' || nome === 'AbortError'
    const motivo = semResposta ? 'A Kapso não respondeu a tempo.' : `Não consegui falar com a Kapso (${causa instanceof Error ? causa.message : 'erro de rede'}).`
    return { ok: false, status: 0, dados: null, erro: limparErro(config, motivo), semResposta, motivo: semResposta ? 'tempo' : 'rede' }
  }
}

const numeroNaUrl = (config: ConfigDaKapso) => encodeURIComponent(config.numeroId)

// ------------------------------------------------------------------ mensagens

function idDoEnvio(dados: unknown): string | null {
  const primeiro = Array.isArray(objeto(dados)?.messages) ? objeto((objeto(dados)!.messages as unknown[])[0]) : null
  return typeof primeiro?.id === 'string' ? primeiro.id.slice(0, 128) : null
}

/**
 * O texto de um aviso cabendo num parâmetro de modelo: a Meta não aceita
 * quebra de linha, tabulação nem mais de 4 espaços seguidos ali.
 */
export function textoParaModelo(t: string): string {
  return t.replace(/\s*\n+\s*/g, ' · ').replace(/[\t ]+/g, ' ').replace(/ {2,}/g, ' ').trim().slice(0, 1000)
}

async function enviarModelo(config: ConfigDaKapso, numero: string, t: string): Promise<Resposta> {
  return chamar(config, 'POST', `${META}/${numeroNaUrl(config)}/messages`, {
    messaging_product: 'whatsapp', recipient_type: 'individual', to: numero, type: 'template',
    template: { name: config.modelo, language: { code: IDIOMA_DO_MODELO }, components: [{ type: 'body', parameters: [{ type: 'text', text: textoParaModelo(t) }] }] },
  }, TEMPO_DO_ENVIO_MS)
}

/**
 * Manda um texto. Fora da janela de 24 h, cai no modelo aprovado (se houver
 * um em Configurações → Integrações), com o texto inteiro no parâmetro.
 */
export async function enviarTextoKapso(config: ConfigDaKapso, numero: string, t: string): Promise<Envio> {
  let r = await chamar(config, 'POST', `${META}/${numeroNaUrl(config)}/messages`, {
    messaging_product: 'whatsapp', recipient_type: 'individual', to: numero, type: 'text', text: { body: t.slice(0, 4096), preview_url: false },
  }, TEMPO_DO_ENVIO_MS)
  if (!r.ok && r.foraDaJanela) {
    if (!config.modelo) return { ok: false, erro: `${r.erro} Para avisar fora da janela, aprove um modelo de mensagem na Kapso e informe o nome em Configurações → Integrações.`, motivo: 'outro' }
    r = await enviarModelo(config, numero, t)
  }
  if (r.semResposta) return { ok: false, erro: 'A Kapso não confirmou o envio a tempo; a mensagem pode ter saído mesmo assim.', motivo: 'tempo', semResposta: true }
  if (!r.ok) return { ok: false, erro: r.erro ?? 'Não foi possível enviar.', motivo: r.motivo ?? 'outro' }
  return { ok: true, id: idDoEnvio(r.dados) }
}

/**
 * O arquivo de uma mensagem recebida: pelo id da mídia no proxy da Meta (download_url de 4
 * minutos) e, se o proxy falhar, pelo endereço que a Kapso mandou no webhook (`reserva`, sempre
 * em api.kapso.ai, com a chave).
 */
export async function baixarMidiaKapso(config: ConfigDaKapso, midiaId: string, tetoBytes: number, reserva?: string | null): Promise<MidiaBaixada> {
  const daReserva = reserva?.startsWith('https://api.kapso.ai/') ? reserva : null
  if (!/^[\w.-]{1,128}$/.test(midiaId) && !daReserva) return { ok: false, erro: 'Mensagem sem arquivo.' }
  const r = /^[\w.-]{1,128}$/.test(midiaId) ? await chamar(config, 'GET', `${META}/${encodeURIComponent(midiaId)}?phone_number_id=${numeroNaUrl(config)}`) : null
  const d = r?.ok ? objeto(r.dados) : null
  const tamanho = Number(d?.file_size)
  if (Number.isFinite(tamanho) && tamanho > tetoBytes) return { ok: false, erro: 'Arquivo grande demais.' }
  const link = texto(d?.download_url)
  if (link?.startsWith('https://')) return baixarDe(link, d, tetoBytes, null)
  if (daReserva) return baixarDe(daReserva, null, tetoBytes, config.chave)
  return { ok: false, erro: r?.erro ?? 'A Kapso não devolveu o endereço do arquivo.' }
}

/** Baixa respeitando o teto. `chave`: só para o endereço de reserva (o download_url já leva a autorização no token). */
async function baixarDe(link: string, d: Record<string, unknown> | null, tetoBytes: number, chave: string | null): Promise<MidiaBaixada> {
  try {
    const resposta = await fetch(link, { headers: chave ? { 'X-API-Key': chave } : {}, signal: AbortSignal.timeout(120_000), cache: 'no-store' })
    if (!resposta.ok) return { ok: false, erro: `A Kapso não entregou o arquivo (${resposta.status}).` }
    const declarado = Number(resposta.headers.get('content-length'))
    if (Number.isFinite(declarado) && declarado > tetoBytes) return { ok: false, erro: 'Arquivo grande demais.' }
    const conteudo = Buffer.from(await resposta.arrayBuffer())
    if (!conteudo.length) return { ok: false, erro: 'O arquivo veio vazio.' }
    if (conteudo.length > tetoBytes) return { ok: false, erro: 'Arquivo grande demais.' }
    const mime = (texto(d?.mime_type) ?? resposta.headers.get('content-type') ?? '').split(';')[0].trim().toLowerCase().slice(0, 120) || null
    return { ok: true, conteudo, mime, nome: null }
  } catch (causa) {
    const nome = causa instanceof Error ? causa.name : ''
    return { ok: false, erro: nome === 'TimeoutError' ? 'A Kapso demorou demais para entregar o arquivo.' : 'Não foi possível baixar o arquivo.' }
  }
}

// ------------------------------------------------------------------ conexão

/**
 * O número, pela API da plataforma da Kapso. Não pelo proxy da Meta: no número gerenciado pela
 * Kapso, GET /{phone_number_id} no proxy volta 401 da Meta (código 190, "Cannot parse access
 * token") mesmo com a chave certa e o envio funcionando (visto em 18/10/2026).
 */
async function lerNumero(config: ConfigDaKapso): Promise<Resposta> {
  return chamar(config, 'GET', `${PLATAFORMA}/whatsapp/phone_numbers/${numeroNaUrl(config)}`)
}

export async function situacaoDaConexaoKapso(config: ConfigDaKapso): Promise<SituacaoDaConexao> {
  const r = await lerNumero(config)
  if (!r.ok) return { estado: r.status === 404 ? 'sem_instancia' : 'erro', erro: r.status === 404 ? null : r.erro }
  const estado = estadoDoNumeroNaKapso(objeto(objeto(r.dados)?.data)?.status)
  return { estado, erro: estado === 'erro' ? 'A Kapso não disse o estado do número.' : null }
}

export async function perfilConectadoKapso(config: ConfigDaKapso): Promise<{ numero: string | null; nome: string | null }> {
  const r = await lerNumero(config)
  const d = r.ok ? objeto(objeto(r.dados)?.data) : null
  const exibido = texto(d?.display_phone_number_normalized) ?? texto(d?.display_phone_number)
  return {
    numero: exibido ? numeroCanonico(`+${exibido.replace(/\D/g, '')}`) : null,
    nome: (texto(d?.verified_name) ?? texto(d?.display_name))?.slice(0, 80) ?? null,
  }
}

// ------------------------------------------------------------------ webhook

/** O cabeçalho em que a Kapso manda a assinatura do corpo. */
export const CABECALHO_DA_ASSINATURA = 'x-webhook-signature'

/** A senha com que a Kapso assina as entregas, derivada da chave (nada novo para guardar). */
export function segredoDoWebhookKapso(config: ConfigDaKapso, workspaceId: string): string {
  return createHmac('sha256', config.chave).update(`palacio-whatsapp-kapso:${workspaceId}:${config.numeroId}`).digest('hex')
}

/** A assinatura (HMAC-SHA256 em hex do corpo cru) confere? */
export function assinaturaConfere(config: ConfigDaKapso, workspaceId: string, corpoCru: string, recebida: string | null): boolean {
  if (!recebida) return false
  const esperada = createHmac('sha256', segredoDoWebhookKapso(config, workspaceId)).update(corpoCru, 'utf8').digest('hex')
  const a = Buffer.from(recebida.trim().toLowerCase().replace(/^sha256=/, ''))
  const b = Buffer.from(esperada)
  return a.length === b.length && timingSafeEqual(a, b)
}

const EVENTOS = ['whatsapp.message.received']

type WebhookDaKapso = { id: string; url: string; ativo: boolean; segredo: string | null; eventos: string[] }

async function webhooksDoNumero(config: ConfigDaKapso, url: string): Promise<{ lista: WebhookDaKapso[] } | { erro: string }> {
  const r = await chamar(config, 'GET', `${PLATAFORMA}/whatsapp/phone_numbers/${numeroNaUrl(config)}/webhooks?kind=kapso&per_page=50&url_contains=${encodeURIComponent(url.split('?')[0])}`)
  if (!r.ok) return { erro: r.erro ?? 'Não foi possível ler os webhooks na Kapso.' }
  const dados = objeto(r.dados)?.data
  const lista = (Array.isArray(dados) ? dados : []).map(objeto).filter((w): w is Record<string, unknown> => w !== null).map((w) => ({
    id: String(w.id ?? ''), url: String(w.url ?? ''), ativo: w.active !== false, segredo: texto(w.secret_key),
    eventos: Array.isArray(w.events) ? w.events.filter((e): e is string => typeof e === 'string') : [],
  }))
  return { lista: lista.filter((w) => w.id) }
}

/** Cria (ou acerta, se já existe um para este endereço) o webhook do número na Kapso. */
export async function ligarWebhookKapso(config: ConfigDaKapso, workspaceId: string, url: string): Promise<{ erro: string | null }> {
  const existentes = await webhooksDoNumero(config, url)
  if ('erro' in existentes) return { erro: existentes.erro }
  const corpo = { whatsapp_webhook: { kind: 'kapso', url, events: EVENTOS, active: true, secret_key: segredoDoWebhookKapso(config, workspaceId) } }
  const igual = existentes.lista.find((w) => w.url === url)
  const r = igual
    ? await chamar(config, 'PATCH', `${PLATAFORMA}/whatsapp/phone_numbers/${numeroNaUrl(config)}/webhooks/${encodeURIComponent(igual.id)}`, corpo)
    : await chamar(config, 'POST', `${PLATAFORMA}/whatsapp/phone_numbers/${numeroNaUrl(config)}/webhooks`, corpo)
  return { erro: r.ok ? null : r.erro }
}

export async function situacaoDoWebhookKapso(config: ConfigDaKapso, workspaceId: string, url: string): Promise<SituacaoDoWebhook> {
  const existentes = await webhooksDoNumero(config, url)
  if ('erro' in existentes) return 'desconhecido'
  const meu = existentes.lista.find((w) => w.url === url)
  if (!meu) return existentes.lista.length ? 'outro_endereco' : 'desligado'
  if (!meu.ativo) return 'desligado'
  const segredoOk = meu.segredo === null || meu.segredo === segredoDoWebhookKapso(config, workspaceId)
  return segredoOk && meu.eventos.includes('whatsapp.message.received') ? 'ligado' : 'outro_endereco'
}
