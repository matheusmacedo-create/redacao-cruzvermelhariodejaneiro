import { parseContentBlocks, type ContentBlock, type InlineToken } from '@/lib/content-blocks'
import { blocoDoAnalytics } from '@/lib/site/analytics'
import { CSS_DO_SITE, LINK_DAS_FONTES, cabecalhoDoSite, escapar, origemDoSite, rodapeDoSite, scriptDoMenu } from '@/lib/site/esqueleto'
import { svgDaMarca } from '@/lib/marcas'
export { escapar } from '@/lib/site/esqueleto'

/**
 * Monta a página de uma matéria para o site institucional.
 *
 * Uma página só, sem framework: o servidor é FTP na Hostinger. CSS vai
 * embutido. Header, footer, logo, favicon e paleta repetem o site
 * (cruzvermelhariodejaneiro.org) — paths de marca apontam para /assets
 * na origem do domínio, não para a pasta da matéria.
 */



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
 * Legenda no padrão do jornalismo: descrição — crédito.
 *
 * Quem digita só o nome ("Reprodução/TV Globo") não deveria ter de lembrar do
 * prefixo, então ele entra sozinho; quem já escreveu "Foto: Ana" não ganha um
 * segundo "Foto:" na frente.
 */
function legendaDaMidia(tipo: 'image' | 'video' | 'audio', alt: string, credito?: string): string {
  const partes: string[] = []
  if (alt.trim()) partes.push(escapar(alt.trim()))
  const bruto = credito?.trim()
  if (bruto) {
    const prefixo = tipo === 'image' ? 'Foto: ' : tipo === 'video' ? 'Vídeo: ' : 'Áudio: '
    const texto = bruto.includes(':') ? bruto : `${prefixo}${bruto}`
    partes.push(`<span class="credito">${escapar(texto)}</span>`)
  }
  return partes.length ? `<figcaption>${partes.join(' — ')}</figcaption>` : ''
}

type BlocoDeMidia = { type: 'image' | 'video' | 'audio'; url: string; alt: string; credito?: string }

function renderMidia(bloco: BlocoDeMidia, local: ArquivoLocal, classe = '', eager = false): string {
  // A LEGENDA É DO BLOCO, não do arquivo. O bloco carrega o que alguém
  // escreveu sobre esta foto nesta matéria; `local` descreve o arquivo que vai
  // para o servidor. Quando o arquivo vinha primeiro, um chamador que
  // preenchia `local.alt` com o nome do arquivo fazia a página sair com
  // "cerebro-9093f620.jpg" embaixo da imagem — e não havia legenda escrita
  // que ganhasse dela.
  const descricao = bloco.alt?.trim() || local.alt || ''
  const alt = escapar(descricao)
  const src = escapar(local.nome)
  const legenda = legendaDaMidia(bloco.type, descricao, bloco.credito)
  // A capa é o LCP da página: nunca lazy, e com prioridade de busca.
  const corpo = bloco.type === 'image'
    ? (eager
        ? `<img src="${src}" alt="${alt}" fetchpriority="high" decoding="async">`
        : `<img src="${src}" alt="${alt}" loading="lazy" decoding="async">`)
    : bloco.type === 'video'
      ? `<video src="${src}" controls playsinline></video>`
      : `<audio src="${src}" controls></audio>`
  return `<figure${classe ? ` class="${classe}"` : ''}>${corpo}${legenda}</figure>`
}

