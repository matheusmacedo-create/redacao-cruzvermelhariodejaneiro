import type { Adapter } from './contrato'
import { siteWeb } from './site-web'
import { newsletter } from './newsletter'
import { instagram } from './instagram'
import { facebook } from './facebook'
import { linkedin } from './linkedin'
import { x } from './x'
import { threads } from './threads'
import { bluesky } from './bluesky'
import { pinterest } from './pinterest'
import { googleBusiness } from './google-business'
import { tiktok } from './tiktok'
import { youtube } from './youtube'
import { reddit } from './reddit'
import { telegram } from './telegram'
import { discord } from './discord'
import { mastodon } from './mastodon'

/**
 * O site vem primeiro de propósito: é o destino padrão da casa. A newsletter
 * vem logo depois porque, como o site, ela é canal próprio da instituição — o
 * que sai por ali não depende do alcance que uma rede social resolver dar.
 */
export const ADAPTERS: Adapter[] = [
  siteWeb, newsletter, instagram, facebook, linkedin, x, threads, bluesky,
  pinterest, googleBusiness, tiktok, youtube, reddit, telegram, discord, mastodon,
]

/**
 * Os canais que a instituição opera sozinha — não passam pelo Upload-Post.
 *
 * O site publica por FTP; a newsletter, pelo Resend. Os dois têm em comum
 * tudo o que importa para o disparo: não consomem cota do plano, não aparecem
 * na consulta de status das redes, e saem numa ordem própria.
 *
 * Existe como conjunto, e não como uma comparação com 'site_web' espalhada
 * pelo código, porque essa comparação já estava em cinco lugares. Acrescentar
 * um segundo canal assim sem declarar a categoria era como um deles ia parar
 * na fila errada — sem erro, só sem sair.
 */
export const CANAIS_PROPRIOS = new Set(['site_web', 'newsletter'])

/** O destino passa pelo Upload-Post (e portanto consome cota do plano)? */
export const ehCanalDeRede = (canal: string) => !CANAIS_PROPRIOS.has(canal)

const porId = new Map(ADAPTERS.map((a) => [a.id, a]))

export function adapter(id: string): Adapter | undefined {
  return porId.get(id)
}

export * from './contrato'
