/**
 * Erros que o Next usa como controle de fluxo, e não como falha.
 *
 * `redirect()` e `notFound()` funcionam lançando: quem chama tem que deixar
 * passar. Um `catch` que transforma tudo em texto captura esses dois também —
 * e foi o que acontecia aqui: com a sessão expirada, o hub mostrava a palavra
 * "NEXT_REDIRECT" numa tarja vermelha em vez de levar a pessoa ao login.
 */
const CONTROLE = ['NEXT_REDIRECT', 'NEXT_NOT_FOUND', 'NEXT_HTTP_ERROR_FALLBACK']

export function ehControleDoNext(causa: unknown): boolean {
  if (typeof causa !== 'object' || causa === null) return false
  const digest = (causa as { digest?: unknown }).digest
  return typeof digest === 'string' && CONTROLE.some((prefixo) => digest.startsWith(prefixo))
}

/**
 * Traduz uma falha em mensagem para a tela — e devolve o controle do Next
 * intacto para quem sabe tratá-lo.
 */
export function mensagemDoErro(causa: unknown, padrao: string): string {
  if (ehControleDoNext(causa)) throw causa
  return (causa instanceof Error ? causa.message : padrao).slice(0, 500)
}
