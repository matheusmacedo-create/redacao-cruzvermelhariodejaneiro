/**
 * O Google Analytics e o Pixel da Meta do site institucional.
 *
 * Os identificadores não são segredo: eles saem impressos no HTML de toda
 * página que os carrega — estão na home pública desde sempre. O que este
 * módulo garante é OUTRA coisa: que todas as páginas usem os MESMOS
 * identificadores e o MESMO bloco da home, porque duas versões do trecho é
 * como um site passa a contar metade das visitas sem ninguém perceber.
 *
 * Dois usos, uma fonte:
 *  - o gerador de páginas (matéria, notícias, privacidade, termos, acervo)
 *    inclui o bloco em toda página que nasce;
 *  - o enxerto por FTP (ligarAnalyticsDoSite) completa as páginas que já
 *    existem no servidor e ficaram de fora.
 */

/** O mesmo identificador que a home do site já usa. */
export const ID_DO_ANALYTICS = 'G-HDYZZ5JZHF'
/** O Pixel da Meta da home. */
export const ID_DO_PIXEL = '2224500131617302'

/**
 * O bloco, copiado da home (site/index.html, "Google tag (gtag.js)"): a
 * configuração do GA4 com o linker da escola (a visita que continua na
 * plataforma é a mesma), o Pixel com o PageView e, no fim, o carregador que
 * busca gtag.js e fbevents.js só depois do `load`, no tempo ocioso — as
 * chamadas feitas antes ficam na fila e saem quando os scripts chegam.
 */
export function blocoDoAnalytics(id: string = ID_DO_ANALYTICS, pixel: string = ID_DO_PIXEL): string {
  return `<!-- Google tag (gtag.js) -->
  <script>
    window.dataLayer = window.dataLayer || [];
    function gtag(){dataLayer.push(arguments);}
    gtag('js', new Date());

    gtag('config', '${id}', { linker: { domains: ['escola.cursoscruzvermelha.org'] } });
  </script>

  <!-- Meta Pixel Code -->
  <script>
  !function(f,b,e,v,n,t,s)
  {if(f.fbq)return;n=f.fbq=function(){n.callMethod?
  n.callMethod.apply(n,arguments):n.queue.push(arguments)};
  if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';
  n.queue=[]}(window, document,'script',
  'https://connect.facebook.net/en_US/fbevents.js');
  fbq('init', '${pixel}');
  fbq('track', 'PageView');
  </script>
  <noscript><img height="1" width="1" style="display:none" alt=""
  src="https://www.facebook.com/tr?id=${pixel}&ev=PageView&noscript=1"
  /></noscript>
  <script>
    // Os scripts do GA4 e do Pixel carregam depois de a página estar pronta (load + ocioso).
    // As chamadas gtag() e fbq() feitas antes ficam na fila e saem quando os scripts chegam.
    (function () {
      function carregar() {
        ['https://www.googletagmanager.com/gtag/js?id=${id}', 'https://connect.facebook.net/en_US/fbevents.js'].forEach(function (src) {
          var s = document.createElement('script'); s.async = true; s.src = src; document.head.appendChild(s);
        });
      }
      function agendar() { if ('requestIdleCallback' in window) requestIdleCallback(carregar, { timeout: 2500 }); else setTimeout(carregar, 800); }
      if (document.readyState === 'complete') agendar(); else window.addEventListener('load', agendar);
    })();
  </script>
  <!-- End Meta Pixel Code -->`
}

/**
 * A página já carrega o gtag? Vale qualquer identificador e as duas formas do
 * bloco — a antiga (<script async src=".../gtag/js">) e a da home, que busca o
 * gtag.js depois do load: uma página com qualquer uma delas não deve ganhar
 * uma segunda, porque página com dois gtags conta cada visita duas vezes.
 */
export function temAnalytics(html: string): boolean {
  return html.includes('googletagmanager.com/gtag/js') || /gtag\(\s*['"]config['"]\s*,\s*['"]G-/.test(html)
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
