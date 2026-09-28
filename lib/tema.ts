/**
 * Modo escuro — as regras, sem banco. A escolha de cada pessoa fica num
 * cookie (`tema`), que vale no Palácio e na Área do Voluntário do mesmo
 * navegador.
 *
 * - "claro" (o padrão: ninguém acorda com a tela mudada), "escuro" ou
 *   "sistema" (segue o celular ou o computador, e muda junto com ele).
 * - Papel continua papel: a conferência de ofício, o crachá e os cartazes
 *   são sempre claros, em qualquer escolha — são o documento, não a tela.
 * - O tema entra por um script no <head>, antes da primeira pintura: sem
 *   o clarão branco ao abrir uma página no escuro.
 */

export const TEMAS = ['claro', 'escuro', 'sistema'] as const
export type Tema = (typeof TEMAS)[number]
export const ehTema = (v: unknown): v is Tema => typeof v === 'string' && (TEMAS as readonly string[]).includes(v)

export const COOKIE_DO_TEMA = 'tema'
export const TEMA_PADRAO: Tema = 'claro'

/** Páginas que são documento ou impressão: sempre claras. */
export const CAMINHOS_SEMPRE_CLAROS = /^\/(verificar|cracha|portaria\/cartaz|portaria\/crachas|envios\/cartaz)(\/|$)/

export function lerTema(cookie: string | null | undefined): Tema {
  const m = /(?:^|;\s*)tema=([a-z]+)/.exec(cookie ?? '')
  return m && ehTema(m[1]) ? m[1] : TEMA_PADRAO
}

/** O tema escuro vale nesta página, com esta escolha e este sistema? */
export function escuroNaPagina(tema: Tema, caminho: string, sistemaEscuro: boolean): boolean {
  if (CAMINHOS_SEMPRE_CLAROS.test(caminho)) return false
  return tema === 'escuro' || (tema === 'sistema' && sistemaEscuro)
}

/**
 * O script do <head>: a mesma conta de escuroNaPagina, escrita à mão em ES5
 * (roda antes de qualquer pacote). Conferido contra a função pelo script
 * scripts/conferir-tema.ts.
 */
export const SCRIPT_DO_TEMA = `(function(){try{var m=/(?:^|;\\s*)tema=([a-z]+)/.exec(document.cookie);var t=m&&(m[1]==='claro'||m[1]==='escuro'||m[1]==='sistema')?m[1]:'${TEMA_PADRAO}';var fixo=${CAMINHOS_SEMPRE_CLAROS.toString()}.test(location.pathname);var s=window.matchMedia&&window.matchMedia('(prefers-color-scheme: dark)').matches;var e=!fixo&&(t==='escuro'||(t==='sistema'&&s));var h=document.documentElement;h.classList.toggle('dark',e);h.style.colorScheme=e?'dark':'light'}catch(_){}})()`

export const ROTULO_DO_TEMA: Record<Tema, string> = { claro: 'Claro', escuro: 'Escuro', sistema: 'Automático' }
