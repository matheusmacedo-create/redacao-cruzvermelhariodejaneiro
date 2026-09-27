import 'server-only'
import { usarChatDoSite } from '@/lib/site/esqueleto'
import { usarAvisoDeCookies } from '@/lib/site/analytics'

/**
 * O chat "Fale com a gente" e o aviso de cookies nas páginas que a Redação gera.
 *
 * As páginas do site carregam /chat/chat.min.css?v=HASH, /chat/chat.js?v=HASH
 * e /consentimento/consentimento.js?v=HASH, com cache de um ano (immutable):
 * quem muda o chat ou o aviso muda o HASH, no repositório do site. Um endereço
 * sem versão ficaria velho no navegador de todo visitante, então as páginas
 * daqui usam a versão que a HOME usa agora, lida da própria home na hora de
 * publicar. Se a leitura falhar, a página sai sem o chat e sem o aviso (e, sem
 * o aviso, o bloco de medição não mede quem não escolheu: analytics.ts) —
 * nunca com um endereço adivinhado.
 */

const HOME = 'https://cruzvermelhariodejaneiro.org/'
const TEMPO_LIMITE_MS = 4000
const VALIDADE_MS = 10 * 60_000
const VALIDADE_DA_FALHA_MS = 60_000

// Só a forma exata que as páginas do site escrevem: caminho /chat/, arquivo
// conhecido e versão em hexadecimal. O que não casar não entra na página.
const CSS = /<link\s+rel="stylesheet"\s+href="(\/chat\/chat(?:\.min)?\.css\?v=[0-9a-f]{6,40})"\s*\/?>/
const JS = /<script\s+src="(\/chat\/chat\.js\?v=[0-9a-f]{6,40})"\s+defer\s*><\/script>/
// O aviso de cookies, com a versão de 10 dígitos que o scripts/consentimento.py do site carimba.
const AVISO = /<script\s+src="(\/consentimento\/consentimento\.js\?v=[0-9a-f]{10})"\s+defer\s*><\/script>/

/** As duas tags, montadas por nós a partir dos endereços versionados da home. Vazio se faltar uma. */
export function extrairTagsDoChat(html: string): string {
  const css = CSS.exec(html)?.[1]
  const js = JS.exec(html)?.[1]
  if (!css || !js) return ''
  return `<!-- Chat de contato por e-mail (o mesmo da home) -->
    <link rel="stylesheet" href="${css}">
    <script src="${js}" defer></script>`
}

/** A tag do aviso de cookies, montada por nós a partir do endereço versionado da home. Vazio se não houver. */
export function extrairTagDoAvisoDeCookies(html: string): string {
  const src = AVISO.exec(html)?.[1]
  return src ? `<script src="${src}" defer></script>` : ''
}

let guardado: { tags: string; aviso: string; ate: number } | null = null

/**
 * Lê as tags do chat e a do aviso de cookies e as deixa prontas para as
 * páginas desta rodada: devolve as do chat (quem monta a página as passa
 * adiante) e guarda as duas — o chat no esqueleto, que o usa quando a página
 * não recebe nenhum, e o aviso no bloco de medição. Nunca lança: sem a home,
 * devolve vazio, as páginas saem sem o chat e sem o aviso e o resto da
 * publicação segue.
 */
export async function prepararChatDoSite(buscar: typeof fetch = fetch): Promise<string> {
  if (guardado && guardado.ate > Date.now()) {
    usarChatDoSite(guardado.tags)
    usarAvisoDeCookies(guardado.aviso)
    return guardado.tags
  }
  let tags = ''
  let aviso = ''
  try {
    const resposta = await buscar(HOME, { cache: 'no-store', redirect: 'follow', signal: AbortSignal.timeout(TEMPO_LIMITE_MS) })
    if (resposta.ok) {
      const home = await resposta.text()
      tags = extrairTagsDoChat(home)
      aviso = extrairTagDoAvisoDeCookies(home)
    }
  } catch {
    tags = ''
    aviso = ''
  }
  if (!tags) console.warn('[site] não encontrei a versão do chat na home: as páginas desta rodada saem sem o chat')
  if (!aviso) console.warn('[site] não encontrei a versão do aviso de cookies na home: as páginas desta rodada saem sem o aviso')
  // A leitura só vale os 10 minutos inteiros se trouxe as duas versões.
  guardado = { tags, aviso, ate: Date.now() + (tags && aviso ? VALIDADE_MS : VALIDADE_DA_FALHA_MS) }
  usarChatDoSite(tags)
  usarAvisoDeCookies(aviso)
  return tags
}
