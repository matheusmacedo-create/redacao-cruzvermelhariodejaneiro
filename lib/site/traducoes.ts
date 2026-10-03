/**
 * As versões em inglês das páginas que o Palácio Virtual gera para o site.
 *
 * As traduções moram no repositório do site (`traducoes/en/`, geradas por
 * `scripts/gerar_ingles.py`), que grava `traducoes/en/mapa-hreflang.json`
 * (caminho em português → caminho em inglês). A página em inglês já declara
 * o par (pt-BR, en, x-default no português); este módulo faz o lado de cá,
 * para o Google ver as duas versões como a mesma matéria.
 *
 * `traducoes-en.json` é uma cópia daquele mapa. Quando o site ganhar uma
 * tradução nova, copie o arquivo de novo e clique em "Regerar as páginas das
 * notícias". Matéria sem par não declara nada: hreflang só com um lado é erro.
 */
import mapa from './traducoes-en.json'

const PARES: Record<string, string> = { '/noticias/': '/en/news/', ...(mapa as Record<string, string>) }

export type Alternativa = { hreflang: string; url: string }

/** O caminho em inglês de uma página em português, ou null se não há tradução. */
export function caminhoEmIngles(caminho: string): string | null {
  return PARES[caminho] ?? null
}

/**
 * As alternativas de idioma de uma página (a própria incluída), prontas para
 * `montarPaginaDoSite({ alternativas })`. `caminho` é o canônico em português,
 * com barra final (ex.: /noticias/7-de-setembro/).
 */
export function alternativasDaPagina(caminho: string, origem: string): Alternativa[] | null {
  const en = caminhoEmIngles(caminho)
  if (!en) return null
  const o = origem.replace(/\/+$/, '')
  return [
    { hreflang: 'pt-BR', url: `${o}${caminho}` },
    { hreflang: 'en', url: `${o}${en}` },
    { hreflang: 'x-default', url: `${o}${caminho}` },
  ]
}
