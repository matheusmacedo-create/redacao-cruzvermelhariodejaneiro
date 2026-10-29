import { CATEGORIAS, ONLINE_MIN, INTERVALO_NO_MESMO_LINK_MIN, type Categoria } from '@/lib/notificacoes/regras'
import { PERGUNTA_DA_VISITA, RESPOSTAS, situacaoDaResposta, type RespostaDaVisita } from '@/lib/portaria/regras'
import { reais } from '@/lib/financeiro/regras'
import { FINALIDADES_DE_USO, SITUACOES_DO_VEICULO, TIPOS_DE_VEICULO, km, lerHodometro, placaLegivel, type FinalidadeDeUso } from '@/lib/patrimonio/frota'
import { quantidade, situacaoDoSaldo } from '@/lib/patrimonio/estoque'

/**
 * Regras do WhatsApp do Palácio Virtual, sem banco nem rede — conferidas por
 * `npx tsx scripts/conferir-whatsapp.ts`.
 *
 * O WhatsApp é um canal a mais do mesmo aviso: tudo continua no sino, e o
 * e-mail segue as regras dele (lib/notificacoes/regras.ts). Pelo WhatsApp:
 *  - só vai para número CONFIRMADO por código e não pausado;
 *  - cada pessoa liga ou desliga por assunto (padrão: ligado);
 *  - quem está com o Palácio aberto agora não recebe (já está vendo o sino);
 *  - no mesmo link, no máximo uma mensagem a cada INTERVALO_NO_MESMO_LINK_MIN;
 *  - aviso "importante" (o desfecho de algo que a pessoa pediu, como o
 *    chamado resolvido) passa por cima dessas duas últimas: é a resposta que
 *    ela espera, e pode chegar minutos depois de outro aviso do mesmo link.
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
 * O mesmo celular brasileiro sem o nono dígito (5521987654321 → 552187654321), como o WhatsApp
 * ainda identifica muitos números antigos; null se não for celular brasileiro com o 9. A Kapso
 * confere a janela de 24 h pelo número exato da conversa: é a segunda tentativa do envio.
 */
export function numeroSemNonoDigito(numero: string): string | null {
  const m = /^55(\d{2})9(\d{8})$/.exec(numero)
  return m ? `55${m[1]}${m[2]}` : null
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

// ------------------------------------------------------------------ conexão

/** Na Kapso o número fica conectado no painel dela: "sem_instancia" é o Phone number ID que ela não acha. */
export type EstadoDaConexao = 'conectado' | 'conectando' | 'desconectado' | 'sem_instancia' | 'erro'

/** O `status` do número na Kapso (CONNECTED, PENDING…) em português. */
export function estadoDoNumeroNaKapso(status: unknown): EstadoDaConexao {
  const s = String(status ?? '').toUpperCase()
  if (s === 'CONNECTED') return 'conectado'
  if (s === 'PENDING' || s === 'CONNECTING' || s === 'IN_PROGRESS') return 'conectando'
  return s ? 'desconectado' : 'erro'
}

/**
 * O problema que o exame de saúde da Kapso (GET …/phone_numbers/{id}/health) aponta no envio ou
 * no acesso ao número; null se está saudável ou se a resposta não diz. O `status` do número fica
 * CONNECTED mesmo com a ligação com a Meta quebrada (visto em 18/10/2026): é o exame que mostra.
 */
export function problemaNaSaude(dados: unknown): string | null {
  const d = dados && typeof dados === 'object' ? dados as Record<string, unknown> : null
  if (!d || d.status !== 'unhealthy') return null
  const checks = d.checks && typeof d.checks === 'object' ? d.checks as Record<string, unknown> : {}
  for (const nome of ['messaging_health', 'phone_number_access']) {
    const c = checks[nome] && typeof checks[nome] === 'object' ? checks[nome] as Record<string, unknown> : null
    if (c?.passed === false) {
      const erro = typeof c.error === 'string' ? c.error : ''
      return /access token|OAuth/i.test(erro)
        ? 'A ligação da Kapso com a Meta para este número caiu (token inválido). Reconecte o número no painel da Kapso.'
        : `A Kapso aponta problema no número${erro ? ` (${erro.slice(0, 160)})` : ''}.`
    }
  }
  return null
}

/** O id de uma conta do WhatsApp Business (WABA) na Meta: só dígitos, como o do número. */
export const wabaValido = (v: unknown): v is string => typeof v === 'string' && /^\d{5,30}$/.test(v)

/**
 * A conta do WhatsApp Business (WABA) do número, na resposta da API da plataforma da Kapso
 * (GET …/whatsapp/phone_numbers/{id}, `{ data: { … } }`): é nela que ficam os modelos (GET
 * /{WABA}/message_templates). Lê os nomes que a Kapso usa para a conta (business_account_id e as
 * variações); null se a resposta não traz — aí vale o campo opcional do cofre (kapso.ts).
 */
export function wabaDoNumero(dados: unknown): string | null {
  const d = dados && typeof dados === 'object' ? (dados as Record<string, unknown>).data : null
  const n = d && typeof d === 'object' && !Array.isArray(d) ? d as Record<string, unknown> : null
  if (!n) return null
  const conta = n.business_account && typeof n.business_account === 'object' ? (n.business_account as Record<string, unknown>).id : null
  for (const v of [n.business_account_id, n.whatsapp_business_account_id, n.waba_id, conta]) {
    const id = typeof v === 'number' && Number.isSafeInteger(v) ? String(v) : typeof v === 'string' ? v.trim() : null
    if (wabaValido(id)) return id
  }
  return null
}

export const ROTULO_DO_ESTADO: Record<EstadoDaConexao, string> = {
  conectado: 'Conectado',
  conectando: 'Conectando',
  desconectado: 'Desconectado',
  sem_instancia: 'Número não encontrado na Kapso',
  erro: 'Sem resposta da Kapso',
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
  /** O desfecho que a pessoa espera: sai mesmo com o Palácio aberto e logo depois de outro aviso do mesmo link. */
  importante?: boolean
}): boolean {
  if (!p.temNumero || p.pausado || !p.categoriaLigada) return false
  if (p.importante) return true
  const agora = p.agora.getTime()
  const visto = p.vistoEm ? new Date(p.vistoEm).getTime() : NaN
  if (Number.isFinite(visto) && agora - visto < ONLINE_MIN * 60_000) return false
  const ultimo = p.ultimoNoMesmoLink ? new Date(p.ultimoNoMesmoLink).getTime() : NaN
  if (Number.isFinite(ultimo) && agora - ultimo < INTERVALO_NO_MESMO_LINK_MIN * 60_000) return false
  return true
}

/**
 * Tira os caracteres invisíveis de formatação (\p{Cf}: a inversão de direção U+202E, o espaço de largura zero
 * U+200B…) e normaliza a compatibilidade (NFKC: a letra de largura cheia vira a comum). Um nome ou título não
 * imita outro, nem esconde um pedaço do texto. º, ª e … ficam como estão: o NFKC os trocaria por o, a e "..."
 * ("2º andar" virando "2o andar").
 */
export const semInvisiveis = (texto: string): string =>
  String(texto ?? '').split(/([ºª…])/).map((p) => (p === 'º' || p === 'ª' || p === '…' ? p : p.normalize('NFKC'))).join('').replace(/\p{Cf}/gu, '')

/**
 * Só os invisíveis que enganam a leitura (a inversão de direção U+202A–202E e U+2066–2069, as marcas de direção, o
 * espaço de largura zero, o hífen invisível, o U+FEFF…), sem o NFKC: o emoji composto (🤦‍♀️, 🏳️‍🌈, com o U+200D),
 * a bandeira com os caracteres de tag, o m² e o ½ ficam como estão. É o de limpo (os textos de todo dia do bot);
 * a comparação e os nomes do assistente usam semInvisiveis inteiro.
 */
const semInvisiveisDeRisco = (texto: string): string =>
  String(texto ?? '').replace(/[­؜​‎‏‪-‮⁠-⁤⁦-⁩﻿]/g, '')

