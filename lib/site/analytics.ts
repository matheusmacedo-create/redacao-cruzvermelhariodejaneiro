/**
 * O Google Analytics e o Pixel da Meta do site institucional — só com
 * consentimento (LGPD; Guia de Cookies da ANPD).
 *
 * Os identificadores não são segredo: eles saem impressos no HTML de toda
 * página que os carrega — estão na home pública desde sempre. O que este
 * módulo garante é OUTRA coisa: que todas as páginas usem os MESMOS
 * identificadores e o MESMO bloco da home, porque duas versões do trecho é
 * como um site passa a contar metade das visitas sem ninguém perceber — ou a
 * medir quem não deixou.
 *
 * Dois usos, uma fonte:
 *  - o gerador de páginas (matéria, notícias, acervo, portal) inclui o bloco
 *    em toda página que nasce;
 *  - o enxerto por FTP (ligarAnalyticsDoSite) completa as páginas que já
 *    existem no servidor e ficaram de fora.
 */

/** O mesmo identificador que a home do site já usa. */
export const ID_DO_ANALYTICS = 'G-HDYZZ5JZHF'
/**
 * A propriedade do GA4 desse identificador (Administrador → Detalhes da
 * propriedade), de onde Resultados lê os números pela Data API. Também não é
 * segredo: sem a conta de serviço com acesso de Leitor, ninguém lê nada com ele.
 */
export const ID_DA_PROPRIEDADE = '544248603'
/** O Pixel da Meta da home. */
export const ID_DO_PIXEL = '2224500131617302'

/**
 * A tag do aviso de cookies (/consentimento/consentimento.js?v=HASH), com a
 * versão que a home usa agora.
 *
 * O arquivo é do repositório do site e fica em cache por um ano: quem muda o
 * aviso muda o HASH. Por isso a versão não mora aqui — prepararChatDoSite()
 * (lib/site/chat-do-site.ts) a lê da home na hora de publicar e a guarda com
 * usarAvisoDeCookies(). Sem ela o bloco sai sem a tag: o aviso não aparece e
 * ninguém é medido (só quem já escolheu "sim" em outra página do site), que é
 * a falha segura — nunca um endereço adivinhado.
 */
let tagDoAvisoDeCookies = ''

export function usarAvisoDeCookies(tag: string): void {
  tagDoAvisoDeCookies = tag
}

/**
 * O bloco de medição, copiado da home (site/index.html, de "Google tag
 * (gtag.js)" a "End Meta Pixel Code") byte a byte; só a tag do aviso de
 * cookies, a última linha, vem de fora. O Consent Mode do Google começa
 * negado, sem o <noscript> do Pixel e sem fbq('consent', 'revoke') antes do
 * init: com o fbevents.js baixado só depois do "Aceitar todos", o revoke na
 * fila travava o Pixel (de 27/09 a 02/10 nada saiu). O gtag.js e o fbevents.js
 * só são baixados quando o cookie cvrj_consentimento, gravado pelo aviso,
 * permite; o aviso liga a medição na hora da escolha por window.cvrjMedicao
 * ({ ler, aplicar }).
 *
 * Mudou o bloco na home, muda aqui — e a conferência byte a byte da §7.6.
 */
