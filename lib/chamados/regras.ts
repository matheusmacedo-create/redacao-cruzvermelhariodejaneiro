/**
 * Chamados — as regras, sem banco (docs/CHAMADOS.md explica de onde veio cada
 * uma). Módulo puro: a tela usa para mostrar só o botão que vale, a action usa
 * para recusar de verdade, e um script avulso confere tudo.
 */

// ------------------------------------------------------------------ status

export const STATUS = ['novo', 'em_atendimento', 'aguardando_solicitante', 'aguardando_terceiro', 'resolvido', 'fechado', 'cancelado'] as const
export type Status = (typeof STATUS)[number]
export const ehStatus = (v: unknown): v is Status => typeof v === 'string' && (STATUS as readonly string[]).includes(v)

export const ROTULO_DO_STATUS: Record<Status, string> = {
  novo: 'Novo',
  em_atendimento: 'Em atendimento',
  aguardando_solicitante: 'Aguardando você',
  aguardando_terceiro: 'Aguardando terceiro',
  resolvido: 'Resolvido',
  fechado: 'Fechado',
  cancelado: 'Cancelado',
}

/** Como a EQUIPE lê o status (o "Aguardando você" é do ponto de vista de quem abriu). */
export const ROTULO_DO_STATUS_PARA_EQUIPE: Record<Status, string> = { ...ROTULO_DO_STATUS, aguardando_solicitante: 'Aguardando solicitante' }

/** Ainda exige trabalho de alguém. */
export const ABERTOS: readonly Status[] = ['novo', 'em_atendimento', 'aguardando_solicitante', 'aguardando_terceiro']
/** Relógio parado: a espera não é da equipe (JSM "Waiting for customer"). */
export const PAUSADOS: readonly Status[] = ['aguardando_solicitante', 'aguardando_terceiro']
export const ENCERRADOS: readonly Status[] = ['fechado', 'cancelado']

export const DIAS_PARA_FECHAR = 5
export const DIAS_PARA_REABRIR = 5

export type Quem = 'equipe' | 'solicitante'

/**
 * Transições permitidas. Quem é equipe E solicitante (abriu chamado na
 * própria fila) pode o que cada papel pode.
 */
const TRANSICOES: Record<Quem, Partial<Record<Status, readonly Status[]>>> = {
  equipe: {
    novo: ['em_atendimento', 'aguardando_solicitante', 'aguardando_terceiro', 'resolvido', 'cancelado'],
    em_atendimento: ['aguardando_solicitante', 'aguardando_terceiro', 'resolvido', 'cancelado'],
    aguardando_solicitante: ['em_atendimento', 'aguardando_terceiro', 'resolvido', 'cancelado'],
    aguardando_terceiro: ['em_atendimento', 'aguardando_solicitante', 'resolvido', 'cancelado'],
    resolvido: ['em_atendimento'],
  },
  solicitante: {
    novo: ['cancelado'],
    em_atendimento: ['cancelado'],
    aguardando_solicitante: ['em_atendimento', 'cancelado'],
    aguardando_terceiro: ['cancelado'],
    resolvido: ['fechado', 'em_atendimento'],
  },
}

export function podeMudar(de: Status, para: Status, papeis: readonly Quem[]): boolean {
  return papeis.some((p) => (TRANSICOES[p][de] ?? []).includes(para))
}

export const proximosStatus = (de: Status, papeis: readonly Quem[]): Status[] =>
  STATUS.filter((s) => podeMudar(de, s, papeis))

/** Reabrir vale só por alguns dias depois de resolvido. */
export function podeReabrir(resolvidoEm: Date | null, agora = new Date()): boolean {
  if (!resolvidoEm) return false
  return agora.getTime() - resolvidoEm.getTime() <= DIAS_PARA_REABRIR * 86_400_000
}

// ------------------------------------------------------------------ prioridade (GLPI)

export const URGENCIA: Record<1 | 2 | 3, { rotulo: string; ajuda: string }> = {
  1: { rotulo: 'Consigo esperar', ajuda: 'Incomoda, mas dá para continuar trabalhando.' },
  2: { rotulo: 'Atrapalha meu trabalho', ajuda: 'Consigo fazer parte do trabalho, com dificuldade.' },
  3: { rotulo: 'Parou tudo', ajuda: 'Não consigo trabalhar, ou há risco à segurança.' },
}

export const IMPACTO: Record<1 | 2 | 3, { rotulo: string }> = {
  1: { rotulo: 'Uma pessoa' },
  2: { rotulo: 'Um setor inteiro' },
  3: { rotulo: 'A filial toda' },
}

export const PRIORIDADES = ['baixa', 'media', 'alta', 'critica'] as const
export type Prioridade = (typeof PRIORIDADES)[number]

export const ROTULO_DA_PRIORIDADE: Record<Prioridade, string> = { baixa: 'Baixa', media: 'Média', alta: 'Alta', critica: 'Crítica' }

