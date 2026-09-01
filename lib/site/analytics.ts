/**
 * O Google Analytics do site institucional.
 *
 * O identificador não é segredo: ele sai impresso no HTML de toda página que
 * o carrega — está na home pública desde sempre. O que este módulo garante é
 * OUTRA coisa: que todas as páginas usem o MESMO identificador e o MESMO
 * bloco, porque duas versões do trecho é como um site passa a contar metade
 * das visitas sem ninguém perceber.
 *
 * Dois usos, uma fonte:
 *  - o gerador de páginas de notícia inclui o bloco em toda página que nasce;
 *  - o enxerto por FTP (ligarAnalyticsDoSite) completa as páginas que já
 *    existem no servidor e ficaram de fora.
 */

/** O mesmo identificador que a home do site já usa. */
export const ID_DO_ANALYTICS = 'G-HDYZZ5JZHF'

/** O bloco, idêntico ao que a home carrega — uma versão só para o site todo. */
export function blocoDoAnalytics(id: string = ID_DO_ANALYTICS): string {
  return [
    '<!-- Google tag (gtag.js) -->',
    `<script async src="https://www.googletagmanager.com/gtag/js?id=${id}"></script>`,
    '<script>',
    '  window.dataLayer = window.dataLayer || [];',
    '  function gtag(){dataLayer.push(arguments);}',
    "  gtag('js', new Date());",
    `  gtag('config', '${id}');`,
    '</script>',
  ].join('\n')
}

/**
 * A página já carrega o gtag? Vale qualquer identificador: uma página com o
 * trecho antigo escrito à mão não deve ganhar um segundo — página com dois
 * gtags conta cada visita duas vezes.
 */
export function temAnalytics(html: string): boolean {
  return html.includes('googletagmanager.com/gtag/js')
}

export type ResultadoDoEnxerto =
  | { estado: 'ligado'; html: string; detalhe: string }
  | { estado: 'ja-ligado'; detalhe: string }
  | { estado: 'recusado'; detalhe: string }

/**
 * Põe o bloco numa página que ainda não o tem — antes do </head>, como o
 * Google pede.
 *
 * As recusas são o contrato: página sem </head> não é uma página inteira
 * (pode ser um fragmento, um e-mail, um arquivo pela metade) e gravar nela
 * às cegas é como se corrompe um site inteiro por FTP. Na dúvida, não grava.
 */
export function ligarAnalyticsNaPagina(html: string, id: string = ID_DO_ANALYTICS): ResultadoDoEnxerto {
  if (temAnalytics(html)) {
    return { estado: 'ja-ligado', detalhe: 'A página já carrega o Google Analytics.' }
  }
  const fim = html.search(/<\/head\s*>/i)
  if (fim === -1) {
    return { estado: 'recusado', detalhe: 'A página não tem </head> — não parece uma página inteira.' }
  }
  const bloco = `\n${blocoDoAnalytics(id)}\n`
  return {
    estado: 'ligado',
    html: html.slice(0, fim) + bloco + html.slice(fim),
    detalhe: `Google Analytics (${id}) ligado na página.`,
  }
}
