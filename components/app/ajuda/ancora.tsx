'use client'

import { useEffect } from 'react'

/*
 * Arquivo à parte, sem nada de lib/ajuda, de propósito: as páginas da
 * Central importam isto, e o Turbopack liga a referência do cliente ao
 * arquivo inteiro, não ao export. Morando em ./central.tsx, cada
 * /ajuda/<área> baixava o texto de toda a ajuda (~140 KB comprimidos) por
 * causa de um efeito de 20 linhas.
 */

/** O aviso de ./ancora para a página aberta: "a pessoa escolheu esta resposta aqui mesmo". */
const EVENTO = 'ajuda:resposta'

/** Quanto a resposta espera um diálogo (o painel "?", o ⌘K) terminar de fechar para pegar o foco. */
const ESPERA_DOS_DIALOGOS_MS = 1500

/**
 * Leva à resposta do link (/ajuda/pautas#criar-pauta), acende e dá o foco a
 * ela. O navegador sozinho não dá conta: a página chega por partes (o
 * esqueleto do loading.tsx vem antes), e quando a resposta aparece ele já
 * desistiu de rolar; e o :target do CSS não acende quando se chega pelo
 * painel "?" ou pelo ⌘K, que navegam sem recarregar. Não desenha nada.
 *
 * O foco vai para a resposta (os cartões têm tabIndex -1) para o teclado e o
 * leitor de tela continuarem dali, e não do botão "?" — mas só depois que o
 * painel ou o ⌘K terminam de fechar: ao fechar, eles devolvem o foco a quem
 * os abriu, e a resposta perderia o foco para o "?".
 */
export function AncoraDaAjuda() {
  useEffect(() => {
    let acesa: Element | null = null
    let quadro = 0
    const acender = (id: string) => {
      const alvo = id ? document.getElementById(id) : null
      if (acesa && acesa !== alvo) acesa.removeAttribute('data-ancora')
      acesa = alvo
      cancelAnimationFrame(quadro)
      if (!alvo) return
      alvo.setAttribute('data-ancora', '')
      const reduzido = window.matchMedia('(prefers-reduced-motion: reduce)').matches
      alvo.scrollIntoView({ block: 'start', behavior: reduzido ? 'auto' : 'smooth' })
      const limite = performance.now() + ESPERA_DOS_DIALOGOS_MS
      const focar = () => {
        if (!alvo.isConnected) return
        // Um diálogo na frente: se é o painel ou o ⌘K fechando, espera; se é
        // outro (as boas-vindas, um tour), a resposta não tira o foco dele.
        if (document.querySelector('[role="dialog"], [role="alertdialog"]')) {
          if (performance.now() < limite) quadro = requestAnimationFrame(focar)
          return
        }
        if (!alvo.contains(document.activeElement)) alvo.focus({ preventScroll: true })
      }
      focar()
    }
    const peloEndereco = () => {
      let id = ''
      try { id = decodeURIComponent(window.location.hash.slice(1)) } catch { /* endereço malformado: nada a acender */ }
      acender(id)
    }
    const peloAviso = (e: Event) => acender((e as CustomEvent<string>).detail)
    peloEndereco()
    window.addEventListener('hashchange', peloEndereco)
    window.addEventListener(EVENTO, peloAviso)
    return () => {
      cancelAnimationFrame(quadro)
      window.removeEventListener('hashchange', peloEndereco)
      window.removeEventListener(EVENTO, peloAviso)
      acesa?.removeAttribute('data-ancora')
    }
  }, [])
  return null
}

/**
 * Quem leva a uma resposta (a busca do painel "?", a da Central, o ⌘K)
 * chama isto ao escolher. Numa página nova, a AncoraDaAjuda de lá lê o
 * endereço ao montar. Na mesma página, o Next troca o endereço com
 * history.pushState, que não dispara hashchange: sem o aviso, o cartão
 * antigo continuava aceso e o novo, não.
 */
export function avisarResposta(href: string): void {
  const url = new URL(href, window.location.href)
  if (!url.hash || url.pathname !== window.location.pathname) return
  let id = ''
  try { id = decodeURIComponent(url.hash.slice(1)) } catch { return }
  window.dispatchEvent(new CustomEvent(EVENTO, { detail: id }))
}
