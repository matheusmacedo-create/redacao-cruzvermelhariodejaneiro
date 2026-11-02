/**
 * Confere a régua da publicação agendada (lib/publicacao/agendamento.ts).
 *
 *   npx tsx scripts/conferir-agendamento.ts
 */
import { horarioAindaFuturo, horarioEfetivo, horarioParaLer, vaiParaAFila } from '../lib/publicacao/agendamento'

let falhas = 0
const conferir = (nome: string, ok: boolean, detalhe?: unknown) => {
  if (!ok) { falhas++; console.log(`FALHA: ${nome}`, detalhe ?? '') } else console.log(`ok: ${nome}`)
}

const agora = new Date('2026-11-04T11:00:00Z') // 08:00 em Brasília

conferir('destino com horário próprio manda', horarioEfetivo('2026-11-04T15:00:00Z', '2026-11-04T12:00:00Z') === '2026-11-04T15:00:00Z')
conferir('sem horário no destino, vale o do pacote', horarioEfetivo(null, '2026-11-04T12:00:00Z') === '2026-11-04T12:00:00Z')
conferir('sem horário nenhum', horarioEfetivo(undefined, null) === null)

conferir('sem horário: sai na hora', vaiParaAFila(null, agora) === false)
conferir('uma hora à frente: fila', vaiParaAFila('2026-11-04T12:00:00Z', agora) === true)
conferir('um minuto à frente: sai na hora', vaiParaAFila('2026-11-04T11:01:00Z', agora) === false)
conferir('três minutos à frente: fila', vaiParaAFila('2026-11-04T11:03:00Z', agora) === true)
conferir('no passado: sai na hora', vaiParaAFila('2026-11-04T10:00:00Z', agora) === false)
conferir('texto inválido: sai na hora', vaiParaAFila('ontem', agora) === false)

conferir('vencido vira agora', horarioAindaFuturo('2026-11-04T11:00:00Z', agora) === undefined)
conferir('quase agora vira agora', horarioAindaFuturo('2026-11-04T11:01:30Z', agora) === undefined)
conferir('mais tarde continua agendado', horarioAindaFuturo('2026-11-04T15:00:00Z', agora) === '2026-11-04T15:00:00Z')
conferir('sem horário fica sem', horarioAindaFuturo(null, agora) === undefined)

conferir('leitura em Brasília', horarioParaLer('2026-11-04T12:00:00Z') === '04/11 às 09:00', horarioParaLer('2026-11-04T12:00:00Z'))
conferir('virada do dia em Brasília', horarioParaLer('2026-11-05T02:30:00Z') === '04/11 às 23:30', horarioParaLer('2026-11-05T02:30:00Z'))

console.log(falhas ? `\n${falhas} falha(s)` : '\ntudo ok')
process.exit(falhas ? 1 : 0)
