import { blocoDoAnalytics } from '@/lib/site/analytics'

/**
 * O esqueleto das páginas do site institucional: tokens, cabeçalho, rodapé,
 * menu e o <head> com rastreamento.
 *
 * Antes isto vivia dentro do gerador de matérias, e cada página nova ia
 * exigir uma cópia — e cópia de chrome é como um site ganha dois rodapés
 * diferentes em seis meses. A matéria, a central de notícias, a privacidade
 * e os termos agora vestem o MESMO esqueleto, deste arquivo.
 */

const ESCAPES: Record<string, string> = {
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
}

/** Todo texto que vem do banco passa por aqui antes de virar HTML. */
export function escapar(texto: string): string {
  return texto.replace(/[&<>"']/g, (c) => ESCAPES[c])
}

export function origemDoSite(baseUrl: string): string {
  try {
    return new URL(baseUrl).origin
  } catch {
    return 'https://cruzvermelhariodejaneiro.org'
  }
}

/**
 * A folha inteira do site — tokens, chrome E os estilos de matéria juntos,
 * como sempre foi. Não separamos de propósito: cada página carrega alguns KB
 * a mais e em troca nenhuma regra pode divergir entre uma página e outra.
 */
export const CSS_DO_SITE = `
:root{
  --red:#cc0000;--red-dark:#a30000;--black:#0f1318;--ink:#0f1318;
  --text:#1a202c;--muted:#718096;--line:#e2e8f0;--soft:#f7f8fa;
  --paper:#ffffff;--stone:#f7f8fa;--blue:#2b6cb0;--max:1100px;
  --coluna:680px;--coluna-larga:940px;
  /* Tokens editoriais do briefing "jornal digital" — usados na área de
     notícias; o chrome do site continua na paleta antiga. */
  --news-ink:#111111;--ink-2:#2B2B2B;--news-muted:#5C6570;
  --brand:#C8102E;--brand-dark:#8B0E20;--news-line:#D6D6D6;
  /* Fundo branco por decisão da redação (o off-white quente do briefing
     pareceu amarelado); o box de contexto segue num cinza neutro claro. */
  --news-paper:#ffffff;--box:#F4F4F2;
  --max-folio:1180px;--col-rail:320px;--gutter:40px;
  --serif:'Source Serif 4',Georgia,'Times New Roman',serif;
  --sans:Inter,'Source Sans 3',Arial,sans-serif
}
*{box-sizing:border-box}
html{scroll-behavior:smooth}
body{margin:0;font-family:Inter,Arial,sans-serif;color:var(--text);background:var(--paper);line-height:1.55}
img{display:block;max-width:100%}
a{color:inherit;text-decoration:none}
.main-header{background:var(--paper);position:sticky;top:0;z-index:1000;box-shadow:0 12px 28px rgba(16,24,40,.10)}
.header-container{width:100%;display:flex;justify-content:space-between;align-items:center;padding:16px 32px;gap:16px;position:relative}
.logo-area{display:flex;align-items:center;gap:12px;flex-shrink:0;color:inherit}
.logo-img{height:52px;width:auto;display:block;flex-shrink:0;object-fit:contain}
.nav-links{display:flex;gap:32px;position:absolute;left:50%;transform:translateX(-50%);justify-content:center}
.nav-links a{color:var(--muted);font-weight:600;font-size:13.5px;letter-spacing:.2px;transition:color .2s;position:relative;padding-bottom:2px}
.nav-links a::after{content:'';position:absolute;bottom:-2px;left:0;width:0;height:2px;background:var(--red);transition:width .2s}
.nav-links a:hover,.nav-links a[aria-current="page"]{color:var(--red)}
.nav-links a:hover::after,.nav-links a[aria-current="page"]::after{width:100%}
.nav-toggle{display:none;border:0;background:transparent;font-size:24px;color:var(--ink);cursor:pointer;margin-left:auto}
.header-collapse{display:flex;align-items:center;gap:24px;margin-left:auto}
.header-actions{display:flex;gap:12px;align-items:center}
.btn-login-sutil{color:var(--red);font-weight:600;font-size:13.5px;display:flex;align-items:center;gap:6px;padding:8px 16px;border-radius:6px;transition:background .2s}
.btn-login-sutil:hover{background:rgba(204,0,0,.08)}
@media(max-width:1024px){
  .header-container{flex-wrap:nowrap;justify-content:space-between;gap:10px;padding:14px 20px}
  .nav-toggle{display:inline-flex}
  .header-collapse{display:none;position:absolute;top:100%;left:0;right:0;background:var(--paper);flex-direction:column;padding:8px 20px 18px;box-shadow:0 18px 40px rgba(11,18,32,.12);border-top:1px solid var(--line);margin-left:0}
  .main-header.nav-open .header-collapse{display:flex}
  .main-header.nav-open .nav-toggle i::before{content:"\\f00d"}
  .nav-links{position:static;transform:none;left:auto;flex-direction:column;gap:0;width:100%}
  .nav-links a{padding:14px 4px;border-bottom:1px solid var(--line);width:100%}
  .nav-links a::after{display:none}
  .header-actions{display:flex;flex-direction:column;align-items:stretch;width:100%;gap:10px;margin-top:10px}
  .header-actions .btn-login-sutil{justify-content:center;width:100%}
  .logo-img{height:48px}
}
.materia{background:var(--paper);padding-bottom:72px}
.coluna{width:min(var(--coluna),calc(100% - 40px));margin:0 auto}
.coluna-larga{width:min(var(--coluna-larga),calc(100% - 40px));margin:0 auto}
.cabecalho{padding-top:44px}
.materia-kicker{color:var(--red);font-size:.72rem;font-weight:800;letter-spacing:.14em;text-transform:uppercase;margin:0 0 14px}
.materia h1{color:var(--black);font-size:clamp(1.75rem,4.2vw,2.5rem);line-height:1.16;letter-spacing:-.045em;font-weight:800;margin:0 0 .85rem}
.linhafina{font-size:1.2rem;color:var(--muted);margin:0 0 1.6rem;line-height:1.45;font-weight:400}
.materia-meta{display:flex;flex-wrap:wrap;align-items:center;gap:6px 10px;font-size:12.5px;color:var(--muted);border-top:1px solid var(--line);border-bottom:1px solid var(--line);padding:12px 0;margin:0}
.materia-por{font-weight:600;color:var(--text)}
.materia-meta .sep{color:var(--line)}
.compartilhar{display:flex;align-items:center;gap:8px;padding:16px 0 4px;flex-wrap:wrap}
.compartilhar-rotulo{font-size:11px;font-weight:800;letter-spacing:.1em;text-transform:uppercase;color:var(--muted);margin-right:2px}
.compartilhar a,.compartilhar button{width:34px;height:34px;border:1px solid var(--line);border-radius:50%;background:var(--paper);color:var(--muted);display:flex;align-items:center;justify-content:center;font-size:14px;cursor:pointer;transition:background .2s,color .2s,border-color .2s;font-family:inherit;padding:0}
.compartilhar a:hover,.compartilhar button:hover{background:var(--red);border-color:var(--red);color:#fff}
.compartilhar .copiado{background:#0f766e;border-color:#0f766e;color:#fff}
.capa{margin:28px auto 0}
.capa img,.capa video{width:100%;height:auto;border-radius:4px}
figure{margin:2.2rem 0}
figure img,figure video{width:100%;height:auto;display:block;border-radius:4px}
figcaption{font-size:13px;color:var(--muted);line-height:1.5;margin-top:.6rem}
figcaption .credito{color:#a0aec0}
article{padding-top:8px}
article p{margin:0 0 1.55rem;font-size:1.125rem;line-height:1.72;color:var(--text)}
article h2{color:var(--black);font-size:1.5rem;line-height:1.2;letter-spacing:-.03em;font-weight:800;margin:2.6rem 0 1rem}
article a{color:var(--red);text-decoration:underline;text-underline-offset:3px}
article ul,article ol{margin:0 0 1.55rem;padding-left:1.35rem}
article li{margin-bottom:.6rem;font-size:1.125rem;line-height:1.7}
article li::marker{color:var(--red)}
blockquote{margin:2.2rem 0;padding:.35rem 0 .35rem 1.25rem;border-left:4px solid var(--red);color:var(--black);font-size:1.25rem;line-height:1.45;font-weight:600;letter-spacing:-.01em}
.materia-fim{border-top:1px solid var(--line);margin-top:44px;padding-top:20px;font-size:13px;color:var(--muted)}
.materia-fim a{color:var(--red);font-weight:600}
footer{background:var(--stone);border-top:3px solid var(--red);color:var(--muted);padding:0}
.footer-grid{max-width:1100px;margin:0 auto;padding:48px 24px 36px;display:grid;grid-template-columns:1.5fr 1fr 1.3fr 1fr;gap:20px}
.footer-brand{display:flex;flex-direction:column}
.footer-logo{height:64px;width:auto;display:block;margin-bottom:12px;object-fit:contain}
.footer-brand p{font-size:13px;color:var(--muted);line-height:1.7;margin:0}
.footer-col h4{font-size:10px;font-weight:800;color:var(--black);text-transform:uppercase;letter-spacing:1.5px;margin:0 0 14px}
.footer-col p{font-size:13px;color:var(--muted);line-height:1.8;margin:0 0 8px}
.footer-col p i{color:var(--red);width:16px;margin-right:6px}
.footer-social{display:flex;gap:10px;margin-top:4px}
.footer-social a{width:34px;height:34px;border-radius:50%;background:var(--line);color:var(--muted);display:flex;align-items:center;justify-content:center;font-size:14px;transition:background .2s,color .2s}
.footer-social a:hover{background:var(--red);color:#fff}
.footer-bottom{border-top:1px solid var(--line);background:var(--line);padding:16px 0}
.footer-inner{display:flex;flex-wrap:wrap;justify-content:center;align-items:center;gap:10px;font-size:12px;color:var(--muted);max-width:1100px;margin:0 auto;padding:0 24px}
.footer-inner a{color:var(--blue);font-weight:600}
.footer-inner a:hover{color:var(--red)}
.footer-inner .sep{color:#cbd5e0}
.wpp-float{position:fixed;right:22px;bottom:22px;z-index:2000;display:flex;align-items:center;justify-content:center;width:56px;height:56px;background:#075e54;color:#fff;border-radius:50%;box-shadow:0 8px 24px rgba(0,0,0,.28);transition:box-shadow .25s,transform .25s}
.wpp-float:hover{box-shadow:0 14px 32px rgba(0,0,0,.35);transform:scale(1.1)}
.wpp-float i{font-size:28px}
@media(max-width:920px){
  .footer-grid{grid-template-columns:1fr;padding:36px 20px 28px}
  .coluna,.coluna-larga{width:calc(100% - 32px)}
  .cabecalho{padding-top:28px}
  .materia{padding-bottom:48px}
  article p,article li{font-size:1.0625rem}
}
@media print{
  .main-header,footer,.wpp-float,.compartilhar{display:none}
  body{font-size:12pt}
}

/* ═══ A folha editorial — página de notícia como jornal digital ═══
   Briefing fechado: corpo serifado, testata, grid artigo+rail, uma cor de
   ênfase (o vermelho da cruz), foto documental com legenda e crédito. */
.single-noticia{background:var(--news-paper)}
.single-noticia a:focus-visible,.single-noticia button:focus-visible{outline:2px solid var(--brand);outline-offset:2px}
.single-noticia .main-header{box-shadow:none;border-bottom:1px solid var(--news-line)}
.single-noticia .header-container{padding:10px 32px}
.single-noticia .logo-img{height:44px}
.single-noticia .nav-links a{font-size:13px}
.single-noticia .nav-links a[aria-current="page"]{color:var(--brand)}
.single-noticia .btn-login-sutil{font-size:13px}
.news-folio{max-width:var(--max-folio);margin:0 auto;padding:0 24px 56px}
.news-masthead{border-top:3px solid var(--brand);padding:14px 0 10px;font-size:11px;font-weight:700;letter-spacing:.14em;text-transform:uppercase;color:var(--ink-2);display:flex;align-items:center;gap:10px;flex-wrap:wrap}
.news-masthead .dot{color:var(--news-line)}
.news-grid{display:grid;grid-template-columns:minmax(0,1fr) var(--col-rail);gap:var(--gutter);align-items:start;padding-top:26px}
.news-article{max-width:760px;min-width:0}
.news-article .kicker{color:var(--brand);font-size:11px;font-weight:700;letter-spacing:.14em;text-transform:uppercase;margin:0 0 8px}
.news-article h1{font-family:var(--serif);font-weight:800;font-size:48px;line-height:1.12;letter-spacing:-.02em;color:var(--news-ink);margin:0}
.news-article .deck{font-family:var(--serif);font-size:21px;line-height:1.35;color:var(--news-muted);margin:12px 0 18px;font-weight:400}
.meta-bar{display:flex;justify-content:space-between;align-items:center;gap:10px 16px;flex-wrap:wrap;padding-bottom:12px;border-bottom:1px solid var(--news-line);margin-bottom:26px}
.meta-bar .byline{font-size:13px;color:var(--news-muted);display:flex;flex-wrap:wrap;align-items:baseline;gap:6px 8px}
.meta-bar .byline b{font-weight:600;color:var(--news-ink)}
.meta-bar .byline .dot{color:var(--news-line)}
.news-share{display:flex;align-items:center;gap:14px}
.news-share a,.news-share button{color:var(--news-muted);background:none;border:0;padding:2px;cursor:pointer;display:flex;transition:color .15s}
.news-share a:hover,.news-share button:hover{color:var(--brand)}
.news-share .copiado{color:#0f766e}
.news-hero{margin:0 0 28px}
.news-hero img,.news-hero video{width:100%;height:auto;border-radius:0;display:block}
.news-hero figcaption{font-size:14px;line-height:1.4;color:var(--ink-2);margin-top:.55rem}
.news-hero figcaption .credito{font-size:12px;letter-spacing:.06em;text-transform:uppercase;color:var(--news-muted)}
.news-body p{font-family:var(--serif);font-size:20px;line-height:1.58;color:var(--news-ink);margin:0 0 .85em;text-align:left}
.news-body a{color:var(--brand);text-decoration:underline;text-underline-offset:2px;text-decoration-thickness:1px}
.news-body a:hover{color:var(--brand-dark)}
.news-body strong{font-weight:600}
.news-body h2{font-family:var(--sans);font-size:19px;font-weight:700;letter-spacing:0;color:var(--news-ink);border-top:1px solid var(--news-line);padding-top:10px;margin:32px 0 14px}
.news-body ul,.news-body ol{margin:0 0 1em;padding-left:1.3rem}
.news-body li{font-family:var(--serif);font-size:19px;line-height:1.55;color:var(--news-ink);margin-bottom:.5em}
.news-body li::marker{color:var(--brand)}
.news-body blockquote{border-left:3px solid var(--brand);margin:28px 0;padding:8px 0 8px 20px;font-family:var(--serif);font-style:italic;font-size:26px;line-height:1.3;font-weight:400;color:var(--news-ink);letter-spacing:0}
.news-body figure{margin:1.8rem 0}
.news-body figure img,.news-body figure video{width:100%;height:auto;border-radius:0}
.news-body figcaption{font-size:14px;color:var(--ink-2)}
.news-body figcaption .credito{font-size:12px;letter-spacing:.06em;text-transform:uppercase;color:var(--news-muted)}
.news-source{border-top:1px solid var(--news-line);margin-top:40px;padding-top:16px;font-size:13px;color:var(--news-muted)}
.news-source a{color:var(--brand);font-weight:600}
.news-rail{position:sticky;top:88px;display:flex;flex-direction:column;gap:26px;min-width:0}
.news-rail .rail-titulo{font-size:12px;font-weight:700;letter-spacing:.12em;text-transform:uppercase;color:var(--news-ink);border-bottom:1px solid var(--news-line);padding-bottom:8px;margin:0 0 4px}
.rail-lista{list-style:none;margin:0;padding:0}
.rail-lista li{border-bottom:1px solid var(--news-line)}
.rail-lista a{display:block;padding:12px 0;color:inherit}
.rail-lista .t{font-size:14px;font-weight:600;line-height:1.3;color:var(--news-ink);display:block;margin:0 0 4px}
.rail-lista a:hover .t{color:var(--brand)}
.rail-lista time{font-size:12px;color:var(--news-muted)}
.rail-box{background:var(--box);border-top:3px solid var(--brand);padding:18px 20px}
.rail-box .rail-titulo{border-bottom:0;padding-bottom:0;margin-bottom:10px}
.rail-box ul{list-style:none;margin:0;padding:0}
.rail-box li{font-size:14.5px;line-height:1.45;color:var(--ink-2);padding-left:14px;position:relative;margin-bottom:8px}
.rail-box li::before{content:'';position:absolute;left:0;top:.55em;width:5px;height:5px;background:var(--brand)}
.rail-cta{font-size:14.5px;font-weight:600}
.rail-cta a{color:var(--brand)}
.rail-cta a:hover{color:var(--brand-dark)}
.news-more{margin-top:52px;border-top:1px solid var(--news-line);padding-top:20px}
.news-more>h2{font-family:var(--serif);font-size:28px;font-weight:700;color:var(--news-ink);margin:0 0 18px}
.news-more .cartoes{display:grid;grid-template-columns:repeat(3,1fr);gap:28px}
.news-more a{display:block;color:inherit;min-width:0}
.news-more .kicker{color:var(--brand);font-size:11px;font-weight:700;letter-spacing:.12em;text-transform:uppercase;display:block;margin-bottom:6px}
.news-more .t{font-family:var(--serif);font-size:18px;font-weight:700;line-height:1.25;color:var(--news-ink);display:block;margin-bottom:6px}
.news-more a:hover .t{color:var(--brand)}
.news-more time{font-size:12px;color:var(--news-muted)}
.single-noticia footer{margin-top:48px}
@media(max-width:1199px){
  .news-article h1{font-size:42px}
  .news-body p{font-size:19px}
  :root{--col-rail:280px;--gutter:24px}
}
@media(max-width:1023px){
  .news-grid{grid-template-columns:1fr}
  .news-rail{position:static;top:auto}
  .news-article h1{font-size:36px}
  .news-body p,.news-body li{font-size:18.5px}
}
@media(max-width:767px){
  .news-folio{padding:0 18px 40px}
  .news-article h1{font-size:32px}
  .news-article .deck{font-size:18px}
  .news-body p,.news-body li{font-size:18px}
  .news-body blockquote{font-size:22px}
  .news-more .cartoes{grid-template-columns:1fr}
  .single-noticia .header-container{padding:10px 18px}
}
`

/** O cabeçalho com o menu — o mesmo da home, com o atalho de Notícias.
 * `ativo` marca a página atual no menu (aria-current + filete). */
export function cabecalhoDoSite(origem: string, ativo?: 'noticias'): string {
  const o = escapar(origem)
  const atual = ativo === 'noticias' ? ' aria-current="page"' : ''
  return `<header class="main-header">
      <div class="header-container">
        <a href="${o}/" class="logo-area">
          <img src="${o}/assets/logo-cvb-rj.png" alt="Cruz Vermelha Brasileira — Rio de Janeiro" class="logo-img">
        </a>
        <button class="nav-toggle" type="button" aria-label="Abrir menu" aria-expanded="false">
          <i class="fa-solid fa-bars"></i>
        </button>
        <div class="header-collapse">
          <nav class="nav-links">
            <a href="${o}/#institucional">Sobre</a>
            <a href="${o}/noticias/"${atual}>Notícias</a>
            <a href="https://escola.cursoscruzvermelha.org" target="_blank" rel="noopener">Cursos</a>
            <a href="${o}/#campanhas">Campanhas</a>
            <a href="${o}/#parceiros">Parceiros</a>
            <a href="${o}/#faq">FAQ</a>
            <a href="${o}/equipe.html">Equipe</a>
            <a href="${o}/#contato">Contato</a>
          </nav>
          <div class="header-actions">
            <a href="https://escola.cursoscruzvermelha.org" class="btn-login-sutil" target="_blank" rel="noopener"><i class="fa-solid fa-graduation-cap"></i> Plataforma</a>
          </div>
        </div>
      </div>
    </header>`
}

/** O rodapé — com o endereço completo e os links das páginas de base. */
export function rodapeDoSite(origem: string, ano: number | string): string {
  const o = escapar(origem)
  return `<footer>
      <div class="footer-grid">
        <div class="footer-brand">
          <img class="footer-logo" src="${o}/assets/logo-cvb-rj.png" alt="Cruz Vermelha Brasileira — Rio de Janeiro">
          <p>Humanidade, imparcialidade, neutralidade, independência, voluntariado, unidade e universalidade.</p>
        </div>
        <div class="footer-col">
          <h4>Sobre</h4>
          <p>Cruz Vermelha Brasileira<br>Filial Rio de Janeiro</p>
        </div>
        <div class="footer-col">
          <h4>Contato</h4>
          <p><i class="fa-solid fa-location-dot"></i> Praça Cruz Vermelha, 10</p>
          <p><i class="fa-solid fa-phone"></i> (21) 99992-2864</p>
          <p><i class="fa-regular fa-envelope"></i> contato@cruzvermelhariodejaneiro.org</p>
        </div>
        <div class="footer-col">
          <h4>Siga-nos</h4>
          <div class="footer-social">
            <a href="https://www.facebook.com/profile.php?id=61591390052128" target="_blank" rel="noopener" aria-label="Facebook"><i class="fa-brands fa-facebook-f"></i></a>
            <a href="https://www.linkedin.com" target="_blank" rel="noopener" aria-label="LinkedIn"><i class="fa-brands fa-linkedin-in"></i></a>
            <a href="https://www.instagram.com/cruzvermelhabrasileirarj/" target="_blank" rel="noopener" aria-label="Instagram"><i class="fa-brands fa-instagram"></i></a>
            <a href="https://www.tiktok.com" target="_blank" rel="noopener" aria-label="TikTok"><i class="fa-brands fa-tiktok"></i></a>
          </div>
        </div>
      </div>
      <div class="footer-bottom">
        <div class="footer-inner">
          <span>&copy; ${ano} Cruz Vermelha Brasileira do Rio de Janeiro</span>
          <span class="sep">|</span>
          <a href="${o}/noticias/">Notícias</a>
          <span class="sep">|</span>
          <a href="${o}/privacidade/">Política de Privacidade</a>
          <span class="sep">|</span>
          <a href="${o}/termos/">Termos de Uso</a>
        </div>
      </div>
    </footer>`
}

/** O script do menu de celular — só ele; script de página fica na página. */
export function scriptDoMenu(): string {
  return `<script>
      document.querySelector('.nav-toggle')?.addEventListener('click', function() {
        const header = this.closest('.main-header');
        const isOpen = header.classList.toggle('nav-open');
        this.setAttribute('aria-expanded', String(isOpen));
      });
      document.querySelectorAll('.nav-links a').forEach(function(link) {
        link.addEventListener('click', function() {
          const header = link.closest('.main-header');
          header?.classList.remove('nav-open');
          document.querySelector('.nav-toggle')?.setAttribute('aria-expanded', 'false');
        });
      });
    </script>`
}

export type DadosDaPagina = {
  titulo: string
  descricao: string
  /** Caminho canônico com barra final, ex.: /privacidade/ */
  caminho: string
  origem?: string
  /** HTML do miolo — tudo entre o cabeçalho e o rodapé. */
  corpo: string
  cssExtra?: string
  jsonLd?: object
  agora?: Date
  /** Item do menu a marcar como página atual. */
  ativo?: 'noticias'
}

/** As fontes das páginas: Inter no chrome/UI, Source Serif 4 na leitura —
 * duas famílias, quatro pesos, como o briefing editorial pede. */
export const LINK_DAS_FONTES =
  `<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700;800&family=Source+Serif+4:ital,opsz,wght@0,8..60,400;0,8..60,700;0,8..60,800;1,8..60,400&display=swap" rel="stylesheet">`

/** Uma página institucional completa, vestida com o esqueleto do site. */
export function montarPaginaDoSite(dados: DadosDaPagina): string {
  const origem = dados.origem ?? 'https://cruzvermelhariodejaneiro.org'
  const canonica = `${origem}${dados.caminho}`
  const ano = (dados.agora ?? new Date()).getFullYear()
  const meta = [
    `<meta charset="utf-8">`,
    `<meta name="viewport" content="width=device-width, initial-scale=1">`,
    `<title>${escapar(dados.titulo)} — Cruz Vermelha Brasileira — Rio de Janeiro</title>`,
    `<meta name="description" content="${escapar(dados.descricao.slice(0, 300))}">`,
    `<link rel="canonical" href="${escapar(canonica)}">`,
    `<link rel="icon" href="${escapar(origem)}/assets/logo-cvb-rj.png">`,
    `<meta name="theme-color" content="#cc0000">`,
    `<meta name="robots" content="index, follow">`,
    `<meta property="og:type" content="website">`,
    `<meta property="og:site_name" content="Cruz Vermelha Brasileira — Rio de Janeiro">`,
    `<meta property="og:locale" content="pt_BR">`,
    `<meta property="og:title" content="${escapar(dados.titulo)}">`,
    `<meta property="og:description" content="${escapar(dados.descricao.slice(0, 300))}">`,
    `<meta property="og:url" content="${escapar(canonica)}">`,
    `<link rel="preconnect" href="https://fonts.googleapis.com">`,
    `<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>`,
    LINK_DAS_FONTES,
    `<link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css">`,
  ].join('\n    ')

  return `<!doctype html>
<html lang="pt-BR">
  <head>
    ${meta}
    ${blocoDoAnalytics()}
    <style>${CSS_DO_SITE}${dados.cssExtra ?? ''}</style>${dados.jsonLd ? `
    <script type="application/ld+json">${JSON.stringify(dados.jsonLd).replace(/</g, '\\u003c')}</script>` : ''}
  </head>
  <body>
    ${cabecalhoDoSite(origem, dados.ativo)}

    ${dados.corpo}

    ${rodapeDoSite(origem, ano)}
    ${scriptDoMenu()}
  </body>
</html>
`
}
