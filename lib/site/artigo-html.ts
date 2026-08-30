import { parseContentBlocks, type ContentBlock, type InlineToken } from '@/lib/content-blocks'

/**
 * Monta a página de uma matéria para o site institucional.
 *
 * Uma página só, sem framework: o servidor é FTP na Hostinger. CSS vai
 * embutido. Header, footer, logo, favicon e paleta repetem o site
 * (cruzvermelhariodejaneiro.org) — paths de marca apontam para /assets
 * na origem do domínio, não para a pasta da matéria.
 */

const ESCAPES: Record<string, string> = {
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
}

/** Todo texto que vem do banco passa por aqui antes de virar HTML. */
export function escapar(texto: string): string {
  return texto.replace(/[&<>"']/g, (c) => ESCAPES[c])
}

function origemDoSite(baseUrl: string): string {
  try {
    return new URL(baseUrl).origin
  } catch {
    return 'https://cruzvermelhariodejaneiro.org'
  }
}

/** Endereços que podem virar href. Barra a porta para javascript: e data:. */
function hrefSeguro(url: string): string | null {
  try {
    const u = new URL(url, 'https://exemplo.invalido')
    if (!['http:', 'https:', 'mailto:'].includes(u.protocol)) return null
    return url
  } catch {
    return null
  }
}

function renderInline(tokens: InlineToken[]): string {
  return tokens.map((t) => {
    if (t.type === 'bold') return `<strong>${escapar(t.text)}</strong>`
    if (t.type === 'italic') return `<em>${escapar(t.text)}</em>`
    if (t.type === 'link') {
      const href = hrefSeguro(t.href)
      if (!href) return escapar(t.text)
      return `<a href="${escapar(href)}" rel="noopener">${escapar(t.text)}</a>`
    }
    return escapar(t.text)
  }).join('')
}

function textoDoInline(tokens: InlineToken[]): string {
  return tokens.map((t) => (t.type === 'link' ? t.text : t.text)).join('')
}

export type ArquivoLocal = { nome: string; alt: string }

function renderBlocos(blocos: ContentBlock[], arquivos: Map<string, ArquivoLocal>): string {
  const partes: string[] = []
  for (const bloco of blocos) {
    if (bloco.type === 'image' || bloco.type === 'video' || bloco.type === 'audio') {
      const local = arquivos.get(bloco.url)
      if (!local) continue
      const alt = escapar(local.alt || bloco.alt || '')
      if (bloco.type === 'image') partes.push(`<figure><img src="${escapar(local.nome)}" alt="${alt}" loading="lazy" decoding="async">${alt ? `<figcaption>${alt}</figcaption>` : ''}</figure>`)
      else if (bloco.type === 'video') partes.push(`<figure><video src="${escapar(local.nome)}" controls playsinline></video>${alt ? `<figcaption>${alt}</figcaption>` : ''}</figure>`)
      else partes.push(`<figure><audio src="${escapar(local.nome)}" controls></audio>${alt ? `<figcaption>${alt}</figcaption>` : ''}</figure>`)
      continue
    }
    if (bloco.type === 'heading') { partes.push(`<h2>${renderInline(bloco.inline)}</h2>`); continue }
    if (bloco.type === 'quote') { partes.push(`<blockquote>${renderInline(bloco.inline)}</blockquote>`); continue }
    if (bloco.type === 'list') {
      partes.push(`<ul>${bloco.items.map((i) => `<li>${renderInline(i)}</li>`).join('')}</ul>`)
      continue
    }
    partes.push(`<p>${renderInline(bloco.inline)}</p>`)
  }
  return partes.join('\n      ')
}

/** Resumo para a meta description e para o card das redes. */
export function resumoDoCorpo(blocos: ContentBlock[], limite = 155): string {
  const primeiro = blocos.find((b) => b.type === 'text' || b.type === 'quote')
  if (!primeiro || !('inline' in primeiro)) return ''
  const texto = textoDoInline(primeiro.inline).replace(/\s+/g, ' ').trim()
  if (texto.length <= limite) return texto
  return `${texto.slice(0, limite).replace(/\s+\S*$/, '')}…`
}

const CSS = `
:root{
  --red:#cc0000;--red-dark:#a30000;--black:#0f1318;--ink:#0f1318;
  --text:#1a202c;--muted:#718096;--line:#e2e8f0;--soft:#f7f8fa;
  --paper:#ffffff;--stone:#f7f8fa;--blue:#2b6cb0;--max:1100px
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
.materia{background:var(--paper)}
.materia-wrap{width:min(720px,calc(100% - 40px));margin:0 auto;padding:48px 0 80px}
.materia-kicker{color:var(--red);font-size:.72rem;font-weight:800;letter-spacing:.14em;text-transform:uppercase;margin:0 0 14px}
.materia h1{color:var(--black);font-size:clamp(1.85rem,3.4vw,2.55rem);line-height:1.12;letter-spacing:-.035em;font-weight:800;margin:0 0 .7rem}
.linhafina{font-size:1.12rem;color:var(--muted);margin:0 0 1.25rem;line-height:1.5;font-weight:500}
.data{font-size:13px;color:var(--muted);border-bottom:1px solid var(--line);padding-bottom:1.2rem;margin:0 0 2rem}
article p{margin:0 0 1.25rem;font-size:1.05rem;line-height:1.75;color:var(--text)}
article h2{color:var(--black);font-size:1.35rem;line-height:1.25;letter-spacing:-.02em;margin:2.4rem 0 .7rem}
article a{color:var(--red);text-decoration:underline;text-underline-offset:3px}
article ul{margin:0 0 1.25rem;padding-left:1.2rem}
article li{margin-bottom:.45rem;line-height:1.7}
blockquote{margin:2rem 0;padding:.2rem 0 .2rem 1.15rem;border-left:3px solid var(--red);color:var(--muted);font-style:italic}
figure{margin:2rem 0}
figure img,figure video{width:100%;height:auto;display:block;border-radius:12px}
figcaption{font-size:13px;color:var(--muted);margin-top:.55rem}
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
  .materia-wrap{width:min(720px,calc(100% - 32px));padding:32px 0 64px}
}
@media print{
  .main-header,footer,.wpp-float{display:none}
  body{font-size:12pt}
}
`.trim()

export type DadosDoArtigo = {
  titulo: string
  subtitulo?: string | null
  corpo?: string | null
  slug: string
  /** Endereço da pasta que guarda as matérias, sem barra no fim. */
  baseUrl: string
  publicadoEm: Date
  atualizadoEm?: Date | null
  autor?: string | null
  organizacao?: string
  arquivos?: Map<string, ArquivoLocal>
}

export function montarPaginaDoArtigo(dados: DadosDoArtigo): string {
  const org = dados.organizacao || 'Cruz Vermelha Brasileira — Rio de Janeiro'
  const arquivos = dados.arquivos ?? new Map()
  const blocos = parseContentBlocks(dados.corpo)

  const base = dados.baseUrl.replace(/\/+$/, '')
  const origem = origemDoSite(base)
  const assets = `${origem}/assets`
  const home = `${origem}/`
  const canonica = `${base}/${dados.slug}/`

  const descricao = (dados.subtitulo?.trim() || resumoDoCorpo(blocos) || dados.titulo).slice(0, 300)

  const primeiraImagem = blocos.find((b) => b.type === 'image')
  const capa = primeiraImagem && 'url' in primeiraImagem ? arquivos.get(primeiraImagem.url) : undefined
  const capaUrl = capa ? `${canonica}${capa.nome}` : ''

  const publicado = dados.publicadoEm.toISOString()
  const atualizado = (dados.atualizadoEm ?? dados.publicadoEm).toISOString()
  const dataLegivel = new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit', month: 'long', year: 'numeric', timeZone: 'America/Sao_Paulo',
  }).format(dados.publicadoEm)
  const ano = new Intl.DateTimeFormat('pt-BR', { year: 'numeric', timeZone: 'America/Sao_Paulo' }).format(dados.publicadoEm)

  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'NewsArticle',
    headline: dados.titulo.slice(0, 110),
    description: descricao,
    datePublished: publicado,
    dateModified: atualizado,
    inLanguage: 'pt-BR',
    mainEntityOfPage: { '@type': 'WebPage', '@id': canonica },
    publisher: {
      '@type': 'Organization',
      name: org,
      logo: { '@type': 'ImageObject', url: `${assets}/logo-cvb-rj.png` },
    },
    ...(dados.autor ? { author: { '@type': 'Person', name: dados.autor } } : {}),
    ...(capaUrl ? { image: [capaUrl] } : {}),
  }

  const meta = [
    `<meta charset="utf-8">`,
    `<meta name="viewport" content="width=device-width, initial-scale=1">`,
    `<title>${escapar(dados.titulo)} — ${escapar(org)}</title>`,
    `<meta name="description" content="${escapar(descricao)}">`,
    `<link rel="canonical" href="${escapar(canonica)}">`,
    `<link rel="icon" type="image/svg+xml" href="${escapar(assets)}/favicon.svg">`,
    `<link rel="icon" type="image/png" href="${escapar(assets)}/favicon.png">`,
    `<link rel="apple-touch-icon" href="${escapar(assets)}/favicon.png">`,
    `<meta name="theme-color" content="#cc0000">`,
    `<meta name="robots" content="index, follow, max-image-preview:large">`,
    `<meta property="og:type" content="article">`,
    `<meta property="og:site_name" content="${escapar(org)}">`,
    `<meta property="og:locale" content="pt_BR">`,
    `<meta property="og:title" content="${escapar(dados.titulo)}">`,
    `<meta property="og:description" content="${escapar(descricao)}">`,
    `<meta property="og:url" content="${escapar(canonica)}">`,
    ...(capaUrl ? [`<meta property="og:image" content="${escapar(capaUrl)}">`] : []),
    `<meta property="article:published_time" content="${publicado}">`,
    `<meta property="article:modified_time" content="${atualizado}">`,
    `<meta name="twitter:card" content="${capaUrl ? 'summary_large_image' : 'summary'}">`,
    `<meta name="twitter:title" content="${escapar(dados.titulo)}">`,
    `<meta name="twitter:description" content="${escapar(descricao)}">`,
    ...(capaUrl ? [`<meta name="twitter:image" content="${escapar(capaUrl)}">`] : []),
    `<link rel="preconnect" href="https://fonts.googleapis.com">`,
    `<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>`,
    `<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&display=swap" rel="stylesheet">`,
    `<link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css">`,
  ].join('\n    ')

  return `<!doctype html>
<html lang="pt-BR">
  <head>
    ${meta}
    <style>${CSS}</style>
    <script type="application/ld+json">${JSON.stringify(jsonLd).replace(/</g, '\\u003c')}</script>
  </head>
  <body>
    <header class="main-header">
      <div class="header-container">
        <a href="${escapar(home)}" class="logo-area">
          <img src="${escapar(assets)}/logo-cvb-rj.png" alt="Cruz Vermelha Brasileira — Rio de Janeiro" class="logo-img">
        </a>
        <button class="nav-toggle" type="button" aria-label="Abrir menu" aria-expanded="false">
          <i class="fa-solid fa-bars"></i>
        </button>
        <div class="header-collapse">
          <nav class="nav-links">
            <a href="${escapar(origem)}/#institucional">Sobre</a>
            <a href="https://escola.cursoscruzvermelha.org" target="_blank" rel="noopener">Cursos</a>
            <a href="${escapar(origem)}/#campanhas">Campanhas</a>
            <a href="${escapar(origem)}/#parceiros">Parceiros</a>
            <a href="${escapar(origem)}/#faq">FAQ</a>
            <a href="${escapar(origem)}/equipe.html">Equipe</a>
            <a href="${escapar(origem)}/#contato">Contato</a>
          </nav>
          <div class="header-actions">
            <a href="https://escola.cursoscruzvermelha.org" class="btn-login-sutil" target="_blank" rel="noopener"><i class="fa-solid fa-graduation-cap"></i> Plataforma</a>
          </div>
        </div>
      </div>
    </header>

    <main class="materia">
      <div class="materia-wrap">
        <p class="materia-kicker">Notícias</p>
        <h1>${escapar(dados.titulo)}</h1>
        ${dados.subtitulo?.trim() ? `<p class="linhafina">${escapar(dados.subtitulo.trim())}</p>` : ''}
        <p class="data">
          <time datetime="${publicado}">${dataLegivel}</time>${dados.autor ? ` · ${escapar(dados.autor)}` : ''}
        </p>
        <article>
      ${renderBlocos(blocos, arquivos)}
        </article>
      </div>
    </main>

    <footer>
      <div class="footer-grid">
        <div class="footer-brand">
          <img class="footer-logo" src="${escapar(assets)}/logo-cvb-rj.png" alt="Cruz Vermelha Brasileira — Rio de Janeiro">
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
          <a href="${escapar(origem)}/privacidade">Política de Privacidade</a>
        </div>
      </div>
    </footer>

    <a class="wpp-float" href="https://wa.me/5521999922864?text=Ol%C3%A1!%20Tenho%20uma%20d%C3%BAvida%20sobre%20os%20cursos%20da%20Escola%20de%20Capacita%C3%A7%C3%A3o." target="_blank" rel="noopener" aria-label="Falar no WhatsApp">
      <i class="fa-brands fa-whatsapp"></i>
    </a>
    <script>
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
    </script>
  </body>
</html>
`
}
