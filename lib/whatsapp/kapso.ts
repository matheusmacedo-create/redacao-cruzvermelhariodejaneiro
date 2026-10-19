import 'server-only'
import { createHmac, timingSafeEqual } from 'node:crypto'
import {
  IDIOMA_DO_MODELO, estadoDoNumeroNaKapso, interativoCaiNoTexto, modeloParaEnviar, numeroCanonico, numeroSemNonoDigito, objetoInterativo, problemaDoModelo, problemaNaSaude,
  wabaDoNumero, wabaValido, type ModelosDoWhatsapp, type MotivoDaFalha, type ObjetoDoModelo,
} from './regras'
import {
  MODELOS_POR_PAGINA, VALIDADE_DA_FALHA_MS, cacheDosModelos, idDeMidiaValido, lerModelosDaMeta, modeloDoCatalogo, proximaPaginaDosModelos, type ModeloNaMeta,
} from './modelos'
import type { Envio, MidiaBaixada, MidiaEnviada, OpcoesDoEnvio, SituacaoDaConexao, SituacaoDoWebhook } from './servidor'

/**
 * O WhatsApp do Palácio pela Kapso (API oficial da Meta, número gerenciado
 * pela Kapso). Quem chama usa servidor.ts. As mesmas três regras de lá: nunca lança, a chave
 * não sai daqui, e só a tela de conexão liga o webhook.
 *
 * Contrato conferido em docs.kapso.ai (outubro de 2026):
 *  - envio pelo proxy da Meta, com o cabeçalho X-API-Key, no formato da Cloud
 *    API (POST /{phone_number_id}/messages);
 *  - texto livre só dentro da janela de 24 h desde a última mensagem da
 *    pessoa; fora dela a Meta recusa (131047) e só sai modelo aprovado, um
 *    por finalidade (regras.ts, modeloParaEnviar);
 *  - botões de resposta e listas (type "interactive") seguem a mesma janela;
 *    o toque volta no webhook como interactive.button_reply / list_reply;
 *  - webhook por número (kind "kapso", payload v2), assinado com HMAC-SHA256
 *    do corpo cru no cabeçalho X-Webhook-Signature;
 *  - mídia recebida: GET /{media_id} devolve um download_url de 4 minutos;
 *  - mídia enviada: POST /{phone_number_id}/media (multipart, imagem JPEG ou
 *    PNG de até 5 MB) devolve o id, que vai no cabeçalho dos botões ou do
 *    modelo; DELETE /{media_id}?phone_number_id= apaga;
 *  - modelos: GET /{WABA}/message_templates lista os modelos da conta com a
 *    situação e a categoria (até 100 por página). O WABA vem do número, pela
 *    API da plataforma, ou do campo opcional do cofre (wabaDoNumeroKapso).
 *
 * Não há QR code nem instância: o número fica conectado no painel da Kapso.
 */

/**
 * Os modelos (regras.ts): `modelo` o dos avisos, `modeloCodigo` o de Autenticação, `modeloSeguranca` (vazio usa o dos avisos).
 * `wabaId`: a conta do WhatsApp Business, opcional — só vale quando a Kapso não diz qual é (wabaDoNumeroKapso).
 */
export type ConfigDaKapso = { provedor: 'kapso'; numeroId: string; chave: string; wabaId?: string | null } & ModelosDoWhatsapp

const META = 'https://api.kapso.ai/meta/whatsapp/v24.0'
const PLATAFORMA = 'https://api.kapso.ai/platform/v1'
const TEMPO_MAXIMO_MS = 15_000
const TEMPO_DO_ENVIO_MS = 30_000

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