function renderBlocos(blocos: ContentBlock[], arquivos: Map<string, ArquivoLocal>): string {
  const partes: string[] = []
  for (const bloco of blocos) {
    if (bloco.type === 'image' || bloco.type === 'video' || bloco.type === 'audio') {
      const local = arquivos.get(bloco.url)
      if (!local) continue
      partes.push(renderMidia(bloco, local))
      continue
    }
    if (bloco.type === 'heading') { partes.push(`<h2>${renderInline(bloco.inline)}</h2>`); continue }
    if (bloco.type === 'quote') { partes.push(`<blockquote>${renderInline(bloco.inline)}</blockquote>`); continue }
    if (bloco.type === 'list') {
      const tag = bloco.ordenada ? 'ol' : 'ul'
      partes.push(`<${tag}>${bloco.items.map((i) => `<li>${renderInline(i)}</li>`).join('')}</${tag}>`)
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

// O CSS mora no esqueleto: uma folha só para o site inteiro.
const CSS = CSS_DO_SITE

/** Tempo de leitura no padrão de redação: palavras / 200, mínimo 1 minuto. */
export function tempoDeLeitura(blocos: ContentBlock[]): number {
  let palavras = 0
  for (const b of blocos) {
    if ('inline' in b) palavras += textoDoInline(b.inline).split(/\s+/).filter(Boolean).length
    if (b.type === 'list') for (const item of b.items) palavras += textoDoInline(item).split(/\s+/).filter(Boolean).length
  }
  return Math.max(1, Math.round(palavras / 200))
}

/** Uma notícia irmã, para o rail "Leia também" e a faixa "Mais notícias". */
export type NoticiaRelacionada = {
  titulo: string
  url: string
  publicadaEm: Date
}

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
  /** A seção acima da manchete. Em branco, "Notícias". */
  kicker?: string
  /** As outras matérias publicadas — alimentam o rail e a faixa final. */
  relacionadas?: NoticiaRelacionada[]
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

  // A foto de abertura do noticiário: ela só sobe para o topo se o autor já a
  // escreveu antes do texto. Quem enterrou a foto no meio da matéria quis ela
  // ali — mover por conta própria seria reescrever a edição de outra pessoa.
  const iImagem = blocos.findIndex((b) => b.type === 'image' || b.type === 'video')
  const iTexto = blocos.findIndex((b) => b.type === 'text' || b.type === 'heading' || b.type === 'quote' || b.type === 'list')
  const iCapa = iImagem >= 0 && (iTexto === -1 || iImagem < iTexto) ? iImagem : -1
  const blocoCapa = iCapa >= 0 ? (blocos[iCapa] as BlocoDeMidia) : undefined
  const corpoBlocos = iCapa >= 0 ? blocos.filter((_, i) => i !== iCapa) : blocos

  // O og:image continua saindo da primeira imagem, esteja ela na capa ou no
  // meio do texto: é a miniatura que o WhatsApp e o Facebook mostram.
  const primeiraImagem = blocos.find((b) => b.type === 'image')
  const capa = primeiraImagem && 'url' in primeiraImagem ? arquivos.get(primeiraImagem.url) : undefined
  const capaUrl = capa ? `${canonica}${capa.nome}` : ''

  const arquivoDaCapa = blocoCapa ? arquivos.get(blocoCapa.url) : undefined
  const htmlDaCapa = blocoCapa && arquivoDaCapa
    ? renderMidia(blocoCapa, arquivoDaCapa, 'news-hero', true)
    : ''

  // Endereços de compartilhamento: links estáticos, sem script de terceiros e
  // sem rastreador — a página não carrega nada das redes para existir.
  const compartilhar = {
    whatsapp: `https://wa.me/?text=${encodeURIComponent(`${dados.titulo} ${canonica}`)}`,
    facebook: `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(canonica)}`,
    x: `https://twitter.com/intent/tweet?url=${encodeURIComponent(canonica)}&text=${encodeURIComponent(dados.titulo)}`,
    linkedin: `https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(canonica)}`,
  }

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
    LINK_DAS_FONTES,
    `<link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css">`,
  ].join('\n    ')

  // A testata e o tempo de leitura: sinais de jornal, calculados aqui.
  const minutos = tempoDeLeitura(blocos)
  const dataTestata = new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit', month: 'short', year: 'numeric', timeZone: 'America/Sao_Paulo',
  }).format(dados.publicadoEm).replace(/\. de /g, ' ').replace('.', '').toUpperCase()
  const kicker = dados.kicker?.trim() || 'Notícias'

  // Os ícones de share saem das marcas oficiais embutidas (é o que garante o
  // X no lugar do pássaro, sem depender da versão do Font Awesome do site).
  const iconeDeCopiar = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>`
  const share = `<div class="news-share">
            <a href="${escapar(compartilhar.whatsapp)}" target="_blank" rel="noopener" aria-label="Compartilhar no WhatsApp">${svgDaMarca('whatsapp', 17, 'currentColor')}</a>
            <a href="${escapar(compartilhar.facebook)}" target="_blank" rel="noopener" aria-label="Compartilhar no Facebook">${svgDaMarca('facebook', 17, 'currentColor')}</a>
            <a href="${escapar(compartilhar.x)}" target="_blank" rel="noopener" aria-label="Compartilhar no X">${svgDaMarca('x', 16, 'currentColor')}</a>
            <a href="${escapar(compartilhar.linkedin)}" target="_blank" rel="noopener" aria-label="Compartilhar no LinkedIn">${svgDaMarca('linkedin', 17, 'currentColor')}</a>
            <button type="button" class="copiar-link" data-url="${escapar(canonica)}" aria-label="Copiar o endereço da página">${iconeDeCopiar}</button>
          </div>`

  // Rail e faixa final: continuidade de leitura. No fim da matéria o leitor
  // cai em outra notícia, não num footer de campanha.
  const dataCurta = (d: Date) =>
    new Intl.DateTimeFormat('pt-BR', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'America/Sao_Paulo' })
      .format(d).replace(/\. de /g, ' ').replace('.', '')
  const relacionadas = (dados.relacionadas ?? []).filter((n) => n.url !== canonica)
  const doRail = relacionadas.slice(0, 5)
  const daFaixa = relacionadas.slice(0, 3)

  const leiaTambem = doRail.length
    ? `<section>
          <h2 class="rail-titulo">Leia também</h2>
          <ul class="rail-lista">
            ${doRail.map((n) => `<li><a href="${escapar(n.url)}">
              <span class="t">${escapar(n.titulo)}</span>
              <time datetime="${n.publicadaEm.toISOString()}">${escapar(dataCurta(n.publicadaEm))}</time>
            </a></li>`).join('\n            ')}
          </ul>
        </section>`
    : ''

  const rail = `<aside class="news-rail">
        ${leiaTambem}
        <section class="rail-box">
          <h2 class="rail-titulo">Para entender</h2>
          <ul>
            <li>A Cruz Vermelha Brasileira integra o maior movimento humanitário do mundo, presente em 191 países.</li>
            <li>No Rio de Janeiro, a filial atua em emergências, saúde comunitária e capacitação.</li>
            <li>O trabalho é feito por voluntários da própria cidade.</li>
          </ul>
        </section>
        <p class="rail-cta"><a href="${escapar(home)}#contato">Seja voluntário no Rio →</a></p>
      </aside>`

  const maisNoticias = daFaixa.length
    ? `<section class="news-more">
        <h2>Mais notícias</h2>
        <div class="cartoes">
          ${daFaixa.map((n) => `<a href="${escapar(n.url)}">
            <span class="kicker">Notícias</span>
            <span class="t">${escapar(n.titulo)}</span>
            <time datetime="${n.publicadaEm.toISOString()}">${escapar(dataCurta(n.publicadaEm))}</time>
          </a>`).join('\n          ')}
        </div>
      </section>`
    : ''

  return `<!doctype html>
