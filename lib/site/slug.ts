/**
 * Endereço da matéria dentro do site.
 *
 * O slug vira nome de pasta no servidor e caminho na URL, então tudo que
 * atrapalha em qualquer um dos dois é removido: acento, espaço, pontuação,
 * barra. O que sobra é [a-z0-9-], que é o que buscador e sistema de arquivos
 * tratam igual em qualquer lugar.
 */

const TAMANHO_MAXIMO = 80

// Nomes que colidiriam com o que já existe no servidor ou com convenção de web.
const RESERVADOS = new Set([
  'index', 'admin', 'wp-admin', 'wp-content', 'cgi-bin', 'api', 'assets',
  'static', 'public', 'noticias', 'noticia', 'feed', 'sitemap', 'robots',
])

export function gerarSlug(titulo: string): string {
  const base = titulo
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')   // tira os acentos separados pelo NFD
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')

  if (!base) return ''

  // Corta no limite sem deixar hífen solto na ponta.
  const cortado = base.length <= TAMANHO_MAXIMO
    ? base
    : base.slice(0, TAMANHO_MAXIMO).replace(/-+[^-]*$/, '').replace(/-+$/, '')

  const final = cortado || base.slice(0, TAMANHO_MAXIMO)
  return RESERVADOS.has(final) ? `${final}-materia` : final
}

/**
 * Confere um slug que veio de fora — do banco ou de um campo editável — antes
 * de ele virar caminho no servidor de arquivos.
 */
export function slugValido(slug: string): boolean {
  return /^[a-z0-9]+(-[a-z0-9]+)*$/.test(slug)
    && slug.length <= TAMANHO_MAXIMO
    && !RESERVADOS.has(slug)
}

/** Acrescenta sufixo numérico até não colidir com um slug já usado. */
export function slugDisponivel(desejado: string, jaUsados: Iterable<string>): string {
  const usados = new Set(jaUsados)
  if (!usados.has(desejado)) return desejado
  for (let n = 2; n < 1000; n++) {
    const tentativa = `${desejado}-${n}`
    if (!usados.has(tentativa)) return tentativa
  }
  throw new Error('Não foi possível achar um endereço livre para esta matéria.')
}
