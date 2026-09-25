import { mesmoSetor, perfilDoSetor } from './setores'

/**
 * A fila de Aprovações: em que aba cada rodada aparece, se está atrasada e
 * em que ordem. Módulo puro, conferido com script (npx tsx).
 *
 * Como nas ferramentas de revisão comparadas (docs/APROVACOES.md), a tela
 * abre no que depende de mim — "Esperando meu voto" — e não na lista inteira.
 */

export type Decisao = 'pending' | 'approved' | 'changes_requested'
export type ItemDaFila = {
  id: string
  status: string
  criadaEm: string
  pedidaPor: string | null
  /** Setor da pauta (texto livre, como está no banco). */
  setor: string | null
  votos: { userId: string; decisao: string }[]
}

export const ABAS = [
  { id: 'minhas', rotulo: 'Esperando meu voto' },
  { id: 'setor', rotulo: 'Do meu setor' },
  { id: 'pedidas', rotulo: 'Pedidas por mim' },
  { id: 'todas', rotulo: 'Todas' },
] as const
export type Aba = (typeof ABAS)[number]['id']
export const ehAba = (v: unknown): v is Aba => ABAS.some((a) => a.id === v)

export const SITUACOES = [
  { id: 'pending', rotulo: 'Em aberto' },
  { id: 'changes_requested', rotulo: 'Com ajustes' },
  { id: 'approved', rotulo: 'Aprovadas' },
  { id: 'all', rotulo: 'Qualquer situação' },
] as const
export type Situacao = (typeof SITUACOES)[number]['id']
export const ehSituacao = (v: unknown): v is Situacao => SITUACOES.some((s) => s.id === v)

export function meuVoto(item: ItemDaFila, eu: string): string | null {
  return item.votos.find((v) => v.userId === eu)?.decisao ?? null
}

export function esperaMeuVoto(item: ItemDaFila, eu: string): boolean {
  return item.status === 'pending' && meuVoto(item, eu) === 'pending'
}

export function naAba(item: ItemDaFila, aba: Aba, eu: string, meuSetor: string | null): boolean {
  if (aba === 'minhas') return esperaMeuVoto(item, eu)
  if (aba === 'setor') return mesmoSetor(item.setor, meuSetor)
  if (aba === 'pedidas') return item.pedidaPor === eu
  return true
}

export function naSituacao(item: ItemDaFila, situacao: Situacao): boolean {
  return situacao === 'all' || item.status === situacao
}

const HORA = 3_600_000

/** Há quanto tempo a rodada espera, e se passou do prazo do setor (só conta enquanto está em aberto). */
export function prazoDaRodada(item: Pick<ItemDaFila, 'status' | 'criadaEm' | 'setor'>, agora: number) {
  const horas = Math.max(0, (agora - Date.parse(item.criadaEm)) / HORA)
  const prazoHoras = perfilDoSetor(item.setor).prazoHoras
  const aberta = item.status === 'pending'
  return { horas, prazoHoras, atrasada: aberta && horas > prazoHoras, venceEmHoras: aberta ? prazoHoras - horas : null }
}

/** "agora", "há 5 h", "há 3 dias". */
export function haQuanto(horas: number): string {
  if (horas < 1) return 'agora há pouco'
  if (horas < 24) return `há ${Math.floor(horas)} h`
  const dias = Math.floor(horas / 24)
  return `há ${dias} dia${dias === 1 ? '' : 's'}`
}

/** "vence em 3 h", "vence em 2 dias", "atrasada 1 dia". */
export function rotuloDoPrazo(p: ReturnType<typeof prazoDaRodada>): string | null {
  if (p.venceEmHoras === null) return null
  const h = Math.abs(p.venceEmHoras)
  const quanto = h < 24 ? `${Math.max(1, Math.round(h))} h` : `${Math.round(h / 24)} dia${Math.round(h / 24) === 1 ? '' : 's'}`
  return p.venceEmHoras < 0 ? `atrasada ${quanto}` : `vence em ${quanto}`
}

/** Em aberto primeiro; entre elas, as atrasadas e as mais antigas; depois as encerradas, das mais novas. */
export function ordenar<T extends ItemDaFila>(itens: T[], agora: number): T[] {
  return [...itens].sort((a, b) => {
    const pa = prazoDaRodada(a, agora), pb = prazoDaRodada(b, agora)
    const abertaA = a.status === 'pending' ? 0 : 1, abertaB = b.status === 'pending' ? 0 : 1
    if (abertaA !== abertaB) return abertaA - abertaB
    if (abertaA === 0) {
      if (pa.atrasada !== pb.atrasada) return pa.atrasada ? -1 : 1
      return (pa.venceEmHoras ?? 0) - (pb.venceEmHoras ?? 0)
    }
    return Date.parse(b.criadaEm) - Date.parse(a.criadaEm)
  })
}

/** Números do topo, sempre sobre a lista inteira (não sobre o filtro aberto). */
export function contagens(itens: ItemDaFila[], eu: string, meuSetor: string | null, agora: number) {
  return {
    minhas: itens.filter((i) => esperaMeuVoto(i, eu)).length,
    atrasadas: itens.filter((i) => prazoDaRodada(i, agora).atrasada).length,
    setor: meuSetor ? itens.filter((i) => i.status === 'pending' && mesmoSetor(i.setor, meuSetor)).length : 0,
    abertas: itens.filter((i) => i.status === 'pending').length,
  }
}