/** Tira o que o WhatsApp leria como formatação (*negrito*, _itálico_…), os controles e os invisíveis que enganam (semInvisiveisDeRisco). */
export const limpo = (texto: string, max: number) =>
  semInvisiveisDeRisco(texto).replace(/[\u0000-\u0009\u000b-\u001f\u007f]/g, '').replace(/[*_~`]/g, '').replace(/\n{3,}/g, '\n\n').trim().slice(0, max)

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
  if (alvo.tipo === 'visita') return `_${PERGUNTA_DA_VISITA}_`
  // O ofício não se assina por aqui: o aviso sai como os comuns, com o link (a resposta só diz onde assinar).
  if (alvo.tipo === 'oficio') return null
  return '_Para responder por aqui, responda esta mensagem._'
}

/**
 * Os botões do aviso que se responde com um toque: hoje, a visita na portaria — "1", "2" e "3", como a
 * resposta digitada (lerRespostaDaVisita), com o rótulo da tela quando cabe no botão. Só dentro da
 * janela de 24 h: fora dela o aviso sai pelo modelo, sem botão, e a dica do texto continua valendo.
 * A ficha da visita que sai na hora leva os dela, com o id da visita (portaria-regras.ts, interativoDaFicha);
 * estes ficam para a ficha que esperou na fila (fila.ts, enviarAgora), que volta como o aviso de antes.
 */
export function interativoDoAviso(link: string | null | undefined): Interativo | null {
  if (alvoDoLink(link)?.tipo !== 'visita') return null
  const respostas = Object.values(RESPOSTAS).sort((a, b) => a.numero - b.numero)
  return {
    tipo: 'botoes',
    botoes: respostas.map((r) => ({ id: String(r.numero), titulo: r.rotulo.length <= LIMITES_DO_INTERATIVO.tituloDoBotao ? r.rotulo : r.curto })),
  }
}

// ------------------------------------------------------------------ volume
//
// Controle de volume comum, não disfarce: o Palácio não manda mais do que
// isto, para não virar enxurrada no celular de ninguém nem sobrecarregar o
// número na Meta (que limita quem manda demais). O que passa do limite espera na fila.

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
 * de pedir (código, resposta do bot, teste), para a segurança da conta, para
 * a portaria (a visita está na porta agora) e para a conta nova (categoria
 * "conta": e-mail e senha provisória de quem acabou de ser aprovado, decisão do
 * responsável em 24/10/2026 — senha parada na fila até as 7h é pior que chegar
 * à noite).
 */
export function silencioSeAplica(p: { tipo: Finalidade; categoria?: string | null }): boolean {
  return p.tipo === 'aviso' && p.categoria !== 'portaria' && p.categoria !== 'conta'
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

/**
 * Categoria que não vai pelo WhatsApp: o alerta de "WhatsApp caiu" iria justamente por onde caiu. O alerta das
 * outras integrações ("integracoes": conta Google expirada, e-mail ou armazenamento parados) vai, como qualquer aviso.
 */
export const categoriaVaiPorWhatsapp = (categoria: string): boolean => categoria !== 'sistema'

/** Alerta de queda repetido no máximo a cada tantas horas. */
export const ALERTA_A_CADA_HORAS = 6

// ------------------------------------------------------------------ cota diária de conversas iniciadas
//
// A Meta limita quantas pessoas DIFERENTES o número procura em 24 h (janela móvel) com conversa que a
// empresa inicia: a mensagem a quem não escreveu ao número nas últimas 24 h, que só sai por modelo. O
// número começa no TIER_250 (250 por dia), e o teto sobe sozinho com o uso e a qualidade; passou dele, a
// Meta recusa o que sobrar. O Palácio conta pela aproximação (fila.ts, cotaDeConversas; a função
// whatsapp_cota_de_conversas no banco): números distintos que receberam saída enviada nas últimas 24 h sem
// ter escrito nas 24 h antes dela. A resposta do bot não conta (vai sempre dentro da janela).
//
// Chegando em teto − reserva, o que pode esperar espera um dia; a reserva fica para o que não espera. E só
// espera quem abriria conversa nova: com a janela aberta (escreveu nas últimas 24 h) ou já contado hoje, sai.

/** O teto do número na Meta (TIER_250) e a reserva para o que não espera. Subiu o teto na Meta, suba aqui. */
export const COTA_DE_CONVERSAS = { teto: 250, reserva: 30 } as const

/** A partir de quantas conversas iniciadas em 24 h o que pode esperar fica para o dia seguinte. */
export const limiteDaCota = (teto: number = COTA_DE_CONVERSAS.teto, reserva: number = COTA_DE_CONVERSAS.reserva) => Math.max(0, teto - reserva)

export type PrioridadeNaCota = 'alta' | 'baixa'

/** Avisos que não esperam a cota: a visita na porta, os alertas de acesso e da trilha (auditoria) e os das integrações. */
const AVISOS_QUE_NAO_ESPERAM_A_COTA = new Set<string>(['portaria', 'auditoria', 'integracoes'])

/**
 * Alta: segurança da conta, código, resposta do bot, teste e os avisos de AVISOS_QUE_NAO_ESPERAM_A_COTA. Baixa:
 * o resto dos avisos — os comuns do sino, o anúncio aos voluntários, os convites (o de acesso e o da ficha) e o
 * pedido de documentos ao candidato.
 */
export function prioridadeNaCota(m: { tipo: Finalidade; categoria?: string | null }): PrioridadeNaCota {
  if (m.tipo !== 'aviso') return 'alta'
  return AVISOS_QUE_NAO_ESPERAM_A_COTA.has(m.categoria ?? '') ? 'alta' : 'baixa'
}

/** A cota do espaço e, para um número, se ele está com a janela aberta ou já foi contado nas últimas 24 h. */
export type CotaDoNumero = { usadas: number; janelaAberta: boolean; jaContado: boolean }

/** A mensagem espera pela cota? `usadas` null = não deu para contar (antes da migração): nada espera. */
export function esperaPelaCota(p: { prioridade: PrioridadeNaCota; usadas: number | null; janelaAberta: boolean; jaContado: boolean; limite?: number }): boolean {
  if (p.prioridade === 'alta' || p.usadas === null || p.janelaAberta || p.jaContado) return false
  return p.usadas >= (p.limite ?? limiteDaCota())
}

/**
 * Quando o que esperou pela cota tenta de novo: 24 h depois — a janela da Meta é móvel, então o que contou até
 * agora já saiu da conta. Caindo no silêncio da noite, às 7h. Lá, confere de novo (e, no limite, espera mais um dia).
 */
export function fimDaEsperaDaCota(agora: Date): Date {
  const amanha = new Date(agora.getTime() + 24 * 3_600_000)
  return emSilencio(amanha) ? fimDoSilencio(amanha) : amanha
}

/** "37 de 250"; no limite, o que acontece; sem a contagem, "não deu para ler agora". */
export function textoDaCota(usadas: number | null, teto: number = COTA_DE_CONVERSAS.teto): string {
  if (usadas === null) return 'não deu para ler agora'
  return `${usadas} de ${teto}${usadas >= limiteDaCota(teto) ? ' – no limite: avisos comuns, convites e anúncios esperam o dia seguinte' : ''}`
}

/** O fim do recado de quem mandou um convite ou um link que ficou para o dia seguinte pela cota. */
export const TEXTO_DA_ESPERA_DA_COTA = 'amanhã: a cota diária de conversas que o WhatsApp deixa o Palácio começar está no limite'

// ------------------------------------------------------------------ saúde do canal (o "status" da administração e os alertas da rotina)
//
// Além da conexão, a rotina diária confere o recebimento (o webhook na Kapso) e as falhas por falta
// de modelo, e alerta a administração no sino e no e-mail (lib/whatsapp/estado.ts). O "status" mostra
// tudo isso de uma vez pelo próprio WhatsApp (lib/whatsapp/admin.ts).

/** O webhook do número na Kapso aponta para o Palácio, ligado e com a senha certa? (servidor.ts, situacaoDoWebhook) */
export type EstadoDoWebhook = 'ligado' | 'outro_endereco' | 'desligado' | 'desconhecido'

/** Tantas falhas por "fora da janela" ou por recusa do modelo em 24 h já pedem os modelos aprovados: a rotina avisa. */
export const FALHAS_SEM_MODELO_PARA_ALERTAR = 5

export type TipoDeFalha = 'janela' | 'modelo' | 'meta' | 'chave' | 'creditos' | 'numero_do_palacio' | 'sem_resposta' | 'rede' | 'outro'

/**
 * Os erros que kapso.ts grava em whatsapp_mensagens.erro, reconhecidos pelo texto. A ordem conta: o
 * de fora da janela termina com o que falta ("aprove um modelo…"), e a recusa do modelo pausado fala
 * em "fora da janela" no meio — por isso a janela é só a que COMEÇA assim.
 */
const FALHAS: [TipoDeFalha, RegExp, string][] = [
  ['janela', /^fora da janela/i, 'Fora da janela de 24 h, sem modelo aprovado'],
  ['modelo', /\bmodelo\b/i, 'Modelo recusado pela Meta ou pela Kapso'],
  ['meta', /ligação da Kapso com a Meta/i, 'Ligação da Kapso com a Meta caiu'],
  ['chave', /recusou a chave/i, 'Chave da Kapso recusada'],
  ['creditos', /créditos/i, 'Kapso sem créditos'],
  ['numero_do_palacio', /não achou o número/i, 'Número do Palácio não achado na Kapso'],
  ['sem_resposta', /\ba tempo\b/i, 'Kapso sem resposta a tempo (pode ter saído)'],
  ['rede', /falar com a Kapso/i, 'Sem conexão com a Kapso'],
]

/** A resposta do bot que caiu fora da janela: nunca vai por modelo (modeloParaEnviar), então nenhum modelo aprovado a faz sair. */
export const ROTULO_DO_BOT_FORA_DA_JANELA = 'Resposta do bot fora da janela de 24 h (não usa modelo)'

/**
 * O motivo de uma falha de envio, resumido para agrupar. O que não é conhecido agrupa pelo próprio erro, cortado.
 * `tipoDaMensagem` é o tipo do registro (whatsapp_mensagens.tipo): a resposta do bot fora da janela (as
 * boas-vindas depois de confirmar o número, por exemplo) vira "outro", com rótulo próprio — não conta como
 * falta de modelo nem puxa a dica dos modelos.
 */
export function tipoDaFalha(erro: string | null | undefined, tipoDaMensagem?: string | null): { tipo: TipoDeFalha; rotulo: string } {
  const t = String(erro ?? '').replace(/\s+/g, ' ').trim()
  if (!t) return { tipo: 'outro', rotulo: 'Sem motivo registrado' }
  for (const [tipo, padrao, rotulo] of FALHAS) {
    if (!padrao.test(t)) continue
    if (tipoDaMensagem === 'bot' && (tipo === 'janela' || tipo === 'modelo')) return { tipo: 'outro', rotulo: ROTULO_DO_BOT_FORA_DA_JANELA }
    return { tipo, rotulo }
  }
  const curto = t.replace(/\.$/, '')
  return { tipo: 'outro', rotulo: curto.length > 80 ? `${curto.slice(0, 79).trimEnd()}…` : curto }
}

/** Uma saída que falhou: o erro gravado e o tipo do registro (a finalidade: aviso, bot, código…). */
export type FalhaDeEnvio = { erro: string | null; tipo?: string | null }

export type GrupoDeFalhas = { rotulo: string; tipo: TipoDeFalha; quantas: number }

/** As falhas agrupadas pelo motivo, da mais comum para a menos. */
export function resumoDasFalhas(falhas: FalhaDeEnvio[]): GrupoDeFalhas[] {
  const grupos = new Map<string, GrupoDeFalhas>()
  for (const f of falhas) {
    const { tipo, rotulo } = tipoDaFalha(f.erro, f.tipo)
    const g = grupos.get(rotulo)
    if (g) g.quantas++
    else grupos.set(rotulo, { rotulo, tipo, quantas: 1 })
  }
  return [...grupos.values()].sort((a, b) => b.quantas - a.quantas || a.rotulo.localeCompare(b.rotulo))
}

/** Quantas falharam por estar fora da janela sem modelo ou por recusa do modelo: as que os modelos aprovados resolvem (a resposta do bot, não). */
export const falhasSemModelo = (falhas: FalhaDeEnvio[]): number =>
  falhas.filter((f) => { const { tipo } = tipoDaFalha(f.erro, f.tipo); return tipo === 'janela' || tipo === 'modelo' }).length

/**
 * O alerta de um problema que a rotina confere (recebimento desligado, falhas sem modelo): uma vez
 * por episódio, como o de queda (estado.ts), e nunca de novo antes de ALERTA_A_CADA_HORAS. `aberto` =
 * já houve alerta e nada o resolveu depois; `problema` null = não deu para saber (nada muda).
 */
export function decidirAlerta(p: { problema: boolean | null; aberto: boolean; ultimoAlertaEm: string | null; agora: Date }): 'alertar' | 'resolvido' | null {
  if (p.problema === null) return null
  if (!p.problema) return p.aberto ? 'resolvido' : null
  if (p.aberto) return null
  const ultimo = p.ultimoAlertaEm ? new Date(p.ultimoAlertaEm).getTime() : NaN
  if (Number.isFinite(ultimo) && p.agora.getTime() - ultimo < ALERTA_A_CADA_HORAS * 3_600_000) return null
  return 'alertar'
}

/** "dom, 18/10 às 07:05" (relógio de São Paulo); null se a data não serve. */
export function quandoEmSaoPaulo(iso: string | null | undefined): string | null {
  const d = new Date(String(iso ?? ''))
  if (!iso || !Number.isFinite(d.getTime())) return null
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).formatToParts(d).map((x) => [x.type, x.value]))
  return `${rotuloDoDia(`${p.year}-${p.month}-${p.day}`)} às ${p.hour}:${p.minute}`
}

/** O que espera na fila, por motivo; `cota`: o que ficou para o dia seguinte pela cota diária de conversas. */
export type EsperaNaFila = { silencio: number; volume: number; falha: number; cota: number }

/** "3 mensagens (2 no silêncio até as 7h, 1 para reenviar)"; "vazia"; sem a contagem, "não deu para ler agora". */
function textoDaEspera(f: EsperaNaFila | null): string {
  if (!f) return 'não deu para ler agora'
  const total = f.silencio + f.volume + f.falha + f.cota
  if (!total) return 'vazia'
  const partes = [
    f.silencio ? `${f.silencio} no silêncio até as 7h` : null,
    f.volume ? `${f.volume} esperando a vez` : null,
    f.falha ? `${f.falha} para reenviar` : null,
    f.cota ? `${f.cota} para amanhã pela cota diária` : null,
  ].filter(Boolean)
  return `${total} ${total === 1 ? 'mensagem' : 'mensagens'} (${partes.join(', ')})`
}

const WEBHOOK_NO_STATUS: Record<EstadoDoWebhook, string> = {
  ligado: 'ligado',
  outro_endereco: 'aponta para outro endereço (ou sem a senha do Palácio)',
  desligado: 'desligado: o bot não recebe as mensagens',
  desconhecido: 'não deu para ler na Kapso',
}

export const GRUPOS_DE_FALHAS_NO_STATUS = 4

export type StatusDoCanal = {
  conexao: { estado: EstadoDaConexao; erro: string | null }
  webhook: EstadoDoWebhook
  fila: EsperaNaFila | null
  /** As falhas de envio das últimas 24 h (`total` conta todas; os grupos, as lidas). null = não deu para ler. */
  falhas: { total: number; grupos: GrupoDeFalhas[] } | null
  /** Os nomes das integrações sem chave (nunca os valores). null = não deu para ler. */
  semChave: string[] | null
  /** As autorizações do Google que expiraram: onde são usadas e a conta. */
  googleExpiradas: { onde: string; conta: string }[]
  /** As conversas que o Palácio iniciou nas últimas 24 h (a cota diária da Meta); null = não deu para contar. */
  conversas: number | null
  /** Quando a rotina diária do WhatsApp terminou pela última vez; null = sem registro. */
  rotina: string | null
  /** A última sincronização de cada conta ativa da Escola (Únicopag e Meta); null = não deu para ler; sem conta (ou sem o campo), a linha não sai. */
  escola?: SincronizacaoDaEscola[] | null
  /** O assistente do WhatsApp (lib/whatsapp/assistente): sem a configuração (ou sem o campo), a linha não sai. */
  assistente?: AssistenteNoStatus | null
  /** O Google Drive da filial (lib/whatsapp/drive.ts): null = não deu para ler; sem o campo, a linha não sai. */
  drive?: DriveNoStatus | null
  urlBase: string
}

/** O Google Drive no "status": conectado ou expirado (a conta e se a pasta raiz já existe), ou sem conexão. */
export type DriveNoStatus = { estado: 'ativa' | 'expirada'; conta: string; pastaRaiz: boolean } | 'sem_conexao'

/** A linha do Drive no "status" (a pasta raiz é "Palácio – Arquivos": lib/google/drive-regras.ts). */
export function linhaDoDriveNoStatus(d: DriveNoStatus | null): string {
  if (d === null) return '*Google Drive:* não deu para ler agora'
  if (d === 'sem_conexao') return '*Google Drive:* sem conexão (um administrador conecta em Configurações → E-mail dos setores)'
  const conta = d.conta ? ` (${limpo(d.conta, 80)})` : ''
  if (d.estado === 'expirada') return `*Google Drive:* expirado${conta} – a autorização caiu; reconecte em Configurações → E-mail dos setores`
  return `*Google Drive:* conectado${conta} · ${d.pastaRaiz ? 'pasta “Palácio – Arquivos” criada' : 'a pasta “Palácio – Arquivos” nasce no primeiro arquivo'}`
}

/** O assistente no "status" (lib/whatsapp/assistente/uso.ts, assistenteNoStatus): só a configuração e as contagens de hoje. */
export type AssistenteNoStatus = {
  modo: 'desligado' | 'piloto' | 'admins' | 'equipe'
  /** Prepara ações para a pessoa confirmar (whatsapp_ia_config.escrita). */
  escrita: boolean
  /** A pausa do disjuntor (ou da chave, ou do modelo) em vigor. */
  pausado: boolean
  /** O teto de gasto do espaço por dia, em US$. */
  teto: number
  /** null = não deu para ler agora (ou desligado). */
  numeros: { conversas: number; gasto: number; comCache: number; recusas: number; noTeto: number } | null
}

const MODO_NO_STATUS: Record<AssistenteNoStatus['modo'], string> = { desligado: 'desligado', piloto: 'piloto', admins: 'administradores', equipe: 'toda a equipe' }
const dolares = (n: number, casas: boolean) => `US$ ${casas || !Number.isInteger(n) ? n.toFixed(2).replace('.', ',') : String(n)}`
const quantas = (n: number, uma: string, varias: string) => `${n} ${n === 1 ? uma : varias}`

/** "*Assistente:* piloto, com ações · hoje 37 conversas · US$ 1,12 de US$ 10 · cache 92% · 0 recusas · 1 pessoa no teto de consultas". */
export function linhaDoAssistenteNoStatus(a: AssistenteNoStatus): string {
  if (a.modo === 'desligado') return '*Assistente:* desligado'
  const partes = [`${MODO_NO_STATUS[a.modo] ?? a.modo}, ${a.escrita ? 'com ações' : 'só consultas'}`]
  if (a.pausado) partes.push('pausado agora (o bot de comandos responde sozinho)')
  if (!a.numeros) partes.push('números de hoje: não deu para ler agora')
  else {
    const n = a.numeros
    partes.push(`hoje ${quantas(n.conversas, 'conversa', 'conversas')}`, `${dolares(n.gasto, true)} de ${dolares(a.teto, false)}`, `cache ${n.comCache}%`, quantas(n.recusas, 'recusa', 'recusas'))
    if (n.noTeto) partes.push(`${quantas(n.noTeto, 'pessoa', 'pessoas')} no teto de consultas`)
  }
  return `*Assistente:* ${partes.join(' · ')}`
}

// A Escola no "status": a sincronização diária de cada conta da Únicopag (saldo e transações) e do Meta
// (marketing), lida de escola_contas e escola_meta_contas — quando leu certo pela última vez e o erro da última
// tentativa (o texto que lib/escola grava, sem chave nem dado de aluno).

export type OrigemDaEscola = 'unicopag' | 'meta'
export type SituacaoDaSincronizacao = 'em_dia' | 'atrasada' | 'erro' | 'nunca'
export type SincronizacaoDaEscola = { origem: OrigemDaEscola; nome: string | null; sincronizadaEm: string | null; erro: string | null; situacao: SituacaoDaSincronizacao }

/** Sem leitura certa há mais que isso, a conta está atrasada (a rotina da Escola roda todo dia). */
export const ESCOLA_ATRASADA_HORAS = 30
export const CONTAS_DA_ESCOLA_NO_STATUS = 4

/** A situação da conta: o erro da última tentativa manda; sem erro, nunca leu, leu há muito ou está em dia. */
export function situacaoDaSincronizacao(c: { sincronizadaEm: string | null; erro: string | null }, agora: Date): SituacaoDaSincronizacao {
  if (c.erro?.trim()) return 'erro'
  const lida = c.sincronizadaEm ? new Date(c.sincronizadaEm).getTime() : NaN
  if (!Number.isFinite(lida)) return 'nunca'
  return agora.getTime() - lida > ESCOLA_ATRASADA_HORAS * 3_600_000 ? 'atrasada' : 'em_dia'
}

const ORIGEM_DA_ESCOLA: Record<OrigemDaEscola, string> = { unicopag: 'Únicopag', meta: 'Meta' }

/** As linhas da Escola no "status": uma quando tudo está em dia; com problema, a contagem e até 4 contas. */
function linhasDaEscola(e: SincronizacaoDaEscola[] | null | undefined): string[] {
  if (e === undefined) return []
  if (e === null) return ['*Escola (sincronização):* não deu para ler agora']
  if (!e.length) return []
  const problemas = e.filter((c) => c.situacao !== 'em_dia')
  if (!problemas.length) {
    const ultima = e.map((c) => c.sincronizadaEm ?? '').sort().reverse()[0]
    return [`*Escola (sincronização):* em dia (${e.length} ${e.length === 1 ? 'conta' : 'contas'}; última leitura ${quandoEmSaoPaulo(ultima) ?? 'sem data'})`]
  }
  const mostradas = problemas.slice(0, CONTAS_DA_ESCOLA_NO_STATUS)
  const linhas = [`*Escola (sincronização):* ${problemas.length} de ${e.length} com problema`, ...mostradas.map((c) => {
    const qual = `${ORIGEM_DA_ESCOLA[c.origem]}${c.nome?.trim() ? ` · ${limpo(c.nome, 60)}` : ''}`
    const ultima = quandoEmSaoPaulo(c.sincronizadaEm)
    if (c.situacao === 'erro') return `• ${qual} – ${limpo(c.erro ?? '', 120)} (última leitura certa: ${ultima ?? 'nunca'})`
    if (c.situacao === 'nunca') return `• ${qual} – ainda não leu nenhuma vez`
    return `• ${qual} – sem leitura há mais de ${ESCOLA_ATRASADA_HORAS} h (última: ${ultima ?? 'sem data'})`
  })]
  const outras = problemas.length - mostradas.length
  if (outras > 0) linhas.push(`_e mais ${outras} ${outras === 1 ? 'conta' : 'contas'}_`)
  return linhas
}

/** A resposta ao "status": curta, uma linha por assunto, no formato do WhatsApp. */
export function textoDoStatus(s: StatusDoCanal): string {
  const conexao = `*Kapso:* ${ROTULO_DO_ESTADO[s.conexao.estado]}${s.conexao.erro ? ` – ${limpo(s.conexao.erro, 160)}` : ''}`
  const linhasDasFalhas = (() => {
    if (!s.falhas) return ['*Falhas em 24 h:* não deu para ler agora']
    if (!s.falhas.total) return ['*Falhas em 24 h:* nenhuma']
    const mostrados = s.falhas.grupos.slice(0, GRUPOS_DE_FALHAS_NO_STATUS)
    const linhas = [`*Falhas em 24 h:* ${s.falhas.total}`, ...mostrados.map((g) => `• ${g.quantas} – ${limpo(g.rotulo, 90)}`)]
    const outros = s.falhas.grupos.length - mostrados.length
    if (outros > 0) linhas.push(`_e mais ${outros} ${outros === 1 ? 'motivo' : 'motivos'}_`)
    if (s.falhas.grupos.some((g) => g.tipo === 'janela' || g.tipo === 'modelo')) linhas.push('_Os modelos aprovados ficam em Configurações → Integrações._')
    return linhas
  })()
  const semChave = !s.semChave ? 'não deu para ler agora' : s.semChave.length ? s.semChave.map((n) => limpo(n, 60)).join(', ') : 'nenhuma'
  const google = s.googleExpiradas.length
    ? `${s.googleExpiradas.map((g) => `${limpo(g.onde, 60)} (${limpo(g.conta, 80)})`).join('; ')} – a autorização expirou; reconecte em Configurações → E-mail dos setores`
    : 'em dia'
  return [
    '*Status do WhatsApp do Palácio*',
    [
      conexao,
      `*Recebimento (bot):* ${WEBHOOK_NO_STATUS[s.webhook]}`,
      `*Fila:* ${textoDaEspera(s.fila)}`,
      `*Conversas iniciadas em 24 h:* ${textoDaCota(s.conversas)}`,
      ...linhasDasFalhas,
      `*Integrações sem chave:* ${semChave}`,
      `*Contas Google:* ${google}`,
      ...(s.drive !== undefined ? [linhaDoDriveNoStatus(s.drive)] : []),
      ...linhasDaEscola(s.escola),
      ...(s.assistente ? [linhaDoAssistenteNoStatus(s.assistente)] : []),
      `*Rotina diária:* ${quandoEmSaoPaulo(s.rotina) ?? 'sem registro ainda'}`,
    ].join('\n'),
    `Detalhes: ${s.urlBase}/configuracoes/whatsapp`,
  ].join('\n\n')
}

export type RodadaDaFila = { enviadas: number; adiadas: number; desistiu: number; restam: number }

/** O que uma rodada da fila fez (o botão "Enviar a fila agora" e o comando "fila"). */
export function textoDaRodadaDaFila(r: RodadaDaFila): string {
  if (!r.enviadas && !r.adiadas && !r.desistiu && !r.restam) {
    return 'Nada saiu agora: a fila está vazia, ou o que espera ainda não pode sair (o silêncio das 22h às 7h, o reenvio marcado para mais tarde ou a cota diária).'
  }
  const partes = [`${r.enviadas} ${r.enviadas === 1 ? 'mensagem enviada' : 'mensagens enviadas'}`]
  if (r.adiadas) partes.push(`${r.adiadas} para tentar de novo mais tarde`)
  if (r.desistiu) partes.push(`${r.desistiu} ${r.desistiu === 1 ? 'descartada' : 'descartadas'} (aviso já lido, número removido ou falha sem volta)`)
  if (r.restam) partes.push(`${r.restam} ainda esperando a vez`)
  return `${partes.join('; ')}.`
}

/** A resposta ao "fila": a rodada e o que ficou esperando. */
export function textoDoComandoFila(p: { rodada: RodadaDaFila; fila: EsperaNaFila | null }): string {
  return ['*Fila do WhatsApp*', textoDaRodadaDaFila(p.rodada), `Na fila agora: ${textoDaEspera(p.fila)}.`].join('\n\n')
}

/**
 * O convite de acesso ao Palácio pelo WhatsApp: o usuário e o link para criar
 * a senha (uso único) e, quando o RH também pediu, o link da ficha — tudo numa
 * mensagem só.
 */
export function textoDoConviteDoPalacio(p: { nome: string; usuario: string; url: string; horas: number; convidadoPor: string; urlDaFicha?: string | null }): string {
  const nome = primeiroNome(p.nome)
  return [
    `${nome ? `Olá, ${limpo(nome, 60)}!` : 'Olá!'} ${limpo(p.convidadoPor, 80)} criou o seu acesso ao *Palácio Virtual*, o sistema interno da Cruz Vermelha Brasileira – RJ.`,
    `Seu usuário: *${limpo(p.usuario, 40)}*`,
    `${p.urlDaFicha ? '*1.* ' : ''}Crie a sua senha (o link vale por ${p.horas} horas e funciona uma vez só):\n${p.url}`,
    p.urlDaFicha ? `*2.* Complete a sua ficha no RH (dados pessoais, endereço e contato de emergência):\n${p.urlDaFicha}` : null,
    '_Não repasse estes links. A Cruz Vermelha nunca pede a sua senha por mensagem._',
  ].filter(Boolean).join('\n\n')
}

/**
 * O link de "Esqueci minha senha" pelo WhatsApp confirmado da conta (app/actions/contas.ts). Vai como mensagem de
 * segurança: sai mesmo com os avisos pausados e de madrugada, e fora da janela de 24 h pelo modelo de segurança.
 */
export function textoDoLinkDeSenha(p: { nome: string | null; usuario: string; url: string; minutos: number }): string {
  const nome = primeiroNome(p.nome ?? '')
  return [
    `${nome ? `Olá, ${limpo(nome, 60)}!` : 'Olá!'} Pediram um link para criar uma senha nova no *Palácio Virtual*.`,
    `Seu usuário: *${limpo(p.usuario, 40)}*`,
    `Crie a senha nova (o link vale por ${p.minutos} minutos e funciona uma vez só):\n${p.url}`,
    '_Se não foi você, ignore: a sua senha atual continua valendo. Não repasse este link; a Cruz Vermelha nunca pede a sua senha por mensagem._',
  ].join('\n\n')
}

/**
 * A linha do "Não fui eu" no aviso de segurança que o oferece (lib/whatsapp/protecao.ts). É por ela que a
 * entrega remonta o botão e marca o registro da saída (interativoDaSeguranca), saia o aviso agora ou da fila.
 */
export const LINHA_DO_NAO_FUI_EU = 'Responda *NÃO FUI EU* se não foi você: depois de confirmar, o Palácio encerra todas as sessões da conta e avisa a administração.'

/**
 * Aviso de segurança da conta (senha, verificação, e-mail, acesso novo, bloqueio, troca ou remoção do
 * WhatsApp): sai sempre, mesmo pausado e de madrugada (lib/contas/servidor.ts, avisarPorWhatsapp).
 * `naoFuiEu`: o aviso de algo que a própria pessoa faria (acesso novo, bloqueio, senha, número trocado)
 * ensina a responder "NÃO FUI EU"; o do que a administração fez, não (lib/contas/emails.ts, ofereceNaoFuiEu).
 */
export function textoDeSeguranca(p: { titulo: string; texto: string; naoFuiEu?: boolean }): string {
  return [
    `*${limpo(p.titulo, 200)}*`,
    limpo(p.texto, 900),
    p.naoFuiEu ? `_${LINHA_DO_NAO_FUI_EU}_` : null,
    '_Palácio Virtual · Cruz Vermelha Brasileira – RJ. A equipe nunca pede sua senha nem códigos, por aqui ou por telefone._',
  ].filter(Boolean).join('\n\n')
}

/**
 * O recado ao número que saiu da conta (trocado ou removido pela própria pessoa): o número pode já
 * ser de outra pessoa, então vai sem nome, sem quem fez, sem data e sem "sua conta" ou "sua senha". O
 * aviso completo vai só ao e-mail confirmado (lib/contas/servidor.ts, avisarTrocaDeWhatsapp). Leva o
 * "Não fui eu": se a troca não foi da pessoa, é por este número que ela derruba quem entrou na conta.
 */
export const AVISO_AO_NUMERO_ANTIGO = {
  titulo: 'Avisos do Palácio Virtual',
  texto: 'Este número deixou de receber os avisos de uma conta do Palácio Virtual. Se não foi você que pediu, fale com a administração.',
  naoFuiEu: true,
} as const

/** O botão do "Não fui eu": o id é o que se digita (ehNaoFuiEu). Só dentro da janela; fora dela, o modelo leva o texto, que ensina a responder. */
export const BOTAO_DO_NAO_FUI_EU: Interativo = { tipo: 'botoes', botoes: [{ id: 'nao fui eu', titulo: 'Não fui eu' }] }

/** A marca no registro da saída (whatsapp_mensagens.comando) do aviso que oferece o "Não fui eu": é por ela que a resposta acha o aviso. */
export const MARCA_DO_NAO_FUI_EU = 'nao_fui_eu'

/** O aviso oferece o "Não fui eu"? Pelo texto, para valer também no que esperou na fila (que guarda só o texto). */
export const ofereceNaoFuiEu = (texto: string): boolean => texto.includes(LINHA_DO_NAO_FUI_EU)

// ------------------------------------------------------------------ confirmação do número
//
// Dois caminhos, e o código de um nunca serve no outro (o sentido entra no hash):
//  - ida (o padrão): o Palácio mostra o código na tela e a pessoa manda ao número do Palácio
//    (link wa.me com o texto pronto). Quem escreve é que abre a conversa, então não depende da
//    janela de 24 h nem de modelo aprovado. O bot confere e confirma (lib/whatsapp/confirmacao.ts);
//  - volta: o Palácio manda o código ao número e a pessoa digita na tela. Só chega a quem escreveu
//    ao número nas últimas 24 h, ou pelo modelo de Autenticação do cofre (modeloParaEnviar, abaixo).
// Os limites (códigos por janela, validade, tentativas) são os mesmos e contam juntos.

export const CODIGO_VALIDADE_MIN = 10
export const CODIGO_TENTATIVAS = 5
/** No máximo tantos códigos por pessoa na janela (freia quem usa a tela para mandar mensagem a terceiros). */
export const CODIGOS_POR_JANELA = 3
export const JANELA_DOS_CODIGOS_MIN = 30

export const codigoNoFormato = (codigo: string) => /^\d{6}$/.test(codigo)

export type SentidoDoCodigo = 'ida' | 'volta'

/**
 * O que entra no hash do código: o sentido, o dono (a pessoa da equipe ou `voluntario:<id>`), o
 * número e o código. O de volta é o formato de sempre: os códigos já pedidos continuam valendo.
 */
export const baseDoHashDoCodigo = (sentido: SentidoDoCodigo, dono: string, numero: string, codigo: string) =>
  `${sentido === 'ida' ? 'whatsapp-ida' : 'whatsapp'}:${dono}:${numero}:${codigo}`

export function textoDoCodigo(codigo: string): string {
  return [
    `Seu código do Palácio Virtual: *${codigo}*`,
    `Digite no seu perfil para ligar os avisos por WhatsApp. Vale por ${CODIGO_VALIDADE_MIN} minutos.`,
    '_Se não foi você que pediu, ignore esta mensagem: nada muda sem o código._',
  ].join('\n\n')
}

/** A tela do código de ida pergunta a cada tanto se o bot já confirmou (só lê). */
export const INTERVALO_DA_CONFERENCIA_MS = 4_000

/** A mensagem pronta do link, com o código de ida. Sem outro número no texto: o bot acha o código sem confusão. */
export function textoDoCodigoDeIda(codigo: string, onde: 'palacio' | 'voluntariado' = 'palacio'): string {
  return `Confirmar meu WhatsApp ${onde === 'voluntariado' ? 'na Área do Voluntário' : 'no Palácio'}: ${codigo}`
}

/** Link do WhatsApp (wa.me) para o número, com a mensagem pronta; null sem um número que sirva. */
export function linkDoWhatsapp(numero: string | null | undefined, texto: string): string | null {
  const d = String(numero ?? '').replace(/\D/g, '')
  if (d.length < 10 || d.length > 15) return null
  return `https://wa.me/${d}?text=${encodeURIComponent(texto)}`
}

/**
 * O código de 6 números numa mensagem ao bot: a mensagem pronta do link, só o código ou
 * "123 456". null se não há, se há outro número junto (um telefone, uma data, o "10 minutos" do
 * código que o Palácio mandou) ou se a mensagem é longa demais para ser o código.
 */
export function codigoNaMensagem(entrada: string | null | undefined): string | null {
  const t = String(entrada ?? '').trim()
  if (!t || t.length > 160) return null
  const grupos = t.match(/\d(?:[\d .-]*\d)?/g) ?? []
  if (grupos.length !== 1) return null
  const digitos = grupos[0].replace(/\D/g, '')
  return codigoNoFormato(digitos) ? digitos : null
}

/**
 * A leitura estrita do código, para o número que já é de alguém da equipe: só a mensagem que é o
 * código ("123456", "123 456") ou exatamente a mensagem pronta do link. "chamado: patrimônio 123456
 * sem toner" segue para o chamado — codigoNaMensagem acharia ali um código.
 */
export function soOCodigo(entrada: string | null | undefined): string | null {
  const t = String(entrada ?? '').trim()
  const m = /^(\d{3})[ .-]?(\d{3})$/.exec(t) ?? /^Confirmar meu WhatsApp (?:no Palácio|na Área do Voluntário):\s*(\d{3})[ .-]?(\d{3})$/i.exec(t)
  return m ? `${m[1]}${m[2]}` : null
}

/** A resposta do bot quando o código de ida confere. */
export function textoDoNumeroConfirmado(onde: 'palacio' | 'voluntariado'): string {
  return onde === 'voluntariado'
    ? 'Pronto: número confirmado. As oportunidades de voluntariado passam a chegar por aqui.\n\nResponda *menu* para ver as opções.'
    : 'Pronto: número confirmado. Os avisos do Palácio Virtual passam a chegar por aqui.\n\nResponda *menu* para ver o que dá para fazer por aqui.'
}

/** Código de ida errado: curto, com o que resta. */
export function textoDoCodigoDeIdaErrado(restam: number): string {
  if (restam <= 0) return 'Esse código não confere, e as tentativas acabaram. Gere um código novo na tela.'
  return `Esse código não confere. Confira o código na tela e mande de novo (${restam === 1 ? 'resta 1 tentativa' : `restam ${restam} tentativas`}).`
}

/** O código de ida conferiu, mas o número não se confirmou: por quê. */
export function textoDaFalhaDoCodigoDeIda(motivo: 'usado' | 'outra_conta' | 'falhou', quem: 'equipe' | 'voluntario'): string {
  if (motivo === 'usado') return 'Esse código já foi usado. Gere um código novo na tela.'
  if (motivo === 'outra_conta') {
    return quem === 'equipe' ? 'Esse número já está confirmado em outra conta do Palácio Virtual. Nada mudou.' : 'Esse número já está confirmado por outro voluntário. Nada mudou.'
  }
  return 'Não consegui confirmar o número agora. Gere um código novo na tela e tente de novo.'
}

/** O código que o Palácio mandou (o de digitar na tela) chegou de volta aqui: não conta tentativa. */
export const TEXTO_DO_CODIGO_DE_VOLTA = 'Este código é para digitar na tela em que você o pediu, não para mandar aqui.'

// ------------------------------------------------------------------ modelos (fora da janela de 24 h)
//
// Pela API oficial, texto livre só sai para quem escreveu ao número nas últimas 24 h. Fora disso,
// só modelo aprovado pela Meta, um por finalidade (os nomes ficam no cofre, Configurações → Integrações):
//  - aviso e teste: o modelo dos avisos, com uma variável no corpo ({{1}}) que leva o texto inteiro;
//  - código de confirmação: um modelo da categoria AUTHENTICATION da Meta (é a categoria que a Meta
//    exige para códigos). O texto é fixo da Meta, com o botão de copiar; o código vai no corpo e no
//    botão. Sem ele, o código não sai fora da janela — nunca pelo modelo dos avisos;
//  - segurança da conta: o modelo de segurança, se houver; senão, o dos avisos;
//  - resposta do bot: nunca por modelo (quem escreveu acabou de abrir a janela).

/** Para que a mensagem sai. É o tipo do registro (whatsapp_mensagens.tipo) e da fila. */
export type Finalidade = 'aviso' | 'seguranca' | 'codigo' | 'bot' | 'teste'

/** Os nomes dos modelos aprovados, como estão no cofre (null = não informado). */
export type ModelosDoWhatsapp = { modelo: string | null; modeloCodigo: string | null; modeloSeguranca: string | null }

/** Idioma dos modelos aprovados do Palácio. */
export const IDIOMA_DO_MODELO = 'pt_BR'

/** O nome de um modelo como a Meta grava: letras minúsculas, números e sublinhado. */
export const nomeDeModeloValido = (nome: string) => /^[a-z0-9_]{1,512}$/.test(nome)

/** O modelo que leva a mensagem fora da janela; null = nenhum serve. */
export function modeloDaFinalidade(finalidade: Finalidade, m: ModelosDoWhatsapp): string | null {
  if (finalidade === 'bot') return null
  if (finalidade === 'codigo') return m.modeloCodigo
  if (finalidade === 'seguranca') return m.modeloSeguranca ?? m.modelo
  return m.modelo
}

/**
 * O texto de um aviso cabendo num parâmetro de modelo: a Meta não aceita
 * quebra de linha, tabulação nem mais de 4 espaços seguidos ali.
 */
export function textoParaModelo(t: string): string {
  return t.replace(/\s*\n+\s*/g, ' · ').replace(/[\t\u00a0]+/g, ' ').replace(/ {2,}/g, ' ').trim().slice(0, 1000)
}

type ParametroDeTexto = { type: 'text'; text: string }

/**
 * O objeto `template` da Cloud API (POST /{phone_number_id}/messages com type "template"). O do cofre leva só o corpo
 * (e o botão de copiar, no de Autenticação); os do catálogo por situação (modelos.ts, montarModelo) podem levar o
 * cabeçalho de imagem, pelo id da mídia, e o payload de cada botão de resposta rápida.
 */
export type ObjetoDoModelo = {
  name: string
  language: { code: string }
  components: (
    | { type: 'header'; parameters: { type: 'image'; image: { id: string } }[] }
    | { type: 'body'; parameters: ParametroDeTexto[] }
    | { type: 'button'; sub_type: 'url'; index: string; parameters: ParametroDeTexto[] }
    | { type: 'button'; sub_type: 'quick_reply'; index: string; parameters: { type: 'payload'; payload: string }[] }
  )[]
}

/**
 * O modelo para mandar fora da janela, ou o que falta para haver um. `texto` é a mensagem que
 * sairia como texto livre; `codigo`, o código de confirmação (só na finalidade "codigo": o modelo
 * de Autenticação não leva o nosso texto, só o código, no corpo e no botão de copiar).
 */
export function modeloParaEnviar(p: { finalidade: Finalidade; modelos: ModelosDoWhatsapp; texto: string; codigo?: string | null }):
  { ok: true; modelo: ObjetoDoModelo } | { ok: false; falta: string } {
  if (p.finalidade === 'bot') return { ok: false, falta: 'Resposta do bot não sai por modelo.' }
  const nome = modeloDaFinalidade(p.finalidade, p.modelos)
  if (!nome) {
    return {
      ok: false,
      falta: p.finalidade === 'codigo'
        ? 'Para mandar o código fora da janela, aprove na Kapso um modelo da categoria Autenticação e informe o nome em Configurações → Integrações.'
        : 'Para avisar fora da janela, aprove um modelo de mensagem na Kapso e informe o nome em Configurações → Integrações.',
    }
  }
  const idioma = { code: IDIOMA_DO_MODELO }
  if (p.finalidade === 'codigo') {
    const codigo = String(p.codigo ?? '')
    if (!codigoNoFormato(codigo)) return { ok: false, falta: 'O código não veio para o modelo de Autenticação.' }
    const parametros: ParametroDeTexto[] = [{ type: 'text', text: codigo }]
    return { ok: true, modelo: { name: nome, language: idioma, components: [{ type: 'body', parameters: parametros }, { type: 'button', sub_type: 'url', index: '0', parameters: parametros }] } }
  }
  return { ok: true, modelo: { name: nome, language: idioma, components: [{ type: 'body', parameters: [{ type: 'text', text: textoParaModelo(p.texto) }] }] } }
}

/**
 * Erro da Meta que é do modelo, não da conexão: 132000–132016 (modelo que não existe no idioma,
 * pausado, desativado, variáveis erradas) e 132068/132069 (fluxo do modelo bloqueado ou limitado).
 */
export const ehErroDeModelo = (codigo: number | null | undefined): boolean =>
  typeof codigo === 'number' && (codigo >= 132000 && codigo <= 132016 || codigo === 132068 || codigo === 132069)

/**
 * A recusa de um envio por modelo, legível; null se a recusa não é do modelo (chave, créditos,
 * volume, número). Quem chama trata como falha comum ("outro"): sem reenvio e sem alerta de queda,
 * porque quem arruma é a administração, na Kapso. A Kapso pode recusar antes de chegar à Meta, sem
 * o código: 400, 404 ou 422 que fala do modelo também conta (o 404 não vira "número não achado").
 * `doCatalogo`: o modelo é do catálogo por situação (modelos.ts), não do cofre — o nome não está em
 * Configurações → Integrações, e as variáveis são as do catálogo.
 */
export function problemaDoModelo(p: { nome: string; codigo: number | null; status: number; mensagem: string | null; doCatalogo?: boolean }): string | null {
  const nome = p.nome.slice(0, 80)
  const qual = `o modelo “${nome}”`
  const Qual = `O modelo “${nome}”`
  const catalogo = 'O texto e as variáveis dele estão no catálogo do Palácio (lib/whatsapp/modelos.ts) e precisam ser iguais aos aprovados na Meta.'
  if (ehErroDeModelo(p.codigo)) {
    const c = p.codigo as number
    const meta = ` (erro ${c} da Meta)`
    if (c === 132000) return `${Qual} espera outro número de variáveis${meta}. ${p.doCatalogo ? catalogo : 'O dos avisos e o de segurança têm uma variável só, no corpo; o de código é da categoria Autenticação, com o botão de copiar.'}`
    if (c === 132001) return `${Qual} não existe na Kapso em português (pt_BR) ou ainda não foi aprovado pela Meta${meta}. ${p.doCatalogo ? 'Confira no painel da Kapso.' : 'Confira o nome em Configurações → Integrações.'}`
    if (c === 132005) return `O texto ficou longo demais para ${qual}${meta}.`
    if (c === 132007) return `A Meta recusou o texto em ${qual} pelas regras de formatação${meta}.`
    if (c === 132012) return `As variáveis não estão no formato que ${qual} espera${meta}. ${p.doCatalogo ? catalogo : 'O de código precisa ser da categoria Autenticação, com o botão de copiar.'}`
    if (c === 132015) return `${Qual} foi pausado pela Meta por baixa qualidade${meta}. Veja no painel da Kapso; até lá, o que depende dele não sai fora da janela.`
    if (c === 132016) return `${Qual} foi desativado pela Meta${meta}. ${p.doCatalogo ? 'Até outro ser aprovado, vale o próximo da lista do catálogo.' : 'Aprove outro na Kapso e troque o nome em Configurações → Integrações.'}`
    if (c === 132068) return `O fluxo ligado a ${qual} está bloqueado na Meta${meta}.`
    if (c === 132069) return `O fluxo ligado a ${qual} está limitado pela Meta agora${meta}. Tente mais tarde.`
    return `A Meta recusou ${qual}${meta}. Confira o modelo no painel da Kapso.`
  }
  if ((p.status === 400 || p.status === 404 || p.status === 422) && /template|modelo/i.test(p.mensagem ?? '')) {
    return `A Kapso recusou ${qual}: ${String(p.mensagem).replace(/\s+/g, ' ').trim().slice(0, 160)}. ${p.doCatalogo ? 'Confira o modelo no painel da Kapso.' : 'Confira o nome em Configurações → Integrações e o modelo no painel da Kapso.'}`
  }
  return null
}

// ------------------------------------------------------------------ botões e listas (mensagens interativas)
//
// Dentro da janela de 24 h, a resposta do bot e o aviso da visita na portaria podem levar botões de
// resposta (até 3) ou uma lista (até 10 linhas). O id de cada botão ou linha é exatamente o texto que o
// comando digitado já aceita ("1", "confirmo", "cancelar", "status"…): o toque chega ao webhook como esse
// texto (lerMensagemDaKapso, com `toque`) e segue por lerPedido, lerDecisao, lerEscolha e cia., como se a
// pessoa tivesse digitado. O texto da mensagem vai inteiro no corpo e continua dizendo o que digitar:
// fora da janela, ou se a Meta recusar o formato, sai o mesmo texto sem os botões (e, fora da janela, o
// modelo da finalidade — kapso.ts, enviarTextoKapso).

/** Os limites da Cloud API para mensagens interativas (`id`: o nosso teto, bem abaixo do da Meta — são palavras de comando). */
export const LIMITES_DO_INTERATIVO = {
  corpo: 1024, botoes: 3, tituloDoBotao: 20, linhas: 10, tituloDaLinha: 24, descricaoDaLinha: 72, botaoDaLista: 20, tituloDaSecao: 24, id: 40,
} as const

export type BotaoDeResposta = { id: string; titulo: string }
export type LinhaDaLista = { id: string; titulo: string; descricao?: string | null }
export type SecaoDaLista = { titulo?: string | null; linhas: LinhaDaLista[] }

/**
 * Botões de resposta ou lista, no vocabulário do Palácio; objetoInterativo monta o objeto da Cloud API. `imagem`: o id
 * da mídia já enviada à Meta (kapso.ts, subirMidiaKapso) para o cabeçalho dos botões — a ficha da visita com a foto.
 */
export type Interativo =
  | { tipo: 'botoes'; botoes: BotaoDeResposta[]; imagem?: string | null }
  | { tipo: 'lista'; botao: string; secoes: SecaoDaLista[] }

type LinhaDaMeta = { id: string; title: string; description?: string }

/** O objeto `interactive` da Cloud API (POST /{phone_number_id}/messages com type "interactive"). */
export type ObjetoInterativo =
  | {
    type: 'button'; header?: { type: 'image'; image: { id: string } }; body: { text: string }
    action: { buttons: { type: 'reply'; reply: { id: string; title: string } }[] }
  }
  | { type: 'list'; body: { text: string }; action: { button: string; sections: { title?: string; rows: LinhaDaMeta[] }[] } }

/** Uma linha só, sem a formatação do WhatsApp (que não vale em botão nem em linha de lista), cortada com "…". */
function rotuloCurto(t: string | null | undefined, max: number): string {
  const linha = String(t ?? '').replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/[*_~`]/g, '').replace(/\s+/g, ' ').trim()
  return linha.length <= max ? linha : `${linha.slice(0, max - 1).trimEnd()}…`
}

/** O id do botão ou da linha: o comando como é digitado. Nunca é cortado (cortado, seria outro comando). */
const idDoToque = (id: string): string | null => {
  const t = String(id ?? '').trim()
  return t && t.length <= LIMITES_DO_INTERATIVO.id ? t : null
}

const repetidos = (lista: string[]) => new Set(lista).size < lista.length

/**
 * Os botões ou a lista prontos para a Cloud API, com os títulos, as descrições e o botão da lista cortados
 * no tamanho que a Meta aceita; null quando não dá para mandar sem perder algo — corpo vazio ou com mais de
 * 1024 caracteres, mais de 3 botões ou de 10 linhas, id vazio, longo ou repetido, título vazio ou repetido
 * entre os botões, mais de uma seção sem título, id da imagem do cabeçalho fora do formato. Aí sai só o
 * texto, que diz o que digitar.
 */
export function objetoInterativo(corpo: string, i: Interativo): ObjetoInterativo | null {
  const L = LIMITES_DO_INTERATIVO
  const texto = String(corpo ?? '').trim()
  if (!texto || texto.length > L.corpo) return null
  if (i.tipo === 'botoes') {
    if (!i.botoes.length || i.botoes.length > L.botoes) return null
    const botoes: { id: string; title: string }[] = []
    for (const b of i.botoes) {
      const id = idDoToque(b.id)
      const title = rotuloCurto(b.titulo, L.tituloDoBotao)
      if (!id || !title) return null
      botoes.push({ id, title })
    }
    if (repetidos(botoes.map((b) => b.id)) || repetidos(botoes.map((b) => b.title.toLowerCase()))) return null
    if (i.imagem && !/^[\w.-]{1,128}$/.test(i.imagem)) return null
    return {
      type: 'button', ...(i.imagem ? { header: { type: 'image' as const, image: { id: i.imagem } } } : {}),
      body: { text: texto }, action: { buttons: botoes.map((reply) => ({ type: 'reply', reply })) },
    }
  }
  const secoes = i.secoes.filter((s) => s.linhas.length)
  const total = secoes.reduce((n, s) => n + s.linhas.length, 0)
  const botao = rotuloCurto(i.botao, L.botaoDaLista)
  if (!total || total > L.linhas || !botao) return null
  const sections: { title?: string; rows: LinhaDaMeta[] }[] = []
  for (const s of secoes) {
    const title = rotuloCurto(s.titulo, L.tituloDaSecao)
    if (!title && secoes.length > 1) return null
    const rows: LinhaDaMeta[] = []
    for (const l of s.linhas) {
      const id = idDoToque(l.id)
      const titulo = rotuloCurto(l.titulo, L.tituloDaLinha)
      if (!id || !titulo) return null
      const description = rotuloCurto(l.descricao, L.descricaoDaLinha)
      rows.push({ id, title: titulo, ...(description ? { description } : {}) })
    }
    sections.push({ ...(title ? { title } : {}), rows })
  }
  if (repetidos(sections.flatMap((s) => s.rows.map((r) => r.id)))) return null
  return { type: 'list', body: { text: texto }, action: { button: botao, sections } }
}

/**
 * O interativo recusado cai no texto (o mesmo, sem os botões)? Sim quando a recusa pode ser do formato:
 * erro comum ("outro") ou de entrega ("numero" — a Meta dá "não entregue" a WhatsApp antigo demais para
 * botões, e o texto ainda pode chegar). Não fora da janela (o texto ficaria de fora igual: segue direto
 * para o modelo), quando a Kapso não confirmou a tempo (pode ter saído: seria mensagem repetida) nem
 * quando a conexão caiu (chave, número do Palácio, servidor, rede: o texto cairia igual).
 */
export function interativoCaiNoTexto(r: { ok: boolean; motivo?: MotivoDaFalha; foraDaJanela?: boolean; semResposta?: boolean }): boolean {
  if (r.ok || r.semResposta || r.foraDaJanela) return false
  const motivo = r.motivo ?? 'outro'
  return motivo === 'outro' || motivo === 'numero'
}

// ------------------------------------------------------------------ webhook

export type MensagemRecebida = {
  id: string | null
  numero: string | null
  texto: string
  nome: string | null
  /** O id da mensagem que a pessoa citou ao responder (o aviso, a pergunta do bot); null sem citação. */
  citada: string | null
  /**
   * Veio de um toque num botão ou numa linha de lista: `texto` é o id do botão (o comando como se digita),
   * e `citada`, a mensagem tocada (a Meta sempre manda junto).
   */
  toque: boolean
  /** Foto, vídeo, áudio ou documento que veio junto (o arquivo em si se baixa da Kapso, pelo id da mídia). */
  midia: MidiaRecebida | null
  /**
   * A transcrição do áudio, quando a Kapso a manda no payload v2 (message.kapso.transcript.text); null sem áudio ou
   * sem transcrição. Só o assistente a usa — e áudio nunca escreve sem um plano confirmado por escrito ou pelo botão
   * (lib/whatsapp/assistente/regras.ts, rotaDaMensagem).
   */
  transcricao: string | null
  /** Motivo para não responder; null = responder. */
  /** `sem_conteudo`: sem texto, mídia nem toque (reação com emoji, localização, contato…): não é conversa, não se responde. */
  ignorar: 'de_mim' | 'grupo' | 'sem_numero' | 'sem_conteudo' | null
  /**
   * A hora em que a pessoa enviou (ms), pelo `timestamp` da Meta (segundos). É ela que ordena o "confirmo" do
   * assistente e as correções (lib/whatsapp/assistente/regras.ts). null sem a hora, ou com uma hora fora de
   * [agora − 7 dias, agora + 5 min] (relógio errado do outro lado não passa por mensagem nova).
   */
  enviadaEm: number | null
}

export type EventoDoWebhook = {
  /** O evento da Kapso (cabeçalho X-Webhook-Event), como "whatsapp.message.received". */
  evento: string
  mensagens: MensagemRecebida[]
}

const objeto = (v: unknown): Record<string, unknown> | null => (v && typeof v === 'object' && !Array.isArray(v) ? v as Record<string, unknown> : null)
const texto = (v: unknown): string | null => (typeof v === 'string' && v.trim() ? v : null)

export type CategoriaDaMidia = 'foto' | 'video' | 'audio' | 'documento'
export type MidiaRecebida = {
  categoria: CategoriaDaMidia; mime: string; tamanho: number | null; nome: string | null
  /** O id da mídia na Meta: é por ele que se baixa. */
  arquivo?: string
  /** O endereço da mídia na própria Kapso (kapso.media_url): o caminho de reserva para baixar. */
  endereco?: string
}

/** Os tipos de mensagem da API oficial que têm arquivo, na categoria do Palácio (figurinha não conta). */
const MIDIAS_DA_META: [string, CategoriaDaMidia][] = [['image', 'foto'], ['video', 'video'], ['audio', 'audio'], ['document', 'documento']]

/** Quanto a hora de envio pode estar no passado (reentrega da Kapso, celular sem rede) e no futuro (relógio adiantado). */
export const ENVIADA_EM_PASSADO_MS = 7 * 86_400_000
export const ENVIADA_EM_FUTURO_MS = 5 * 60_000

/** O `timestamp` da Meta (segundos Unix, em texto ou número) em ms; null fora da faixa que faz sentido. */
export function lerEnviadaEm(valor: unknown, agora: number): number | null {
  const bruto = typeof valor === 'number' ? valor : typeof valor === 'string' && /^\d{9,11}$/.test(valor.trim()) ? Number(valor.trim()) : NaN
  if (!Number.isFinite(bruto) || bruto <= 0) return null
  const ms = Math.round(bruto * 1000)
  return ms >= agora - ENVIADA_EM_PASSADO_MS && ms <= agora + ENVIADA_EM_FUTURO_MS ? ms : null
}

/** Uma mensagem recebida no payload v2 da Kapso (`whatsapp.message.received`). */
function lerMensagemDaKapso(dado: unknown, idDoNumero: string | null, agora: number): MensagemRecebida | null {
  const d = objeto(dado)
  const m = objeto(d?.message)
  if (!d || !m) return null
  const conversa = objeto(d.conversation)
  const kapso = objeto(m.kapso)
  // Outro número do mesmo projeto apontado para cá por engano: não é conosco.
  const doNumero = texto(d.phone_number_id) ?? texto(conversa?.phone_number_id)
  if (idDoNumero && doNumero && doNumero !== idDoNumero) return null
  const tipo = texto(m.type) ?? ''
  const deMim = kapso?.direction === 'outbound'
  const remetente = texto(m.from) ?? texto(conversa?.phone_number)
  const numero = remetente ? numeroCanonico(`+${remetente.replace(/\D/g, '')}`) : null

  const interativo = objeto(m.interactive)
  const digitado = texto(objeto(m.text)?.body)
  // O toque num botão de resposta, numa linha de lista ou num botão de modelo traz o id (o comando), não o título.
  const doToque = texto(objeto(interativo?.button_reply)?.id) ?? texto(objeto(interativo?.list_reply)?.id)
    ?? texto(objeto(m.button)?.payload) ?? texto(objeto(m.button)?.text)
  const textoDireto = digitado ?? doToque

  let midia: MidiaRecebida | null = null
  let legenda: string | null = null
  let transcricao: string | null = null
  for (const [chave, categoria] of MIDIAS_DA_META) {
    if (tipo !== chave) continue
    const md = objeto(m[chave])
    const dadosDaKapso = objeto(kapso?.media_data)
    const mime = (texto(md?.mime_type) ?? texto(dadosDaKapso?.content_type) ?? '').split(';')[0].trim().toLowerCase().slice(0, 120)
    const real: CategoriaDaMidia = categoria === 'documento' && mime.startsWith('image/') ? 'foto' : categoria === 'documento' && mime.startsWith('video/') ? 'video' : categoria
    const tamanho = Number(dadosDaKapso?.byte_size ?? md?.file_size)
    const arquivo = texto(md?.id)?.slice(0, 128)
    const endereco = [texto(dadosDaKapso?.url), texto(kapso?.media_url)].find((u) => u?.startsWith('https://api.kapso.ai/'))?.slice(0, 2000)
    midia = {
      categoria: real, mime: mime || 'application/octet-stream', tamanho: Number.isFinite(tamanho) && tamanho > 0 ? tamanho : null,
      nome: (texto(md?.filename) ?? texto(dadosDaKapso?.filename))?.slice(0, 200) ?? null, ...(arquivo ? { arquivo } : {}), ...(endereco ? { endereco } : {}),
    }
    legenda = texto(md?.caption)
    // A Kapso transcreve o áudio e manda junto (message.kapso.transcript.text): só do áudio, numa linha, até 2.000 caracteres.
    if (real === 'audio') transcricao = texto(objeto(kapso?.transcript)?.text)?.replace(/\s+/g, ' ').trim().slice(0, 2000) || null
  }

  return {
    id: texto(m.id)?.slice(0, 128) ?? null,
    numero,
    texto: (textoDireto ?? legenda ?? '').slice(0, 4000),
    nome: texto(conversa?.contact_name)?.slice(0, 80) ?? null,
    citada: texto(objeto(m.context)?.id)?.slice(0, 128) ?? null,
    toque: !digitado && doToque !== null,
    midia,
    transcricao,
    ignorar: deMim ? 'de_mim' : !numero ? 'sem_numero' : !textoDireto && !legenda && !midia ? 'sem_conteudo' : null,
    enviadaEm: lerEnviadaEm(m.timestamp, agora),
  }
}

/**
 * Lê o corpo que a Kapso manda ao webhook (payload v2, avulso ou em lote).
 * O nome do evento vem no cabeçalho X-Webhook-Event. Nunca lança.
 * `agora`: a hora de referência para a hora de envio (lerEnviadaEm).
 */
export function lerEventoDaKapso(corpo: unknown, eventoDoCabecalho: string | null, idDoNumero: string | null, agora: number = Date.now()): EventoDoWebhook {
  const c = objeto(corpo) ?? {}
  const evento = String(eventoDoCabecalho ?? c.type ?? c.event ?? '').trim().toLowerCase()
  const itens = c.batch === true && Array.isArray(c.data) ? c.data : [c]
  const recebida = evento === 'whatsapp.message.received'
  return {
    evento,
    mensagens: recebida ? itens.map((i) => lerMensagemDaKapso(i, idDoNumero, agora)).filter((m): m is MensagemRecebida => m !== null) : [],
  }
}

// ------------------------------------------------------------------ bot

export type Comando =
  | 'menu' | 'avisos' | 'lidas' | 'parar' | 'voltar' | 'agenda' | 'chamados' | 'aprovacoes' | 'ajuda' | 'abrir_chamado'
  | 'atender_chamado' | 'portaria' | 'registrar_visita' | 'financeiro' | 'decidir_financeiro' | 'desativar_conta' | 'cadastrar_colaborador'
  | 'presenca' | 'frota' | 'saida_veiculo' | 'retorno_veiculo' | 'estoque' | 'funcoes' | ComandoDaAdministracao | 'desconhecido'

/** Os comandos de quem administra o espaço (lib/whatsapp/admin.ts). */
export type ComandoDaAdministracao = 'status' | 'fila'

/** Sem acento, minúsculo, só letras, números e um espaço entre as palavras: é a forma que os comandos comparam. */
export const normalizar = (t: string) => t.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim()

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

/**
 * Os da administração valem só como a mensagem inteira: "fila" ou "status" no meio de uma frase
 * ("a fila do chamado não anda") nunca roda nada. Nenhuma destas palavras é de outro comando.
 */
const DA_ADMINISTRACAO: Record<string, ComandoDaAdministracao> = {
  status: 'status', diagnostico: 'status', saude: 'status', 'status do whatsapp': 'status',
  fila: 'fila', 'fila agora': 'fila', 'enviar fila': 'fila',
}

/** O passeio por tudo o que o bot faz (textoDasFuncoes): só como a mensagem inteira, para não roubar frase de outro comando. */
const DAS_FUNCOES = new Set([
  'funcoes', 'funcao', 'o que voce faz', 'o que voce sabe fazer', 'o que voce pode fazer', 'o que o bot faz', 'o que o bot sabe fazer',
  'tour', 'conhecer', 'recursos', 'comandos', 'tudo que voce faz',
])

/**
 * A lista das visitas abertas do dia (lib/whatsapp/portaria.ts): só como a mensagem inteira, como os da
 * administração — "a portaria ligou" numa frase não roda nada. Quem não tem a portaria cai no menu.
 */
const DA_PORTARIA = new Set(['portaria', 'quem esta aqui', 'quem ta aqui', 'quem esta na filial', 'quem chegou', 'visitas', 'visitantes', 'visitas de hoje', 'visitantes de hoje'])

/** Registrar quem chegou: "visitante: João Silva", "registrar visita". O nome é opcional (o bot pergunta); "visitantes" é a lista. */
const REGISTRAR_VISITA = /^\s*(?:registrar\s+(?:a\s+|uma\s+)?(?:visita|visitante|entrada)|nova\s+visita|novo\s+visitante|visitante)(?![\p{L}\d])[\s:,.;\-–—]*/iu

/**
 * A lista das despesas e compras que esperam a decisão da pessoa (lib/whatsapp/financeiro.ts): só como a
 * mensagem inteira, como a portaria. Quem não decide no Financeiro nem em Compras cai no menu.
 */
const DA_FINANCEIRO = new Set([
  'financeiro', 'despesas', 'compras', 'pagamentos', 'despesas e compras', 'aprovar despesas', 'aprovar compras', 'decisoes do financeiro',
  'pendencias do financeiro', 'pendencias financeiras', 'aprovacoes do financeiro', 'aprovacoes financeiras', 'aprovacoes de compras',
])

/**
 * A chamada da ação de hoje (lib/whatsapp/presenca.ts): só como a mensagem inteira, como a portaria. Quem não
 * coordena as oportunidades do Voluntariado cai no menu.
 */
const DA_PRESENCA = new Set([
  'presenca', 'presencas', 'marcar presenca', 'marcar presencas', 'chamada', 'fazer chamada', 'fazer a chamada', 'lista de presenca',
  'presenca de hoje', 'presenca da acao', 'presenca na acao',
])

/** A frota agora (lib/whatsapp/frota.ts): só como a mensagem inteira. Quem não vê a Frota cai no menu. */
const DA_FROTA = new Set([
  'veiculos', 'veiculo', 'frota', 'carros', 'viaturas', 'ambulancias', 'veiculos disponiveis', 'carros disponiveis', 'frota disponivel', 'diario de bordo',
])

/** O saldo de um material (lib/whatsapp/estoque.ts): "estoque luva", "estoque: álcool 70", "estoque de máscaras". */
const SALDO_NO_ESTOQUE = /^\s*estoque(?![\p{L}\d])[\s:,.;\-–—]*(?:(?:d[aeo]s?)\s+)?/iu

/** "estoque luva" → "luva"; "estoque" sozinho → "" (o bot pergunta o material); o resto, null. */
export function lerEstoque(entrada: string): string | null {
  const m = SALDO_NO_ESTOQUE.exec(String(entrada ?? ''))
  return m ? entrada.slice(m[0].length).replace(/\s+/g, ' ').trim().slice(0, 80) : null
}

// O diário de bordo pelo WhatsApp (lib/whatsapp/frota.ts), só para quem opera a frota (`frota` em lerPedido): para
// os outros, "sair com…" continua pausando os avisos e "volta…" retomando, como sempre.
const SAIDA_DE_VEICULO = /^\s*(?:registrar\s+(?:a\s+)?sa[ií]da|sa[ií]da|sair\s+com)(?![\p{L}\d])[\s:,.;\-–—]*/iu
const RETORNO_DE_VEICULO = /^\s*(?:registrar\s+(?:o\s+|a\s+)?(?:retorno|volta)|retorno|volta|voltei\s+com|cheguei\s+com)(?![\p{L}\d])[\s:,.;\-–—]*/iu
const ARTIGO_DO_VEICULO = /^(?:d[oa]s?|de|com(?:\s+[oa]s?)?|[oa]s?)\s+/iu
/** Depois de "volta", só "do/da/com" dizem que é um veículo ("volta a receber" é retomar os avisos). */
const LIGACAO_DA_VOLTA = /^(?:d[oa]s?|com(?:\s+[oa]s?)?)\s+/iu
const PARECE_PLACA = /^[a-z]{3}\s*-?\s*\d[a-z0-9]\d{2}$/iu

export type PedidoDeViagem = { acao: 'saida' | 'retorno'; veiculo: string }

/**
 * "saída ABC1D23", "saída da ambulância 1", "registrar saída", "sair com a van"; "retorno ABC1D23", "volta da
 * van", "voltei com a ambulância 1", "registrar retorno". O veículo é opcional (o bot pergunta), menos em "sair
 * com" e "voltei com", que sem ele não dizem nada; e "volta" só vale com "do/da/com" ou a placa ("volta a receber"
 * nunca é retorno). null para o resto.
 */
export function lerViagem(entrada: string): PedidoDeViagem | null {
  const t = String(entrada ?? '')
  const saida = SAIDA_DE_VEICULO.exec(t)
  const m = saida ?? RETORNO_DE_VEICULO.exec(t)
  if (!m) return null
  const verbo = normalizar(m[0])
  const bruto = t.slice(m[0].length).replace(/\s+/g, ' ').trim()
  const veiculo = bruto.replace(ARTIGO_DO_VEICULO, '').trim().slice(0, 80)
  if ((verbo === 'sair com' || verbo === 'voltei com' || verbo === 'cheguei com') && veiculo.length < 2) return null
  if (verbo === 'volta' && !((LIGACAO_DA_VOLTA.test(bruto) && veiculo.length >= 2) || PARECE_PLACA.test(veiculo))) return null
  return { acao: saida ? 'saida' : 'retorno', veiculo }
}

export type Pedido = { comando: Comando; resto: string }

/**
 * Com o assistente (lib/whatsapp/assistente), os comandos que ESCREVEM valem só pela frase exata: "cancelar o
 * plano" não pausa os avisos, "li, confirmo" não marca tudo como lido, "continuar" não retoma. O "2" e o "3" do
 * menu continuam (a rota do plano os intercepta logo depois de uma escolha).
 */
const EXATOS: Record<'parar' | 'lidas' | 'voltar', string[]> = {
  parar: ['parar', 'pare', 'sair', 'stop', 'quero sair', 'parar avisos', 'parar os avisos', 'descadastrar'],
  lidas: ['lidas', 'marcar como lidas', 'marcar todas como lidas'],
  voltar: ['voltar', 'ativar', 'reativar', 'voltar a receber'],
}

/** Com o assistente, o menu só sai quando TODAS as palavras são de saudação ou de menu: "oi aprova tudo" vai para ele. */
const SO_SAUDACAO = new Set([
  'oi', 'ola', 'oie', 'opa', 'bom', 'boa', 'dia', 'tarde', 'noite', 'tudo', 'bem', 'e', 'ai', 'blz', 'beleza', 'menu', 'inicio', 'opcoes', 'help', 'ajuda', '0',
])

/** Com o assistente, as consultas (só leitura) valem em até tantas palavras, com a palavra do comando entre elas. */
export const PALAVRAS_DA_CONSULTA = 3

/** O texto depois da palavra do comando, com acentos e maiúsculas originais. */
function depoisDe(entrada: string, prefixo: RegExp): string {
  return entrada.trim().replace(prefixo, '').replace(/^[\s:,.-]+/, '').trim().slice(0, 4000)
}

/**
 * O que a pessoa pediu, e o resto do texto quando o comando leva um
 * complemento ("ajuda como abrir um chamado", "chamado: impressora sem
 * toner"). O "3" do menu alterna: para quem recebe, é parar; para quem
 * pausou, é voltar. "status" e "fila" são só de quem administra o espaço
 * (`admin`); para o resto seguem o caminho de sempre e dão "desconhecido".
 * "desativar conta: …" e "colaborador: …" são só de quem gerencia usuários
 * (`usuarios`); para o resto, "desativar" continua pausando os avisos, como
 * sempre, e "colaborador" não é comando. "saída…" e
 * "retorno…" são só de quem opera a frota (`frota`); para o resto, "sair
 * com…" pausa e "volta…" retoma, como sempre.
 */
export function lerPedido(entrada: string, p: { pausado: boolean; admin?: boolean; usuarios?: boolean; frota?: boolean; assistente?: boolean }): Pedido {
  const t = normalizar(entrada)
  if (!t) return { comando: 'desconhecido', resto: '' }
  if (t === '3') return { comando: p.pausado ? 'voltar' : 'parar', resto: '' }
  if (p.admin && DA_ADMINISTRACAO[t]) return { comando: DA_ADMINISTRACAO[t], resto: '' }
  if (DAS_FUNCOES.has(t)) return { comando: 'funcoes', resto: '' }
  const palavras = t.split(' ')
  // Comandos com complemento vêm antes: "ajuda como paro os avisos" é dúvida, não "avisos".
  if ((palavras[0] === 'ajuda' || palavras[0] === 'duvida') && palavras.length > 1) return { comando: 'ajuda', resto: depoisDe(entrada, /^\s*(ajuda|d[uú]vida)\b/i) }
  // Com o assistente, "como está meu chamado?" e "como troco a senha?" vão para ele (que busca na ajuda).
  if (palavras[0] === 'como' && palavras.length > 2 && !p.assistente) return { comando: 'ajuda', resto: entrada.trim().slice(0, 1000) }
  // Quem atende: "assumir TI-0042", "resolver TI-0042: …", "transferir TI-0042 para …". Sem o código, não é comando
  // (respondendo ao aviso do chamado, o código vem do aviso: lib/whatsapp/atendimento.ts).
  if (lerAtendimento(entrada)?.codigo) return { comando: 'atender_chamado', resto: entrada.trim().slice(0, 4000) }
  if (DA_PORTARIA.has(t)) return { comando: 'portaria', resto: '' }
  // As decisões do Financeiro e de Compras: a lista, e "aprovar 2" / "recusar 2: motivo" sobre ela.
  if (DA_FINANCEIRO.has(t)) return { comando: 'financeiro', resto: '' }
  if (lerDecisaoFinanceira(entrada)) return { comando: 'decidir_financeiro', resto: entrada.trim().slice(0, 2000) }
  if (p.usuarios) {
    const nome = lerDesativarConta(entrada)
    if (nome !== null) return { comando: 'desativar_conta', resto: nome }
    // O cadastro de colaborador: o nome é opcional (o bot pergunta), e a conta só nasce confirmada no Palácio.
    const colaborador = lerColaborador(entrada)
    if (colaborador !== null) return { comando: 'cadastrar_colaborador', resto: colaborador }
  }
  // As outras áreas: a chamada da ação de hoje, a frota, o diário de bordo (só de quem opera) e o saldo do estoque.
  if (DA_PRESENCA.has(t)) return { comando: 'presenca', resto: '' }
  if (DA_FROTA.has(t)) return { comando: 'frota', resto: '' }
  if (p.frota) {
    const viagem = lerViagem(entrada)
    if (viagem) return { comando: viagem.acao === 'saida' ? 'saida_veiculo' : 'retorno_veiculo', resto: viagem.veiculo }
  }
  const material = lerEstoque(entrada)
  if (material !== null) return { comando: 'estoque', resto: material }
  const visita = REGISTRAR_VISITA.exec(entrada)
  if (visita) return { comando: 'registrar_visita', resto: entrada.slice(visita[0].length).replace(/\s+/g, ' ').trim().slice(0, 120) }
  const abrir = /^\s*(abrir\s+(um\s+)?chamado|novo\s+chamado|chamado)\b/i
  // Com o assistente, "chamado" no começo só abre com os dois-pontos ("chamado: impressora sem toner"): "chamado da
  // impressora, como está?" é pergunta para ele.
  const chamadoNoComeco = palavras[0] === 'chamado' && (!p.assistente || /^\s*chamado\s*:/i.test(entrada))
  if ((chamadoNoComeco || (palavras[0] === 'abrir' && palavras.includes('chamado')) || (palavras[0] === 'novo' && palavras[1] === 'chamado')) && depoisDe(entrada, abrir).length >= 8) {
    return { comando: 'abrir_chamado', resto: depoisDe(entrada, abrir) }
  }
  if (p.assistente) return lerComAssistente(t, palavras)
  // "marcar como lidas", "ver avisos": vale a palavra que decide, não a primeira.
  for (const comando of ['parar', 'voltar', 'lidas', 'avisos', 'agenda', 'chamados', 'aprovacoes'] as const) {
    if (palavras.some((w) => PALAVRAS[comando].includes(w) && (w.length > 1 || palavras.length === 1))) return { comando, resto: '' }
  }
  if (PALAVRAS.menu.includes(palavras[0])) return { comando: 'menu', resto: '' }
  return { comando: 'desconhecido', resto: '' }
}

/**
 * O resto de lerPedido com o assistente ligado para a pessoa: os que escrevem (parar, lidas, voltar) só pela frase
 * exata (EXATOS) ou pelo número do menu; as consultas em até PALAVRAS_DA_CONSULTA palavras; o menu só com saudação
 * pura. O que sobra é "desconhecido": vai para o assistente.
 */
function lerComAssistente(t: string, palavras: string[]): Pedido {
  if (t === '2') return { comando: 'lidas', resto: '' }
  for (const comando of ['parar', 'voltar', 'lidas'] as const) {
    if (EXATOS[comando].includes(t)) return { comando, resto: '' }
  }
  if (palavras.length <= PALAVRAS_DA_CONSULTA) {
    for (const comando of ['avisos', 'agenda', 'chamados', 'aprovacoes'] as const) {
      if (palavras.some((w) => PALAVRAS[comando].includes(w) && (w.length > 1 || palavras.length === 1))) return { comando, resto: '' }
    }
  }
  if (palavras.every((w) => SO_SAUDACAO.has(w))) return { comando: 'menu', resto: '' }
  return { comando: 'desconhecido', resto: '' }
}

export const interpretarComando = (entrada: string, p: { pausado: boolean; admin?: boolean; usuarios?: boolean; frota?: boolean; assistente?: boolean }): Comando => lerPedido(entrada, p).comando

/**
 * Os comandos das áreas que são nome de setor ou de lugar ("Financeiro", "Portaria", "Chamada", "Veículos",
 * "Estoque central"): com uma pergunta de texto livre aberta ("Onde é?" do chamado, o motivo da visita, o destino
 * da viagem), a mensagem sem citar é a resposta a ela, não o comando (lib/whatsapp/bot.ts). "cancelar" desiste.
 */
export const COMANDOS_DE_AREA: ReadonlySet<Comando> = new Set<Comando>([
  'portaria', 'registrar_visita', 'financeiro', 'presenca', 'frota', 'saida_veiculo', 'retorno_veiculo', 'estoque',
])

/** A mensagem pode ser do diário de bordo? Só então o bot lê o nível da pessoa na Frota (lib/whatsapp/frota.ts). */
export const pareceViagem = (entrada: string): boolean => lerViagem(entrada) !== null

/** Respostas do bot a cada ~10 min por número, no máximo: um robô do outro lado não vira enxurrada. */
export const RESPOSTAS_POR_JANELA = 10
export const JANELA_DAS_RESPOSTAS_MIN = 10
/** Número que não é de ninguém da equipe recebe a apresentação no máximo uma vez neste intervalo. */
export const APRESENTACAO_A_CADA_HORAS = 24

/**
 * Uma opção do menu da equipe: o mesmo `id` (o que se digita) no texto (*1* – …) e na lista — menos o 3, que na
 * lista vai como a palavra do rótulo, "parar" ou "voltar" (interativoDoMenu).
 */
type OpcaoDoMenu = { id: string; titulo: string; texto: string }

/** `atende`: quem atende uma fila de chamados vê no 5 também os chamados da fila (lib/whatsapp/atendimento.ts). */
function opcoesDoMenu(pausado: boolean, atende = false): OpcaoDoMenu[] {
  return [
    { id: '1', titulo: 'Avisos sem abrir', texto: 'os avisos que você ainda não abriu' },
    { id: '2', titulo: 'Marcar como lidos', texto: 'marcar todos os avisos como lidos' },
    pausado
      ? { id: '3', titulo: 'Voltar a receber', texto: 'voltar a receber os avisos por aqui' }
      : { id: '3', titulo: 'Parar os avisos', texto: 'parar de receber os avisos por aqui' },
    { id: '4', titulo: 'Agenda', texto: 'sua agenda de hoje e amanhã' },
    { id: '5', titulo: 'Meus chamados', texto: atende ? 'seus chamados e os da fila que você atende' : 'seus chamados abertos' },
    { id: '6', titulo: 'Aprovações', texto: 'o que espera o seu voto' },
  ]
}

/** Os comandos de quem administra o espaço, como a mensagem inteira (DA_ADMINISTRACAO). */
const OPCOES_DA_ADMINISTRACAO: OpcaoDoMenu[] = [
  { id: 'status', titulo: 'Status do WhatsApp', texto: 'a saúde do WhatsApp do Palácio e das integrações' },
  { id: 'fila', titulo: 'Fazer a fila andar', texto: 'fazer a fila do WhatsApp andar agora' },
]

/** A lista das visitas de hoje, na lista do menu de quem tem a portaria (no texto, é a linha do "Ou escreva"). */
const OPCAO_DA_PORTARIA: OpcaoDoMenu = { id: 'portaria', titulo: 'Visitas de hoje', texto: 'quem está na portaria hoje' }

/** As despesas e compras esperando a decisão, na lista do menu de quem decide (no texto, é a linha do "Ou escreva"). */
const OPCAO_DO_FINANCEIRO: OpcaoDoMenu = { id: 'financeiro', titulo: 'Despesas e compras', texto: 'o que espera a sua decisão no Financeiro' }

/** A chamada da ação de hoje, na lista do menu de quem coordena as oportunidades (se couber nas 10 linhas). */
const OPCAO_DA_PRESENCA: OpcaoDoMenu = { id: 'presenca', titulo: 'Presença da ação', texto: 'marcar quem veio na ação de hoje' }

/** A frota agora, na lista do menu de quem vê a Frota (se couber nas 10 linhas). */
const OPCAO_DA_FROTA: OpcaoDoMenu = { id: 'veiculos', titulo: 'Veículos', texto: 'a frota agora: disponíveis e em viagem' }

/** O começo do menu que responde ao que o bot não entendeu. */
/** O que o bot diz quando não entende uma mensagem: direto, sem despejar o menu (o menu sai quando a pessoa pede: "menu", "oi"). */
export const TEXTO_NAO_ENTENDI_CURTO = 'Não entendi. Escreva *ajuda* e a sua dúvida (ex.: _ajuda como trocar a senha_), ou *menu* para ver as opções.'

const PALAVRAS_DE_CORTESIA = new Set(['ok', 'okay', 'obrigado', 'obrigada', 'obg', 'brigado', 'brigada', 'valeu', 'vlw', 'blz', 'beleza', 'certo', 'entendi', 'entendido', 'perfeito', 'show', 'top', 'legal', 'otimo', 'combinado', 'fechado', 'tranquilo', 'muito', 'de', 'nada', 'tmj', 'amem', 'gracas', 'deus', 'abencoe', 'viu', 'demais', 'tudo', 'bem', 'ta', 'sim', 'isso', 'recebi', 'vi'])

/**
 * Agradecimento, "ok", emoji solto: não é pergunta, e responder a isso com um menu só confunde. O bot fica quieto.
 * Só vale para mensagem curta (até 4 palavras), sem "?", feita só de palavras de cortesia — ou só de símbolos/emoji.
 */
export function ehCortesia(texto: string): boolean {
  if (texto.includes('?')) return false
  const palavras = normalizar(texto).split(' ').filter(Boolean)
  if (!palavras.length) return true
  return palavras.length <= 4 && palavras.every((p) => PALAVRAS_DE_CORTESIA.has(p))
}

export const TEXTO_NAO_ENTENDI = '_Não entendi. Este número responde só às opções abaixo; mensagens soltas não chegam a ninguém._'

const linhaDoMenu = (o: OpcaoDoMenu) => `*${o.id}* – ${o.texto}`

/**
 * O que muda o menu de cada pessoa: quem administra (status e fila), quem tem a portaria, quem atende chamados,
 * quem decide despesas ou compras (`financeiro`: a mesma permissão das telas, lib/whatsapp/financeiro.ts), quem
 * coordena as oportunidades do Voluntariado (`presenca`), quem vê ou opera a Frota (`frota`) e quem vê o
 * Estoque (`estoque`) — cada um com a permissão da tela da área — e quem gerencia usuários (`usuarios`).
 */
export type QuemNoMenu = {
  admin?: boolean; portaria?: boolean; atende?: boolean; financeiro?: boolean; presenca?: boolean; frota?: 'ver' | 'operar' | null; estoque?: boolean
  /** Quem gerencia usuários ("usuarios.gerenciar"): o "colaborador:" (lib/whatsapp/colaborador.ts). */
  usuarios?: boolean
}

/** As linhas das áreas no "Ou escreva", uma por área (a forma longa). */
function linhasDasAreas(p: QuemNoMenu): string[] {
  return [
    p.portaria ? '*portaria* para as visitas de hoje e registrar quem chegou' : null,
    p.financeiro ? '*financeiro* para decidir despesas e compras' : null,
    p.presenca ? '*presença* para marcar quem veio na ação de hoje' : null,
    p.frota === 'operar' ? '*veículos* para a frota; *saída* e *retorno* para o diário de bordo' : p.frota === 'ver' ? '*veículos* para ver a frota' : null,
    p.estoque ? '*estoque* e o material, para o saldo (ex.: _estoque luva_)' : null,
  ].filter((l): l is string => Boolean(l))
}

/** As mesmas áreas numa linha só (a forma curta, quando a longa não cabe no corpo da lista). */
function linhaCurtaDasAreas(p: QuemNoMenu): string | null {
  const palavras = [
    p.portaria ? '*portaria*' : null, p.financeiro ? '*financeiro*' : null, p.presenca ? '*presença*' : null,
    p.frota ? '*veículos*' : null, p.frota === 'operar' ? '*saída*' : null, p.frota === 'operar' ? '*retorno*' : null,
  ].filter((x): x is string => Boolean(x))
  const lista = palavras.length > 1 ? `${palavras.slice(0, -1).join(', ')} ou ${palavras[palavras.length - 1]}` : palavras[0] ?? ''
  if (!lista && !p.estoque) return null
  return `Das suas áreas: ${[lista, p.estoque ? '*estoque* e o material' : null].filter(Boolean).join('; ')}.`
}

/**
 * `admin`: quem administra o espaço vê também a linha dos comandos dele (status e fila). `portaria`,
 * `financeiro`, `presenca`, `frota` e `estoque`: a linha de cada área no "Ou escreva". `atende`: o 5 diz que
 * traz também a fila. `naoEntendi`: começa com TEXTO_NAO_ENTENDI. O menu cabe sempre no corpo de 1024 da
 * lista: com áreas demais (quem administra tem todas), elas vão numa linha só.
 */
/** A linha do menu de quem tem o assistente ligado (lib/whatsapp/assistente): escrever do jeito da pessoa. */
export const LINHA_DO_ASSISTENTE = 'Ou escreva do seu jeito, ex.: _o que tenho pra aprovar?_, _avisa a Ana que…_'

/** A linha de quem gerencia usuários no menu: o cadastro pede texto (o nome), então fica só no corpo, não na lista. */
export const LINHA_DO_CADASTRO = '*colaborador:* e o nome, para cadastrar alguém (a conta nasce confirmada no Palácio)'

/** A porta de entrada do passeio, na última linha antes do sino: quem acabou de chegar descobre o resto sozinho. */
export const LINHA_DAS_FUNCOES = 'Quer conhecer tudo o que eu faço? Escreva *funções*.'

/**
 * O passeio por tudo o que o bot faz ("funções"): as mesmas opções do menu, agrupadas e explicadas, e só as áreas que a
 * pessoa tem. Cabe numa mensagem de texto só (o teto é 4096; o de quem tem tudo fica bem abaixo disso).
 */
export function textoDasFuncoes(p: { assistente?: boolean } & QuemNoMenu): string {
  const areas = linhasDasAreas(p)
  return [
    '*O que eu faço por aqui*',
    ['*Avisos do Palácio*', '*1* – ver os avisos que você ainda não abriu', '*2* – marcar todos como lidos',
      '*3* – parar de receber os avisos por aqui (e *voltar* quando quiser)', 'Para responder um aviso, responda a própria mensagem dele.'].join('\n'),
    ['*Seu dia*', '*4* – sua agenda de hoje e amanhã', '*6* – o que espera o seu voto'].join('\n'),
    ['*Chamados*', `*5* – ${p.atende ? 'seus chamados e os da fila que você atende' : 'seus chamados abertos'}`, '*chamado:* e o problema – abre um chamado novo'].join('\n'),
    ['*Dúvidas*', '*ajuda* e a sua dúvida – ex.: _ajuda como trocar a senha_'].join('\n'),
    areas.length ? ['*Das suas áreas*', ...areas].join('\n') : null,
    p.assistente ? ['*Do seu jeito*', LINHA_DO_ASSISTENTE.replace(/^Ou escreva/, 'Escreva')].join('\n') : null,
    p.admin || p.usuarios ? ['*Da administração*', ...(p.admin ? OPCOES_DA_ADMINISTRACAO.map(linhaDoMenu) : []), ...(p.usuarios ? [LINHA_DO_CADASTRO] : [])].join('\n') : null,
    'Escreva *menu* para ver as opções de novo.',
  ].filter(Boolean).join('\n\n')
}

export function textoDoMenu(p: { nome: string | null; pausado: boolean; urlBase: string; naoEntendi?: boolean; assistente?: boolean } & QuemNoMenu): string {
  const ola = p.nome ? `Olá, ${primeiroNome(p.nome)}!` : 'Olá!'
  const montar = (areas: string[]) => [
    p.naoEntendi ? TEXTO_NAO_ENTENDI : null,
    `${ola} Aqui é o WhatsApp do *Palácio Virtual*, da Cruz Vermelha Brasileira – RJ.`,
    p.pausado ? '_Os avisos por aqui estão pausados._' : null,
    ['Responda com o número:', ...opcoesDoMenu(p.pausado, p.atende).map(linhaDoMenu)].join('\n'),
    ['Ou escreva:', '*chamado:* e o problema, para abrir um chamado', '*ajuda* e a sua dúvida (ex.: _ajuda como trocar a senha_)',
      ...areas].join('\n'),
    p.assistente ? LINHA_DO_ASSISTENTE : null,
    p.admin || p.usuarios ? ['Da administração:', ...(p.admin ? OPCOES_DA_ADMINISTRACAO.map(linhaDoMenu) : []), ...(p.usuarios ? [LINHA_DO_CADASTRO] : [])].join('\n') : null,
    LINHA_DAS_FUNCOES,
    `Tudo continua no sino do Palácio Virtual: ${p.urlBase}/notificacoes`,
  ].filter(Boolean).join('\n\n')
  const longo = montar(linhasDasAreas(p))
  if (longo.length <= LIMITES_DO_INTERATIVO.corpo) return longo
  const curta = linhaCurtaDasAreas(p)
  return curta ? montar([curta]) : longo
}

/**
 * O menu como lista (dentro da janela): as opções 1 a 6, "portaria" para quem tem a portaria, "financeiro" para
 * quem decide despesas ou compras, "presenca" para quem coordena as oportunidades, "veiculos" para quem vê a
 * Frota e, para quem administra, "status" e "fila" — no máximo 10 linhas, o teto da Meta: as áreas entram nessa
 * ordem enquanto cabem (as que sobram ficam no corpo, que diz o que digitar). Cada linha leva o que se digita,
 * então o toque segue por lerPedido como o número digitado. Só a linha do 3 leva a palavra do rótulo ("parar" ou
 * "voltar"), não o "3", que alterna pelo estado da hora: o rótulo fica congelado no envio, e o toque numa lista
 * antiga nunca faz o contrário do que a linha diz (repetido, não muda nada). "chamado:", "ajuda", "visitante:",
 * "saída", "retorno" e "estoque" pedem texto: ficam só no corpo.
 */
export function interativoDoMenu(p: { pausado: boolean } & QuemNoMenu): Interativo {
  const linha = (o: OpcaoDoMenu): LinhaDaLista => ({ id: o.id, titulo: o.titulo, descricao: `${o.texto.charAt(0).toUpperCase()}${o.texto.slice(1)}` })
  const daAdministracao = p.admin ? OPCOES_DA_ADMINISTRACAO : []
  const opcoes = opcoesDoMenu(p.pausado, p.atende).map((o) => (o.id === '3' ? { ...o, id: p.pausado ? 'voltar' : 'parar' } : o))
  const areas = [
    ...(p.portaria ? [OPCAO_DA_PORTARIA] : []), ...(p.financeiro ? [OPCAO_DO_FINANCEIRO] : []),
    ...(p.presenca ? [OPCAO_DA_PRESENCA] : []), ...(p.frota ? [OPCAO_DA_FROTA] : []),
  ].slice(0, Math.max(0, LIMITES_DO_INTERATIVO.linhas - opcoes.length - daAdministracao.length))
  return {
    tipo: 'lista',
    botao: 'Ver as opções',
    secoes: [
      { titulo: 'Opções', linhas: [...opcoes, ...areas].map(linha) },
      ...(daAdministracao.length ? [{ titulo: 'Da administração', linhas: daAdministracao.map(linha) }] : []),
    ],
  }
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
  'Só os avisos de segurança da sua conta (senha trocada, acesso novo, número trocado) continuam chegando por aqui.',
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
/** Os da fila que a pessoa atende, depois dos dela (o 5 de quem atende). */
export const CHAMADOS_DA_FILA_NA_RESPOSTA = 5

/** Como quem atende age pelo WhatsApp: o comando com o código (lerAtendimento). */
export const DICA_DO_ATENDIMENTO =
  'Nos chamados da sua fila, escreva *assumir*, *resolver* ou *transferir* e o código: _assumir TI-0042_, _resolver TI-0042: troquei o toner_, _transferir TI-0042 para Manutenção_.'

/**
 * O 5: os chamados abertos que a pessoa abriu ou que estão com ela e, para quem atende uma fila
 * (`daFila`), os abertos da fila que não estão com ela — sem responsável primeiro.
 */
export function textoDosChamados(p: {
  chamados: ChamadoNaLista[]; total: number; urlBase: string
  /** `falhou`: a fila não carregou (não é "em dia"). */
  daFila?: { chamados: ChamadoNaLista[]; total: number; falhou?: boolean } | null
}): string {
  const linha = (c: ChamadoNaLista) => `*${limpo(c.codigo, 20)}* · ${limpo(c.titulo, 120)}\n_${limpo(c.situacao, 60)}_ · ${p.urlBase}/chamados/${c.id}`
  const fila = p.daFila
  const temFila = Boolean(fila?.total && fila.chamados.length)
  if ((!p.total || !p.chamados.length) && !temFila && !fila?.falhou) {
    return fila
      ? 'Você não tem chamados abertos, e a fila que você atende está em dia. Para abrir um, escreva *chamado:* e o problema.'
      : 'Você não tem chamados abertos. Para abrir um, escreva *chamado:* e o problema.'
  }
  const partes: string[] = []
  if (p.total && p.chamados.length) {
    const itens = p.chamados.slice(0, CHAMADOS_NA_RESPOSTA).map(linha)
    partes.push(p.total === 1 ? 'Você tem *1 chamado* aberto:' : `Você tem *${p.total} chamados* abertos${p.total > itens.length ? `. Os ${itens.length} mais recentes` : ''}:`, ...itens)
  } else {
    partes.push('Você não tem chamados abertos.')
  }
  if (fila && temFila) {
    const itens = fila.chamados.slice(0, CHAMADOS_DA_FILA_NA_RESPOSTA).map(linha)
    partes.push(fila.total === 1 ? '*Na fila que você atende*, 1 chamado aberto:' : `*Na fila que você atende*, ${fila.total} abertos${fila.total > itens.length ? `. Os ${itens.length} primeiros` : ''}:`, ...itens)
  } else if (fila?.falhou) {
    partes.push(`_A fila que você atende não carregou agora: veja em ${p.urlBase}/chamados_`)
  }
  partes.push('Para responder, use o link ou responda a mensagem do aviso do chamado.')
  if (fila) partes.push(DICA_DO_ATENDIMENTO)
  return partes.join('\n\n')
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

/**
 * O resultado de uma ação feita em nome de quem escreveu (votar, responder à portaria, mandar no Chat, mandar uma
 * mensagem direta): quem chama decide por `ok`, não pelo texto — o plano do assistente para no primeiro `ok: false`
 * (lib/whatsapp/assistente). `texto`: a frase para a pessoa, escrita pelo código. `codigo`: por que não deu —
 * já votou, rodada encerrada, matéria mudou, sem permissão, função ausente (migração não aplicada), limite ou erro.
 */
export type ResultadoDaAcao =
  | { ok: true; codigo: 'feito'; texto: string; link?: string }
  | { ok: false; codigo: 'ja_votou' | 'encerrada' | 'mudou' | 'sem_permissao' | 'indisponivel' | 'limite' | 'erro'; texto: string }

/** O que um aviso aponta, pelo link dele: é para lá que vai a resposta que cita o aviso. */
export type AlvoDoAviso =
  | { tipo: 'chamado'; id: string }
  | { tipo: 'chat'; canalId: string; fio: string | null }
  | { tipo: 'aprovacao'; id: string }
  | { tipo: 'mensagem'; pessoaId: string }
  | { tipo: 'visita'; id: string }
  /** O pedido de assinatura (e os outros avisos de um ofício): a resposta não assina nada, só diz onde. */
  | { tipo: 'oficio'; id: string }

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
  if (partes.length === 3 && partes[0] === 'portaria' && partes[1] === 'visita' && ehId(partes[2])) return { tipo: 'visita', id: partes[2] }
  if (partes.length === 2 && partes[0] === 'oficios' && ehId(partes[1])) return { tipo: 'oficio', id: partes[1] }
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

// A pergunta dos detalhes do chamado é opcional: isto pula. "não" está aqui (e não cancela)
// porque a pergunta foi "quer detalhar?"; "cancelar" continua desistindo do chamado.
const PULA = ['pular', 'pula', 'pulo', 'nao', 'n', 'sem', 'nada', 'nenhum', 'nenhuma', 'so isso', 'e isso', 'e so isso', 'so', 'pronto', 'ok',
  'abrir', 'abre', 'pode abrir', 'seguir', 'continuar', 'nao precisa', 'sem detalhes']
export const ehPular = (entrada: string) => PULA.includes(normalizar(entrada))

/** A última pergunta de abrir chamado: o relato de "chamado: wifi da sala 2" costuma ser curto demais para quem atende. */
export function textoPedeDetalhes(): string {
  return [
    'Quer detalhar o que está acontecendo? Escreva aqui: desde quando, o que já tentou, o que precisa.',
    `Ou responda *pular* para abrir o chamado só com o que você já disse. Vale por ${PENDENCIA_VALE_MIN} minutos.`,
  ].join('\n\n')
}

/** Os botões da pergunta dos detalhes: "pular" (ehPular) abre só com o relato; "cancelar" desiste do chamado. */
export const BOTOES_DOS_DETALHES: Interativo = { tipo: 'botoes', botoes: [{ id: 'pular', titulo: 'Pular' }, { id: 'cancelar', titulo: 'Cancelar' }] }

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

/** Os botões da conferência antes do voto: tocar é responder a conferência com a palavra (ehConfirmacao, ehCancelamento). */
export const BOTOES_DA_CONFERENCIA: Interativo = { tipo: 'botoes', botoes: [{ id: 'confirmo', titulo: 'Confirmo' }, { id: 'cancelar', titulo: 'Cancelar' }] }

export type Opcao = { nome: string; detalhe?: string | null }

/** Uma lista numerada para a pessoa escolher respondendo o número. */
export function textoDaEscolha(p: { pergunta: string; opcoes: Opcao[]; rodape?: string | null }): string {
  const linhas = p.opcoes.map((o, i) => `*${i + 1}* – ${limpo(o.nome, 80)}${o.detalhe ? ` _(${limpo(o.detalhe, 80)})_` : ''}`)
  return [p.pergunta, linhas.join('\n'), p.rodape ?? `Responda com o número, ou *cancelar*. Vale por ${PENDENCIA_VALE_MIN} minutos.`].join('\n\n')
}

/**
 * A escolha numerada (textoDaEscolha) como lista: cada linha leva o número ("1", "2"…, o que lerEscolha
 * lê), o nome e o detalhe. `cancelar`: a descrição da linha "Cancelar" no fim, se couber. null com mais
 * opções do que cabem numa lista (vale o texto).
 */
export function interativoDaEscolha(opcoes: Opcao[], p: { botao?: string; cancelar?: string | null } = {}): Interativo | null {
  if (!opcoes.length || opcoes.length > LIMITES_DO_INTERATIVO.linhas) return null
  const linhas: LinhaDaLista[] = opcoes.map((o, i) => ({ id: String(i + 1), titulo: o.nome, descricao: o.detalhe ?? null }))
  if (p.cancelar && linhas.length < LIMITES_DO_INTERATIVO.linhas) linhas.push({ id: 'cancelar', titulo: 'Cancelar', descricao: p.cancelar })
  return { tipo: 'lista', botao: p.botao ?? 'Escolher', secoes: [{ linhas }] }
}

/** Título do chamado a partir do relato: a primeira frase, até 140 letras. */
export function tituloDoRelato(relato: string): string {
  const primeira = relato.trim().split(/\n|(?<=[.!?])\s/)[0] ?? ''
  const base = (primeira.length >= 3 ? primeira : relato).replace(/\s+/g, ' ').trim()
  return base.length <= 140 ? base.replace(/[.!?]+$/, '') : `${base.slice(0, 137).trimEnd()}…`
}

export const TEXTO_SEM_ACAO_PELO_WHATSAPP =
  'Sua conta usa a verificação em duas etapas, então responder, atender chamados, registrar visitas, marcar presença, registrar saída e retorno de veículo e mandar fotos ficam só no Palácio (o WhatsApp não pede o código do app). O voto e as decisões do Financeiro saem por aqui com um link para confirmar no Palácio. As consultas, a abertura de chamado e a resposta à portaria (1, 2 ou 3) por aqui continuam valendo.'

// ------------------------------------------------------------------ quem atende chamado (assumir, resolver, transferir)
//
// Quem atende uma fila age no chamado pelo WhatsApp com as mesmas funções da tela (lib/chamados/nucleo.ts):
// pelo comando com o código ("resolver TI-0042: troquei o toner") ou respondendo ao aviso do chamado (aí o
// código vem do aviso: "resolvido: troquei o toner"). Resolver e transferir terminam na conferência
// ("confirmo"), como o voto; assumir vai direto.

export type AcaoNoChamado = 'assumir' | 'resolver' | 'transferir'

export type PedidoDeAtendimento = {
  acao: AcaoNoChamado
  /** O código escrito logo depois do verbo, no formato do Palácio ("TI-0042"); null sem código. */
  codigo: string | null
  /** O que vem depois do código (a solução; a fila e o motivo da transferência). */
  texto: string
  /** O que vem depois do verbo, com o que parecia código junto: respondendo ao aviso, "resolvido: rede-2 trocada" não cita chamado nenhum. */
  resto: string
}

const VERBO_DO_ATENDIMENTO = /^\s*(assumir|assumo|atender|atendo|resolver|resolvido|resolvida|transferir|transfira|transfere)(?![\p{L}\d])[\s:,.;\-–—]*(?:(?:o\s+)?chamado(?![\p{L}\d])[\s:,.;\-–—]*)?/iu
const CODIGO_NO_COMECO = /^([a-z]{2,6})\s*-\s*(\d{1,7})(?![\p{L}\d])/iu
/** Os separadores e a pontuação solta no começo ("resolvido: …", "assumo!"). */
const semComeco = (t: string) => t.replace(/^[\s:,.;!\-–—]+/, '').trim()

/**
 * "assumir TI-0042", "resolver TI-0042: troquei o toner", "transferir o chamado ti-42 para Manutenção: …".
 * O verbo vem no começo; o resto é a solução ou a fila e o motivo. "assumir" é só o verbo (e o código): "atendo
 * amanhã cedo" é conversa, não comando. Pergunta ("Resolvido?") também é conversa. null para o resto.
 */
export function lerAtendimento(entrada: string): PedidoDeAtendimento | null {
  const bruto = String(entrada ?? '').slice(0, 4000)
  const m = VERBO_DO_ATENDIMENTO.exec(bruto)
  if (!m || /\?\s*$/.test(bruto)) return null
  const verbo = normalizar(m[1])
  const acao: AcaoNoChamado = verbo.startsWith('resolv') ? 'resolver' : verbo.startsWith('transf') ? 'transferir' : 'assumir'
  const resto = bruto.slice(m[0].length).trim()
  const c = CODIGO_NO_COMECO.exec(resto)
  const codigo = c ? `${c[1].toUpperCase()}-${c[2].padStart(4, '0')}` : null
  const texto = semComeco(c ? resto.slice(c[0].length) : resto)
  if (acao === 'assumir' && texto) return null
  return { acao, codigo, texto, resto: semComeco(resto) }
}

/**
 * Respondendo ao aviso do chamado, só a forma que não deixa dúvida vira pedido; o resto é a mensagem de
 * sempre a quem abriu: "assumo", "resolvido…" e "resolver:" (com os dois-pontos — "resolver amanhã" é
 * conversa), "transferir para …". null para a conversa.
 */
export function lerAtendimentoNoAviso(entrada: string): PedidoDeAtendimento | null {
  const pedido = lerAtendimento(entrada)
  if (!pedido) return null
  const t = String(entrada ?? '')
  if (pedido.acao === 'resolver' && /^\s*resolver(?![\p{L}\d])/iu.test(t) && !/^\s*resolver\s*:/i.test(t)) return null
  if (pedido.acao === 'transferir' && !pedido.codigo && !/^\s*(?:para|pra|p\/)\s/i.test(pedido.resto)) return null
  return pedido
}

/** "para Manutenção: o ar da sala dos servidores" → a equipe escrita e o motivo (depois dos dois-pontos ou do travessão). */
export function lerTransferencia(texto: string): { fila: string; motivo: string } {
  const t = String(texto ?? '').replace(/^\s*(?:para|pra|p\/)\s+(?:(?:a\s+)?(?:fila|equipe)\s+(?:de\s+|da\s+|do\s+)?)?/i, '')
  const corte = /\s*(?::|\s[-–—]\s)\s*/.exec(t)
  const fila = (corte ? t.slice(0, corte.index) : t).replace(/\s+/g, ' ').trim().slice(0, 80)
  const motivo = corte ? t.slice(corte.index + corte[0].length).trim().slice(0, 2000) : ''
  return { fila, motivo }
}

/**
 * As opções que batem com o que a pessoa escreveu, sem acento nem maiúscula. O nome (ou um apelido, como o
 * prefixo da fila) igual ao escrito vem sozinho; senão, cada palavra escrita começa uma palavra do nome
 * ("ana li" acha "Ana Lima"; "manut" acha "Manutenção"). Nada escrito, nada achado.
 */
export function acharPeloNome<T extends { nome: string; apelidos?: string[] }>(opcoes: T[], busca: string): T[] {
  const q = normalizar(busca)
  if (!q) return []
  const iguais = opcoes.filter((o) => [o.nome, ...(o.apelidos ?? [])].some((n) => normalizar(n) === q))
  if (iguais.length) return iguais
  const termos = q.split(' ')
  return opcoes.filter((o) => {
    const palavras = normalizar(o.nome).split(' ')
    return termos.every((t) => palavras.some((w) => w.startsWith(t)))
  })
}

const citado = (t: string, max: number) => limpo(t, max).split('\n').map((l) => `> ${l}`).join('\n')

export const TEXTO_PEDE_SOLUCAO = `Como foi resolvido? Escreva a solução: é o que quem abriu vai ler para confirmar. Ou *cancelar*. Vale por ${PENDENCIA_VALE_MIN} minutos.`
export const TEXTO_PEDE_MOTIVO_DA_TRANSFERENCIA = `Por que está transferindo? Responda em poucas palavras, ou *cancelar*. Vale por ${PENDENCIA_VALE_MIN} minutos.`

/**
 * A conferência antes de resolver ou transferir pelo WhatsApp: o que vai acontecer, e *confirmo* ou *cancelar*
 * (como a do voto). `doAviso`: o "resolvido: …" veio respondendo ao aviso, e pode ter sido só uma mensagem a quem abriu.
 */
export function textoDaConferenciaDoChamado(p:
  | { acao: 'resolver'; codigo: string; titulo: string; nota: string; doAviso?: boolean }
  | { acao: 'transferir'; codigo: string; titulo: string; de: string; para: string; assunto: string; motivo: string }): string {
  const qual = `*${limpo(p.codigo, 20)}* · ${limpo(p.titulo, 120)}`
  const fim = `Se está certo, responda *esta mensagem* com *confirmo*. Para desistir, *cancelar*. Vale por ${PENDENCIA_VALE_MIN} minutos.`
  if (p.acao === 'resolver') {
    return [
      `Marcar ${qual} como *resolvido*, com esta solução?`,
      citado(p.nota, 500),
      'Quem abriu lê a solução para confirmar e avaliar, ou reabre se o problema continuar.',
      fim,
      p.doAviso ? '_Era só uma mensagem para quem abriu? Responda *cancelar* e mande de novo sem começar com “resolvido”._' : null,
    ].filter(Boolean).join('\n\n')
  }
  return [
    `Transferir ${qual} de *${limpo(p.de, 60)}* para *${limpo(p.para, 60)}* (assunto: ${limpo(p.assunto, 80)})?`,
    `Motivo:\n${citado(p.motivo, 400)}`,
    'O chamado ganha um código novo na outra fila e fica sem responsável; a equipe de destino e quem abriu são avisados.',
    fim,
  ].join('\n\n')
}

// ------------------------------------------------------------------ portaria (as visitas do dia e registrar quem chegou)
//
// Quem tem a portaria (a mesma regra da tela: membro do Palácio, menos a equipe da Escola) vê as visitas
// abertas do dia — só o nome do visitante, para quem, a hora e a situação — e registra a chegada em etapas,
// como o cadastro do QR, com telefone, autorização, de onde vem, motivo, crachá e foto (lib/whatsapp/portaria.ts;
// as etapas em lib/whatsapp/portaria-regras.ts). Documento fica de fora.

export type VisitaNaLista = { nome: string; para: string; hora: string; situacao: string }
export const VISITAS_NA_RESPOSTA = 10

/** A situação de uma visita aberta, em poucas palavras (o recado de quem é visitado fica na tela). */
export function situacaoDaVisitaNaLista(v: { entrada_em: string | null; visitado_id: string | null; resposta: RespostaDaVisita | null }): string {
  if (!v.entrada_em) return 'Chegou pelo QR: falta confirmar a entrada'
  const r = situacaoDaResposta(v)
  if (r === 'sem_pessoa') return 'Na filial (ninguém foi avisado)'
  if (r === 'esperando') return 'Esperando a resposta'
  return RESPOSTAS[r].rotulo
}

/** A resposta ao "portaria": as visitas abertas de hoje, da mais recente para a mais antiga. `registra`: ensina o "visitante:". */
export function textoDaPortaria(p: { visitas: VisitaNaLista[]; total: number; urlBase: string; registra: boolean }): string {
  const rodape = [p.registra ? 'Para registrar quem chegou, escreva *visitante:* e o nome.' : null, `A portaria completa: ${p.urlBase}/portaria`].filter(Boolean).join(' ')
  if (!p.total || !p.visitas.length) return ['Nenhuma visita aberta hoje na portaria.', rodape].join('\n\n')
  const mostradas = p.visitas.slice(0, VISITAS_NA_RESPOSTA)
  const cabeca = p.total === 1
    ? '*1 visita* aberta hoje na portaria:'
    : `*${p.total} visitas* abertas hoje na portaria${p.total > mostradas.length ? `. As ${mostradas.length} mais recentes` : ''}:`
  const itens = mostradas.map((v) => `• ${limpo(v.hora, 5)} – *${limpo(v.nome, 80)}*${v.para.trim() ? ` → ${limpo(v.para, 80)}` : ''}\n   _${limpo(v.situacao, 60)}_`)
  return [cabeca, itens.join('\n'), rodape].join('\n\n')
}

/** "setor: Financeiro": a visita é para um setor (ou alguém sem conta), em texto livre — como "Setor ou pessoa" da tela, ninguém é avisado. */
export function lerSetorDaVisita(entrada: string): string | null {
  const m = /^\s*setor(?![\p{L}\d])[\s:,.;\-–—]*([\s\S]*)$/iu.exec(String(entrada ?? ''))
  const setor = m?.[1].replace(/\s+/g, ' ').trim().slice(0, 120) ?? ''
  return setor.length >= 2 ? setor : null
}

export const TEXTO_PEDE_NOME_DO_VISITANTE = `Qual é o nome do visitante? Responda com o nome, ou *cancelar*. Vale por ${PENDENCIA_VALE_MIN} minutos.`

export function textoPedeVisitado(nome: string): string {
  return [
    `Para quem é a visita de *${limpo(nome, 80)}*? Escreva o nome de quem vai receber (basta parte do nome).`,
    'Se não for uma pessoa do Palácio, escreva *setor:* e o setor (aí ninguém é avisado). Ou *cancelar*.',
  ].join('\n\n')
}

export const TEXTO_PEDE_MOTIVO_DA_VISITA = `Qual é o motivo da visita? Escreva em poucas palavras, ou responda *pular*. Vale por ${PENDENCIA_VALE_MIN} minutos.`

/**
 * A conferência antes de registrar a entrada: quem chegou, para quem (e se a pessoa é avisada), o telefone (e se o
 * visitante autorizou a resposta no WhatsApp), de onde vem, o motivo, o crachá e a foto. Só aparece o que foi dito;
 * sem foto, lembra que ainda dá para mandar antes do *confirmo*. `telefone`: canônico (numeroCanonico).
 */
export function textoDaConferenciaDaVisita(p: {
  nome: string; pessoa: { nome: string; setor: string | null } | null; setor: string | null; motivo: string | null
  telefone?: string | null; avisar?: boolean; empresa?: string | null; cracha?: string | null; foto?: boolean
}): string {
  const para = p.pessoa
    ? `Para: *${limpo(p.pessoa.nome, 80)}*${p.pessoa.setor ? ` (${limpo(p.pessoa.setor, 60)})` : ''}, que recebe o aviso e responde se a visita pode subir.`
    : `Para: ${limpo(p.setor ?? '', 120) || 'ninguém'} (ninguém é avisado).`
  // A resposta só existe quando há pessoa avisada: com o setor, o "autorizou" não teria o que mandar.
  const telefone = p.telefone
    ? `Telefone: ${formatarNumero(p.telefone)} (${p.avisar && p.pessoa ? 'autorizou: recebe a resposta no WhatsApp' : 'não recebe mensagem do Palácio'})`
    : null
  return [
    `Registrar a entrada de *${limpo(p.nome, 80)}*?`,
    [
      para, telefone, p.empresa ? `De: ${limpo(p.empresa, 80)}` : null, p.motivo ? `Motivo: ${limpo(p.motivo, 200)}` : null,
      p.cracha ? `Crachá: ${limpo(p.cracha, 20)}` : null, p.foto ? 'Foto: recebida ✓' : null,
    ].filter(Boolean).join('\n'),
    p.foto ? null : 'Sem foto: mande agora pela câmera do WhatsApp, antes do *confirmo*, ou tire depois na tela da portaria.',
    `Se está certo, responda *esta mensagem* com *confirmo*. Para desistir, *cancelar*. Vale por ${PENDENCIA_VALE_MIN} minutos.`,
  ].filter(Boolean).join('\n\n')
}

// ------------------------------------------------------------------ confirmar no Palácio (lib/whatsapp/confirmacoes.ts)
//
// O que é sensível e foi pedido pelo WhatsApp (decidir uma despesa ou uma compra, o voto de quem usa a verificação
// em duas etapas, desativar uma conta) não acontece por aqui: vira um link de uso único, amarrado a quem pediu, que
// abre no Palácio com a sessão e a verificação das telas. Lá, "Confirmar" executa pela MESMA função da tela.

/** Quanto vale o link de confirmar no Palácio. */
export const CONFIRMACAO_VALE_MIN = 15

/** A resposta com o link: o que vai acontecer, o link e as regras dele. */
export function textoDoLinkDeConfirmacao(p: { oQue: string; url: string }): string {
  return [
    p.oQue,
    `Confirme no Palácio: ${p.url}`,
    `_O link vale por ${CONFIRMACAO_VALE_MIN} minutos e uma vez só, e abre só na sua conta, com a verificação em duas etapas se você usa. Não repasse. Se desistiu, é só deixar vencer._`,
  ].join('\n\n')
}

/**
 * O voto de quem usa a verificação em duas etapas (lib/whatsapp/acoes.ts): o que o link vai confirmar. Aprovar
 * pede a conferência do setor, que fica na tela de confirmar, antes do botão (como na tela da aprovação).
 */
export function oQueDoVoto(p: { titulo: string; decisao: 'approved' | 'changes_requested'; nota: string }): string {
  return p.decisao === 'approved'
    ? `Aprovar *${limpo(p.titulo, 140)}*? A conferência do setor aparece no Palácio, antes do botão.`
    : [`Pedir ajustes em *${limpo(p.titulo, 140)}*?`, citado(p.nota, 600)].join('\n\n')
}

// ------------------------------------------------------------------ decisões do Financeiro e de Compras (lib/whatsapp/financeiro.ts)
//
// Quem decide despesas (nível "aprovar" ou "gestão" no Financeiro da empresa) ou compras (o Financeiro da empresa do
// pedido e, acima do limite, a Diretoria) pede a lista com "financeiro" e responde "aprovar 2" ou "recusar 2: motivo".
// O pedido vira o link de confirmar no Palácio; pagar, conciliar e fechar o mês continuam só na tela.

/** Uma despesa ou compra esperando a decisão da pessoa. */
export type ItemParaDecidir = {
  tipo: 'despesa' | 'compra'
  /** A descrição da despesa ou o título do pedido de compra. */
  titulo: string
  valor: number
  /** O favorecido da despesa ou o fornecedor da proposta escolhida. */
  fornecedor: string | null
  /** Quem lançou a despesa ou pediu a compra. */
  quem: string | null
  /** O número do pedido de compra (PC-2026-0003). */
  codigo?: string | null
  /** A etapa da compra que é a vez da pessoa (a da Diretoria vem marcada). */
  papel?: 'financeiro' | 'diretoria'
  /** Onde fica no Palácio (o lançamento ou o pedido). */
  link: string
}

export const DECISOES_NA_RESPOSTA = 8
/** O motivo da recusa: o que a tela da compra pede (a da despesa pede menos). */
export const MOTIVO_MINIMO = 5

/**
 * A lista numerada (valor, descrição e fornecedor, quem pediu). `comLinks`: sem a pergunta guardada (a migração
 * 20261018223000 ainda não foi aplicada), "aprovar 2" não teria como achar o item — vai o link de cada um.
 */
export function textoDasDecisoes(p: { itens: ItemParaDecidir[]; total: number; urlBase: string; comLinks?: boolean }): string {
  if (!p.total || !p.itens.length) return 'Nada espera a sua decisão no Financeiro nem em Compras agora.'
  const mostrados = p.itens.slice(0, DECISOES_NA_RESPOSTA)
  const cabeca = p.total === 1
    ? '*1 decisão* espera por você:'
    : `*${p.total} decisões* esperam por você${p.total > mostrados.length ? `. As ${mostrados.length} primeiras` : ''}:`
  const itens = mostrados.map((i, n) => [
    `*${n + 1}.* ${i.tipo === 'despesa' ? 'Despesa' : `Compra ${limpo(i.codigo ?? '', 20)}`.trim()} · *${reais(i.valor)}*${i.tipo === 'compra' && i.papel === 'diretoria' ? ' _(pela Diretoria)_' : ''}`,
    [limpo(i.titulo, 120), i.fornecedor ? limpo(i.fornecedor, 80) : null].filter(Boolean).join(' — '),
    i.quem ? `_${i.tipo === 'despesa' ? 'Lançada' : 'Pedida'} por ${limpo(i.quem, 60)}_` : null,
    p.comLinks ? `${p.urlBase}${i.link}` : null,
  ].filter(Boolean).join('\n'))
  const fim = p.comLinks
    ? 'Para decidir, abra no Palácio.'
    : `Para decidir, responda *aprovar 1* ou *recusar 1:* e o motivo. A decisão se confirma no Palácio, por um link que vale ${CONFIRMACAO_VALE_MIN} minutos.`
  return [cabeca, ...itens, fim].join('\n\n')
}

export type DecisaoFinanceira = { decisao: 'aprovar' | 'recusar'; n: number; motivo: string }

const DECISAO_FINANCEIRA = /^\s*(aprovar|aprovo|aprova|recusar|recuso|recusa)\s+(?:(?:o|a|item|n[º°o]?\.?|n[uú]mero)\s*)?(\d{1,2})(?!\d)(?:\s*[:,;.\-–—]\s*|\s+|\s*$)([\s\S]*)$/iu

/**
 * "aprovar 2", "recusar 2: o valor está acima do orçado", "aprovo o 3". O número é o da lista do "financeiro";
 * o resto é o motivo da recusa (ou a observação da aprovação da compra). Sem o número, não é isto (o "aprovar"
 * solto é o voto, respondendo ao aviso da aprovação). null para o resto.
 */
export function lerDecisaoFinanceira(entrada: string): DecisaoFinanceira | null {
  const m = DECISAO_FINANCEIRA.exec(String(entrada ?? '').slice(0, 2000))
  if (!m) return null
  const n = Number(m[2])
  if (!n) return null
  return { decisao: normalizar(m[1]).startsWith('aprov') ? 'aprovar' : 'recusar', n, motivo: m[3].replace(/\s+/g, ' ').trim().slice(0, 600) }
}

/** O que o link vai confirmar: aprovar ou recusar qual item, por quanto, e o motivo (ou a observação). */
export function oQueDaDecisao(i: ItemParaDecidir, d: DecisaoFinanceira): string {
  const qual = i.tipo === 'despesa' ? `a despesa *${limpo(i.titulo, 120)}*` : `a compra *${limpo(i.codigo ?? '', 20)}* (${limpo(i.titulo, 120)})`
  const verbo = d.decisao === 'recusar' ? 'Recusar' : i.tipo === 'compra' && i.papel === 'diretoria' ? 'Aprovar pela Diretoria' : 'Aprovar'
  const nota = d.decisao === 'recusar' ? `Motivo:\n${citado(d.motivo, 400)}` : i.tipo === 'compra' && d.motivo ? `Observação:\n${citado(d.motivo, 400)}` : null
  return [`${verbo} ${qual}, de ${reais(i.valor)}?`, nota].filter(Boolean).join('\n\n')
}

// ------------------------------------------------------------------ desativar conta (quem gerencia usuários)

const DESATIVAR_CONTA = /^\s*desativar\s+(?:a\s+|o\s+)?(?:conta|acesso|usu[aá]rio)(?:\s+d[aeo])?(?![\p{L}\d])[\s:,.;\-–—]*([\s\S]*)$/iu

/**
 * "desativar conta: Ana Lima", "desativar o acesso do ana.lima": o nome ou o usuário (pode vir vazio: o bot
 * pergunta). Só de quem gerencia usuários (lerPedido, `usuarios`). null quando não é isto.
 */
export function lerDesativarConta(entrada: string): string | null {
  const m = DESATIVAR_CONTA.exec(String(entrada ?? '').slice(0, 300))
  return m ? m[1].replace(/\s+/g, ' ').trim().slice(0, 80) : null
}

export const TEXTO_PEDE_QUEM_DESATIVAR = 'Escreva *desativar conta:* e o nome ou o usuário de quem vai perder o acesso (ex.: _desativar conta: ana.lima_). A confirmação é no Palácio.'

/** O que o link vai confirmar: de quem é o acesso e o que acontece (o mesmo aviso da tela de Usuários). */
export function oQueDaDesativacao(p: { nome: string; usuario: string; papel: string }): string {
  return `Desativar o acesso de *${limpo(p.nome, 80)}* (${limpo(p.usuario, 40)}, ${limpo(p.papel, 40)})? A pessoa perde o acesso na hora, sai de todas as sessões e o WhatsApp dela é liberado. O histórico continua no Palácio, e dá para reativar.`
}

/** Ninguém ativo com o nome escrito (a própria pessoa não entra na busca). */
export function textoDeNinguemParaDesativar(nome: string): string {
  return `Não achei ninguém ativo na equipe com “${limpo(nome, 80)}”. Escreva o nome como está no Palácio ou o usuário (ex.: _desativar conta: ana.lima_).`
}

/** Mais de uma pessoa com o nome escrito: o usuário desfaz a dúvida. */
export function textoDeQuemDesativar(opcoes: { nome: string; usuario: string }[]): string {
  return [
    'Achei mais de uma pessoa com esse nome:',
    opcoes.map((o) => `• ${limpo(o.nome, 80)} (${limpo(o.usuario, 40)})`).join('\n'),
    'Escreva *desativar conta:* e o usuário de quem vai perder o acesso.',
  ].join('\n\n')
}

// ------------------------------------------------------------------ cadastrar colaborador (quem gerencia usuários)

/**
 * "colaborador: Ana Lima", "novo colaborador Ana Lima", "cadastrar colaborador", "nova colaboradora: …": o nome
 * (pode vir vazio: o bot pergunta). "colaborador" sozinho no começo só com os dois-pontos (ou sozinho): "colaborador
 * do mês saiu?" não é cadastro. Só de quem gerencia usuários (lerPedido, `usuarios`); as etapas ficam em
 * lib/whatsapp/colaborador-regras.ts. null quando não é isto.
 */
const CADASTRAR_COLABORADOR = /^\s*(?:(?:novo|nova)\s+colaborador(?:a)?|cadastrar\s+(?:o\s+|a\s+|um\s+|uma\s+)?(?:(?:novo|nova)\s+)?colaborador(?:a)?|colaborador(?:a)?\s*(?=:|$))(?![\p{L}\d])[\s:,.;\-–—]*/iu

export function lerColaborador(entrada: string): string | null {
  const t = String(entrada ?? '').slice(0, 300)
  const m = CADASTRAR_COLABORADOR.exec(t)
  return m ? t.slice(m[0].length).replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/[*_~`]/g, '').replace(/\s+/g, ' ').trim().slice(0, 120) : null
}

