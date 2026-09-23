/**
 * Regras dos projetos no modelo do Asana: situação, progresso e a escala da
 * linha do tempo. Puras — datas sempre em "AAAA-MM-DD", comparadas como
 * texto ou convertidas ao meio-dia UTC para não escorregar de fuso.
 */

export const SITUACOES = {
  no_prazo: { rotulo: 'No prazo' },
  em_risco: { rotulo: 'Em risco' },
  atrasado: { rotulo: 'Atrasado' },
} as const

export type Situacao = keyof typeof SITUACOES
export type SituacaoNaTela = Situacao | 'concluido' | 'sem_atualizacao'

export const ehSituacao = (s: string): s is Situacao => Object.prototype.hasOwnProperty.call(SITUACOES, s)

const DIA = 86_400_000
export const paraDia = (iso: string) => Date.parse(`${iso}T12:00:00Z`)
export const deDia = (ms: number) => new Date(ms).toISOString().slice(0, 10)
export const diasEntre = (a: string, b: string) => Math.round((paraDia(b) - paraDia(a)) / DIA)
export const somarDias = (iso: string, n: number) => deDia(paraDia(iso) + n * DIA)

export function situacaoDoProjeto(p: { situacao: string | null; concluido: boolean }): SituacaoNaTela {
  if (p.concluido) return 'concluido'
  return p.situacao && ehSituacao(p.situacao) ? p.situacao : 'sem_atualizacao'
}

/** Prazo final passou e o projeto não foi concluído. */
export const passouDoPrazo = (fim: string | null, hoje: string, concluido: boolean) => Boolean(fim && !concluido && fim < hoje)

/** Pautas prontas sobre as do projeto (arquivadas não contam). */
export function progresso(statuses: string[]): { feitas: number; total: number; pct: number } {
  const validas = statuses.filter((s) => s !== 'archived')
  const feitas = validas.filter((s) => s === 'approved').length
  return { feitas, total: validas.length, pct: validas.length ? Math.round((feitas / validas.length) * 100) : 0 }
}

/** "hoje", "ontem", "há 3 dias", "há 2 semanas", "há 4 meses". */
export function haQuanto(iso: string | null, hoje: string): string {
  if (!iso) return '—'
  const d = diasEntre(iso.slice(0, 10), hoje)
  if (d <= 0) return 'hoje'
  if (d === 1) return 'ontem'
  if (d < 14) return `há ${d} dias`
  if (d < 60) return `há ${Math.floor(d / 7)} semanas`
  return `há ${Math.floor(d / 30)} meses`
}

/** Início e fim de uma pauta na linha do tempo; só uma data vira um dia. null = sem datas. */
export function periodoDaPauta(inicio: string | null, fim: string | null): { inicio: string; fim: string } | null {
  if (!inicio && !fim) return null
  const a = inicio ?? fim as string
  const b = fim ?? inicio as string
  return a <= b ? { inicio: a, fim: b } : { inicio: b, fim: a }
}

export type Escala = {
  inicio: string
  fim: string
  dias: number
  /** O mês e o ano de abertura, para o cabeçalho ("nov 2026"). */
  abertura: string
  /** Marcas do cabeçalho: dia a dia, por semana (segundas) ou por mês. */
  marcas: { data: string; rotulo: string }[]
}

const MESES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez']

/**
 * A janela da linha do tempo: cobre o projeto, as pautas e os marcos, com um
 * dia de folga de cada lado. A densidade das marcas acompanha o tamanho.
 */
export function escalaDoCronograma(datas: (string | null)[], hoje: string): Escala {
  const validas = datas.filter((d): d is string => Boolean(d)).sort()
  const inicio = somarDias(validas[0] ?? hoje, -1)
  let fim = somarDias(validas[validas.length - 1] ?? somarDias(hoje, 27), 1)
  if (diasEntre(inicio, fim) < 13) fim = somarDias(inicio, 13)
  const dias = diasEntre(inicio, fim) + 1

  const marcas: Escala['marcas'] = []
  for (let i = 0; i < dias; i++) {
    const data = somarDias(inicio, i)
    const dt = new Date(paraDia(data))
    const dia = dt.getUTCDate()
    if (dias <= 45) {
      // Só o dia 1 leva o mês: o mês de abertura vai no cabeçalho da coluna
      // de nomes, porque "2 nov" no primeiro dia encosta no "3" ao lado.
      marcas.push({ data, rotulo: dia === 1 ? `${dia} ${MESES[dt.getUTCMonth()]}` : String(dia) })
    } else if (dias <= 200) {
      if (dt.getUTCDay() === 1) marcas.push({ data, rotulo: `${dia} ${MESES[dt.getUTCMonth()]}` })
    } else if (dia === 1) {
      marcas.push({ data, rotulo: `${MESES[dt.getUTCMonth()]} ${dt.getUTCFullYear()}` })
    }
  }
  const primeiro = new Date(paraDia(inicio))
  return { inicio, fim, dias, marcas, abertura: `${MESES[primeiro.getUTCMonth()]} ${primeiro.getUTCFullYear()}` }
}

/** Posição em % (esquerda e largura) de um período dentro da escala. */
export function posicaoNaEscala(e: Escala, inicio: string, fim: string): { esquerda: number; largura: number } {
  const a = Math.max(0, diasEntre(e.inicio, inicio))
  const b = Math.min(e.dias - 1, diasEntre(e.inicio, fim))
  return { esquerda: (a / e.dias) * 100, largura: (Math.max(1, b - a + 1) / e.dias) * 100 }
}
