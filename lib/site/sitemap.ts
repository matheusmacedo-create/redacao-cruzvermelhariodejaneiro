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
  /** Imagens da página (extensão de imagens do sitemap; o Google Imagens lê). */
  imagens?: string[]
}

export const ORIGEM_DO_SITE = 'https://cruzvermelhariodejaneiro.org'

/** As páginas fixas do site, além das notícias. */
export function paginasFixas(origem: string = ORIGEM_DO_SITE): EntradaDoMapa[] {
  return [
    { url: `${origem}/` },
    { url: `${origem}/noticias/` },
    { url: `${origem}/equipe.html` },
    // cursos.html e doacao.html saíram do ar e respondem 301: o sitemap não deve
    // listar endereço que redireciona — o Google conta como página incorreta no mapa.
    { url: `${origem}/matricula-cursos-presenciais/` },
    { url: `${origem}/doe/` },
    { url: `${origem}/campanha-agasalho.html` },
    { url: `${origem}/bio/` },
    // O acervo entra com as coleções e os itens públicos (lib/acervo/paginas.ts); este é o
    // endereço fixo, que existe mesmo sem item nenhum.
    { url: `${origem}/acervo/` },
    { url: `${origem}/privacidade/` },
    { url: `${origem}/termos/` },
  ]
}

const dataDoMapa = (d: Date) => d.toISOString().slice(0, 10)

export function gerarSitemap(entradas: EntradaDoMapa[]): string {
  // Endereço repetido some: o mapa é um conjunto, e o Google reclama de eco.
  // A mesma página pode chegar duas vezes (ex.: /acervo/ fixa e com data): fica a que tem mais dados.
  const porUrl = new Map<string, EntradaDoMapa>()
  for (const e of entradas) {
    const antes = porUrl.get(e.url)
    if (!antes) porUrl.set(e.url, e)
    else porUrl.set(e.url, { url: e.url, modificadaEm: e.modificadaEm ?? antes.modificadaEm, imagens: e.imagens ?? antes.imagens })
  }
  const linhas = [...porUrl.values()]
    .map((e) => [
      '  <url>',
      `    <loc>${escapar(e.url)}</loc>`,
      ...(e.modificadaEm ? [`    <lastmod>${dataDoMapa(e.modificadaEm)}</lastmod>`] : []),
      ...(e.imagens ?? []).slice(0, 1000).map((i) => `    <image:image><image:loc>${escapar(i)}</image:loc></image:image>`),
      '  </url>',
    ].join('\n'))
  const comImagens = [...porUrl.values()].some((e) => e.imagens?.length)
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"${comImagens ? ' xmlns:image="http://www.google.com/schemas/sitemap-image/1.1"' : ''}>`,
    ...linhas,
    '</urlset>',
    '',
  ].join('\n')
}

export function gerarRobots(origem: string = ORIGEM_DO_SITE): string {
  // Aberto de propósito: site institucional existe para ser encontrado.
  //
  // São dois mapas, e os dois precisam estar aqui. O sitemap.xml é este, regerado a
  // cada publicação. O sitemap-index.xml é do outro repositório (o site em si) e reúne
  // páginas, notícias e subdomínios. Este arquivo é escrito por cima do que estiver lá,
  // então omitir o índice o apagava a cada matéria publicada.
  // A porta da equipe do acervo leva ao login da Redação: não é página para a busca.
  return [
    'User-agent: *',
    'Allow: /',
    'Disallow: /acervo/equipe/',
    '',
    `Sitemap: ${origem}/sitemap-index.xml`,
    `Sitemap: ${origem}/sitemap.xml`,
    '',
  ].join('\n')
}
