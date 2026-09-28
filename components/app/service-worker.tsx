'use client'

import { useEffect } from 'react'

/**
 * Registra o service worker (public/sw.js), só na versão publicada: guarda os
 * arquivos do build e as imagens fixas no aparelho e mostra uma página própria
 * sem conexão. Registra depois que a página terminou de carregar, para não
 * disputar a rede com ela.
 */
export function ServiceWorker() {
  useEffect(() => {
    if (process.env.NODE_ENV !== 'production' || !('serviceWorker' in navigator)) return
    const registrar = () => { navigator.serviceWorker.register('/sw.js', { scope: '/' }).catch(() => {}) }
    if (document.readyState === 'complete') registrar()
    else window.addEventListener('load', registrar, { once: true })
    return () => window.removeEventListener('load', registrar)
  }, [])
  return null
}
