import { escapar } from '@/lib/site/esqueleto'

/**
 * sitemap.xml e robots.txt do site institucional.
 *
 * O site não tinha nenhum dos dois: o Google achava as páginas seguindo
 * links, no ritmo dele. O sitemap entrega a lista completa com a data de
 * cada mudança, e é REGERADO a cada publicação — matéria nova entra no
 * mapa no mesmo instante em que entra no ar, sem ninguém lembrar de nada.
 *
 * As páginas fixas moram aqui, numa lista declarada. Página nova no site =
 * uma linha nesta lista; a parte que muda sozinha (as notícias) vem do banco.
 */

export type EntradaDoMapa = {
  /** Endereço completo. */
  url: string
  /** Última modificação — sai como AAAA-MM-DD, que é o que o Google lê. */
  modificadaEm?: Date
}

export const ORIGEM_DO_SITE = 'https://cruzvermelhariodejaneiro.org'

/** As páginas fixas do site, além das notícias. */
export function paginasFixas(origem: string = ORIGEM_DO_SITE): EntradaDoMapa[] {
  return [
    { url: `${origem}/` },
    { url: `${origem}/noticias/` },
    { url: `${origem}/equipe.html` },
    { url: `${origem}/cursos.html` },
    { url: `${origem}/doacao.html` },
    { url: `${origem}/campanha-agasalho.html` },
    { url: `${origem}/privacidade/` },
    { url: `${origem}/termos/` },
  ]
}

const dataDoMapa = (d: Date) => d.toISOString().slice(0, 10)

export function gerarSitemap(entradas: EntradaDoMapa[]): string {
  // Endereço repetido some: o mapa é um conjunto, e o Google reclama de eco.
  const vistas = new Set<string>()
  const linhas = entradas
    .filter((e) => (vistas.has(e.url) ? false : (vistas.add(e.url), true)))
    .map((e) => [
      '  <url>',
      `    <loc>${escapar(e.url)}</loc>`,
      ...(e.modificadaEm ? [`    <lastmod>${dataDoMapa(e.modificadaEm)}</lastmod>`] : []),
      '  </url>',
    ].join('\n'))
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    ...linhas,
    '</urlset>',
    '',
  ].join('\n')
}

export function gerarRobots(origem: string = ORIGEM_DO_SITE): string {
  // Aberto de propósito: site institucional existe para ser encontrado.
  return [
    'User-agent: *',
    'Allow: /',
    '',
    `Sitemap: ${origem}/sitemap.xml`,
    '',
  ].join('\n')
}
