/**
 * Os atalhos para a central de notícias na PÁGINA INICIAL do site.
 *
 * A home é um arquivo que não é gerado por nós — é editado por fora. O enxerto
 * segue as regras do formulário da newsletter: idempotente, âncora conhecida,
 * e recusa quando a página não tem a forma esperada. Recusar é o comportamento
 * correto: gravar "quase no lugar certo" numa home de produção é pior do que
 * não gravar.
 */

export type ResultadoDoAtalho =
  | { estado: 'ligado'; html: string; detalhe: string }
  | { estado: 'ja-ligado'; detalhe: string }
  | { estado: 'recusado'; detalhe: string }

const LINK_NAV = '<a href="/noticias/">Notícias</a>'
const ANCORA_NAV = '<a href="#institucional">Sobre</a>'
const LINK_RODAPE = '<a href="/noticias/">Notícias</a>\n        <span class="sep">|</span>'
const LINK_TERMOS = '<span class="sep">|</span>\n        <a href="/termos/">Termos de Uso</a>'
const ANCORA_RODAPE = '<a href="/privacidade">Política de Privacidade</a>'

export function ligarAtalhosNaHome(html: string): ResultadoDoAtalho {
  const temNav = /href="\/noticias\/?"[^>]*>\s*Not[íi]cias/i.test(html.slice(0, html.indexOf('</nav>') + 7))
  const temRodape = html.includes('/termos/')

  if (temNav && temRodape) {
    return { estado: 'ja-ligado', detalhe: 'A página inicial já tem os atalhos de Notícias e Termos.' }
  }

  let saida = html
  const feitos: string[] = []

  if (!temNav) {
    if (!saida.includes(ANCORA_NAV)) {
      return { estado: 'recusado', detalhe: 'Não encontrei o menu da página inicial no formato esperado — nada foi gravado.' }
    }
    // Depois de "Sobre": notícia é o segundo motivo de visita de um site
    // institucional, e o fim do menu é onde ninguém olha.
    saida = saida.replace(ANCORA_NAV, `${ANCORA_NAV}\n          ${LINK_NAV}`)
    feitos.push('menu superior')
  }

  if (!temRodape) {
    if (!saida.includes(ANCORA_RODAPE)) {
      return { estado: 'recusado', detalhe: 'Não encontrei o rodapé da página inicial no formato esperado — nada foi gravado.' }
    }
    saida = saida.replace(
      ANCORA_RODAPE,
      `${LINK_RODAPE}\n        ${ANCORA_RODAPE}\n        ${LINK_TERMOS}`,
    )
    feitos.push('rodapé')
  }

  return { estado: 'ligado', html: saida, detalhe: `Atalhos ligados: ${feitos.join(' e ')}.` }
}
