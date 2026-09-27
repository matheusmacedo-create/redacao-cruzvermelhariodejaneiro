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
  const bruto = String(valor ?? '').trim()
  if (!bruto) return null
  try {
    const u = new URL(bruto)
    if (u.protocol !== 'https:' && u.protocol !== 'http:') return null
    if (u.username || u.password || u.search || u.hash) return null
    return `${u.origin}${u.pathname}`.replace(/\/+$/, '')
  } catch {
    return null
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
  partes.push(RODAPE)
  return partes.join('\n\n')
}

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
    texto: textoDaMensagem(d.message).slice(0, 500),
    nome: texto(d.pushName)?.slice(0, 80) ?? null,
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

export type Comando = 'menu' | 'avisos' | 'lidas' | 'parar' | 'voltar' | 'desconhecido'

const normalizar = (t: string) => t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim()

const PALAVRAS: Record<Exclude<Comando, 'desconhecido'>, string[]> = {
  menu: ['menu', 'oi', 'ola', 'oie', 'opa', 'bom', 'boa', 'ajuda', 'inicio', 'opcoes', 'help', '0'],
  avisos: ['1', 'avisos', 'aviso', 'notificacoes', 'notificacao', 'novidades', 'pendencias'],
  lidas: ['2', 'lidas', 'lida', 'lido', 'lidos', 'li'],
  parar: ['parar', 'pare', 'sair', 'stop', 'cancelar', 'descadastrar', 'desativar'],
  voltar: ['voltar', 'volta', 'ativar', 'retomar', 'continuar', 'start', 'reativar'],
}

/**
 * O que a pessoa pediu. O "3" do menu alterna: para quem recebe, é parar;
 * para quem pausou, é voltar.
 */
export function interpretarComando(entrada: string, p: { pausado: boolean }): Comando {
  const t = normalizar(entrada)
  if (!t) return 'desconhecido'
  if (t === '3') return p.pausado ? 'voltar' : 'parar'
  const palavras = t.split(' ')
  // "marcar como lidas", "ver avisos": vale a palavra que decide, não a primeira.
  for (const comando of ['parar', 'voltar', 'lidas', 'avisos'] as const) {
    if (palavras.some((w) => PALAVRAS[comando].includes(w) && (w.length > 1 || palavras.length === 1))) return comando
  }
  if (PALAVRAS.menu.includes(palavras[0])) return 'menu'
  return 'desconhecido'
}

/** Respostas do bot a cada ~10 min por número, no máximo: um robô do outro lado não vira enxurrada. */
export const RESPOSTAS_POR_JANELA = 6
export const JANELA_DAS_RESPOSTAS_MIN = 10
/** Número que não é de ninguém da equipe recebe a apresentação no máximo uma vez neste intervalo. */
export const APRESENTACAO_A_CADA_HORAS = 24

export function textoDoMenu(p: { nome: string | null; pausado: boolean; urlBase: string }): string {
  const ola = p.nome ? `Olá, ${primeiroNome(p.nome)}!` : 'Olá!'
  return [
    `${ola} Aqui é o WhatsApp do *Palácio Virtual*, da Cruz Vermelha Brasileira – RJ.`,
    p.pausado ? '_Os avisos por aqui estão pausados._' : null,
    ['Responda com o número:', '*1* – ver os avisos que você ainda não abriu', '*2* – marcar todos os avisos como lidos',
      p.pausado ? '*3* – voltar a receber os avisos por aqui' : '*3* – parar de receber os avisos por aqui'].join('\n'),
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
    `Para falar com a Cruz Vermelha, use os canais oficiais: ${p.site}`,
  ].join('\n\n')
}
