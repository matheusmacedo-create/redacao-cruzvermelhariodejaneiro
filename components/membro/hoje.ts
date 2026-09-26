'use client'

import { useEffect, useState } from 'react'

const hojeEmSaoPaulo = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date())

/**
 * "Hoje" (AAAA-MM-DD, horário de Brasília) nas páginas públicas que ficam em
 * cache (revalidate): o servidor manda a data do momento em que montou a
 * página, que pode ser de dias atrás; o navegador corrige ao abrir. `aoMudar`
 * recebe a data velha e a nova, para quem guardou a velha num campo.
 */
export function useHoje(doServidor: string, aoMudar?: (velha: string, nova: string) => void): string {
  const [hoje, setHoje] = useState(doServidor)
  useEffect(() => {
    const agora = hojeEmSaoPaulo()
    if (agora !== doServidor) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- o relógio do navegador só existe aqui
      setHoje(agora)
      aoMudar?.(doServidor, agora)
    }
    // Só ao abrir: a data do servidor não muda depois disso.
  }, [doServidor]) // eslint-disable-line react-hooks/exhaustive-deps
  return hoje
}
