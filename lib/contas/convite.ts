/**
 * Por onde o convite de acesso saiu, guardado junto do link (módulo puro).
 *
 * O primeiro acesso pelo link PROVA o canal que o recebeu: quem abriu o
 * convite mandado só por e-mail tem aquele e-mail; quem abriu o mandado só
 * pelo WhatsApp tem aquele número. É isso que decide, em
 * definirSenhaPeloLink, o que fica confirmado na conta. Mandado pelos dois,
 * não dá para saber qual foi usado, e nada é confirmado sozinho.
 *
 * A marca vai na coluna `tokens_de_conta.email` (nos links de definir senha
 * ela não tinha uso): nula = só por e-mail (como sempre foi — inclusive os
 * convites anteriores a esta mudança), "whatsapp:<número>" = só pelo WhatsApp,
 * "whatsapp+email:<número>" = pelos dois.
 */

export type CanalDoConvite = { porEmail: boolean; numero: string | null }

export function marcaDoConvite(c: CanalDoConvite): string | null {
  if (!c.numero) return null
  return `${c.porEmail ? 'whatsapp+email' : 'whatsapp'}:${c.numero}`
}

export function lerMarcaDoConvite(marca: string | null | undefined): CanalDoConvite {
  const m = /^(whatsapp|whatsapp\+email):([0-9]{10,15})$/.exec(String(marca ?? ''))
  if (!m) return { porEmail: true, numero: null }
  return { porEmail: m[1] === 'whatsapp+email', numero: m[2] }
}

/** O que o primeiro acesso confirma na conta, pelo canal que recebeu o link. */
export function oQueOLinkProva(marca: string | null | undefined): { email: boolean; whatsapp: string | null } {
  const c = lerMarcaDoConvite(marca)
  if (!c.numero) return { email: true, whatsapp: null }
  return c.porEmail ? { email: false, whatsapp: null } : { email: false, whatsapp: c.numero }
}