// ------------------------------------------------------------------ "Não fui eu" (lib/whatsapp/protecao.ts)
//
// O aviso de segurança de algo que a própria pessoa faria (acesso novo, bloqueio, senha, número trocado) ensina a
// responder "NÃO FUI EU". A resposta, citando o aviso ou até 24 h depois dele, é PROTEÇÃO: vale com a verificação
// em duas etapas e até do número antigo da conta. Depois do "confirmo", o Palácio encerra todas as sessões, cancela
// os links de senha e de convite pendentes e avisa a administração e a pessoa. Não troca a senha nem desativa a conta.
// Cada aviso protege uma vez só; do número antigo, uma vez a cada 24 h.

const NAO_FUI_EU = ['nao fui eu', 'nao foi eu', 'nao era eu', 'nao sou eu', 'nao fui eu nao', 'nao foi eu nao', 'nao reconheco', 'nao fiz isso', 'nao fui eu que fiz']

/** "Não fui eu", "não foi eu", "NÃO FUI EU!", o toque no botão. */
export const ehNaoFuiEu = (entrada: string): boolean => NAO_FUI_EU.includes(normalizar(entrada))

/** Sem citar o aviso, a resposta vale até tanto depois dele. */
export const NAO_FUI_EU_VALE_HORAS = 24
/** Citando o aviso, até tanto (o número antigo pode mudar de dono; depois disso, fale com a administração). */
export const NAO_FUI_EU_CITANDO_DIAS = 7

