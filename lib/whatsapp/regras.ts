import { CATEGORIAS, ONLINE_MIN, INTERVALO_NO_MESMO_LINK_MIN, type Categoria } from '@/lib/notificacoes/regras'

/**
 * Regras do WhatsApp do Palácio Virtual, sem banco nem rede — conferidas por
 * `npx tsx scripts/conferir-whatsapp.ts`.
 *
 * O WhatsApp é um canal a mais do mesmo aviso: tudo continua no sino, e o
 * e-mail segue as regras dele (lib/notificacoes/regras.ts). Pelo WhatsApp:
 *  - só vai para número CONFIRMADO por código e não pausado;
 *  - cada pessoa liga ou desliga por assunto (padrão: ligado);
 *  - quem está com o Palácio aberto agora não recebe (já está vendo o sino);
 *  - no mesmo link, no máximo uma mensagem a cada INTERVALO_NO_MESMO_LINK_MIN.
 *
 * O número é guardado só em dígitos, com o 55 e o nono dígito do celular
 * (numeroCanonico). O WhatsApp ainda identifica muitos celulares antigos SEM o
 * nono dígito (5521 8765-4321): é pela forma canônica que o webhook reconhece
 * quem escreveu, seja qual for a forma que chegou.
 */

// ------------------------------------------------------------------ número

/** DDDs em uso no Brasil (Anatel). */
const DDDS = new Set([
  11, 12, 13, 14, 15, 16, 17, 18, 19, 21, 22, 24, 27, 28, 31, 32, 33, 34, 35, 37, 38, 41, 42, 43, 44, 45, 46, 47, 48, 49,
  51, 53, 54, 55, 61, 62, 63, 64, 65, 66, 67, 68, 69, 71, 73, 74, 75, 77, 79, 81, 82, 83, 84, 85, 86, 87, 88, 89,
  91, 92, 93, 94, 95, 96, 97, 98, 99,
])

/**
 * O número em dígitos, pronto para guardar e comparar; null se não serve.
 *
 * Sem "+" na frente, 10 ou 11 dígitos são lidos como número brasileiro com
 * DDD. Número de fora do Brasil precisa começar com "+" (ou 00).
 */
export function numeroCanonico(entrada: string | null | undefined): string | null {
  const bruto = String(entrada ?? '').trim()
  if (!bruto || bruto.length > 40) return null
  let digitos = bruto.replace(/\D/g, '')
  let internacional = bruto.startsWith('+')
  if (!internacional && digitos.startsWith('00')) { digitos = digitos.slice(2); internacional = true }
  if (!internacional) {
    digitos = digitos.replace(/^0+/, '')
    if ((digitos.length === 10 || digitos.length === 11) && DDDS.has(Number(digitos.slice(0, 2)))) digitos = `55${digitos}`
    // Sem "+", só vale número brasileiro: um DDD que não existe não vira número de outro país.
    if (!digitos.startsWith('55')) return null
  }
  if (digitos.startsWith('55') && (digitos.length === 12 || digitos.length === 13)) {
    const ddd = Number(digitos.slice(2, 4))
    let local = digitos.slice(4)
    if (!DDDS.has(ddd)) return null
    if (local.length === 8 && /^[6-9]/.test(local)) local = `9${local}` // celular sem o nono dígito
    if (local.length === 9 && !local.startsWith('9')) return null
    if (local.length === 8 && !/^[2-5]/.test(local)) return null
    return `55${digitos.slice(2, 4)}${local}`
  }
  if (digitos.startsWith('55')) return null // brasileiro com dígitos a mais ou a menos
  return digitos.length >= 10 && digitos.length <= 15 ? digitos : null
}

/**
 * O número de um JID do WhatsApp ("5521987654321@s.whatsapp.net", às vezes
 * com ":12" do aparelho). Grupo, lista de transmissão, canal e o endereço
 * anônimo (@lid) não têm número: null.
 */
export function numeroDoJid(jid: unknown): string | null {
  if (typeof jid !== 'string') return null
  const m = /^(\d{8,15})(?::\d+)?@(?:s\.whatsapp\.net|c\.us)$/.exec(jid.trim())
  return m ? numeroCanonico(`+${m[1]}`) : null
}

/** "+55 (21) 98765-4321" — para a tela. */
export function formatarNumero(numero: string): string {
  const d = numero.replace(/\D/g, '')
  if (d.startsWith('55') && (d.length === 12 || d.length === 13)) {
    const local = d.slice(4)
    const meio = local.length - 4
    return `+55 (${d.slice(2, 4)}) ${local.slice(0, meio)}-${local.slice(meio)}`
  }
  return `+${d}`
}

/** "+55 21 9••••-4321" — para registros e listas em que o número não precisa aparecer inteiro. */
export function mascararNumero(numero: string | null | undefined): string {
  const d = String(numero ?? '').replace(/\D/g, '')
  if (d.length < 8) return '—'
  if (d.startsWith('55') && (d.length === 12 || d.length === 13)) {
    const local = d.slice(4)
    return `+55 ${d.slice(2, 4)} ${local.slice(0, local.length - 8)}••••-${local.slice(-4)}`
  }
  return `+${d.slice(0, 2)} ••••${d.slice(-4)}`
}

// ------------------------------------------------------------------ configuração

