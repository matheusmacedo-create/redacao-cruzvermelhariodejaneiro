import { CATEGORIAS, ONLINE_MIN, INTERVALO_NO_MESMO_LINK_MIN, type Categoria } from '@/lib/notificacoes/regras'
import { PERGUNTA_DA_VISITA, RESPOSTAS, situacaoDaResposta, type RespostaDaVisita } from '@/lib/portaria/regras'

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
  if (alvo.tipo === 'visita') return `_${PERGUNTA_DA_VISITA}_`
  return '_Para responder por aqui, responda esta mensagem._'
}

/**
 * Os botões do aviso que se responde com um toque: hoje, a visita na portaria — "1", "2" e "3", como a
 * resposta digitada (lerRespostaDaVisita), com o rótulo da tela quando cabe no botão. Só dentro da
 * janela de 24 h: fora dela o aviso sai pelo modelo, sem botão, e a dica do texto continua valendo.
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
 * de pedir (código, resposta do bot, teste), para a segurança da conta e para
 * a portaria (a visita está na porta agora).
 */
export function silencioSeAplica(p: { tipo: Finalidade; categoria?: string | null }): boolean {
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

export type EsperaNaFila = { silencio: number; volume: number; falha: number }

/** "3 mensagens (2 no silêncio até as 7h, 1 para reenviar)"; "vazia"; sem a contagem, "não deu para ler agora". */
function textoDaEspera(f: EsperaNaFila | null): string {
  if (!f) return 'não deu para ler agora'
  const total = f.silencio + f.volume + f.falha
  if (!total) return 'vazia'
  const partes = [
    f.silencio ? `${f.silencio} no silêncio até as 7h` : null,
    f.volume ? `${f.volume} esperando a vez` : null,
    f.falha ? `${f.falha} para reenviar` : null,
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
  /** Quando a rotina diária do WhatsApp terminou pela última vez; null = sem registro. */
  rotina: string | null
  urlBase: string
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
      ...linhasDasFalhas,
      `*Integrações sem chave:* ${semChave}`,
      `*Contas Google:* ${google}`,
      `*Rotina diária:* ${quandoEmSaoPaulo(s.rotina) ?? 'sem registro ainda'}`,
    ].join('\n'),
    `Detalhes: ${s.urlBase}/configuracoes/whatsapp`,
  ].join('\n\n')
}

export type RodadaDaFila = { enviadas: number; adiadas: number; desistiu: number; restam: number }