/** A conferência antes de proteger. `daConta`: o número é o da conta hoje (do número antigo, sem "sua"). */
export function textoDaConferenciaDoNaoFuiEu(p: { daConta: boolean }): string {
  return [
    p.daConta ? '*Proteger a sua conta do Palácio Virtual?*' : '*Proteger a conta que recebia os avisos neste número?*',
    'O Palácio encerra *todas as sessões* abertas da conta, em qualquer aparelho, cancela os links de senha e de convite que ainda valem e avisa a administração. A senha não muda e a conta continua ativa.',
    `Para proteger agora, responda *esta mensagem* com *confirmo*. Se foi engano, *cancelar*. Vale por ${PENDENCIA_VALE_MIN} minutos.`,
  ].join('\n\n')
}

/** Depois de proteger: o que foi feito e o próximo passo (a senha, que só a pessoa troca). */
export function textoDoNaoFuiEuFeito(p: { daConta: boolean }): string {
  return [
    'Pronto: todas as sessões da conta foram encerradas, os links de senha e de convite pendentes deixaram de valer e a administração foi avisada.',
    p.daConta
      ? 'Agora troque a senha: na tela de entrada do Palácio, toque em “Esqueci minha senha” (o link vai ao seu e-mail confirmado), ou peça uma senha nova à administração.'
      : 'Se a conta é sua, troque a senha pela tela de entrada do Palácio (“Esqueci minha senha”) e fale com a administração.',
  ].join('\n\n')
}

