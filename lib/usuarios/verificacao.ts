/**
 * Verificação em duas etapas: quando a sessão precisa do código.
 *
 * É a mesma regra de `private.verificacao_em_dia` no banco, repetida aqui
 * para o app saber PARA ONDE mandar a pessoa (digitar o código ou cadastrar o
 * app). Se as duas divergirem, o banco vence: nega os dados e a tela mostra
 * vazio — por isso mudar uma exige mudar a outra.
 */

import type { Papel } from '../permissoes'

export type Situacao =
  /** Nada a fazer: sessão já verificada, ou a verificação não se aplica. */
  | 'em_dia'
  /** Tem o app cadastrado e entrou só com senha: falta digitar o código. */
  | 'pedir_codigo'
  /** O papel exige verificação e a pessoa ainda não cadastrou o app. */
  | 'cadastrar'

export function situacaoDaVerificacao(entrada: {
  nivel: string | null | undefined
  temFatorVerificado: boolean
  papel: Papel
  obrigatorioPara: readonly string[] | null | undefined
}): Situacao {
  if (entrada.nivel === 'aal2') return 'em_dia'
  if (entrada.temFatorVerificado) return 'pedir_codigo'
  if ((entrada.obrigatorioPara ?? []).includes(entrada.papel)) return 'cadastrar'
  return 'em_dia'
}

/** O segredo em blocos de 4, para digitar à mão no app sem se perder. */
export const segredoLegivel = (segredo: string) => segredo.replace(/\s+/g, '').match(/.{1,4}/g)?.join(' ') ?? ''

/** Só aceita 6 dígitos — o que os apps autenticadores mostram. */
export const codigoValido = (codigo: string) => /^\d{6}$/.test(codigo)
