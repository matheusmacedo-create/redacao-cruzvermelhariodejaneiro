/**
 * O balde que a tela de Imprensa usa para decidir "dá para contar com este
 * e-mail" — três estados em vez dos seis que a Hunter.io devolve (valid,
 * invalid, accept_all, webmail, disposable, unknown). Ver a nota na migração
 * de press_contacts sobre por que essa simplificação existe.
 *
 * Módulo puro de propósito, sem 'server-only': o conector (lib/imprensa/
 * hunter.ts) usa isto para gravar o balde no banco, e a prévia da busca por
 * domínio na tela usa a MESMA função para mostrar o balde antes de qualquer
 * contato ser salvo — as duas contas não podem divergir.
 */

export type StatusDaHunter = 'valid' | 'invalid' | 'accept_all' | 'webmail' | 'disposable' | 'unknown' | null | undefined
export type BaldeDeEmail = 'valido' | 'invalido' | 'arriscado' | 'nao_verificado'

export function comoBalde(status: StatusDaHunter): BaldeDeEmail {
  if (status === 'valid') return 'valido'
  if (status === 'invalid') return 'invalido'
  if (status == null) return 'nao_verificado'
  // accept_all, webmail, disposable, unknown — e qualquer valor novo que a
  // Hunter venha a inventar. Nunca silenciosamente "valido" por um status que
  // este código não reconhece: o custo de errar para o lado cauteloso é
  // revisar um contato à toa; o custo de errar para o outro lado é confiar
  // num e-mail que a própria Hunter não confirmou.
  return 'arriscado'
}
