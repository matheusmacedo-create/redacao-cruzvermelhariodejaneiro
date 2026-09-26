/**
 * As visões da Agenda (mês, semana, lista): qual janela cada uma mostra e para
 * onde vão "anterior" e "próximo". Módulo puro.
 */
import type { ItemDaAgenda } from './camadas'
import { MESES, diaDaSemana, montarDia, somarDias, ultimoDiaDoMes } from './datas'

export type Visao = 'mes' | 'semana' | 'lista'
export const VISOES: Record<Visao, string> = { mes: 'Mês', semana: 'Semana', lista: 'Lista' }
export const ehVisao = (v: unknown): v is Visao => typeof v === 'string' && v in VISOES

/** A lista mostra 30 dias a partir do dia escolhido. */
export const DIAS_DA_LISTA = 30

export type Janela = { de: string; ate: string; titulo: string; anterior: string; proximo: string }

const mesCurto = (dia: string) => MESES[Number(dia.slice(5, 7)) - 1].slice(0, 3).toLowerCase()

export function janelaDaVisao(visao: Visao, dia: string): Janela {
  const ano = Number(dia.slice(0, 4))
  const mes = Number(dia.slice(5, 7))
  if (visao === 'mes') {
    const primeiro = montarDia(ano, mes, 1)
    const ultimo = montarDia(ano, mes, ultimoDiaDoMes(ano, mes))
    return {
      de: somarDias(primeiro, -diaDaSemana(primeiro)),
      ate: somarDias(ultimo, 6 - diaDaSemana(ultimo)),
      titulo: `${MESES[mes - 1]} de ${ano}`,
      anterior: mes === 1 ? montarDia(ano - 1, 12, 1) : montarDia(ano, mes - 1, 1),
      proximo: mes === 12 ? montarDia(ano + 1, 1, 1) : montarDia(ano, mes + 1, 1),
    }
  }
  if (visao === 'semana') {
    const de = somarDias(dia, -diaDaSemana(dia))
    const ate = somarDias(de, 6)
    const titulo = de.slice(0, 7) === ate.slice(0, 7)
      ? `${Number(de.slice(8))} a ${Number(ate.slice(8))} de ${mesCurto(ate)}. de ${ate.slice(0, 4)}`
      : `${Number(de.slice(8))} de ${mesCurto(de)}. a ${Number(ate.slice(8))} de ${mesCurto(ate)}. de ${ate.slice(0, 4)}`
    return { de, ate, titulo, anterior: somarDias(de, -7), proximo: somarDias(de, 7) }
  }
  const ate = somarDias(dia, DIAS_DA_LISTA - 1)
  return {
    de: dia, ate,
    titulo: `${Number(dia.slice(8))} de ${mesCurto(dia)}. a ${Number(ate.slice(8))} de ${mesCurto(ate)}. de ${ate.slice(0, 4)}`,
    anterior: somarDias(dia, -DIAS_DA_LISTA), proximo: somarDias(dia, DIAS_DA_LISTA),
  }
}

/** Todos os dias entre de e ate (inclusive). */
export function diasEntre(de: string, ate: string): string[] {
  const dias: string[] = []
  for (let d = de; d <= ate; d = somarDias(d, 1)) dias.push(d)
  return dias
}

/** Um item longo (mês temático, campanha) mora na faixa do alto, não em cada dia. */
export const DIAS_PARA_FAIXA = 7
export function ehLongo(i: ItemDaAgenda): boolean {
  return Boolean(i.ate) && diasEntre(i.dia, i.ate!).length > DIAS_PARA_FAIXA
}

/** O item acontece neste dia? (itens de vários dias aparecem em todos eles) */
export const noDia = (i: ItemDaAgenda, dia: string) => i.dia === dia || (Boolean(i.ate) && i.dia <= dia && i.ate! >= dia)

/** O item toca a janela? */
export const naJanela = (i: ItemDaAgenda, de: string, ate: string) => i.dia <= ate && (i.ate ?? i.dia) >= de

/** A janela que a página carrega: a da visão e, se estiver perto, a dos alertas junto (uma leitura só). */
export function janelasParaCarregar(visao: { de: string; ate: string }, alertas: { de: string; ate: string }): { de: string; ate: string }[] {
  const perto = visao.de <= somarDias(alertas.ate, 31) && visao.ate >= somarDias(alertas.de, -31)
  if (perto) return [{ de: visao.de < alertas.de ? visao.de : alertas.de, ate: visao.ate > alertas.ate ? visao.ate : alertas.ate }]
  return [visao, alertas]
}