export const ehNivel = (v: unknown): v is 1 | 2 | 3 => v === 1 || v === 2 || v === 3

/**
 * Matriz urgência × impacto (3×3), no espírito da do GLPI:
 *
 *              urgência 1   2       3
 *   impacto 1  Baixa        Baixa   Média
 *   impacto 2  Baixa        Média   Alta
 *   impacto 3  Média        Alta    Crítica
 */
export function prioridade(urgencia: 1 | 2 | 3, impacto: 1 | 2 | 3): Prioridade {
  const soma = urgencia + impacto
  return soma <= 3 ? 'baixa' : soma === 4 ? 'media' : soma === 5 ? 'alta' : 'critica'
}

// ------------------------------------------------------------------ SLA

/** Horas de atendimento por prioridade: primeira resposta e solução. */
export type Sla = Record<Prioridade, { resposta: number; solucao: number }>

export const SLA_PADRAO: Sla = {
  critica: { resposta: 1, solucao: 4 },
  alta: { resposta: 2, solucao: 8 },
  media: { resposta: 4, solucao: 24 },
  baixa: { resposta: 8, solucao: 40 },
}

/** Aceita o que veio do banco e completa o que faltar com o padrão. */
export function slaDaFila(bruto: unknown): Sla {
  const sla = { ...SLA_PADRAO }
  if (bruto && typeof bruto === 'object') {
    for (const p of PRIORIDADES) {
      const v = (bruto as Record<string, { resposta?: unknown; solucao?: unknown }>)[p]
      const r = Number(v?.resposta), s = Number(v?.solucao)
      if (r > 0 && s > 0 && r <= s && s <= 2000) sla[p] = { resposta: r, solucao: s }
    }
  }
  return sla
}

/**
 * Expediente: segunda a sexta, 8h às 18h, horário de Brasília. Brasília não
 * tem horário de verão desde 2019, então UTC−3 fixo é exato — e evita
 * depender do fuso instalado no servidor.
 */
const DESLOCAMENTO_MS = -3 * 3_600_000
const INICIO_H = 8
const FIM_H = 18
const MIN = 60_000

/** Minutos de relógio local (UTC−3) desde a meia-noite, e o dia da semana. */
function local(t: number) {
  const d = new Date(t + DESLOCAMENTO_MS)
  return { dia: d.getUTCDay(), minutos: d.getUTCHours() * 60 + d.getUTCMinutes() + d.getUTCSeconds() / 60, meiaNoite: t - (d.getUTCHours() * 60 + d.getUTCMinutes()) * MIN - d.getUTCSeconds() * 1000 - d.getUTCMilliseconds() }
}

const diaUtil = (dia: number) => dia >= 1 && dia <= 5

/** Leva um instante para o próximo momento dentro do expediente. */
function paraExpediente(t: number): number {
  for (let i = 0; i < 10; i++) {
    const l = local(t)
    if (!diaUtil(l.dia) || l.minutos >= FIM_H * 60) { t = l.meiaNoite + 24 * 60 * MIN + INICIO_H * 60 * MIN; continue }
    if (l.minutos < INICIO_H * 60) return l.meiaNoite + INICIO_H * 60 * MIN
    return t
  }
  return t
}

/** Soma minutos de atendimento a um instante. */
export function somarMinutosUteis(inicio: Date, minutos: number, vinteQuatroHoras = false): Date {
  if (vinteQuatroHoras) return new Date(inicio.getTime() + minutos * MIN)
  let t = paraExpediente(inicio.getTime())
  let resto = minutos
  for (let guarda = 0; resto > 0 && guarda < 5000; guarda++) {
    const l = local(t)
    const fimDoDia = l.meiaNoite + FIM_H * 60 * MIN
    const disponivel = (fimDoDia - t) / MIN
    if (resto <= disponivel) return new Date(t + resto * MIN)
    resto -= disponivel
    t = paraExpediente(fimDoDia)
  }
  return new Date(t)
}

/** Minutos de atendimento entre dois instantes (0 se b ≤ a). */
export function minutosUteisEntre(a: Date, b: Date, vinteQuatroHoras = false): number {
  if (b <= a) return 0
  if (vinteQuatroHoras) return (b.getTime() - a.getTime()) / MIN
  let t = paraExpediente(a.getTime())
  const fim = b.getTime()
  let total = 0
  for (let guarda = 0; t < fim && guarda < 5000; guarda++) {
    const l = local(t)
    const fimDoDia = l.meiaNoite + FIM_H * 60 * MIN
    total += (Math.min(fimDoDia, fim) - t) / MIN
    t = paraExpediente(fimDoDia)
  }
  return Math.max(0, total)
}

/**
 * Prazos = abertura + SLA da prioridade + tempo parado em "aguardando".
 * Sempre recalculados do zero: mudar a prioridade não perde as pausas.
 */