export function blocoDoAnalytics(avisoDeCookies: string = tagDoAvisoDeCookies): string {
  return `<!-- Google tag (gtag.js) -->
  <script>
    // Consentimento antes de tudo (LGPD; Guia de Cookies da ANPD): estatística e marketing negados até a
    // pessoa escolher no aviso de cookies. As chamadas abaixo só ficam na fila; o gtag.js nem é baixado.
    window.dataLayer = window.dataLayer || [];
    function gtag(){dataLayer.push(arguments);}
    gtag('consent', 'default', { analytics_storage: 'denied', ad_storage: 'denied', ad_user_data: 'denied', ad_personalization: 'denied' });
    gtag('js', new Date());

    gtag('config', '${ID_DO_ANALYTICS}', { linker: { domains: ['escola.cursoscruzvermelha.org'] } });
  </script>

  <!-- Meta Pixel Code -->
  <script>
  !function(f,b,e,v,n,t,s)
  {if(f.fbq)return;n=f.fbq=function(){n.callMethod?
  n.callMethod.apply(n,arguments):n.queue.push(arguments)};
  if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';
  n.queue=[]}(window, document,'script',
  'https://connect.facebook.net/en_US/fbevents.js');
  // Sem fbq('consent', 'revoke') antes do init: o fbevents.js só é baixado com consentimento, e um revoke
  // na fila travava o Pixel (o grant ficava atrás do PageView e nada era enviado, nem com "Aceitar todos").
  fbq('init', '${ID_DO_PIXEL}');
  fbq('track', 'PageView');
  </script>
  <script>
    // Medição só com consentimento. A escolha fica no cookie cvrj_consentimento (todo
    // *.cruzvermelhariodejaneiro.org, 12 meses), gravado pelo aviso de cookies (/consentimento/).
    // Sem escolha, ou com "não", nem o gtag.js nem o fbevents.js são baixados. Com "sim", eles entram
    // depois de a página carregar (load + ocioso), e as chamadas da fila saem nessa hora.
    (function () {
      var GTAG = 'https://www.googletagmanager.com/gtag/js?id=${ID_DO_ANALYTICS}';
      var PIXEL = 'https://connect.facebook.net/en_US/fbevents.js';
      var baixados = {};
      function ler() {
        var m = document.cookie.match(/(?:^|;\\s*)cvrj_consentimento=([^;]+)/);
        if (!m) return null;
        var p = {};
        try { decodeURIComponent(m[1]).split('&').forEach(function (par) { var i = par.indexOf('='); if (i > 0) p[par.slice(0, i)] = par.slice(i + 1); }); } catch (e) { return null; }
        return p.v === '1' ? { estatistica: p.e === '1', marketing: p.m === '1' } : null;
      }
      function baixar(src) {
        if (baixados[src]) return;
        baixados[src] = 1;
        var s = document.createElement('script'); s.async = true; s.src = src; document.head.appendChild(s);
      }
      function aplicar(c) {
        c = c || ler();
        if (!c) return;
        window['ga-disable-${ID_DO_ANALYTICS}'] = !c.estatistica;
        gtag('consent', 'update', {
          analytics_storage: c.estatistica ? 'granted' : 'denied',
          ad_storage: c.marketing ? 'granted' : 'denied',
          ad_user_data: c.marketing ? 'granted' : 'denied',
          ad_personalization: c.marketing ? 'granted' : 'denied'
        });
        fbq('consent', c.marketing ? 'grant' : 'revoke');
        if (c.estatistica) baixar(GTAG);
        if (c.marketing) baixar(PIXEL);
      }
      window.cvrjMedicao = { ler: ler, aplicar: aplicar };
      function agendar() {
        if (!ler()) return;
        if ('requestIdleCallback' in window) requestIdleCallback(function () { aplicar(); }, { timeout: 2500 });
        else setTimeout(function () { aplicar(); }, 800);
      }
      if (document.readyState === 'complete') agendar(); else window.addEventListener('load', agendar);
    })();
  </script>${avisoDeCookies ? `
  ${avisoDeCookies}` : ''}
  <!-- End Meta Pixel Code -->`
}

/**
 * A página já carrega o gtag? Vale qualquer identificador e todas as formas do
 * bloco — a antiga (<script async src=".../gtag/js">), a que buscava o gtag.js
 * depois do load e a de agora, que só o busca com consentimento (o endereço
 * fica numa variável do bloco): uma página com qualquer uma delas não deve
 * ganhar uma segunda, porque página com dois gtags conta cada visita duas vezes.
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
 * Google pede —, com o aviso de cookies que prepararChatDoSite() deixou pronto.
 *
 * As recusas são o contrato: página sem </head> não é uma página inteira
 * (pode ser um fragmento, um e-mail, um arquivo pela metade) e gravar nela
 * às cegas é como se corrompe um site inteiro por FTP. Na dúvida, não grava.
 */
export function ligarAnalyticsNaPagina(html: string): ResultadoDoEnxerto {
  if (temAnalytics(html)) {
    return { estado: 'ja-ligado', detalhe: 'A página já carrega o Google Analytics.' }
  }
  const fim = html.search(/<\/head\s*>/i)
  if (fim === -1) {
    return { estado: 'recusado', detalhe: 'A página não tem </head> — não parece uma página inteira.' }
  }
  const bloco = `\n${blocoDoAnalytics()}\n`
  return {
    estado: 'ligado',
    html: html.slice(0, fim) + bloco + html.slice(fim),
    detalhe: `Google Analytics (${ID_DO_ANALYTICS}) ligado na página.`,
  }
}
