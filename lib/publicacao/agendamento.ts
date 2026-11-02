/**
 * Quando o pacote com página no site espera a fila em vez de sair na hora.
 *
 * Módulo puro (conferido com `npx tsx scripts/conferir-agendamento.ts`): a
 * server action decide por ele, e a rota do relógio usa a mesma régua para
 * saber que um horário já venceu.
 */

/**
 * Folga para "agora": horário a menos de 2 minutos sai na hora. Sem ela, quem
 * agenda para daqui a um minuto esperaria a volta do relógio (que roda de
 * minuto em minuto) e veria a página sair depois do horário que escolheu.
 */
export const FOLGA_DO_AGORA_MS = 2 * 60_000

/** O horário que vale para o destino: o dele, se tiver; senão, o do pacote. */
export function horarioEfetivo(doDestino: string | null | undefined, doPacote: string | null | undefined): string | null {
  return doDestino || doPacote || null
}

/** O horário está longe o bastante no futuro para ir à fila? */
export function vaiParaAFila(horario: string | null | undefined, agora: Date): boolean {
  if (!horario) return false
  const quando = new Date(horario).getTime()
  if (Number.isNaN(quando)) return false
  return quando - agora.getTime() > FOLGA_DO_AGORA_MS
}

/**
 * Na hora da fila, o horário do pacote já passou: repassá-lo ao conector ou
 * ao Resend como "agendar para" seria pedir um horário no passado. Vencido
 * vira "agora" (undefined); o que ainda está à frente — o Instagram às 12h de
 * um pacote que saiu às 9h — continua agendado.
 */
export function horarioAindaFuturo(horario: string | null | undefined, agora: Date): string | undefined {
  if (!horario) return undefined
  const quando = new Date(horario).getTime()
  if (Number.isNaN(quando) || quando <= agora.getTime() + FOLGA_DO_AGORA_MS) return undefined
  return horario
}

/** "04/11 às 09:00", no horário de Brasília. */
export function horarioParaLer(horario: string): string {
  const d = new Date(new Date(horario).getTime() - 3 * 60 * 60 * 1000)
  const dois = (n: number) => String(n).padStart(2, '0')
  return `${dois(d.getUTCDate())}/${dois(d.getUTCMonth() + 1)} às ${dois(d.getUTCHours())}:${dois(d.getUTCMinutes())}`
}
