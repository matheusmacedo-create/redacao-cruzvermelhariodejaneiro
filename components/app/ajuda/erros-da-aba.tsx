'use client'

import { useEffect } from 'react'
import { ERROS_NO_RETORNO, mensagemDeErro } from '@/lib/ajuda/retornos'

/**
 * Os últimos erros que a tela deu (docs/AJUDA.md §17): ficam só na memória
 * desta aba e vão junto quando a pessoa conta um problema ("Achei um erro"),
 * para quem corrige saber o que quebrou. Nada sai daqui sozinho: se a pessoa
 * não avisar, some quando a aba fecha.
 *
 * Entram os erros que escapam (script e promessa sem tratamento, escutados
 * por GuardaDeErros, no layout) e o da tela de erro (app/(app)/error.tsx).
 */

const GUARDADOS = 5
const erros: string[] = []

/** Guarda um erro, com a tela onde aconteceu. O mesmo erro repetido em seguida conta uma vez. */
export function guardarErro(bruto: unknown, origem?: string): void {
  if (typeof window === 'undefined') return
  const mensagem = mensagemDeErro(bruto, origem)
  if (!mensagem) return
  const linha = `${window.location.pathname} — ${mensagem}`
  if (erros[erros.length - 1] === linha) return
  erros.push(linha)
  if (erros.length > GUARDADOS) erros.shift()
}

/** Os que vão junto com o problema: os últimos, do mais antigo para o mais novo. */
export function errosRecentes(): string[] {
  return erros.slice(-ERROS_NO_RETORNO)
}

/** Montado uma vez, no layout: escuta o que escapa. Não desenha nada. */
export function GuardaDeErros() {
  useEffect(() => {
    const aoErrar = (e: ErrorEvent) => guardarErro(e.error ?? e.message, e.filename)
    const aoRejeitar = (e: PromiseRejectionEvent) => guardarErro(e.reason)
    window.addEventListener('error', aoErrar)
    window.addEventListener('unhandledrejection', aoRejeitar)
    return () => {
      window.removeEventListener('error', aoErrar)
      window.removeEventListener('unhandledrejection', aoRejeitar)
    }
  }, [])
  return null
}
