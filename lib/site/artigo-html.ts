import { parseContentBlocks, type ContentBlock, type InlineToken } from '@/lib/content-blocks'

/**
 * Monta a página de uma matéria para o site institucional.
 *
 * Uma página só, sem framework e sem dependência externa: o servidor é um FTP
 * de hospedagem compartilhada, que serve arquivo estático e mais nada. CSS vai
 * embutido pelo mesmo motivo — um <link> para folha externa seria mais uma
 * coisa para subir, versionar e quebrar.
 *
 * O endereço termina em barra porque é assim que o Apache serve
 * `slug/index.html`: quem digita /noticias/slug/ recebe a página, e o canônico
 * declara essa forma como a única. Sem isso o mesmo texto responderia em
 * /slug, /slug/ e /slug/index.html, e o buscador dividiria a autoridade entre
 * três endereços.
 */

const ESCAPES: Record<string, string> = {
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
}

/** Todo texto que vem do banco passa por aqui antes de virar HTML. */
export function escapar(texto: string): string {
  return texto.replace(/[&<>"']/g, (c) => ESCAPES[c])
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

/**
 * Corpo em HTML. `arquivos` mapeia a URL interna de cada mídia para o nome do
 * arquivo que subiu junto com a página — as mídias do sistema moram atrás de
 * autenticação e dariam 404 no site público.
 */
function renderBlocos(blocos: ContentBlock[], arquivos: Map<string, ArquivoLocal>): string {
  const partes: string[] = []
  for (const bloco of blocos) {
    if (bloco.type === 'image' || bloco.type === 'video' || bloco.type === 'audio') {
      const local = arquivos.get(bloco.url)
      if (!local) continue   // mídia que não subiu não vira link quebrado
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
  // Corta na palavra, não no meio dela.
  return `${texto.slice(0, limite).replace(/\s+\S*$/, '')}…`
}

const CSS = `
:root{--tinta:#1b1b1b;--suave:#5a5a5a;--linha:#e5e5e5;--vermelho:#e32219;--fundo:#fff}
*{box-sizing:border-box}
body{margin:0;background:var(--fundo);color:var(--tinta);font:400 18px/1.7 Georgia,'Times New Roman',serif;-webkit-text-size-adjust:100%}
header.topo{border-bottom:3px solid var(--vermelho);padding:20px 24px}
header.topo a{display:inline-flex;align-items:center;gap:12px;text-decoration:none;color:inherit}
header.topo .cruz{width:34px;height:34px;flex:0 0 auto}
header.topo strong{display:block;font:700 15px/1.2 system-ui,-apple-system,Segoe UI,Roboto,sans-serif;letter-spacing:.02em;text-transform:uppercase}
header.topo span{display:block;font:400 12px/1.3 system-ui,-apple-system,Segoe UI,Roboto,sans-serif;color:var(--suave)}
main{max-width:44rem;margin:0 auto;padding:40px 24px 72px}
h1{font-size:2.1rem;line-height:1.2;margin:0 0 .5rem;letter-spacing:-.01em}
.linhafina{font-size:1.2rem;color:var(--suave);margin:0 0 1.5rem;line-height:1.5}
.data{font:400 14px/1.4 system-ui,-apple-system,Segoe UI,Roboto,sans-serif;color:var(--suave);border-bottom:1px solid var(--linha);padding-bottom:1.25rem;margin-bottom:2rem}
article p{margin:0 0 1.35rem}
article h2{font-size:1.45rem;line-height:1.3;margin:2.5rem 0 .75rem}
article a{color:var(--vermelho)}
article ul{margin:0 0 1.35rem;padding-left:1.35rem}
article li{margin-bottom:.5rem}
blockquote{margin:2rem 0;padding:.25rem 0 .25rem 1.25rem;border-left:3px solid var(--vermelho);color:var(--suave);font-style:italic}
figure{margin:2rem 0}
figure img,figure video{width:100%;height:auto;display:block;border-radius:6px}
figcaption{font:400 14px/1.5 system-ui,-apple-system,Segoe UI,Roboto,sans-serif;color:var(--suave);margin-top:.6rem}
footer.rodape{border-top:1px solid var(--linha);padding:28px 24px;font:400 14px/1.6 system-ui,-apple-system,Segoe UI,Roboto,sans-serif;color:var(--suave);text-align:center}
@media(max-width:600px){body{font-size:17px}h1{font-size:1.7rem}main{padding:28px 20px 56px}}
@media print{header.topo,footer.rodape{display:none}body{font-size:12pt}}
`.trim()

const CRUZ_SVG = '<svg class="cruz" viewBox="0 0 32 32" aria-hidden="true"><rect width="32" height="32" rx="3" fill="#fff" stroke="#e32219" stroke-width="2"/><path d="M13 6h6v7h7v6h-7v7h-6v-7H6v-6h7z" fill="#e32219"/></svg>'

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
  const canonica = `${base}/${dados.slug}/`

  const descricao = (dados.subtitulo?.trim() || resumoDoCorpo(blocos) || dados.titulo).slice(0, 300)

  // A primeira imagem vira o card das redes. Sem ela o link sai como uma
  // tira de texto cinza, que é o que menos convida a clicar.
  const primeiraImagem = blocos.find((b) => b.type === 'image')
  const capa = primeiraImagem && 'url' in primeiraImagem ? arquivos.get(primeiraImagem.url) : undefined
  const capaUrl = capa ? `${canonica}${capa.nome}` : ''

  const publicado = dados.publicadoEm.toISOString()
  const atualizado = (dados.atualizadoEm ?? dados.publicadoEm).toISOString()
  const dataLegivel = new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit', month: 'long', year: 'numeric', timeZone: 'America/Sao_Paulo',
  }).format(dados.publicadoEm)

  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'NewsArticle',
    headline: dados.titulo.slice(0, 110),
    description: descricao,
    datePublished: publicado,
    dateModified: atualizado,
    inLanguage: 'pt-BR',
    mainEntityOfPage: { '@type': 'WebPage', '@id': canonica },
    publisher: { '@type': 'Organization', name: org },
    ...(dados.autor ? { author: { '@type': 'Person', name: dados.autor } } : {}),
    ...(capaUrl ? { image: [capaUrl] } : {}),
  }

  const meta = [
    `<meta charset="utf-8">`,
    `<meta name="viewport" content="width=device-width, initial-scale=1">`,
    `<title>${escapar(dados.titulo)} — ${escapar(org)}</title>`,
    `<meta name="description" content="${escapar(descricao)}">`,
    `<link rel="canonical" href="${escapar(canonica)}">`,
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
  ].join('\n    ')

  return `<!doctype html>
<html lang="pt-BR">
  <head>
    ${meta}
    <style>${CSS}</style>
    <script type="application/ld+json">${JSON.stringify(jsonLd).replace(/</g, '\\u003c')}</script>
  </head>
  <body>
    <header class="topo">
      <a href="${escapar(base)}/">
        ${CRUZ_SVG}
        <span><strong>Cruz Vermelha Brasileira</strong><span>Rio de Janeiro</span></span>
      </a>
    </header>
    <main>
      <h1>${escapar(dados.titulo)}</h1>
      ${dados.subtitulo?.trim() ? `<p class="linhafina">${escapar(dados.subtitulo.trim())}</p>` : ''}
      <p class="data">
        <time datetime="${publicado}">${dataLegivel}</time>${dados.autor ? ` · ${escapar(dados.autor)}` : ''}
      </p>
      <article>
      ${renderBlocos(blocos, arquivos)}
      </article>
    </main>
    <footer class="rodape">${escapar(org)}</footer>
  </body>
</html>
`
}
