/**
 * Datas da Agenda: aritmética de dias, feriados (calculados aqui, sem API
 * externa) e as ocorrências das datas comemorativas. Módulo puro — conferido
 * por scripts/conferir-agenda.ts.
 *
 * Todo dia é um texto 'AAAA-MM-DD' no fuso de Brasília; a conta usa Date em
 * UTC só como calculadora, para não depender do fuso da máquina.
 */

export const FUSO = 'America/Sao_Paulo'

const doisDigitos = (n: number) => String(n).padStart(2, '0')

export function dataParaDia(d: Date): string {
  return `${d.getUTCFullYear()}-${doisDigitos(d.getUTCMonth() + 1)}-${doisDigitos(d.getUTCDate())}`
}

export function diaParaData(dia: string): Date {
  const [a, m, d] = dia.split('-').map(Number)
  return new Date(Date.UTC(a, m - 1, d))
}

export const montarDia = (ano: number, mes: number, dia: number) => `${ano}-${doisDigitos(mes)}-${doisDigitos(dia)}`

export function somarDias(dia: string, n: number): string {
  const d = diaParaData(dia)
  d.setUTCDate(d.getUTCDate() + n)
  return dataParaDia(d)
}

export function diferencaEmDias(de: string, ate: string): number {
  return Math.round((diaParaData(ate).getTime() - diaParaData(de).getTime()) / 86_400_000)
}

/** 0 = domingo … 6 = sábado. */
export const diaDaSemana = (dia: string) => diaParaData(dia).getUTCDay()

export const ultimoDiaDoMes = (ano: number, mes: number) => new Date(Date.UTC(ano, mes, 0)).getUTCDate()

/** Segunda-feira da semana do dia (a agenda começa a semana no domingo, mas o resumo e os alertas contam de segunda). */
export function segundaDaSemana(dia: string): string {
  const dds = diaDaSemana(dia)
  return somarDias(dia, dds === 0 ? -6 : 1 - dds)
}