/** Chama a Kapso. `corpo` em JSON, ou FormData para o upload de mídia (o fetch põe o content-type com o boundary). */
async function chamar(config: ConfigDaKapso, metodo: 'GET' | 'POST' | 'PATCH' | 'DELETE', url: string, corpo?: unknown, tempoMs = TEMPO_MAXIMO_MS): Promise<Resposta> {
  try {
    const formulario = corpo instanceof FormData
    const resposta = await fetch(url, {
      method: metodo,
      headers: { 'X-API-Key': config.chave, ...(corpo === undefined || formulario ? {} : { 'content-type': 'application/json' }) },
      body: corpo === undefined ? undefined : formulario ? corpo : JSON.stringify(corpo),
      signal: AbortSignal.timeout(tempoMs),
      cache: 'no-store',
    })
    const bruto = await resposta.text()
    let dados: unknown = null
    try { dados = bruto ? JSON.parse(bruto) : null } catch { dados = bruto }
    if (resposta.ok && !objeto(dados)?.error) return { ok: true, status: resposta.status, dados, erro: null }

    const { mensagem, codigo, subcodigo } = erroDoCorpo(dados)
    const s = resposta.status
    // Recusa do modelo (inexistente, pausado, variáveis erradas) é coisa de arrumar na Kapso: falha comum,
    // sem reenvio e sem alerta de queda, antes de o 404 virar "número não achado".
    const nomeDoModelo = texto(objeto(objeto(corpo)?.template)?.name)
    const doModelo = nomeDoModelo ? problemaDoModelo({ nome: nomeDoModelo, codigo, status: s, mensagem, doCatalogo: modeloDoCatalogo(nomeDoModelo) !== null }) : null
    if (doModelo) return { ok: false, status: s, dados, erro: limparErro(config, doModelo), motivo: 'outro', foraDaJanela: false }
    const foraDaJanela = codigo === 131047 || /24.?h|window|janela/i.test(mensagem ?? '') && s === 422
    let motivo: MotivoDaFalha = 'outro'
    let legivel = mensagem ?? `A Kapso respondeu ${s}.`
    // 190 vem da Meta, repassado pela Kapso: a chave do Palácio passou, o que caiu foi a ligação da Kapso com a Meta.
    if (codigo === 190) { motivo = 'chave'; legivel = 'A ligação da Kapso com a Meta para este número caiu (token inválido). Reconecte o número no painel da Kapso; a chave do Palácio está certa.' }
    else if (s === 401 || s === 403) { motivo = 'chave'; legivel = 'A Kapso recusou a chave. Confira a chave da API em Configurações → Integrações.' }
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

async function enviarModelo(config: ConfigDaKapso, numero: string, modelo: ObjetoDoModelo): Promise<Resposta> {
  return chamar(config, 'POST', `${META}/${numeroNaUrl(config)}/messages`, {
    messaging_product: 'whatsapp', recipient_type: 'individual', to: numero, type: 'template', template: modelo,
  }, TEMPO_DO_ENVIO_MS)
}

/** A resposta da Kapso como Envio. `modelo`: o nome do modelo, quando saiu por modelo. */
function paraEnvio(r: Resposta, modelo: string | null): Envio {
  if (r.semResposta) return { ok: false, erro: 'A Kapso não confirmou o envio a tempo; a mensagem pode ter saído mesmo assim.', motivo: 'tempo', semResposta: true }
  if (!r.ok) return { ok: false, erro: r.erro ?? 'Não foi possível enviar.', motivo: r.motivo ?? 'outro' }
  return { ok: true, id: idDoEnvio(r.dados), ...(modelo ? { modelo } : {}) }
}

/**
 * Manda um modelo já montado (modelos.ts, montarModelo; ou regras.ts, modeloParaEnviar), com qualquer
 * componente: cabeçalho de imagem, corpo, botões de resposta rápida com payload, botão de link. Modelo
 * não depende da janela de 24 h: é o caminho para quem nunca escreveu ao número (o visitante da portaria).
 * A recusa do modelo é falha comum, sem reenvio (chamar, problemaDoModelo).
 */
export async function enviarModeloKapso(config: ConfigDaKapso, numero: string, modelo: ObjetoDoModelo): Promise<Envio> {
  return paraEnvio(await enviarModelo(config, numero, modelo), modelo.name)
}

/**
 * Manda um texto. Com `interativo` (botões ou lista; regras.ts, objetoInterativo),
 * tenta antes a mensagem interativa, com o texto inteiro no corpo; se ela não
 * cabe ou a Meta recusa o formato (interativoCaiNoTexto), vai o mesmo texto sem
 * os botões. Os botões com a imagem no cabeçalho (a ficha da visita), recusados,
 * tentam antes sem a imagem: a mídia que a Meta não aceitou não leva os botões
 * junto. Fora da janela de 24 h, cai no modelo aprovado da finalidade
 * (Configurações → Integrações; regras.ts, modeloParaEnviar): o dos avisos com
 * o texto inteiro no parâmetro, o de Autenticação só com o código, e a resposta
 * do bot nunca. Sem `finalidade`, vale como aviso. Com `modeloForaDaJanela`, é
 * ele que diz o modelo (o da situação, já montado: modelos.ts), só quando
 * precisa; sem modelo, não sai, e a falha diz `foraDaJanela` para quem chama
 * seguir por outro caminho.
 */
export async function enviarTextoKapso(config: ConfigDaKapso, numero: string, t: string, opcoes: OpcoesDoEnvio = {}): Promise<Envio> {
  const enviar = (para: string, conteudo: Record<string, unknown>) => chamar(config, 'POST', `${META}/${numeroNaUrl(config)}/messages`, {
    messaging_product: 'whatsapp', recipient_type: 'individual', to: para, ...conteudo,
  }, TEMPO_DO_ENVIO_MS)
  // A conversa pode estar aberta com o número sem o nono dígito (como o WhatsApp identifica muitos celulares antigos).
  const semNono = numeroSemNonoDigito(numero)
  const tentar = async (conteudo: Record<string, unknown>) => {
    const r = await enviar(numero, conteudo)
    return !r.ok && r.foraDaJanela && semNono ? enviar(semNono, conteudo) : r
  }
  const interativo = opcoes.interativo ? objetoInterativo(t, opcoes.interativo) : null
  let r = interativo ? await tentar({ type: 'interactive', interactive: interativo }) : null
  if (r && interativoCaiNoTexto(r) && interativo?.type === 'button' && interativo.header) {
    r = await tentar({ type: 'interactive', interactive: { type: 'button', body: interativo.body, action: interativo.action } })
  }
  // Fora da janela o texto ficaria de fora igual: segue direto para o modelo, sem os botões.
  if (!r || interativoCaiNoTexto(r)) r = await tentar({ type: 'text', text: { body: t.slice(0, 4096), preview_url: false } })
  let porModelo: string | null = null
  if (!r.ok && r.foraDaJanela) {
    if (opcoes.modeloForaDaJanela) {
      let daSituacao: ObjetoDoModelo | null = null
      try { daSituacao = await opcoes.modeloForaDaJanela() } catch { daSituacao = null }
      if (!daSituacao) return { ok: false, erro: `${r.erro} Não há modelo aprovado para esta mensagem.`, motivo: 'outro', foraDaJanela: true }
      r = await enviarModelo(config, numero, daSituacao)
      porModelo = daSituacao.name
    } else {
      const modelo = modeloParaEnviar({ finalidade: opcoes.finalidade ?? 'aviso', modelos: config, texto: t, codigo: opcoes.codigo })
      if (!modelo.ok) return { ok: false, erro: `${r.erro} ${modelo.falta}`, motivo: 'outro', foraDaJanela: true }
      r = await enviarModelo(config, numero, modelo.modelo)
      porModelo = modelo.modelo.name
    }
  }
  return paraEnvio(r, porModelo)
}

/** O teto da Meta para imagem enviada (POST /{phone_number_id}/media): 5 MB, JPEG ou PNG. */
export const TETO_DA_IMAGEM_NA_META = 5 * 1024 * 1024
const IMAGENS_DA_META = new Map([['image/jpeg', 'foto.jpg'], ['image/png', 'foto.png']])

/**
 * Sobe uma imagem para a Meta e devolve o id da mídia: é por ele que a foto vai no cabeçalho dos botões
 * (regras.ts, Interativo.imagem) ou do modelo (modelos.ts, MontagemDoModelo.imagem). Só JPEG ou PNG, até
 * 5 MB — a foto do visitante já sai normalizada em JPEG. A Meta guarda a mídia por 30 dias; quem sobe apaga
 * depois de usar (apagarMidiaKapso), por melhor esforço.
 */
export async function subirMidiaKapso(config: ConfigDaKapso, conteudo: Uint8Array, mime = 'image/jpeg'): Promise<MidiaEnviada> {
  const nome = IMAGENS_DA_META.get(mime)
  if (!nome) return { ok: false, erro: 'Só imagem JPEG ou PNG sobe para o WhatsApp.', motivo: 'outro' }
  if (!conteudo.length || conteudo.length > TETO_DA_IMAGEM_NA_META) return { ok: false, erro: 'A imagem está vazia ou passa de 5 MB.', motivo: 'outro' }
  const formulario = new FormData()
  formulario.append('messaging_product', 'whatsapp')
  formulario.append('type', mime)
  formulario.append('file', new Blob([new Uint8Array(conteudo)], { type: mime }), nome)
  const r = await chamar(config, 'POST', `${META}/${numeroNaUrl(config)}/media`, formulario, TEMPO_DO_ENVIO_MS)
  if (r.semResposta) return { ok: false, erro: 'A Kapso não confirmou o envio da imagem a tempo.', motivo: 'tempo' }
  if (!r.ok) return { ok: false, erro: r.erro ?? 'Não foi possível enviar a imagem.', motivo: r.motivo ?? 'outro' }
  const id = objeto(r.dados)?.id
  return idDeMidiaValido(id) ? { ok: true, id } : { ok: false, erro: 'A Kapso não devolveu o id da imagem.', motivo: 'outro' }
}

/** Apaga da Meta uma mídia que o Palácio subiu. Melhor esforço: true se a Kapso confirmou; nunca lança. */
export async function apagarMidiaKapso(config: ConfigDaKapso, midiaId: string): Promise<boolean> {
  if (!idDeMidiaValido(midiaId)) return false
  const r = await chamar(config, 'DELETE', `${META}/${encodeURIComponent(midiaId)}?phone_number_id=${numeroNaUrl(config)}`)
  return r.ok
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
  if (estado !== 'conectado') return { estado, erro: estado === 'erro' ? 'A Kapso não disse o estado do número.' : null }
  // "Conectado" na Kapso não garante a ligação com a Meta: o exame de saúde é que diz. Se o exame
  // não responder (a Kapso limita a um a cada 5 minutos), vale o estado.
  const saude = await chamar(config, 'GET', `${PLATAFORMA}/whatsapp/phone_numbers/${numeroNaUrl(config)}/health`)
  const problema = saude.ok ? problemaNaSaude(saude.dados) : null
  return problema ? { estado: 'erro', erro: problema } : { estado, erro: null }
}

/** Quanto tempo vale o WABA lido do número (a conta de um número não muda). */
const VALIDADE_DO_WABA_MS = 6 * 3_600_000
const wabasLidos = new Map<string, { ate: number; waba: string | null }>()

/**
 * A conta do WhatsApp Business (WABA) do número, onde ficam os modelos: pela API da plataforma (o mesmo
 * GET do número; regras.ts, wabaDoNumero), guardada em memória; se a Kapso não diz, o campo opcional do
 * cofre (`wabaId`). null se nenhum dos dois: aí nenhum modelo do catálogo serve. Nunca lança.
 */
export async function wabaDoNumeroKapso(config: ConfigDaKapso): Promise<string | null> {
  const reserva = wabaValido(config.wabaId) ? config.wabaId : null
  const guardado = wabasLidos.get(config.numeroId)
  if (guardado && guardado.ate > Date.now()) return guardado.waba ?? reserva
  const r = await lerNumero(config)
  const lido = r.ok ? wabaDoNumero(r.dados) : null
  // A resposta que não traz o WABA vale tanto quanto a que traz (o formato não muda de uma hora para outra); a falha, pouco.
  wabasLidos.set(config.numeroId, { ate: Date.now() + (r.ok ? VALIDADE_DO_WABA_MS : VALIDADE_DA_FALHA_MS), waba: lido })
  return lido ?? reserva
}

/** Páginas de MODELOS_POR_PAGINA modelos lidas no máximo (o Palácio tem algumas dezenas, e só os aprovados vêm). */
const PAGINAS_DE_MODELOS = 5
const modelosLidos = cacheDosModelos()

/**
 * Os modelos da conta como estão na Meta (nome, situação, categoria e idioma), guardados em memória por
 * VALIDADE_DOS_MODELOS_MS (modelos.ts, cacheDosModelos). Só os que o Palácio pode usar — aprovados, de Utilidade, em
 * português —, com os filtros que a Kapso documenta (e a Meta aceita): uma página basta quase sempre, e um modelo da
 * portaria nunca fica para uma página que não foi lida. modeloUtilAprovado confere de novo do lado de cá (um filtro
 * ignorado não muda a escolha). Sem o WABA ou com a leitura falhando, a lista vem vazia — nenhum aprovado — e quem
 * chama segue pelo caminho de antes. Nunca lança.
 */
export function modelosDaMetaKapso(config: ConfigDaKapso): Promise<ModeloNaMeta[]> {
  return modelosLidos.modelos(config.numeroId, async () => {
    const waba = await wabaDoNumeroKapso(config)
    if (!waba) return null
    const lista: ModeloNaMeta[] = []
    let depois: string | null = null
    const filtros = `fields=name,status,category,language&status=APPROVED&category=UTILITY&language=${IDIOMA_DO_MODELO}&limit=${MODELOS_POR_PAGINA}`
    for (let pagina = 0; pagina < PAGINAS_DE_MODELOS; pagina++) {
      const r = await chamar(config, 'GET', `${META}/${encodeURIComponent(waba)}/message_templates?${filtros}${depois ? `&after=${encodeURIComponent(depois)}` : ''}`)
      if (!r.ok) return null
      lista.push(...lerModelosDaMeta(r.dados))
      depois = proximaPaginaDosModelos(r.dados)
      if (!depois) break
    }
    return lista
  })
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