/** Endereço do servidor da Evolution API, sem barra no fim; null se não serve. */
export function urlDoServidor(valor: string | null | undefined): string | null {
  let bruto = String(valor ?? '').trim()
  if (!bruto) return null
  // "evolution.exemplo.org" (sem protocolo) vira https: foi assim que o primeiro cadastro travou.
  if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(bruto)) bruto = `https://${bruto}`
  try {
    const u = new URL(bruto)
    if (u.protocol !== 'https:' && u.protocol !== 'http:') return null
    if (u.username || u.password || u.search || u.hash) return null
    return `${u.origin}${u.pathname}`.replace(/\/+$/, '')
  } catch {
    return null
  }
}

/**
 * Endereço que só existe dentro de um computador ou da rede local (localhost,
 * 127.x, 10.x, 192.168.x, 172.16–31.x). O Palácio roda na internet e nunca
 * alcança esses endereços: é preciso o endereço público (ex.: o do ngrok).
 */
export function enderecoLocal(url: string): boolean {
  try {
    const host = new URL(url).hostname.toLowerCase()
    if (host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.local') || host === '[::1]' || host === '0.0.0.0') return true
    const ip = /^(\d{1,3})\.(\d{1,3})\.\d{1,3}\.\d{1,3}$/.exec(host)
    if (!ip) return false
    const [a, b] = [Number(ip[1]), Number(ip[2])]
    return a === 127 || a === 10 || (a === 192 && b === 168) || (a === 172 && b >= 16 && b <= 31) || (a === 169 && b === 254)
  } catch {
    return false
  }
}

/** Nome da instância na Evolution: vai no caminho da URL, então só o seguro. */
export const instanciaValida = (nome: string | null | undefined): boolean => /^[A-Za-z0-9._-]{1,64}$/.test(String(nome ?? '').trim())

export type EstadoDaConexao = 'conectado' | 'conectando' | 'desconectado' | 'sem_instancia' | 'erro'

/** O `state` da Evolution (open, connecting, close) em português. */
export function estadoDaEvolution(state: unknown): EstadoDaConexao {
  if (state === 'open') return 'conectado'
  if (state === 'connecting') return 'conectando'
  if (state === 'close' || state === 'refused') return 'desconectado'
  return 'erro'
}

export const ROTULO_DO_ESTADO: Record<EstadoDaConexao, string> = {
  conectado: 'Conectado',
  conectando: 'Esperando a leitura do QR code',
  desconectado: 'Desconectado',
  sem_instancia: 'Instância não encontrada no servidor',
  erro: 'Sem resposta do servidor',
}

// ------------------------------------------------------------------ avisos

/** Categoria ausente no jsonb = ligada. */
export const WHATSAPP_PADRAO = true

export function lerCategoriasDoWhatsapp(valor: unknown): Record<Categoria, boolean> {
  const bruto = valor && typeof valor === 'object' && !Array.isArray(valor) ? valor as Record<string, unknown> : {}
  return Object.fromEntries(CATEGORIAS.map((c) => [c, typeof bruto[c] === 'boolean' ? bruto[c] : WHATSAPP_PADRAO])) as Record<Categoria, boolean>
}

/** O aviso sai pelo WhatsApp agora? */
export function decidirWhatsapp(p: {
  temNumero: boolean
  pausado: boolean
  categoriaLigada: boolean
  vistoEm: string | null | undefined
  ultimoNoMesmoLink: string | null | undefined
  agora: Date
}): boolean {
  if (!p.temNumero || p.pausado || !p.categoriaLigada) return false
  const agora = p.agora.getTime()
  const visto = p.vistoEm ? new Date(p.vistoEm).getTime() : NaN
  if (Number.isFinite(visto) && agora - visto < ONLINE_MIN * 60_000) return false
  const ultimo = p.ultimoNoMesmoLink ? new Date(p.ultimoNoMesmoLink).getTime() : NaN
  if (Number.isFinite(ultimo) && agora - ultimo < INTERVALO_NO_MESMO_LINK_MIN * 60_000) return false
  return true
}

/** Tira o que o WhatsApp leria como formatação (*negrito*, _itálico_…) e os controles. */
const limpo = (texto: string, max: number) =>
  texto.replace(/[\u0000-\u0009\u000b-\u001f\u007f]/g, '').replace(/[*_~`]/g, '').replace(/\n{3,}/g, '\n\n').trim().slice(0, max)

export const primeiroNome = (nome: string | null | undefined) => String(nome ?? '').trim().split(/\s+/)[0] || ''

export const RODAPE = '_Palácio Virtual · Cruz Vermelha Brasileira – RJ. Responda *menu* para ver as opções._'

/** O texto de um aviso de notificar(), no formato do WhatsApp. */
export function textoDoAviso(p: { urlBase: string; titulo: string; mensagem: string; link: string | null; citacao?: string | null }): string {
  const partes = [`*${limpo(p.titulo, 200)}*`, limpo(p.mensagem, 900)]
  if (p.citacao?.trim()) partes.push(limpo(p.citacao, 600).split('\n').map((l) => `> ${l}`).join('\n'))
  partes.push(`Abrir: ${p.urlBase}${p.link ?? '/notificacoes'}`)
  const dica = dicaDeResposta(p.link)
  if (dica) partes.push(dica)
  partes.push(RODAPE)
  return partes.join('\n\n')
}

/** Quando o aviso aceita resposta pelo WhatsApp, diz como (lib/whatsapp/acoes.ts). */
export function dicaDeResposta(link: string | null | undefined): string | null {
  const alvo = alvoDoLink(link)
  if (!alvo) return null
  if (alvo.tipo === 'aprovacao') return '_Para votar por aqui, responda esta mensagem com *aprovar* ou com *ajustes:* e o que precisa mudar._'
  return '_Para responder por aqui, responda esta mensagem._'
}

// ------------------------------------------------------------------ volume
//
// Controle de volume comum, não disfarce: o Palácio não manda mais do que
// isto, para não virar enxurrada no celular de ninguém nem sobrecarregar o
// servidor da Evolution. O que passa do limite espera na fila.

/** Espera fixa entre dois envios seguidos da mesma leva (ms). */
export const INTERVALO_ENTRE_ENVIOS_MS = 3000
/** Teto de mensagens do Palácio por minuto, somando todo mundo. */
export const TETO_POR_MINUTO = 12
/** Teto de avisos por pessoa em 24 h; passou disso, só sino e e-mail até o dia seguinte. */
export const TETO_DIARIO_POR_PESSOA = 40

/** Hora (0–23) em São Paulo. */
export function horaEmSaoPaulo(agora: Date): number {
  return Number(new Intl.DateTimeFormat('en-US', { timeZone: 'America/Sao_Paulo', hour: 'numeric', hourCycle: 'h23' }).format(agora))
}

// ------------------------------------------------------------------ horário de silêncio e fila

/** Entre 22h e 7h (São Paulo), os avisos esperam; saem às 7h. */
export const SILENCIO = { de: 22, ate: 7 } as const

export function emSilencio(agora: Date): boolean {
  const h = horaEmSaoPaulo(agora)
  return h >= SILENCIO.de || h < SILENCIO.ate
}

/** Diferença (min) entre o relógio de São Paulo e o UTC naquele instante. */
function deslocamentoDeSaoPaulo(agora: Date): number {
  const partes = Object.fromEntries(new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Sao_Paulo', year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric', second: 'numeric', hourCycle: 'h23',
  }).formatToParts(agora).map((x) => [x.type, x.value]))
  const local = Date.UTC(Number(partes.year), Number(partes.month) - 1, Number(partes.day), Number(partes.hour), Number(partes.minute), Number(partes.second))
  return Math.round((local - agora.getTime()) / 60_000)
}

/** O fim do silêncio: as próximas 7h em São Paulo a partir de agora. */
export function fimDoSilencio(agora: Date): Date {
  const desloc = deslocamentoDeSaoPaulo(agora)
  const local = new Date(agora.getTime() + desloc * 60_000) // relógio de SP escrito como UTC
  const alvo = new Date(Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate(), SILENCIO.ate, 0, 0))
  if (local.getUTCHours() >= SILENCIO.ate) alvo.setUTCDate(alvo.getUTCDate() + 1)
  return new Date(alvo.getTime() - desloc * 60_000)
}

/**
 * O silêncio vale para os avisos comuns. Não vale para o que a pessoa acabou
 * de pedir (código, resposta do bot, teste), para a segurança da conta e para
 * a portaria (a visita está na porta agora).
 */
export function silencioSeAplica(p: { tipo: 'aviso' | 'seguranca' | 'codigo' | 'bot' | 'teste'; categoria?: string | null }): boolean {
  return p.tipo === 'aviso' && p.categoria !== 'portaria'
}

/** Por que um envio falhou, para decidir se vale tentar de novo. */
export type MotivoDaFalha = 'rede' | 'tempo' | 'servidor' | 'chave' | 'instancia' | 'numero' | 'outro'

/**
 * Reenvia o que falhou por o servidor estar fora (rede, 5xx), a chave ou a
 * instância estarem erradas (volta a funcionar quando alguém arruma). Não
 * reenvia o que pode já ter saído (tempo esgotado: seria mensagem repetida) nem
 * número sem WhatsApp.
 */
export const falhaMereceReenvio = (motivo: MotivoDaFalha): boolean => motivo === 'rede' || motivo === 'servidor' || motivo === 'chave' || motivo === 'instancia'

/** Falha que indica o WhatsApp do Palácio fora do ar (vira alerta para a administração). */
export const falhaDerrubaConexao = (motivo: MotivoDaFalha): boolean => motivo === 'rede' || motivo === 'servidor' || motivo === 'chave' || motivo === 'instancia'

/** Espera antes de cada nova tentativa (min). Depois da última, desiste. */
export const ESPERAS_DE_REENVIO_MIN = [5, 15, 60, 180, 720] as const

export function proximaTentativa(tentativas: number, agora: Date): Date | null {
  const espera = ESPERAS_DE_REENVIO_MIN[tentativas - 1]
  return espera === undefined ? null : new Date(agora.getTime() + espera * 60_000)
}

/** Categoria que não vai pelo WhatsApp: o alerta de "WhatsApp caiu" iria justamente por onde caiu. */
export const categoriaVaiPorWhatsapp = (categoria: string): boolean => categoria !== 'sistema'

/** Alerta de queda repetido no máximo a cada tantas horas. */
export const ALERTA_A_CADA_HORAS = 6

/** Aviso de segurança da conta (senha, verificação, e-mail): sai sempre, mesmo pausado. */
export function textoDeSeguranca(p: { titulo: string; texto: string }): string {
  return [`*${limpo(p.titulo, 200)}*`, limpo(p.texto, 900), '_Palácio Virtual · Cruz Vermelha Brasileira – RJ. A equipe nunca pede sua senha nem códigos, por aqui ou por telefone._'].join('\n\n')
}

// ------------------------------------------------------------------ confirmação do número

export const CODIGO_VALIDADE_MIN = 10
export const CODIGO_TENTATIVAS = 5
/** No máximo tantos códigos por pessoa na janela (freia quem usa a tela para mandar mensagem a terceiros). */
export const CODIGOS_POR_JANELA = 3
export const JANELA_DOS_CODIGOS_MIN = 30

export const codigoNoFormato = (codigo: string) => /^\d{6}$/.test(codigo)

export function textoDoCodigo(codigo: string): string {
  return [
    `Seu código do Palácio Virtual: *${codigo}*`,
    `Digite no seu perfil para ligar os avisos por WhatsApp. Vale por ${CODIGO_VALIDADE_MIN} minutos.`,
    '_Se não foi você que pediu, ignore esta mensagem: nada muda sem o código._',
  ].join('\n\n')
}

// ------------------------------------------------------------------ webhook

export type MensagemRecebida = {
  id: string | null
  numero: string | null
  texto: string
  nome: string | null
  /** O id da mensagem que a pessoa citou ao responder (o aviso, a pergunta do bot); null sem citação. */
  citada: string | null
  /** Foto, vídeo, áudio ou documento que veio junto (o arquivo em si se baixa da Evolution). */
  midia: MidiaRecebida | null
  /** Motivo para não responder; null = responder. */
  ignorar: 'de_mim' | 'grupo' | 'sem_numero' | null
}

export type EventoDoWebhook = {
  /** Normalizado: "messages.upsert", "connection.update"… */
  evento: string
  instancia: string | null
  mensagens: MensagemRecebida[]
  /** Em connection.update: open, connecting, close. */
  estado: string | null
}

const objeto = (v: unknown): Record<string, unknown> | null => (v && typeof v === 'object' && !Array.isArray(v) ? v as Record<string, unknown> : null)
const texto = (v: unknown): string | null => (typeof v === 'string' && v.trim() ? v : null)

/** O texto de uma mensagem do Baileys, onde quer que ele esteja. */
export function textoDaMensagem(mensagem: unknown, profundidade = 0): string {
  const m = objeto(mensagem)
  if (!m || profundidade > 3) return ''
  const direto = texto(m.conversation)
    ?? texto(objeto(m.extendedTextMessage)?.text)
    ?? texto(objeto(m.imageMessage)?.caption)
    ?? texto(objeto(m.videoMessage)?.caption)
    ?? texto(objeto(m.buttonsResponseMessage)?.selectedButtonId)
    ?? texto(objeto(objeto(m.listResponseMessage)?.singleSelectReply)?.selectedRowId)
    ?? texto(objeto(m.templateButtonReplyMessage)?.selectedId)
  if (direto) return direto
  for (const embrulho of ['ephemeralMessage', 'viewOnceMessage', 'viewOnceMessageV2', 'editedMessage', 'documentWithCaptionMessage']) {
    const dentro = textoDaMensagem(objeto(m[embrulho])?.message, profundidade + 1)
    if (dentro) return dentro
  }
  return ''
}

export type CategoriaDaMidia = 'foto' | 'video' | 'audio' | 'documento'
export type MidiaRecebida = { categoria: CategoriaDaMidia; mime: string; tamanho: number | null; nome: string | null }

/** fileLength do Baileys: número, texto ou Long ({ low, high }). */
function tamanhoDaMidia(v: unknown): number | null {
  if (typeof v === 'number' && Number.isFinite(v) && v > 0) return v
  if (typeof v === 'string' && /^\d{1,12}$/.test(v)) return Number(v)
  const longo = objeto(v)
  if (longo && typeof longo.low === 'number') return (longo.low >>> 0) + (typeof longo.high === 'number' ? longo.high * 2 ** 32 : 0)
  return null
}

/** A mídia da mensagem, se houver (figurinha não conta). */
export function midiaDaMensagem(mensagem: unknown, profundidade = 0): MidiaRecebida | null {
  const m = objeto(mensagem)
  if (!m || profundidade > 3) return null
  const tipos: [string, CategoriaDaMidia][] = [['imageMessage', 'foto'], ['videoMessage', 'video'], ['audioMessage', 'audio'], ['documentMessage', 'documento']]
  for (const [chave, categoria] of tipos) {
    const d = objeto(m[chave])
    if (!d) continue
    const mime = (texto(d.mimetype) ?? '').split(';')[0].trim().toLowerCase().slice(0, 120)
    // Foto e vídeo mandados "como documento" continuam foto e vídeo.
    const real: CategoriaDaMidia = categoria === 'documento' && mime.startsWith('image/') ? 'foto' : categoria === 'documento' && mime.startsWith('video/') ? 'video' : categoria
    return { categoria: real, mime: mime || 'application/octet-stream', tamanho: tamanhoDaMidia(d.fileLength), nome: texto(d.fileName)?.slice(0, 200) ?? null }
  }
  for (const embrulho of ['ephemeralMessage', 'viewOnceMessage', 'viewOnceMessageV2', 'documentWithCaptionMessage']) {
    const dentro = midiaDaMensagem(objeto(m[embrulho])?.message, profundidade + 1)
    if (dentro) return dentro
  }
  return null
}

const TIPOS_COM_CONTEXTO = ['extendedTextMessage', 'imageMessage', 'videoMessage', 'audioMessage', 'documentMessage', 'stickerMessage', 'buttonsResponseMessage', 'listResponseMessage', 'templateButtonReplyMessage']

/** O id da mensagem citada (contextInfo.stanzaId), onde quer que ele esteja. */
export function citadaNaMensagem(dado: unknown, profundidade = 0): string | null {
  const d = objeto(dado)
  if (!d || profundidade > 3) return null
  const direto = texto(objeto(d.contextInfo)?.stanzaId)
  if (direto) return direto.slice(0, 128)
  const m = objeto(d.message) ?? d
  for (const tipo of TIPOS_COM_CONTEXTO) {
    const id = texto(objeto(objeto(m[tipo])?.contextInfo)?.stanzaId)
    if (id) return id.slice(0, 128)
  }
  for (const embrulho of ['ephemeralMessage', 'viewOnceMessage', 'viewOnceMessageV2', 'documentWithCaptionMessage']) {
    const dentro = objeto(m[embrulho])
    if (dentro) {
      const id = citadaNaMensagem({ message: dentro.message }, profundidade + 1)
      if (id) return id
    }
  }
  return null
}

function lerMensagem(dado: unknown): MensagemRecebida | null {
  const d = objeto(dado)
  const chave = objeto(d?.key)
  if (!d || !chave) return null
  const remoto = typeof chave.remoteJid === 'string' ? chave.remoteJid : ''
  const grupo = remoto.endsWith('@g.us') || remoto.endsWith('@broadcast') || remoto.endsWith('@newsletter')
  // Com o endereçamento anônimo (@lid), o número vem num campo ao lado.
  const numero = [chave.remoteJidAlt, chave.senderPn, chave.remoteJid, d.remoteJidAlt, d.senderPn].map(numeroDoJid).find(Boolean) ?? null
  return {
    id: texto(chave.id)?.slice(0, 128) ?? null,
    numero: grupo ? null : numero,
    // Cabe uma resposta de chamado ou do Chat; comando é curto de todo jeito.
    texto: textoDaMensagem(d.message).slice(0, 4000),
    nome: texto(d.pushName)?.slice(0, 80) ?? null,
    citada: citadaNaMensagem(d),
    midia: midiaDaMensagem(d.message),
    ignorar: chave.fromMe === true ? 'de_mim' : grupo ? 'grupo' : numero ? null : 'sem_numero',
  }
}

/** Lê o corpo que a Evolution manda ao webhook. Nunca lança. */
export function lerEventoDoWebhook(corpo: unknown): EventoDoWebhook {
  const c = objeto(corpo) ?? {}
  const evento = String(c.event ?? '').trim().toLowerCase().replace(/_/g, '.')
  const dados = Array.isArray(c.data) ? c.data : [c.data]
  const estado = evento === 'connection.update' ? texto(objeto(c.data)?.state) : null
  return {
    evento,
    instancia: texto(c.instance)?.slice(0, 64) ?? null,
    mensagens: evento === 'messages.upsert' ? dados.map(lerMensagem).filter((m): m is MensagemRecebida => m !== null) : [],
    estado,
  }
}

// ------------------------------------------------------------------ bot

export type Comando = 'menu' | 'avisos' | 'lidas' | 'parar' | 'voltar' | 'agenda' | 'chamados' | 'aprovacoes' | 'ajuda' | 'abrir_chamado' | 'desconhecido'

const normalizar = (t: string) => t.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim()

const PALAVRAS: Record<'menu' | 'avisos' | 'lidas' | 'parar' | 'voltar' | 'agenda' | 'chamados' | 'aprovacoes', string[]> = {
  menu: ['menu', 'oi', 'ola', 'oie', 'opa', 'bom', 'boa', 'ajuda', 'inicio', 'opcoes', 'help', '0'],
  avisos: ['1', 'avisos', 'aviso', 'notificacoes', 'notificacao', 'novidades', 'pendencias'],
  lidas: ['2', 'lidas', 'lida', 'lido', 'lidos', 'li'],
  parar: ['parar', 'pare', 'sair', 'stop', 'cancelar', 'descadastrar', 'desativar'],
  voltar: ['voltar', 'volta', 'ativar', 'retomar', 'continuar', 'start', 'reativar'],
  agenda: ['4', 'agenda', 'compromissos', 'calendario'],
  chamados: ['5', 'chamados', 'chamado'],
  aprovacoes: ['6', 'aprovacoes', 'aprovacao', 'votos', 'votar'],
}

export type Pedido = { comando: Comando; resto: string }

/** O texto depois da palavra do comando, com acentos e maiúsculas originais. */
function depoisDe(entrada: string, prefixo: RegExp): string {
  return entrada.trim().replace(prefixo, '').replace(/^[\s:,.-]+/, '').trim().slice(0, 4000)
}

/**
 * O que a pessoa pediu, e o resto do texto quando o comando leva um
 * complemento ("ajuda como abrir um chamado", "chamado: impressora sem
 * toner"). O "3" do menu alterna: para quem recebe, é parar; para quem
 * pausou, é voltar.
 */
export function lerPedido(entrada: string, p: { pausado: boolean }): Pedido {
  const t = normalizar(entrada)
  if (!t) return { comando: 'desconhecido', resto: '' }
  if (t === '3') return { comando: p.pausado ? 'voltar' : 'parar', resto: '' }
  const palavras = t.split(' ')
  // Comandos com complemento vêm antes: "ajuda como paro os avisos" é dúvida, não "avisos".
  if ((palavras[0] === 'ajuda' || palavras[0] === 'duvida') && palavras.length > 1) return { comando: 'ajuda', resto: depoisDe(entrada, /^\s*(ajuda|d[uú]vida)\b/i) }
  if (palavras[0] === 'como' && palavras.length > 2) return { comando: 'ajuda', resto: entrada.trim().slice(0, 1000) }
  const abrir = /^\s*(abrir\s+(um\s+)?chamado|novo\s+chamado|chamado)\b/i
  if ((palavras[0] === 'chamado' || (palavras[0] === 'abrir' && palavras.includes('chamado')) || (palavras[0] === 'novo' && palavras[1] === 'chamado')) && depoisDe(entrada, abrir).length >= 8) {
    return { comando: 'abrir_chamado', resto: depoisDe(entrada, abrir) }
  }
  // "marcar como lidas", "ver avisos": vale a palavra que decide, não a primeira.
  for (const comando of ['parar', 'voltar', 'lidas', 'avisos', 'agenda', 'chamados', 'aprovacoes'] as const) {
    if (palavras.some((w) => PALAVRAS[comando].includes(w) && (w.length > 1 || palavras.length === 1))) return { comando, resto: '' }
  }
  if (PALAVRAS.menu.includes(palavras[0])) return { comando: 'menu', resto: '' }
  return { comando: 'desconhecido', resto: '' }
}

export const interpretarComando = (entrada: string, p: { pausado: boolean }): Comando => lerPedido(entrada, p).comando

/** Respostas do bot a cada ~10 min por número, no máximo: um robô do outro lado não vira enxurrada. */
export const RESPOSTAS_POR_JANELA = 10
export const JANELA_DAS_RESPOSTAS_MIN = 10
/** Número que não é de ninguém da equipe recebe a apresentação no máximo uma vez neste intervalo. */
export const APRESENTACAO_A_CADA_HORAS = 24

export function textoDoMenu(p: { nome: string | null; pausado: boolean; urlBase: string }): string {
  const ola = p.nome ? `Olá, ${primeiroNome(p.nome)}!` : 'Olá!'
  return [
    `${ola} Aqui é o WhatsApp do *Palácio Virtual*, da Cruz Vermelha Brasileira – RJ.`,
    p.pausado ? '_Os avisos por aqui estão pausados._' : null,
    ['Responda com o número:', '*1* – os avisos que você ainda não abriu', '*2* – marcar todos os avisos como lidos',
      p.pausado ? '*3* – voltar a receber os avisos por aqui' : '*3* – parar de receber os avisos por aqui',
      '*4* – sua agenda de hoje e amanhã', '*5* – seus chamados abertos', '*6* – o que espera o seu voto'].join('\n'),
    ['Ou escreva:', '*chamado:* e o problema, para abrir um chamado', '*ajuda* e a sua dúvida sobre o Palácio (ex.: _ajuda como trocar a senha_)',
      'E, para responder um aviso de chamado, do Chat ou de aprovação, responda a própria mensagem do aviso.'].join('\n'),
    `Tudo continua no sino do Palácio Virtual: ${p.urlBase}/notificacoes`,
  ].filter(Boolean).join('\n\n')
}

export type AvisoNaLista = { titulo: string; mensagem: string; link: string | null }

export const AVISOS_NA_RESPOSTA = 5

export function textoDosAvisos(p: { avisos: AvisoNaLista[]; total: number; urlBase: string }): string {
  if (!p.total || !p.avisos.length) return 'Você está em dia: nenhum aviso sem abrir no Palácio Virtual.'
  const mostrados = p.avisos.slice(0, AVISOS_NA_RESPOSTA)
  const cabeca = p.total === 1
    ? 'Você tem *1 aviso* sem abrir:'
    : `Você tem *${p.total} avisos* sem abrir${p.total > mostrados.length ? `. Os ${mostrados.length} mais recentes` : ''}:`
  const itens = mostrados.map((a, i) => `*${i + 1}.* ${limpo(a.titulo, 160)}\n${limpo(a.mensagem, 200)}\n${p.urlBase}${a.link ?? '/notificacoes'}`)
  return [cabeca, ...itens, 'Responda *2* para marcar todos como lidos.'].join('\n\n')
}

export function textoDasLidas(quantas: number): string {
  if (!quantas) return 'Não havia avisos sem abrir. Você está em dia.'
  return quantas === 1 ? 'Pronto: 1 aviso marcado como lido.' : `Pronto: ${quantas} avisos marcados como lidos.`
}

export const TEXTO_PAUSADO = [
  'Combinado: os avisos do Palácio Virtual não vêm mais por aqui. Eles continuam no sino e, se você escolheu, no e-mail.',
  'Para voltar, responda *voltar* ou ligue de novo em Meu perfil.',
].join('\n\n')

export const TEXTO_VOLTOU = 'Pronto: os avisos do Palácio Virtual voltam a chegar por aqui. Para parar, responda *parar*.'

export function textoDaApresentacao(p: { urlBase: string; site: string }): string {
  return [
    'Olá! Este é o WhatsApp de avisos do *Palácio Virtual*, o sistema interno da Cruz Vermelha Brasileira – Rio de Janeiro. As mensagens daqui não são lidas por uma pessoa.',
    `Se você é da equipe, cadastre este número em Meu perfil → WhatsApp: ${p.urlBase}/perfil#whatsapp`,
    `Se você é voluntário, confirme este número na Área do Voluntário para receber as oportunidades: ${p.urlBase}/membro/perfil#whatsapp`,
    `Para falar com a Cruz Vermelha, use os canais oficiais: ${p.site}`,
  ].join('\n\n')
}

// ------------------------------------------------------------------ consultas (agenda, chamados, aprovações, ajuda)

const DIAS_DA_SEMANA = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'] as const

/** "seg, 28/09" a partir de "2026-09-28". */
export function rotuloDoDia(dia: string): string {
  const [a, m, d] = dia.split('-').map(Number)
  const semana = DIAS_DA_SEMANA[new Date(Date.UTC(a, m - 1, d)).getUTCDay()]
  return `${semana}, ${String(d).padStart(2, '0')}/${String(m).padStart(2, '0')}`
}

export type ItemDoDia = { titulo: string; hora?: string | null; detalhe?: string | null }
export const ITENS_POR_DIA = 8

export function textoDaAgenda(p: { hoje: string; amanha: string; itensHoje: ItemDoDia[]; itensAmanha: ItemDoDia[]; urlBase: string; falhou?: boolean }): string {
  const bloco = (rotulo: string, itens: ItemDoDia[]) => {
    if (!itens.length) return `*${rotulo}*\n_Nada marcado._`
    const ordenados = [...itens].sort((x, y) => (x.hora ?? '').localeCompare(y.hora ?? ''))
    const linhas = ordenados.slice(0, ITENS_POR_DIA).map((i) => `• ${i.hora ? i.hora : 'Dia todo'} – ${limpo(i.titulo, 120)}${i.detalhe ? ` _(${limpo(i.detalhe, 80)})_` : ''}`)
    if (ordenados.length > ITENS_POR_DIA) linhas.push(`_e mais ${ordenados.length - ITENS_POR_DIA}_`)
    return [`*${rotulo}*`, ...linhas].join('\n')
  }
  return [
    '*Sua agenda*',
    bloco(`Hoje, ${rotuloDoDia(p.hoje)}`, p.itensHoje),
    bloco(`Amanhã, ${rotuloDoDia(p.amanha)}`, p.itensAmanha),
    p.falhou ? '_Parte da agenda não carregou agora; confira no Palácio._' : null,
    `Agenda completa: ${p.urlBase}/calendario`,
  ].filter(Boolean).join('\n\n')
}

export type ChamadoNaLista = { id: string; codigo: string; titulo: string; situacao: string }
export const CHAMADOS_NA_RESPOSTA = 6

export function textoDosChamados(p: { chamados: ChamadoNaLista[]; total: number; urlBase: string }): string {
  if (!p.total || !p.chamados.length) return 'Você não tem chamados abertos. Para abrir um, escreva *chamado:* e o problema.'
  const itens = p.chamados.slice(0, CHAMADOS_NA_RESPOSTA).map((c) => `*${limpo(c.codigo, 20)}* · ${limpo(c.titulo, 120)}\n_${limpo(c.situacao, 40)}_ · ${p.urlBase}/chamados/${c.id}`)
  const cabeca = p.total === 1 ? 'Você tem *1 chamado* aberto:' : `Você tem *${p.total} chamados* abertos${p.total > itens.length ? `. Os ${itens.length} mais recentes` : ''}:`
  return [cabeca, ...itens, 'Para responder, use o link ou responda a mensagem do aviso do chamado.'].join('\n\n')
}

export type AprovacaoNaLista = { id: string; titulo: string }
export const APROVACOES_NA_RESPOSTA = 6

export function textoDasAprovacoes(p: { aprovacoes: AprovacaoNaLista[]; total: number; urlBase: string }): string {
  if (!p.total || !p.aprovacoes.length) return 'Nada esperando o seu voto agora.'
  const itens = p.aprovacoes.slice(0, APROVACOES_NA_RESPOSTA).map((a, i) => `*${i + 1}.* ${limpo(a.titulo, 140)}\n${p.urlBase}/aprovacoes/${a.id}`)
  const cabeca = p.total === 1 ? '*1 aprovação* espera o seu voto:' : `*${p.total} aprovações* esperam o seu voto:`
  return [cabeca, ...itens, 'Para votar por aqui, responda a mensagem do aviso de aprovação com *aprovar* ou *ajustes:* e o que precisa mudar.'].join('\n\n')
}

export type AchadoDaAjuda = { titulo: string; trecho: string; href: string }

/**
 * O resumo do Claude no formato do WhatsApp: mantém *negrito* e _itálico_,
 * mas desfaz o Markdown que o WhatsApp não entende (títulos, **duplo**, links,
 * crases) e corta numa quebra de linha, não no meio da palavra.
 */
export function respostaParaWhatsapp(texto: string, max = 1200): string {
  const limpa = texto
    .replace(/[\u0000-\u0009\u000b-\u001f\u007f]/g, '')
    .replace(/^\s{0,3}#{1,6}\s+/gm, '')
    .replace(/\*\*(.+?)\*\*/g, '*$1*')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/[`~]/g, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
  if (limpa.length <= max) return limpa
  const corte = limpa.lastIndexOf('\n', max)
  return `${limpa.slice(0, corte > max / 2 ? corte : max).trim()}…`
}

export function textoDaAjuda(p: { pergunta: string; achados: AchadoDaAjuda[]; resposta?: string | null; urlBase: string }): string {
  if (!p.achados.length) return `Não achei nada na Central de ajuda sobre “${limpo(p.pergunta, 120)}”. Tente com outras palavras, ou veja tudo em ${p.urlBase}/ajuda`
  const links = p.achados.slice(0, 3).map((a) => `• ${limpo(a.titulo, 120)}: ${p.urlBase}${a.href}`)
  if (p.resposta?.trim()) return [respostaParaWhatsapp(p.resposta), ['Na Central de ajuda:', ...links].join('\n')].join('\n\n')
  const primeiros = p.achados.slice(0, 3).map((a) => `*${limpo(a.titulo, 120)}*\n${limpo(a.trecho, 280)}\n${p.urlBase}${a.href}`)
  return ['Achei isto na Central de ajuda:', ...primeiros].join('\n\n')
}

// ------------------------------------------------------------------ ações (responder citando o aviso, votar, abrir chamado)

/** O que um aviso aponta, pelo link dele: é para lá que vai a resposta que cita o aviso. */
export type AlvoDoAviso =
  | { tipo: 'chamado'; id: string }
  | { tipo: 'chat'; canalId: string; fio: string | null }
  | { tipo: 'aprovacao'; id: string }
  | { tipo: 'mensagem'; pessoaId: string }

const UUID = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}'

export function alvoDoLink(link: string | null | undefined): AlvoDoAviso | null {
  const bruto = String(link ?? '').trim()
  if (!bruto.startsWith('/')) return null
  const [caminho, busca = ''] = bruto.split('?')
  const partes = caminho.toLowerCase().replace(/\/+$/, '').split('/').filter(Boolean)
  const ehId = (v: string | undefined): v is string => Boolean(v && new RegExp(`^${UUID}$`).test(v))
  if (partes.length === 2 && partes[0] === 'chamados' && ehId(partes[1])) return { tipo: 'chamado', id: partes[1] }
  if (partes.length === 2 && partes[0] === 'aprovacoes' && ehId(partes[1])) return { tipo: 'aprovacao', id: partes[1] }
  if (partes.length === 3 && partes[0] === 'mensagens' && partes[1] === 'pessoa' && ehId(partes[2])) return { tipo: 'mensagem', pessoaId: partes[2] }
  if (partes.length === 2 && partes[0] === 'chat' && ehId(partes[1])) {
    const fio = new URLSearchParams(busca).get('fio')?.toLowerCase() ?? null
    return { tipo: 'chat', canalId: partes[1], fio: ehId(fio ?? undefined) ? fio : null }
  }
  return null
}

export type Decisao = { decisao: 'aprovar' } | { decisao: 'ajustes'; nota: string }

/**
 * A resposta a um aviso de aprovação. "aprovar" pede a conferência antes do
 * voto; "ajustes: …" já vota, com o que precisa mudar (pelo menos 5 letras,
 * como na tela). Qualquer outra coisa: null.
 */
export function lerDecisao(entrada: string): Decisao | null {
  const t = normalizar(entrada)
  if (/^(aprovar|aprovo|aprovado|aprovada|aprova)( (sim|ok))?$/.test(t)) return { decisao: 'aprovar' }
  const ajuste = /^\s*((pedir|peco|pe[çc]o)\s+)?ajustes?\b[\s:,.-]*/i
  if (/^((pedir|peco) )?ajustes?( |$)/.test(t)) {
    const nota = entrada.trim().replace(ajuste, '').trim().slice(0, 2000)
    return { decisao: 'ajustes', nota }
  }
  return null
}

// Só palavra de quem conferiu: "ok" ou "sim" soltos, ditos sobre outra coisa, não podem virar voto.
const CONFIRMA = ['confirmo', 'confirmar', 'confirma', 'confirmado', 'conferi', 'conferido']
// Sem "parar" e "sair": com uma pergunta aberta, eles continuam pausando os avisos.
const CANCELA = ['cancelar', 'cancela', 'cancelo', 'nao', 'n', 'desistir', 'desisto']
export const ehConfirmacao = (entrada: string) => CONFIRMA.includes(normalizar(entrada))
export const ehCancelamento = (entrada: string) => CANCELA.includes(normalizar(entrada))

/** "2", "2.", "opção 2", "*2*": o número escolhido entre 1 e `quantas`; null para o resto. */
export function lerEscolha(entrada: string, quantas: number): number | null {
  const t = normalizar(entrada).replace(/^(opcao|numero|n|no) /, '')
  if (!/^[0-9]{1,2}$/.test(t)) return null
  const n = Number(t)
  return n >= 1 && n <= quantas ? n : null
}

/** Quanto tempo a pergunta do bot espera a resposta. */
export const PENDENCIA_VALE_MIN = 15

export function textoDaConferencia(p: { titulo: string; blocos: { setor: string; itens: string[] }[] }): string {
  const itens = p.blocos.map((b) => [`*${limpo(b.setor, 60)}*`, ...b.itens.map((i) => `☐ ${limpo(i, 200)}`)].join('\n'))
  return [
    `Antes de aprovar *${limpo(p.titulo, 140)}*, confira:`,
    ...itens,
    `Se conferiu tudo, responda *esta mensagem* com *confirmo*. Para desistir, *cancelar*. Vale por ${PENDENCIA_VALE_MIN} minutos.`,
  ].join('\n\n')
}

export type Opcao = { nome: string; detalhe?: string | null }

/** Uma lista numerada para a pessoa escolher respondendo o número. */
export function textoDaEscolha(p: { pergunta: string; opcoes: Opcao[]; rodape?: string | null }): string {
  const linhas = p.opcoes.map((o, i) => `*${i + 1}* – ${limpo(o.nome, 80)}${o.detalhe ? ` _(${limpo(o.detalhe, 80)})_` : ''}`)
  return [p.pergunta, linhas.join('\n'), p.rodape ?? `Responda com o número, ou *cancelar*. Vale por ${PENDENCIA_VALE_MIN} minutos.`].join('\n\n')
}

/** Título do chamado a partir do relato: a primeira frase, até 140 letras. */
export function tituloDoRelato(relato: string): string {
  const primeira = relato.trim().split(/\n|(?<=[.!?])\s/)[0] ?? ''
  const base = (primeira.length >= 3 ? primeira : relato).replace(/\s+/g, ' ').trim()
  return base.length <= 140 ? base.replace(/[.!?]+$/, '') : `${base.slice(0, 137).trimEnd()}…`
}

export const TEXTO_SEM_ACAO_PELO_WHATSAPP =
  'Sua conta usa a verificação em duas etapas, então responder, votar e mandar fotos ficam só no Palácio (o WhatsApp não pede o código do app). As consultas e a abertura de chamado por aqui continuam valendo.'