export const TEXTO_NAO_FUI_EU_SEM_AVISO =
  'Não achei um aviso de segurança recente para este número. Se alguém mexeu na sua conta, troque a senha em Meu perfil (ou pela tela de entrada, em “Esqueci minha senha”) e fale com a administração.'

/**
 * O "Não fui eu" que já valeu: o aviso que já protegeu a conta não vale de novo, e do número que já não é da conta
 * uma proteção nas últimas NAO_FUI_EU_VALE_HORAS basta (lib/whatsapp/protecao.ts, jaProtegida).
 */
export const TEXTO_NAO_FUI_EU_JA_FEITO =
  'A conta já foi protegida por um “Não fui eu”: as sessões foram encerradas e a administração foi avisada. Se ainda houver algo estranho, fale com a administração.'

/** Antes da migração 20261018223000 (a conferência não tem onde ficar): o caminho de sempre. */
export const TEXTO_NAO_FUI_EU_INDISPONIVEL =
  'Ainda não consigo proteger a conta por aqui. Agora mesmo: troque a senha pela tela de entrada do Palácio (“Esqueci minha senha”) e fale com a administração.'

// ------------------------------------------------------------------ ofícios (o aviso do pedido de assinatura)
//
// O pedido de assinatura de um ofício já é um aviso (categoria "oficios", app/actions/oficios.ts) e vai pelo
// WhatsApp como os outros, com o link. Assinar — e recusar — é só no Palácio, com a senha ou o gov.br: a resposta
// que cita o aviso não assina nada, só diz onde.