<html lang="pt-BR">
  <head>
    ${meta}
    ${blocoDoAnalytics()}
    <style>${CSS}</style>
    <script type="application/ld+json">${JSON.stringify(jsonLd).replace(/</g, '\\u003c')}</script>
  </head>
  <body class="single-noticia">
    ${cabecalhoDoSite(origem, 'noticias')}

    <div class="news-folio">
      <div class="news-masthead"><span>Notícias</span><span class="dot">·</span><span>Cruz Vermelha RJ</span><span class="dot">·</span><span>${escapar(dataTestata)}</span></div>
      <div class="news-grid">
        <article class="news-article">
          <header class="news-header">
            <p class="kicker">${escapar(kicker)}</p>
            <h1>${escapar(dados.titulo)}</h1>
            ${dados.subtitulo?.trim() ? `<p class="deck">${escapar(dados.subtitulo.trim())}</p>` : ''}
            <div class="meta-bar">
              <p class="byline"><b>Por ${escapar(dados.autor || org)}</b><span class="dot">·</span><time datetime="${publicado}">${dataLegivel}</time><span class="dot">·</span><span>${minutos} min de leitura</span></p>
              ${share}
            </div>
          </header>
          ${htmlDaCapa}
          <div class="news-body">
      ${renderBlocos(corpoBlocos, arquivos)}
          </div>
          <footer class="news-source">Publicado por ${escapar(org)}. <a href="${escapar(home)}">Ver mais do nosso trabalho</a>.</footer>
        </article>
        ${rail}
      </div>
      ${maisNoticias}
    </div>

    ${rodapeDoSite(origem, ano)}
    ${scriptDoMenu()}
    <script>
      document.querySelector('.copiar-link')?.addEventListener('click', async function() {
        try { await navigator.clipboard.writeText(this.dataset.url); } catch { return; }
        this.classList.add('copiado');
        setTimeout(() => this.classList.remove('copiado'), 1800);
      });
    </script>
  </body>
</html>
`
}