/** O dia e a hora de agora (ou de um instante) em Brasília. */
export function agoraEmBrasilia(instante: Date = new Date()): { dia: string; hora: string } {
  const partes = new Intl.DateTimeFormat('en-CA', {
    timeZone: FUSO, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).formatToParts(instante)
  const p = (t: string) => partes.find((x) => x.type === t)?.value ?? '00'
  return { dia: `${p('year')}-${p('month')}-${p('day')}`, hora: `${p('hour')}:${p('minute')}` }
}

/** Um timestamptz do banco vira dia e hora em Brasília. */
export function instanteParaDiaHora(iso: string): { dia: string; hora: string } {
  return agoraEmBrasilia(new Date(iso))
}

// ── Feriados ────────────────────────────────────────────────────────────────

/** Domingo de Páscoa (algoritmo de Meeus/Jones/Butcher, calendário gregoriano). */
export function pascoa(ano: number): string {
  const a = ano % 19
  const b = Math.floor(ano / 100)
  const c = ano % 100
  const d = Math.floor(b / 4)
  const e = b % 4
  const f = Math.floor((b + 8) / 25)
  const g = Math.floor((b - f + 1) / 3)
  const h = (19 * a + b - d - g + 15) % 30
  const i = Math.floor(c / 4)
  const k = c % 4
  const l = (32 + 2 * e + 2 * i - h - k) % 7
  const m = Math.floor((a + 11 * h + 22 * l) / 451)
  const mes = Math.floor((h + l - 7 * m + 114) / 31)
  const dia = ((h + l - 7 * m + 114) % 31) + 1
  return montarDia(ano, mes, dia)
}

export type Feriado = { dia: string; nome: string; tipo: 'nacional' | 'estadual' | 'municipal' | 'facultativo' }

/** Feriados nacionais, do estado e da cidade do Rio de Janeiro, e os pontos facultativos que mexem no expediente. */
export function feriados(ano: number): Feriado[] {
  const p = pascoa(ano)
  const lista: Feriado[] = [
    { dia: montarDia(ano, 1, 1), nome: 'Confraternização Universal', tipo: 'nacional' },
    { dia: montarDia(ano, 1, 20), nome: 'São Sebastião (cidade do Rio)', tipo: 'municipal' },
    { dia: somarDias(p, -48), nome: 'Carnaval', tipo: 'facultativo' },
    { dia: somarDias(p, -47), nome: 'Carnaval', tipo: 'facultativo' },
    { dia: somarDias(p, -2), nome: 'Sexta-feira Santa', tipo: 'nacional' },
    { dia: montarDia(ano, 4, 21), nome: 'Tiradentes', tipo: 'nacional' },
    { dia: montarDia(ano, 4, 23), nome: 'São Jorge (estado do RJ)', tipo: 'estadual' },
    { dia: montarDia(ano, 5, 1), nome: 'Dia do Trabalho', tipo: 'nacional' },
    { dia: somarDias(p, 60), nome: 'Corpus Christi', tipo: 'facultativo' },
    { dia: montarDia(ano, 9, 7), nome: 'Independência do Brasil', tipo: 'nacional' },
    { dia: montarDia(ano, 10, 12), nome: 'Nossa Senhora Aparecida', tipo: 'nacional' },
    { dia: montarDia(ano, 11, 2), nome: 'Finados', tipo: 'nacional' },
    { dia: montarDia(ano, 11, 15), nome: 'Proclamação da República', tipo: 'nacional' },
    { dia: montarDia(ano, 11, 20), nome: 'Dia Nacional de Zumbi e da Consciência Negra', tipo: 'nacional' },
    { dia: montarDia(ano, 12, 25), nome: 'Natal', tipo: 'nacional' },
  ]
  return lista.sort((a, b) => a.dia.localeCompare(b.dia))
}

/** Feriados entre dois dias (inclusive), atravessando anos. */
export function feriadosEntre(de: string, ate: string): Feriado[] {
  const anos: number[] = []
  for (let a = Number(de.slice(0, 4)); a <= Number(ate.slice(0, 4)); a++) anos.push(a)
  return anos.flatMap(feriados).filter((f) => f.dia >= de && f.dia <= ate)
}

// ── Datas comemorativas ─────────────────────────────────────────────────────

export type DataComemorativa = {
  id: string
  nome: string
  descricao: string | null
  categoria: string
  regra: 'fixa' | 'nesimo_dia_semana' | 'mes'
  mes: number
  dia: number | null
  semana: number | null
  dia_da_semana: number | null
  antecedencia_dias: number
  ativa: boolean
}

export const CATEGORIAS_DE_DATA: Record<string, string> = {
  cruz_vermelha: 'Cruz Vermelha',
  humanitaria: 'Humanitária',
  saude: 'Saúde',
  voluntariado: 'Voluntariado',
  institucional: 'Institucional',
}

/** O n-ésimo (1..5, ou -1 = último) dia da semana de um mês; null se não existe (ex.: 5º sábado). */
export function nesimoDiaDaSemana(ano: number, mes: number, semana: number, dds: number): string | null {
  if (semana === -1) {
    const ultimo = montarDia(ano, mes, ultimoDiaDoMes(ano, mes))
    const recuo = (diaDaSemana(ultimo) - dds + 7) % 7
    return somarDias(ultimo, -recuo)
  }
  const primeiro = montarDia(ano, mes, 1)
  const avanco = (dds - diaDaSemana(primeiro) + 7) % 7
  const dia = 1 + avanco + (semana - 1) * 7
  return dia <= ultimoDiaDoMes(ano, mes) ? montarDia(ano, mes, dia) : null
}

export type Ocorrencia = { data: DataComemorativa; ano: number; dia: string; ate: string | null }

/** Em que dia(s) a data cai num ano. Dia fixo inexistente (31/4, 29/2 fora do bissexto) cai no último dia do mês. */
export function ocorrenciaNoAno(data: DataComemorativa, ano: number): Ocorrencia | null {
  if (data.regra === 'mes') {
    return { data, ano, dia: montarDia(ano, data.mes, 1), ate: montarDia(ano, data.mes, ultimoDiaDoMes(ano, data.mes)) }
  }
  if (data.regra === 'nesimo_dia_semana') {
    if (data.semana == null || data.dia_da_semana == null) return null
    const dia = nesimoDiaDaSemana(ano, data.mes, data.semana, data.dia_da_semana)
    return dia ? { data, ano, dia, ate: null } : null
  }
  if (data.dia == null) return null
  return { data, ano, dia: montarDia(ano, data.mes, Math.min(data.dia, ultimoDiaDoMes(ano, data.mes))), ate: null }
}

/** As ocorrências que tocam a janela [de, ate] (um mês temático conta se qualquer dia dele cai na janela). */
export function ocorrenciasEntre(datas: DataComemorativa[], de: string, ate: string): Ocorrencia[] {
  const saida: Ocorrencia[] = []
  for (const data of datas) {
    if (!data.ativa) continue
    for (let a = Number(de.slice(0, 4)); a <= Number(ate.slice(0, 4)); a++) {
      const o = ocorrenciaNoAno(data, a)
      if (o && (o.ate ?? o.dia) >= de && o.dia <= ate) saida.push(o)
    }
  }
  return saida.sort((x, y) => x.dia.localeCompare(y.dia))
}

/** Descrição da regra em português, para a lista de datas comemorativas. */
export function descreverRegra(d: Pick<DataComemorativa, 'regra' | 'mes' | 'dia' | 'semana' | 'dia_da_semana'>): string {
  const mes = MESES[d.mes - 1]?.toLowerCase() ?? '?'
  if (d.regra === 'mes') return `O mês de ${mes} inteiro`
  if (d.regra === 'fixa') return `${d.dia} de ${mes}`
  const ordinal = d.semana === -1 ? 'Último' : `${d.semana}º`
  return `${ordinal} ${DIAS_DA_SEMANA[d.dia_da_semana ?? 0].toLowerCase()} de ${mes}`
}

export const MESES = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro']
export const DIAS_DA_SEMANA = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado']
export const DIAS_CURTOS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb']

/** "sáb., 12 de set." — rótulo curto de um dia. */
export function rotuloDoDia(dia: string): string {
  const d = diaParaData(dia)
  return `${DIAS_CURTOS[d.getUTCDay()].toLowerCase()}., ${d.getUTCDate()} de ${MESES[d.getUTCMonth()].slice(0, 3).toLowerCase()}.`
}
