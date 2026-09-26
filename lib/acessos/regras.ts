/**
 * As regras do registro de acessos (docs/registro-de-acessos.md §5 e §6):
 * bloqueio por tentativas erradas, sinais de risco e a leitura dos sinais que
 * o navegador manda. Módulo puro, conferido com `npx tsx`.
 */

/** 5 senhas erradas em 15 minutos na mesma conta bloqueiam novas tentativas. */
export const LIMITE_POR_CONTA = 5
/** Do mesmo IP, contando todas as contas: quem testa senha em várias contas. */
export const LIMITE_POR_IP = 20
export const JANELA_MIN = 15

export type Bloqueio = { bloqueado: false } | { bloqueado: true; liberaEm: Date; minutos: number }

/**
 * Janela deslizante: bloqueia enquanto houver `limite` falhas nos últimos 15
 * minutos. Libera quando a mais antiga dessas `limite` sai da janela — em até
 * 15 minutos depois da última tentativa.
 */
export function situacaoDoBloqueio(falhas: (string | Date)[], agora: Date, limite = LIMITE_POR_CONTA): Bloqueio {
  const desde = agora.getTime() - JANELA_MIN * 60_000
  const recentes = falhas.map((f) => new Date(f).getTime()).filter((t) => Number.isFinite(t) && t > desde).sort((a, b) => b - a)
  if (recentes.length < limite) return { bloqueado: false }
  const liberaEm = new Date(recentes[limite - 1] + JANELA_MIN * 60_000)
  return { bloqueado: true, liberaEm, minutos: Math.max(1, Math.ceil((liberaEm.getTime() - agora.getTime()) / 60_000)) }
}

export const mensagemDeBloqueio = (b: Extract<Bloqueio, { bloqueado: true }>) =>
  `Muitas tentativas erradas. Por segurança, espere ${b.minutos} minuto${b.minutos === 1 ? '' : 's'} e tente de novo — ou use “Esqueci minha senha”.`

export type SinalDeRisco = 'aparelho_novo' | 'pais_novo' | 'muitas_falhas' | 'fuso_divergente' | 'primeiro_registro'

export const ROTULO_DO_SINAL: Record<SinalDeRisco, string> = {
  aparelho_novo: 'Aparelho novo',
  pais_novo: 'País novo',
  muitas_falhas: 'Muitas tentativas',
  fuso_divergente: 'Fuso diferente do IP',
  primeiro_registro: 'Primeiro registro',
}

/** Diferença de fuso horário (em horas) entre dois nomes IANA, agora. */
export function diferencaDeFuso(a: string, b: string, agora = new Date()): number | null {
  const deslocamento = (fuso: string) => {
    try {
      const partes = Object.fromEntries(new Intl.DateTimeFormat('en-US', {
        timeZone: fuso, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit',
      }).formatToParts(agora).map((p) => [p.type, p.value]))
      const local = Date.UTC(+partes.year, +partes.month - 1, +partes.day, +partes.hour, +partes.minute)
      return (local - Math.floor(agora.getTime() / 60_000) * 60_000) / 3_600_000
    } catch { return null }
  }
  const x = deslocamento(a)
  const y = deslocamento(b)
  return x === null || y === null ? null : Math.abs(x - y)
}

/**
 * Os sinais de uma entrada certa. Sem nenhum registro anterior da conta, a
 * entrada é só a primeira do registro: nada de "aparelho novo" nem "país
 * novo", senão todo mundo receberia alerta no dia em que isto entrou no ar.
 */
export function sinaisDaEntrada(e: {
  temHistorico: boolean
  aparelhoConhecido: boolean | null
  paisesConhecidos: string[]
  pais: string | null
  fusoDoNavegador: string | null
  fusoDoIp: string | null
  falhasAntes: number
}): SinalDeRisco[] {
  const sinais: SinalDeRisco[] = []
  if (!e.temHistorico) sinais.push('primeiro_registro')
  else {
    if (e.aparelhoConhecido === false) sinais.push('aparelho_novo')
    if (e.pais && !e.paisesConhecidos.includes(e.pais)) sinais.push('pais_novo')
  }
  if (e.falhasAntes >= 3) sinais.push('muitas_falhas')
  if (e.fusoDoNavegador && e.fusoDoIp) {
    const d = diferencaDeFuso(e.fusoDoNavegador, e.fusoDoIp)
    if (d !== null && d >= 2) sinais.push('fuso_divergente')
  }
  return sinais
}

// ------------------------------------------------------------ sinais do navegador

/** O que o coletor do navegador manda (components/auth/impressao.ts). */
export type SinaisDoNavegador = {
  fuso: string | null
  idiomas: string[]
  tela: string | null
  densidade: number | null
  cores: number | null
  nucleos: number | null
  memoria: number | null
  toque: number | null
  plataforma: string | null
  gpu: string | null
  fontes: number | null
  /** Hash de cada componente do fingerprint invasivo, para comparar peça por peça. */
  componentes: Record<string, string>
  /** SHA-256 dos sinais estáveis (nível 2). */
  assinatura: string | null
  /** SHA-256 de tudo, inclusive canvas, WebGL, áudio e fontes (nível 3). */
  impressao: string | null
}