export function prazos(abertura: Date, p: Prioridade, sla: Sla, vinteQuatroHoras = false, minutosPausados = 0) {
  return {
    resposta: somarMinutosUteis(abertura, sla[p].resposta * 60 + minutosPausados, vinteQuatroHoras),
    solucao: somarMinutosUteis(abertura, sla[p].solucao * 60 + minutosPausados, vinteQuatroHoras),
  }
}

export type EstadoDoRelogio = {
  status: Status
  pausadoDesde: Date | null
  minutosPausados: number
  respondidoEm: Date | null
  resolvidoEm: Date | null
  reaberturas: number
}

/**
 * O que muda no chamado ao trocar de status — a parte do relógio.
 *
 * - Entrar em "aguardando" congela o relógio (pausadoDesde).
 * - Sair dele soma o tempo útil parado em minutosPausados (e os prazos
 *   andam junto, via prazos()).
 * - Resolver marca resolvidoEm; se a equipe resolveu sem nunca ter
 *   respondido, a resolução conta como a primeira resposta.
 * - Voltar de "resolvido" é reabertura.
 * `porEquipe` diz se quem mudou é da equipe: só ela "responde".
 */
export function efeitosDaMudanca(atual: EstadoDoRelogio, para: Status, agora: Date, opcoes: { porEquipe: boolean; vinteQuatroHoras?: boolean }) {
  const fica: Partial<{ status: Status; pausadoDesde: Date | null; minutosPausados: number; respondidoEm: Date; resolvidoEm: Date | null; fechadoEm: Date | null; reaberturas: number }> = { status: para }
  const estavaPausado = PAUSADOS.includes(atual.status) && atual.pausadoDesde
  const vaiPausar = PAUSADOS.includes(para)

  if (estavaPausado && !vaiPausar) {
    fica.minutosPausados = atual.minutosPausados + Math.round(minutosUteisEntre(atual.pausadoDesde!, agora, opcoes.vinteQuatroHoras))
    fica.pausadoDesde = null
  } else if (!estavaPausado && vaiPausar) {
    fica.pausadoDesde = agora
  }

  if (opcoes.porEquipe && !atual.respondidoEm) fica.respondidoEm = agora

  if (para === 'resolvido') fica.resolvidoEm = agora
  if (atual.status === 'resolvido' && para !== 'fechado') {
    fica.resolvidoEm = null
    fica.reaberturas = atual.reaberturas + 1
  }
  if (para === 'fechado' || para === 'cancelado') fica.fechadoEm = agora
  return fica
}

export type SituacaoDoPrazo = 'cumprido' | 'estourado' | 'em_risco' | 'no_prazo' | 'pausado'

/**
 * Como está um prazo agora. "Em risco" = menos de 25% do tempo total
 * restando. Concluído (respondido/resolvido) compara a data de conclusão.
 */
export function situacaoDoPrazo(p: { inicio: Date; prazo: Date | null; concluidoEm: Date | null; pausado: boolean; agora?: Date; vinteQuatroHoras?: boolean }): SituacaoDoPrazo | null {
  if (!p.prazo) return null
  if (p.concluidoEm) return p.concluidoEm <= p.prazo ? 'cumprido' : 'estourado'
  const agora = p.agora ?? new Date()
  if (agora > p.prazo) return 'estourado'
  if (p.pausado) return 'pausado'
  const total = minutosUteisEntre(p.inicio, p.prazo, p.vinteQuatroHoras)
  const resta = minutosUteisEntre(agora, p.prazo, p.vinteQuatroHoras)
  return total > 0 && resta / total < 0.25 ? 'em_risco' : 'no_prazo'
}

// ------------------------------------------------------------------ formatação

export const codigoDoChamado = (prefixo: string, numero: number) => `${prefixo}-${String(numero).padStart(4, '0')}`

/** "TI-0042" → { prefixo: 'TI', numero: 42 }. */
export function lerCodigo(codigo: string): { prefixo: string; numero: number } | null {
  const m = /^([A-Z]{2,6})-(\d{1,7})$/.exec(codigo.trim().toUpperCase())
  return m ? { prefixo: m[1], numero: Number(m[2]) } : null
}

/** "2h 15min", "3 dias úteis"… para prazos e médias. */
export function duracao(minutos: number): string {
  if (!Number.isFinite(minutos) || minutos < 0) return '—'
  if (minutos < 60) return `${Math.round(minutos)} min`
  const h = Math.floor(minutos / 60), m = Math.round(minutos % 60)
  if (h < 10) return m ? `${h}h ${m}min` : `${h}h`
  const dias = minutos / (60 * (FIM_H - INICIO_H))
  return dias < 1.5 ? `${h}h` : `${dias.toFixed(1).replace('.', ',')} dias úteis`
}