/** O que uma rodada da fila fez (o botão "Enviar a fila agora" e o comando "fila"). */
export function textoDaRodadaDaFila(r: RodadaDaFila): string {
  if (!r.enviadas && !r.adiadas && !r.desistiu && !r.restam) {
    return 'Nada saiu agora: a fila está vazia, ou o que espera ainda não pode sair (o silêncio das 22h às 7h, ou o reenvio marcado para mais tarde).'
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
 * Aviso de segurança da conta (senha, verificação, e-mail, acesso novo, bloqueio, troca ou remoção do
 * WhatsApp): sai sempre, mesmo pausado e de madrugada (lib/contas/servidor.ts, avisarPorWhatsapp).
 */
export function textoDeSeguranca(p: { titulo: string; texto: string }): string {
  return [`*${limpo(p.titulo, 200)}*`, limpo(p.texto, 900), '_Palácio Virtual · Cruz Vermelha Brasileira – RJ. A equipe nunca pede sua senha nem códigos, por aqui ou por telefone._'].join('\n\n')
}

/**
 * O recado ao número que saiu da conta (trocado ou removido pela própria pessoa): o número pode já
 * ser de outra pessoa, então vai sem nome, sem quem fez, sem data e sem "sua conta" ou "sua senha". O
 * aviso completo vai só ao e-mail confirmado (lib/contas/servidor.ts, avisarTrocaDeWhatsapp).
 */
export const AVISO_AO_NUMERO_ANTIGO = {
  titulo: 'Avisos do Palácio Virtual',
  texto: 'Este número deixou de receber os avisos de uma conta do Palácio Virtual. Se não foi você que pediu, fale com a administração.',
} as const

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

/** O objeto `template` da Cloud API (POST /{phone_number_id}/messages com type "template"). */
export type ObjetoDoModelo = {
  name: string
  language: { code: string }
  components: ({ type: 'body'; parameters: ParametroDeTexto[] } | { type: 'button'; sub_type: 'url'; index: string; parameters: ParametroDeTexto[] })[]
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
 */
export function problemaDoModelo(p: { nome: string; codigo: number | null; status: number; mensagem: string | null }): string | null {
  const nome = p.nome.slice(0, 80)
  const qual = `o modelo “${nome}”`
  const Qual = `O modelo “${nome}”`
  if (ehErroDeModelo(p.codigo)) {
    const c = p.codigo as number
    const meta = ` (erro ${c} da Meta)`
    if (c === 132000) return `${Qual} espera outro número de variáveis${meta}. O dos avisos e o de segurança têm uma variável só, no corpo; o de código é da categoria Autenticação, com o botão de copiar.`
    if (c === 132001) return `${Qual} não existe na Kapso em português (pt_BR) ou ainda não foi aprovado pela Meta${meta}. Confira o nome em Configurações → Integrações.`
    if (c === 132005) return `O texto ficou longo demais para ${qual}${meta}.`
    if (c === 132007) return `A Meta recusou o texto em ${qual} pelas regras de formatação${meta}.`
    if (c === 132012) return `As variáveis não estão no formato que ${qual} espera${meta}. O de código precisa ser da categoria Autenticação, com o botão de copiar.`
    if (c === 132015) return `${Qual} foi pausado pela Meta por baixa qualidade${meta}. Veja no painel da Kapso; até lá, o que depende dele não sai fora da janela.`
    if (c === 132016) return `${Qual} foi desativado pela Meta${meta}. Aprove outro na Kapso e troque o nome em Configurações → Integrações.`
    if (c === 132068) return `O fluxo ligado a ${qual} está bloqueado na Meta${meta}.`
    if (c === 132069) return `O fluxo ligado a ${qual} está limitado pela Meta agora${meta}. Tente mais tarde.`
    return `A Meta recusou ${qual}${meta}. Confira o modelo no painel da Kapso.`
  }
  if ((p.status === 400 || p.status === 404 || p.status === 422) && /template|modelo/i.test(p.mensagem ?? '')) {
    return `A Kapso recusou ${qual}: ${String(p.mensagem).replace(/\s+/g, ' ').trim().slice(0, 160)}. Confira o nome em Configurações → Integrações e o modelo no painel da Kapso.`
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

/** Botões de resposta ou lista, no vocabulário do Palácio; objetoInterativo monta o objeto da Cloud API. */
export type Interativo =
  | { tipo: 'botoes'; botoes: BotaoDeResposta[] }
  | { tipo: 'lista'; botao: string; secoes: SecaoDaLista[] }

type LinhaDaMeta = { id: string; title: string; description?: string }

/** O objeto `interactive` da Cloud API (POST /{phone_number_id}/messages com type "interactive"). */
export type ObjetoInterativo =
  | { type: 'button'; body: { text: string }; action: { buttons: { type: 'reply'; reply: { id: string; title: string } }[] } }
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
 * entre os botões, mais de uma seção sem título. Aí sai só o texto, que diz o que digitar.
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
    return { type: 'button', body: { text: texto }, action: { buttons: botoes.map((reply) => ({ type: 'reply', reply })) } }
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
  /** Motivo para não responder; null = responder. */
  ignorar: 'de_mim' | 'grupo' | 'sem_numero' | null
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

/** Uma mensagem recebida no payload v2 da Kapso (`whatsapp.message.received`). */
function lerMensagemDaKapso(dado: unknown, idDoNumero: string | null): MensagemRecebida | null {
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
  }

  return {
    id: texto(m.id)?.slice(0, 128) ?? null,
    numero,
    texto: (textoDireto ?? legenda ?? '').slice(0, 4000),
    nome: texto(conversa?.contact_name)?.slice(0, 80) ?? null,
    citada: texto(objeto(m.context)?.id)?.slice(0, 128) ?? null,
    toque: !digitado && doToque !== null,
    midia,
    ignorar: deMim ? 'de_mim' : numero ? null : 'sem_numero',
  }
}

/**
 * Lê o corpo que a Kapso manda ao webhook (payload v2, avulso ou em lote).
 * O nome do evento vem no cabeçalho X-Webhook-Event. Nunca lança.
 */
export function lerEventoDaKapso(corpo: unknown, eventoDoCabecalho: string | null, idDoNumero: string | null): EventoDoWebhook {
  const c = objeto(corpo) ?? {}
  const evento = String(eventoDoCabecalho ?? c.type ?? c.event ?? '').trim().toLowerCase()
  const itens = c.batch === true && Array.isArray(c.data) ? c.data : [c]
  const recebida = evento === 'whatsapp.message.received'
  return {
    evento,
    mensagens: recebida ? itens.map((i) => lerMensagemDaKapso(i, idDoNumero)).filter((m): m is MensagemRecebida => m !== null) : [],
  }
}

// ------------------------------------------------------------------ bot

export type Comando =
  | 'menu' | 'avisos' | 'lidas' | 'parar' | 'voltar' | 'agenda' | 'chamados' | 'aprovacoes' | 'ajuda' | 'abrir_chamado'
  | 'atender_chamado' | 'portaria' | 'registrar_visita' | ComandoDaAdministracao | 'desconhecido'

/** Os comandos de quem administra o espaço (lib/whatsapp/admin.ts). */
export type ComandoDaAdministracao = 'status' | 'fila'

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

/**
 * Os da administração valem só como a mensagem inteira: "fila" ou "status" no meio de uma frase
 * ("a fila do chamado não anda") nunca roda nada. Nenhuma destas palavras é de outro comando.
 */
const DA_ADMINISTRACAO: Record<string, ComandoDaAdministracao> = {
  status: 'status', diagnostico: 'status', saude: 'status', 'status do whatsapp': 'status',
  fila: 'fila', 'fila agora': 'fila', 'enviar fila': 'fila',
}

/**
 * A lista das visitas abertas do dia (lib/whatsapp/portaria.ts): só como a mensagem inteira, como os da
 * administração — "a portaria ligou" numa frase não roda nada. Quem não tem a portaria cai no menu.
 */
const DA_PORTARIA = new Set(['portaria', 'quem esta aqui', 'quem ta aqui', 'quem esta na filial', 'quem chegou', 'visitas', 'visitantes', 'visitas de hoje', 'visitantes de hoje'])

/** Registrar quem chegou: "visitante: João Silva", "registrar visita". O nome é opcional (o bot pergunta); "visitantes" é a lista. */
const REGISTRAR_VISITA = /^\s*(?:registrar\s+(?:a\s+|uma\s+)?(?:visita|visitante|entrada)|nova\s+visita|novo\s+visitante|visitante)(?![\p{L}\d])[\s:,.;\-–—]*/iu

export type Pedido = { comando: Comando; resto: string }

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
 */
export function lerPedido(entrada: string, p: { pausado: boolean; admin?: boolean }): Pedido {
  const t = normalizar(entrada)
  if (!t) return { comando: 'desconhecido', resto: '' }
  if (t === '3') return { comando: p.pausado ? 'voltar' : 'parar', resto: '' }
  if (p.admin && DA_ADMINISTRACAO[t]) return { comando: DA_ADMINISTRACAO[t], resto: '' }
  const palavras = t.split(' ')
  // Comandos com complemento vêm antes: "ajuda como paro os avisos" é dúvida, não "avisos".
  if ((palavras[0] === 'ajuda' || palavras[0] === 'duvida') && palavras.length > 1) return { comando: 'ajuda', resto: depoisDe(entrada, /^\s*(ajuda|d[uú]vida)\b/i) }
  if (palavras[0] === 'como' && palavras.length > 2) return { comando: 'ajuda', resto: entrada.trim().slice(0, 1000) }
  // Quem atende: "assumir TI-0042", "resolver TI-0042: …", "transferir TI-0042 para …". Sem o código, não é comando
  // (respondendo ao aviso do chamado, o código vem do aviso: lib/whatsapp/atendimento.ts).
  if (lerAtendimento(entrada)?.codigo) return { comando: 'atender_chamado', resto: entrada.trim().slice(0, 4000) }
  if (DA_PORTARIA.has(t)) return { comando: 'portaria', resto: '' }
  const visita = REGISTRAR_VISITA.exec(entrada)
  if (visita) return { comando: 'registrar_visita', resto: entrada.slice(visita[0].length).replace(/\s+/g, ' ').trim().slice(0, 120) }
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

export const interpretarComando = (entrada: string, p: { pausado: boolean; admin?: boolean }): Comando => lerPedido(entrada, p).comando

/** Respostas do bot a cada ~10 min por número, no máximo: um robô do outro lado não vira enxurrada. */
export const RESPOSTAS_POR_JANELA = 10
export const JANELA_DAS_RESPOSTAS_MIN = 10
/** Número que não é de ninguém da equipe recebe a apresentação no máximo uma vez neste intervalo. */
export const APRESENTACAO_A_CADA_HORAS = 24

/** Uma opção do menu da equipe: o mesmo `id` (o que se digita) no texto (*1* – …) e na lista. */
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

const linhaDoMenu = (o: OpcaoDoMenu) => `*${o.id}* – ${o.texto}`

/** O que muda o menu de cada pessoa: quem administra (status e fila), quem tem a portaria e quem atende chamados. */
export type QuemNoMenu = { admin?: boolean; portaria?: boolean; atende?: boolean }

/**
 * `admin`: quem administra o espaço vê também a linha dos comandos dele (status e fila). `portaria`: a linha
 * de "portaria" e "visitante:". `atende`: o 5 diz que traz também a fila. O texto mais longo (pausado, com
 * tudo e o "Não entendi") ainda cabe no corpo de 1024 da lista.
 */
export function textoDoMenu(p: { nome: string | null; pausado: boolean; urlBase: string } & QuemNoMenu): string {
  const ola = p.nome ? `Olá, ${primeiroNome(p.nome)}!` : 'Olá!'
  return [
    `${ola} Aqui é o WhatsApp do *Palácio Virtual*, da Cruz Vermelha Brasileira – RJ.`,
    p.pausado ? '_Os avisos por aqui estão pausados._' : null,
    ['Responda com o número:', ...opcoesDoMenu(p.pausado, p.atende).map(linhaDoMenu)].join('\n'),
    ['Ou escreva:', '*chamado:* e o problema, para abrir um chamado', '*ajuda* e a sua dúvida sobre o Palácio (ex.: _ajuda como trocar a senha_)',
      p.portaria ? '*portaria* para as visitas de hoje e registrar quem chegou' : null,
      'E, para responder um aviso de chamado, do Chat ou de aprovação, responda a própria mensagem do aviso.'].filter(Boolean).join('\n'),
    p.admin ? ['Da administração:', ...OPCOES_DA_ADMINISTRACAO.map(linhaDoMenu)].join('\n') : null,
    `Tudo continua no sino do Palácio Virtual: ${p.urlBase}/notificacoes`,
  ].filter(Boolean).join('\n\n')
}

/**
 * O menu como lista (dentro da janela): as opções 1 a 6, "portaria" para quem tem a portaria e, para quem
 * administra, "status" e "fila" (no máximo 9 linhas). Cada linha leva o que se digita, então o toque segue
 * por lerPedido como o número digitado (o "3" continua alternando parar e voltar pelo estado da hora).
 * "chamado:", "ajuda" e "visitante:" pedem texto: ficam só no corpo.
 */
export function interativoDoMenu(p: { pausado: boolean } & QuemNoMenu): Interativo {
  const linha = (o: OpcaoDoMenu): LinhaDaLista => ({ id: o.id, titulo: o.titulo, descricao: `${o.texto.charAt(0).toUpperCase()}${o.texto.slice(1)}` })
  return {
    tipo: 'lista',
    botao: 'Ver as opções',
    secoes: [
      { titulo: 'Opções', linhas: [...opcoesDoMenu(p.pausado, p.atende), ...(p.portaria ? [OPCAO_DA_PORTARIA] : [])].map(linha) },
      ...(p.admin ? [{ titulo: 'Da administração', linhas: OPCOES_DA_ADMINISTRACAO.map(linha) }] : []),
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

/** O que um aviso aponta, pelo link dele: é para lá que vai a resposta que cita o aviso. */
export type AlvoDoAviso =
  | { tipo: 'chamado'; id: string }
  | { tipo: 'chat'; canalId: string; fio: string | null }
  | { tipo: 'aprovacao'; id: string }
  | { tipo: 'mensagem'; pessoaId: string }
  | { tipo: 'visita'; id: string }

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
  'Sua conta usa a verificação em duas etapas, então responder, votar, atender chamados, registrar visitas e mandar fotos ficam só no Palácio (o WhatsApp não pede o código do app). As consultas, a abertura de chamado e a resposta à portaria (1, 2 ou 3) por aqui continuam valendo.'

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
// abertas do dia — só o nome do visitante, para quem, a hora e a situação — e registra a chegada em etapas
// (lib/whatsapp/portaria.ts). Documento e foto ficam na tela.

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

/** A conferência antes de registrar a entrada: quem chegou, para quem (e se a pessoa é avisada) e o motivo. */
export function textoDaConferenciaDaVisita(p: { nome: string; pessoa: { nome: string; setor: string | null } | null; setor: string | null; motivo: string | null }): string {
  const para = p.pessoa
    ? `Para: *${limpo(p.pessoa.nome, 80)}*${p.pessoa.setor ? ` (${limpo(p.pessoa.setor, 60)})` : ''}, que recebe o aviso e responde se a visita pode subir.`
    : `Para: ${limpo(p.setor ?? '', 120) || 'ninguém'} (ninguém é avisado).`
  return [
    `Registrar a entrada de *${limpo(p.nome, 80)}*?`,
    [para, p.motivo ? `Motivo: ${limpo(p.motivo, 200)}` : null].filter(Boolean).join('\n'),
    'Foto e crachá de visitante, se precisar, ficam na tela da portaria.',
    `Se está certo, responda *esta mensagem* com *confirmo*. Para desistir, *cancelar*. Vale por ${PENDENCIA_VALE_MIN} minutos.`,
  ].join('\n\n')
}