const HEX64 = /^[0-9a-f]{64}$/
const texto = (v: unknown, max: number) => (typeof v === 'string' && v.trim() ? v.trim().slice(0, max) : null)
const inteiro = (v: unknown, max: number) => (typeof v === 'number' && Number.isFinite(v) && v >= 0 && v <= max ? Math.round(v * 100) / 100 : null)
const hash = (v: unknown) => (typeof v === 'string' && HEX64.test(v) ? v : null)

/**
 * Lê o JSON que veio do navegador. Tudo pode ter sido forjado: só passa o que
 * tem o formato esperado, com tamanho limitado. Nada daqui decide acesso —
 * serve para reconhecer o aparelho e para investigar depois.
 */
export function lerSinais(bruto: unknown): SinaisDoNavegador | null {
  let j: Record<string, unknown>
  try {
    j = (typeof bruto === 'string' ? JSON.parse(bruto) : bruto) as Record<string, unknown>
  } catch { return null }
  if (!j || typeof j !== 'object' || Array.isArray(j)) return null
  const componentes: Record<string, string> = {}
  if (j.componentes && typeof j.componentes === 'object' && !Array.isArray(j.componentes)) {
    for (const [k, v] of Object.entries(j.componentes as Record<string, unknown>).slice(0, 12)) {
      const h = hash(v)
      if (h && /^[a-z]{2,16}$/.test(k)) componentes[k] = h
    }
  }
  return {
    fuso: texto(j.fuso, 64),
    idiomas: Array.isArray(j.idiomas) ? j.idiomas.filter((i): i is string => typeof i === 'string').slice(0, 8).map((i) => i.slice(0, 20)) : [],
    tela: texto(j.tela, 40),
    densidade: inteiro(j.densidade, 10),
    cores: inteiro(j.cores, 64),
    nucleos: inteiro(j.nucleos, 1024),
    memoria: inteiro(j.memoria, 1024),
    toque: inteiro(j.toque, 64),
    plataforma: texto(j.plataforma, 40),
    gpu: texto(j.gpu, 160),
    fontes: inteiro(j.fontes, 500),
    componentes,
    assinatura: hash(j.assinatura),
    impressao: hash(j.impressao),
  }
}

// ------------------------------------------------------------ apresentação

export const EVENTOS = ['entrada', 'entrada_falhou', 'entrada_bloqueada', 'mfa_ok', 'mfa_falhou', 'codigo_pedido', 'saida'] as const
export type EventoDeAcesso = (typeof EVENTOS)[number]

export const ROTULO_DO_EVENTO: Record<EventoDeAcesso, { nome: string; tom: 'ok' | 'falha' | 'neutro' }> = {
  entrada: { nome: 'Entrou', tom: 'ok' },
  entrada_falhou: { nome: 'Tentativa errada', tom: 'falha' },
  entrada_bloqueada: { nome: 'Bloqueado', tom: 'falha' },
  mfa_ok: { nome: 'Confirmou o código (2 etapas)', tom: 'ok' },
  mfa_falhou: { nome: 'Código errado (2 etapas)', tom: 'falha' },
  codigo_pedido: { nome: 'Pediu código por e-mail', tom: 'neutro' },
  saida: { nome: 'Saiu', tom: 'neutro' },
}

/** Os grupos do filtro "o que aconteceu". */
export const FILTROS_DE_EVENTO: Record<string, { rotulo: string; eventos: EventoDeAcesso[] }> = {
  todos: { rotulo: 'Tudo', eventos: [...EVENTOS] },
  entradas: { rotulo: 'Entradas', eventos: ['entrada'] },
  falhas: { rotulo: 'Erros e bloqueios', eventos: ['entrada_falhou', 'entrada_bloqueada', 'mfa_falhou'] },
  verificacao: { rotulo: 'Verificação em 2 etapas', eventos: ['mfa_ok', 'mfa_falhou'] },
  saidas: { rotulo: 'Saídas', eventos: ['saida'] },
  codigos: { rotulo: 'Códigos pedidos (voluntários)', eventos: ['codigo_pedido'] },
}

export const PERIODOS: Record<string, { rotulo: string; dias: number | null }> = {
  '1': { rotulo: 'Últimas 24 horas', dias: 1 },
  '7': { rotulo: 'Últimos 7 dias', dias: 7 },
  '30': { rotulo: 'Últimos 30 dias', dias: 30 },
  '90': { rotulo: 'Últimos 90 dias', dias: 90 },
  tudo: { rotulo: 'Desde o começo', dias: null },
}