export function textoDoOficioPeloWhatsapp(abrir: string): string {
  return `Ofício não se assina pelo WhatsApp: a assinatura (ou a recusa) é no Palácio, com a sua senha ou pelo gov.br. Abra o ofício: ${abrir}`
}

// ------------------------------------------------------------------ presença das ações do Voluntariado (lib/whatsapp/presenca.ts)
//
// Quem coordena as oportunidades (nível "gerenciar" ou "dados sensíveis" no Voluntariado — a permissão do botão
// "Presente" da tela) faz a chamada da ação de hoje: escolhe a ação (se houver mais de uma), responde com os
// números de quem veio e confere. Cada marcação passa pela mesma registrar_presenca da tela, que lança (ou tira)
// as horas no cadastro do voluntário.

/** Na escolha da ação, no máximo tantas (cabe numa lista do WhatsApp, com a linha de cancelar). */
export const ACOES_NA_ESCOLHA = 9
/** A chamada por aqui vai até tantos inscritos; ação maior, pela tela. */
export const INSCRITOS_NA_CHAMADA = 40

export type InscritoNaChamada = { nome: string; situacao: string }

/** "4 h", "2,5 h", "0,25 h". */
export const horasNoTexto = (h: number) => `${h.toLocaleString('pt-BR', { maximumFractionDigits: 2 })} h`

