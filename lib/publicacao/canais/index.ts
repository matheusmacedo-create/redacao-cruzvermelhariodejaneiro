import type { Adapter } from './contrato'
import { siteWeb } from './site-web'
import { instagram } from './instagram'
import { facebook } from './facebook'
import { linkedin } from './linkedin'
import { x } from './x'
import { threads } from './threads'
import { bluesky } from './bluesky'
import { pinterest } from './pinterest'
import { googleBusiness } from './google-business'

/** O site vem primeiro de propósito: é o destino padrão da casa. */
export const ADAPTERS: Adapter[] = [
  siteWeb, instagram, facebook, linkedin, x, threads, bluesky, pinterest, googleBusiness,
]

const porId = new Map(ADAPTERS.map((a) => [a.id, a]))

export function adapter(id: string): Adapter | undefined {
  return porId.get(id)
}

export * from './contrato'
