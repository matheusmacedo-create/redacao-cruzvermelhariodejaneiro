'use client'

import { useSyncExternalStore } from 'react'

// O relógio é uma fonte externa: assina o tique de cada segundo; no servidor, sem hora.
const assinarSegundos = (avisar: () => void) => { const t = setInterval(avisar, 1000); return () => clearInterval(t) }
const segundoAtual = () => Math.floor(Date.now() / 1000)
const semHoraNoServidor = () => 0

/**
 * A hora de agora, com os segundos correndo, na verificação do crachá: quem
 * confere vê que a página está viva — um print de tela antigo fica parado.
 */
export function RelogioAoVivo({ className }: { className?: string }) {
  const segundo = useSyncExternalStore(assinarSegundos, segundoAtual, semHoraNoServidor)
  const texto = segundo ? new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'medium', timeZone: 'America/Sao_Paulo' }).format(new Date(segundo * 1000)) : '…'
  return (
    <span className={className} data-relogio>
      <span className="relative mr-1.5 inline-flex size-2 align-middle" aria-hidden="true">
        <span className="absolute inline-flex size-full animate-ping rounded-full bg-current opacity-60" />
        <span className="relative inline-flex size-2 rounded-full bg-current" />
      </span>
      Conferido agora · <time className="tabular-nums">{texto}</time>
    </span>
  )
}