const SITUACAO_NA_CHAMADA: Record<string, string> = { presente: 'presente', ausente: 'falta' }

/** A lista numerada dos inscritos, com o que já foi marcado, e como responder. */
export function textoDaChamada(p: { titulo: string; quando: string; inscritos: InscritoNaChamada[]; horas: number }): string {
  const total = p.inscritos.length
  const linhas = p.inscritos.map((i, n) => `*${n + 1}* – ${limpo(i.nome, 60)}${SITUACAO_NA_CHAMADA[i.situacao] ? ` _(${SITUACAO_NA_CHAMADA[i.situacao]})_` : ''}`)
  return [
    `*${limpo(p.titulo, 140)}*\n${limpo(p.quando, 80)} · ${total === 1 ? '1 inscrito' : `${total} inscritos`}`,
    linhas.join('\n'),
    `Responda com os números de quem veio (ex.: _1 3 4_ ou _1 a 5_), *todos* ou _todos menos 3_ (aí o 3 fica com falta). Só faltas: _faltas 2 6_. Cada presença lança ${horasNoTexto(p.horas)} no cadastro do voluntário.`,
    `Ou *cancelar*. Vale por ${PENDENCIA_VALE_MIN} minutos.`,
  ].join('\n\n')
}

/** Os botões da chamada: "todos" (lerMarcacaoDePresenca) e cancelar. */
export const BOTOES_DA_CHAMADA: Interativo = { tipo: 'botoes', botoes: [{ id: 'todos', titulo: 'Todos vieram' }, { id: 'cancelar', titulo: 'Cancelar' }] }

export type MarcacaoDePresenca = { presentes: number[]; ausentes: number[] }

const VIERAM = new Set(['presente', 'presentes', 'presenca', 'presencas', 'vieram', 'veio', 'compareceram', 'compareceu'])
const FALTARAM = new Set(['ausente', 'ausentes', 'faltaram', 'faltou', 'falta', 'faltas'])
const TIRANDO = new Set(['menos', 'exceto', 'fora', 'tirando'])
const LIGACOES = new Set(['e', 'o', 'a', 'os', 'as', 'n', 'no', 'numero', 'numeros'])

/**
 * A resposta à chamada (`quantos` inscritos na lista): "1 3 4", "1, 3 e 4", "1 a 5", "1-5" (os que vieram),
 * "todos", "todos menos 3 5" (os outros vieram; o 3 e o 5 ficam com falta), "faltas 2 6" ou "não vieram 2", e as
 * duas coisas juntas ("presentes 1 3, faltas 2"). null quando não dá para ler sem chutar: palavra estranha,
 * número fora da lista, o mesmo número nos dois lados, "presente" ou "falta" depois dos números ("2 não veio")
 * ou nenhum número.
 */
