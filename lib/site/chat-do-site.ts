import 'server-only'
import { usarChatDoSite } from '@/lib/site/esqueleto'

/**
 * O chat "Fale com a gente" nas páginas que a Redação gera.
 *
 * As páginas do site carregam /chat/chat.min.css?v=HASH e /chat/chat.js?v=HASH,
 * com cache de um ano (immutable): quem muda o chat muda o HASH, no
 * repositório do site. Um endereço sem versão ficaria velho no navegador de
 * todo visitante, então as páginas daqui usam a versão que a HOME usa agora,
 * lida da própria home na hora de publicar. Se a leitura falhar, a página sai
 * sem o chat — nunca com um endereço adivinhado.
 */

const HOME = 'https://cruzvermelhariodejaneiro.org/'
const TEMPO_LIMITE_MS = 4000
const VALIDADE_MS = 10 * 60_000
const VALIDADE_DA_FALHA_MS = 60_000

// Só a forma exata que as páginas do site escrevem: caminho /chat/, arquivo
// conhecido e versão em hexadecimal. O que não casar não entra na página.
const CSS = /<link\s+rel="stylesheet"\s+href="(\/chat\/chat(?:\.min)?\.css\?v=[0-9a-f]{6,40})"\s*\/?>/
const JS = /<script\s+src="(\/chat\/chat\.js\?v=[0-9a-f]{6,40})"\s+defer\s*><\/script>/

/** As duas tags, montadas por nós a partir dos endereços versionados da home. Vazio se faltar uma. */
export function extrairTagsDoChat(html: string): string {
  const css = CSS.exec(html)?.[1]
  const js = JS.exec(html)?.[1]
  if (!css || !js) return ''
  return `<!-- Chat de contato por e-mail (o mesmo da home) -->
    <link rel="stylesheet" href="${css}">
    <script src="${js}" defer></script>`
}

let guardado: { tags: string; ate: number } | null = null

/**
 * Lê as tags do chat e as deixa prontas para as páginas desta rodada: devolve
 * as tags (quem monta a página as passa adiante) e as guarda no esqueleto, que
 * as usa quando a página não recebe nenhuma. Nunca lança: sem a home, devolve
 * vazio, as páginas saem sem o chat e o resto da publicação segue.
 */
export async function prepararChatDoSite(buscar: typeof fetch = fetch): Promise<string> {
  if (guardado && guardado.ate > Date.now()) {
    usarChatDoSite(guardado.tags)
    return guardado.tags
  }
  let tags = ''
  try {
    const resposta = await buscar(HOME, { cache: 'no-store', redirect: 'follow', signal: AbortSignal.timeout(TEMPO_LIMITE_MS) })
    if (resposta.ok) tags = extrairTagsDoChat(await resposta.text())
  } catch {
    tags = ''
  }
  if (!tags) console.warn('[site] não encontrei a versão do chat na home: as páginas desta rodada saem sem o chat')
  guardado = { tags, ate: Date.now() + (tags ? VALIDADE_MS : VALIDADE_DA_FALHA_MS) }
  usarChatDoSite(tags)
  return tags
}
