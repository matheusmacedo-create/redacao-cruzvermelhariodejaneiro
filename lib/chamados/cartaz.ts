/**
 * O cartaz com QR de cada fila de chamados (/chamados/cartaz): o QR leva a
 * /chamado?fila=<slug>, que abre "Abrir chamado" já na fila (com a sessão) ou
 * passa pelo login e volta para lá. Puro: a página, a rota e a conferência
 * (`npx tsx scripts/conferir-cartaz-dos-chamados.ts`) usam as mesmas regras.
 */

/** O mesmo formato do banco (chamado_filas.slug). */
export const ehSlugDaFila = (valor: unknown): valor is string => typeof valor === 'string' && /^[a-z0-9-]{2,40}$/.test(valor)

/** O endereço curto que vai no QR. */
export function linkDoCartaz(base: string, slug: string): string {
  return `${base.replace(/\/+$/, '')}/chamado?fila=${encodeURIComponent(slug)}`
}

/** Onde abrir o chamado dentro do Palácio. */
export const formularioDaFila = (slug: string) => `/chamados/novo?fila=${encodeURIComponent(slug)}`

/**
 * Para onde voltar depois de entrar (?voltar=), só se for um caminho do próprio
 * Palácio: começa com uma barra e não é "//outro-site" nem "/\\outro-site" (que
 * o navegador trataria como outro endereço). Qualquer outra coisa: o Início.
 */
export function destinoSeguro(valor: unknown): string | null {
  if (typeof valor !== 'string' || valor.length > 300) return null
  if (!valor.startsWith('/') || valor.startsWith('//') || valor.startsWith('/\\')) return null
  if (/[\u0000-\u001f\s]/.test(valor)) return null
  // Dentro do Palácio, e não de volta para a própria entrada.
  if (valor === '/' || valor.startsWith('/?')) return null
  return valor
}

/** Os três passos impressos no cartaz. */
export const PASSOS_DO_CARTAZ = [
  'Aponte a câmera do celular para o código.',
  'Entre com o seu usuário do Palácio Virtual.',
  'Descreva o pedido. A resposta chega no Palácio e no seu WhatsApp.',
] as const