export function lerMarcacaoDePresenca(entrada: string, quantos: number): MarcacaoDePresenca | null {
  const t = String(entrada ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
    .replace(/(\d+)\s*(?:-|–|—|\ba\b|\bate\b)\s*(\d+)/g, '$1~$2')
    .replace(/[^a-z0-9~ ]+/g, ' ').replace(/\s+/g, ' ').trim()
  if (!t || quantos < 1) return null
  const palavras = t.split(' ')
  let i = 0
  // "todos" (ou "todos faltaram") e, depois de "menos", as exceções.
  let todos: 'vieram' | 'faltaram' | null = null
  if (palavras[0] === 'todos' || palavras[0] === 'todas' || (palavras[0] === 'todo' && palavras[1] === 'mundo')) {
    i = palavras[0] === 'todo' ? 2 : 1
    todos = 'vieram'
    if (VIERAM.has(palavras[i] ?? '')) i++
    else if (FALTARAM.has(palavras[i] ?? '')) { todos = 'faltaram'; i++ }
    if (i < palavras.length) {
      if (!TIRANDO.has(palavras[i])) return null
      i++
      if (i >= palavras.length) return null
    }
  }
  const presentes = new Set<number>()
  const ausentes = new Set<number>()
  let lado: 'presentes' | 'ausentes' = todos === 'vieram' ? 'ausentes' : 'presentes'
  let numeros = 0
  let semNumero = false
  let nao = false
  for (; i < palavras.length; i++) {
    const w = palavras[i]
    if (!todos && (w === 'nao' || VIERAM.has(w) || FALTARAM.has(w))) {
      if (w === 'nao') { nao = true; continue }
      lado = FALTARAM.has(w) || nao ? 'ausentes' : 'presentes'
      nao = false
      semNumero = true
      continue
    }
    if (LIGACOES.has(w)) continue
    const faixa = /^(\d{1,3})(?:~(\d{1,3}))?$/.exec(w)
    if (!faixa || nao) return null
    const de = Number(faixa[1])
    const ate = Number(faixa[2] ?? faixa[1])
    if (de < 1 || ate > quantos || de > ate) return null
    for (let n = de; n <= ate; n++) (lado === 'presentes' ? presentes : ausentes).add(n)
    numeros++
    semNumero = false
  }
  if (semNumero || nao) return null
  if (todos === 'vieram') for (let n = 1; n <= quantos; n++) { if (!ausentes.has(n)) presentes.add(n) }
  else if (todos === 'faltaram') for (let n = 1; n <= quantos; n++) { if (!presentes.has(n)) ausentes.add(n) }
  else if (!numeros) return null
  if ([...presentes].some((n) => ausentes.has(n))) return null
  const ordem = (c: Set<number>) => [...c].sort((a, b) => a - b)
  return { presentes: ordem(presentes), ausentes: ordem(ausentes) }
}

/** A conferência antes de marcar: quem fica com presença (e as horas) e quem fica com falta. */
export function textoDaConferenciaDaPresenca(p: { titulo: string; quando: string; presentes: string[]; ausentes: string[]; horas: number }): string {
  const nomes = (l: string[]) => l.map((n) => limpo(n, 60)).join(', ')
  return [
    `Marcar na *${limpo(p.titulo, 140)}* (${limpo(p.quando, 80)}):`,
    [
      p.presentes.length ? `*Presença (${p.presentes.length}):* ${nomes(p.presentes)} – ${horasNoTexto(p.horas)} no cadastro de cada um.` : null,
      p.ausentes.length ? `*Falta (${p.ausentes.length}):* ${nomes(p.ausentes)} – se esta ação já tinha lançado horas para eles, elas saem.` : null,
    ].filter(Boolean).join('\n'),
    `Se está certo, responda *esta mensagem* com *confirmo*. Para desistir, *cancelar*. Vale por ${PENDENCIA_VALE_MIN} minutos.`,
  ].join('\n\n')
}

/** Depois de marcar: o que entrou e o que não deu (com o motivo do banco). */
export function textoDaPresencaMarcada(p: { titulo: string; presentes: number; ausentes: number; horas: number; falhas: { nome: string; motivo: string }[]; link: string }): string {
  const feitas = [
    p.presentes ? `${p.presentes === 1 ? '1 presença' : `${p.presentes} presenças`} (${horasNoTexto(p.horas)} no cadastro de cada um)` : null,
    p.ausentes ? (p.ausentes === 1 ? '1 falta' : `${p.ausentes} faltas`) : null,
  ].filter(Boolean)
  const mostradas = p.falhas.slice(0, 10)
  return [
    feitas.length
      ? `Pronto: na *${limpo(p.titulo, 140)}*, ${feitas.join(' e ')} ${p.presentes + p.ausentes === 1 ? 'registrada' : 'registradas'}.`
      : `Nada foi marcado na *${limpo(p.titulo, 140)}*.`,
    mostradas.length
      ? ['Não deu para marcar:', ...mostradas.map((f) => `• ${limpo(f.nome, 60)}: ${limpo(f.motivo, 140)}`), p.falhas.length > mostradas.length ? `_e mais ${p.falhas.length - mostradas.length}_` : null]
        .filter(Boolean).join('\n')
      : null,
    `A ação no Palácio: ${p.link}`,
  ].filter(Boolean).join('\n\n')
}

/** Nenhuma ação com a presença liberada hoje; `depois`: as de hoje que ainda vão começar (a presença vale a partir do início). */
export function textoSemAcaoHoje(p: { depois: { titulo: string; hora: string }[]; urlBase: string }): string {
  return [
    'Nenhuma ação de hoje com a presença liberada: a presença vale a partir do início da ação.',
    p.depois.length ? `Mais tarde: ${p.depois.slice(0, 3).map((a) => `${limpo(a.titulo, 80)} (${limpo(a.hora, 5)})`).join('; ')}.` : null,
    `As oportunidades: ${p.urlBase}/voluntariado/oportunidades`,
  ].filter(Boolean).join('\n\n')
}

// ------------------------------------------------------------------ frota (lib/whatsapp/frota.ts)
//
// Quem vê a Frota (nível "ver" ou mais no Patrimônio, a permissão da tela) pede "veículos": os disponíveis, os em
// viagem (com quem e para onde) e os parados. Quem opera ("operar" ou "gestão", a permissão dos botões "Saída" e
// "Retorno") registra a saída — veículo, quem dirige, hodômetro, finalidade e destino — e o retorno — hodômetro e
// ocorrências —, sempre com a conferência, pelas mesmas funções da tela (frota_sair e frota_retornar, com a
// conferência de pedidoDeSaida e pedidoDeRetorno, em lib/patrimonio/frota.ts).

export type VeiculoNaFrota = { nome: string; tipo: string; km: number; situacao: string; uso?: { condutor: string; destino: string; desde: string } | null }
export const VEICULOS_NA_RESPOSTA = 12

/** "Ambulância 1 · ABC-1234" (ou só a placa, legível). */
export const nomeDoVeiculo = (v: { apelido: string | null; placa: string }) => (v.apelido?.trim() ? `${v.apelido.trim()} · ${placaLegivel(v.placa)}` : placaLegivel(v.placa))

const tipoDoVeiculo = (tipo: string) => (TIPOS_DE_VEICULO as Record<string, string>)[tipo] ?? tipo

/** O "veículos": os disponíveis, os em viagem e os parados. `opera`: ensina o "saída" e o "retorno". */
export function textoDaFrota(p: { veiculos: VeiculoNaFrota[]; urlBase: string; opera: boolean }): string {
  const link = `${p.urlBase}/patrimonio/frota`
  if (!p.veiculos.length) return ['Nenhum veículo cadastrado na Frota.', `A frota: ${link}`].join('\n\n')
  const disponiveis = p.veiculos.filter((v) => v.situacao === 'ativo' && !v.uso)
  const emViagem = p.veiculos.filter((v) => v.uso)
  const parados = p.veiculos.filter((v) => v.situacao !== 'ativo' && !v.uso)
  const bloco = (titulo: string, lista: VeiculoNaFrota[], linha: (v: VeiculoNaFrota) => string) => {
    if (!lista.length) return null
    const mostrados = lista.slice(0, VEICULOS_NA_RESPOSTA)
    return [`*${titulo}*`, ...mostrados.map(linha), lista.length > mostrados.length ? `_e mais ${lista.length - mostrados.length}_` : null].filter(Boolean).join('\n')
  }
  const situacao = (v: VeiculoNaFrota) => ((SITUACOES_DO_VEICULO as Record<string, { rotulo: string }>)[v.situacao]?.rotulo ?? v.situacao).toLowerCase()
  return [
    `*Frota agora:* ${disponiveis.length} ${disponiveis.length === 1 ? 'disponível' : 'disponíveis'}, ${emViagem.length} em viagem${parados.length ? `, ${parados.length} ${parados.length === 1 ? 'parado' : 'parados'}` : ''}.`,
    bloco('Disponíveis', disponiveis, (v) => `• ${limpo(v.nome, 60)} (${tipoDoVeiculo(v.tipo)}) – ${km(v.km)}`),
    bloco('Em viagem', emViagem, (v) => `• ${limpo(v.nome, 60)} – ${limpo(v.uso?.condutor ?? '', 60)}, para ${limpo(v.uso?.destino ?? '', 80)}, desde ${limpo(v.uso?.desde ?? '', 30)}`),
    bloco('Em manutenção ou fora de uso', parados, (v) => `• ${limpo(v.nome, 60)} – ${situacao(v)}`),
    [p.opera ? 'Para o diário de bordo, escreva *saída* ou *retorno* e o veículo (ex.: _saída ABC1D23_).' : null, `A frota completa: ${link}`].filter(Boolean).join(' '),
  ].filter(Boolean).join('\n\n')
}

/**
 * Os veículos que batem com o que a pessoa escreveu: a placa inteira (com ou sem hífen) ou o fim dela ("1D23"),
 * senão o apelido, o tipo, a marca e o modelo (acharPeloNome: "amb 1" acha "Ambulância 1"). Nada escrito, nada.
 */
export function acharVeiculo<T extends { placa: string; apelido: string | null; tipo: string; marca?: string | null; modelo?: string | null }>(lista: T[], busca: string): T[] {
  const placa = String(busca ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '')
  if (!placa) return []
  const iguais = lista.filter((v) => v.placa === placa)
  if (iguais.length) return iguais
  if (placa.length >= 3 && /\d/.test(placa)) {
    const peloFim = lista.filter((v) => v.placa.endsWith(placa))
    if (peloFim.length) return peloFim
  }
  const nomes = lista.map((v) => ({ v, nome: [v.apelido, tipoDoVeiculo(v.tipo), v.marca, v.modelo].filter(Boolean).join(' ') }))
  return acharPeloNome(nomes, busca).map((x) => x.v)
}

const MESMO_KM = new Set(['mesmo', 'o mesmo', 'mesma', 'manter', 'mantem', 'mantenha', 'igual', 'nao mudou'])

/** O hodômetro respondido na conversa: "52.100", "52100 km"; "mesmo" (ou o toque em "Manter") repete `atual`. null se não serve. */
export function lerHodometroDaConversa(entrada: string, atual: number | null): number | null {
  if (atual !== null && MESMO_KM.has(normalizar(entrada))) return atual
  const n = lerHodometro(entrada)
  return n === null || Number.isNaN(n) ? null : n
}

/** A pergunta do hodômetro: na saída, o último registro (e "mesmo" para manter); no retorno, o da saída. */
export function textoPedeHodometro(p: { veiculo: string; acao: 'saida' | 'retorno'; km: number }): string {
  return p.acao === 'saida'
    ? `Qual o hodômetro de *${limpo(p.veiculo, 80)}* agora? O último registro é ${km(p.km)}. Responda o número, *mesmo* para manter, ou *cancelar*. Vale por ${PENDENCIA_VALE_MIN} minutos.`
    : `Qual o hodômetro de *${limpo(p.veiculo, 80)}* na chegada? Saiu com ${km(p.km)}. Responda o número, ou *cancelar*. Vale por ${PENDENCIA_VALE_MIN} minutos.`
}

/** Os botões da pergunta do hodômetro na saída: manter o último registro ("mesmo") ou desistir. */
export const botoesDoHodometro = (atual: number): Interativo => ({ tipo: 'botoes', botoes: [{ id: 'mesmo', titulo: `Manter ${km(atual)}` }, { id: 'cancelar', titulo: 'Cancelar' }] })

export const TEXTO_PEDE_DESTINO = `Para onde vai? Escreva o destino (ex.: _Maracanã – posto médico do jogo_), ou *cancelar*. Vale por ${PENDENCIA_VALE_MIN} minutos.`
export const TEXTO_PEDE_OCORRENCIAS = `Alguma ocorrência na viagem (luz acesa no painel, pneu baixo, batida)? Escreva, ou responda *pular*. Vale por ${PENDENCIA_VALE_MIN} minutos.`

/** As finalidades da viagem, na ordem da tela (a escolha numerada da saída). */
export const FINALIDADES_NA_CONVERSA = Object.keys(FINALIDADES_DE_USO) as FinalidadeDeUso[]

/** A conferência antes de abrir a viagem: o veículo, quem dirige, o hodômetro, a finalidade e o destino. */
export function textoDaConferenciaDaSaida(p: { veiculo: string; condutor: string; km: number; finalidade: FinalidadeDeUso; destino: string }): string {
  return [
    `Registrar a *saída* de *${limpo(p.veiculo, 80)}*?`,
    [`Quem dirige: ${limpo(p.condutor, 80)}`, `Hodômetro na saída: ${km(p.km)}`, `Finalidade: ${FINALIDADES_DE_USO[p.finalidade]}`, `Destino: ${limpo(p.destino, 200)}`].join('\n'),
    'A viagem fica aberta no diário de bordo até o retorno. Para ligar a viagem a um projeto, registre a saída pela tela do veículo.',
    `Se está certo, responda *esta mensagem* com *confirmo*. Para desistir, *cancelar*. Vale por ${PENDENCIA_VALE_MIN} minutos.`,
  ].join('\n\n')
}

/** A conferência antes de fechar a viagem: o hodômetro (e o quanto rodou) e as ocorrências. */
export function textoDaConferenciaDoRetorno(p: { veiculo: string; kmSaida: number; km: number; observacao: string; condutor: string | null; destino: string | null }): string {
  const viagem = [p.condutor ? limpo(p.condutor, 60) : null, p.destino ? `para ${limpo(p.destino, 100)}` : null].filter(Boolean).join(', ')
  return [
    `Registrar o *retorno* de *${limpo(p.veiculo, 80)}*?`,
    [
      viagem ? `Viagem: ${viagem}` : null,
      `Hodômetro na chegada: ${km(p.km)} (rodou ${km(p.km - p.kmSaida)})`,
      `Ocorrências: ${p.observacao ? limpo(p.observacao, 300) : 'nenhuma'}`,
    ].filter(Boolean).join('\n'),
    `Se está certo, responda *esta mensagem* com *confirmo*. Para desistir, *cancelar*. Vale por ${PENDENCIA_VALE_MIN} minutos.`,
  ].join('\n\n')
}

/** Depois do retorno: o quanto rodou e, se venceu, a manutenção (quem opera a frota recebe o aviso). */
export function textoDoRetornoRegistrado(p: { veiculo: string; kmRodado: number; planos: { nome: string; km: number }[]; link: string }): string {
  return [
    `Pronto: retorno de *${limpo(p.veiculo, 80)}* registrado; rodou ${km(p.kmRodado)}.`,
    p.planos.length ? `Atenção: manutenção vencida nesta viagem – ${p.planos.map((x) => `${limpo(x.nome, 60)} (${km(x.km)})`).join('; ')}. Quem opera a frota foi avisado.` : null,
    `O veículo: ${p.link}`,
  ].filter(Boolean).join('\n\n')
}

// ------------------------------------------------------------------ estoque (lib/whatsapp/estoque.ts)
//
// Quem vê o Estoque (nível "ver" ou mais no Patrimônio, a permissão da tela) pergunta o saldo de um material:
// "estoque luva". Só leitura: o saldo, o mínimo, onde está e a validade mais próxima. As doações em espécie entram
// no mesmo estoque, então valem também. Entrada, saída, transferência e ajuste ficam na tela.

export type MaterialNoSaldo = {
  id: string; nome: string; codigo: string; unidade: string; saldo: number; minimo: number
  /** Onde está (os lotes com saldo, somados por local). */
  locais: { nome: string; quantidade: number }[]
  /** A validade mais próxima que ainda não venceu (AAAA-MM-DD), e quanto já venceu e espera a baixa. */
  validade: string | null
  vencido: number
}
export const MATERIAIS_NO_SALDO = 5

export const TEXTO_PEDE_MATERIAL = 'Escreva *estoque* e o material (ex.: _estoque luva_, _estoque álcool 70_). A resposta traz o saldo, o mínimo e onde está.'

const PALAVRAS_SOLTAS = new Set(['de', 'do', 'da', 'dos', 'das', 'em', 'e', 'para', 'com', 'o', 'a', 'os', 'as'])

/**
 * Os materiais que batem com o que a pessoa escreveu: o código igual ("EST-0012", sem diferença de hífen ou
 * maiúscula) vem sozinho; senão, cada palavra escrita (menos "de", "em"…) começa uma palavra do nome — no
 * singular também ("luvas" acha "Luva de procedimento").
 */
export function acharNoEstoque<T extends { nome: string; codigo: string }>(itens: T[], busca: string): T[] {
  const q = normalizar(busca)
  if (!q) return []
  const peloCodigo = itens.filter((i) => normalizar(i.codigo).replace(/ /g, '') === q.replace(/ /g, ''))
  if (peloCodigo.length) return peloCodigo
  const todos = q.split(' ')
  const termos = todos.filter((t) => !PALAVRAS_SOLTAS.has(t))
  const usar = termos.length ? termos : todos
  const singular = (t: string) => (t.length > 3 && t.endsWith('s') ? t.slice(0, -1) : t)
  return itens.filter((i) => {
    const palavras = normalizar(i.nome).split(' ')
    return usar.every((t) => palavras.some((w) => w.startsWith(t) || w.startsWith(singular(t))))
  })
}

const dataBr = (d: string) => d.split('-').reverse().join('/')

/** A resposta ao "estoque <material>": um material, em detalhe; vários, um por linha (até 5), com o link da busca. */
export function textoDoSaldo(p: { busca: string; materiais: MaterialNoSaldo[]; total: number; urlBase: string }): string {
  const buscaNaTela = `${p.urlBase}/patrimonio/estoque?q=${encodeURIComponent(p.busca.trim().slice(0, 80))}`
  if (!p.total || !p.materiais.length) return `Não achei “${limpo(p.busca, 80)}” no estoque. Tente outra palavra (ou o código), ou veja a lista: ${buscaNaTela}`
  const alerta = (m: MaterialNoSaldo) => {
    const s = situacaoDoSaldo(m.saldo, m.minimo)
    return s === 'zerado' ? ' _(zerado)_' : s === 'abaixo' ? ` _(abaixo do mínimo de ${quantidade(m.minimo, m.unidade)})_` : ''
  }
  if (p.total === 1) {
    const m = p.materiais[0]
    return [
      `*${limpo(m.nome, 120)}* (${limpo(m.codigo, 20)})`,
      [
        `Saldo: *${quantidade(m.saldo, m.unidade)}*${alerta(m)}${m.minimo > 0 && situacaoDoSaldo(m.saldo, m.minimo) === 'ok' ? ` · mínimo ${quantidade(m.minimo, m.unidade)}` : ''}`,
        m.locais.length ? `Onde está: ${m.locais.slice(0, 6).map((l) => `${limpo(l.nome, 60)} ${quantidade(l.quantidade, m.unidade)}`).join('; ')}${m.locais.length > 6 ? '; …' : ''}` : null,
        m.validade ? `Validade mais próxima: ${dataBr(m.validade)}` : null,
        m.vencido > 0 ? `Vencido esperando a baixa: ${quantidade(m.vencido, m.unidade)}` : null,
      ].filter(Boolean).join('\n'),
      `No Palácio: ${p.urlBase}/patrimonio/estoque/${m.id}`,
    ].join('\n\n')
  }
  const mostrados = p.materiais.slice(0, MATERIAIS_NO_SALDO)
  return [
    `Achei *${p.total} materiais* com “${limpo(p.busca, 80)}”${p.total > mostrados.length ? `. Os ${mostrados.length} primeiros` : ''}:`,
    mostrados.map((m) => `• *${limpo(m.nome, 80)}* (${limpo(m.codigo, 20)}): ${quantidade(m.saldo, m.unidade)}${alerta(m)}`).join('\n'),
    `Para o detalhe de um, escreva mais do nome ou o código. A lista: ${buscaNaTela}`,
  ].join('\n\n')
}
