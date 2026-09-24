/**
 * Contas da área do membro. Puro, para dar para testar.
 */

export type ResumoDeHoras = { total: number; noAno: number; noMes: number; acoesNoAno: number }

export function resumoDeHoras(atividades: { data: string; horas: number }[], hoje: string): ResumoDeHoras {
  const ano = hoje.slice(0, 4)
  const mes = hoje.slice(0, 7)
  const soma = (l: { horas: number }[]) => Math.round(l.reduce((s, a) => s + a.horas, 0) * 100) / 100
  const doAno = atividades.filter((a) => a.data.startsWith(ano))
  return { total: soma(atividades), noAno: soma(doAno), noMes: soma(atividades.filter((a) => a.data.startsWith(mes))), acoesNoAno: doAno.length }
}

/** "Bom dia" até 12h, "Boa tarde" até 18h, "Boa noite" depois (hora de São Paulo). */
export function saudacao(hora: number): string {
  return hora < 5 ? 'Boa noite' : hora < 12 ? 'Bom dia' : hora < 18 ? 'Boa tarde' : 'Boa noite'
}

export const primeiroNome = (nome: string) => nome.trim().split(/\s+/)[0] || nome

export const horasLegiveis = (h: number) => `${h.toLocaleString('pt-BR', { maximumFractionDigits: 2 })} h`

/** Mês e ano por extenso: "setembro de 2026". */
export const mesEAno = (iso: string) => new Date(iso).toLocaleDateString('pt-BR', { month: 'long', year: 'numeric', timeZone: 'America/Sao_Paulo' })
