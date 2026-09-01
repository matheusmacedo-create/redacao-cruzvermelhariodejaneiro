import { parseContentBlocks, type ContentBlock, type InlineToken } from '@/lib/content-blocks'
import { blocoDoAnalytics } from '@/lib/site/analytics'
import { CSS_DO_SITE, cabecalhoDoSite, escapar, origemDoSite, rodapeDoSite, scriptDoMenu } from '@/lib/site/esqueleto'
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

function renderMidia(bloco: BlocoDeMidia, local: ArquivoLocal, classe = ''): string {
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
  const corpo = bloco.type === 'image'
    ? `<img src="${src}" alt="${alt}" loading="lazy" decoding="async">`
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
    ? `<div class="coluna-larga capa">${renderMidia(blocoCapa, arquivoDaCapa)}</div>`
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
    `<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&display=swap" rel="stylesheet">`,
    `<link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css">`,
  ].join('\n    ')

  return `<!doctype html>
<html lang="pt-BR">
  <head>
    ${meta}
    ${blocoDoAnalytics()}
    <style>${CSS}</style>
    <script type="application/ld+json">${JSON.stringify(jsonLd).replace(/</g, '\\u003c')}</script>
  </head>
  <body>
    ${cabecalhoDoSite(origem)}

    <main class="materia">
      <div class="coluna cabecalho">
        <p class="materia-kicker">Notícias</p>
        <h1>${escapar(dados.titulo)}</h1>
        ${dados.subtitulo?.trim() ? `<p class="linhafina">${escapar(dados.subtitulo.trim())}</p>` : ''}
        <p class="materia-meta">
          <span class="materia-por">Por ${escapar(dados.autor || org)}</span>
          <span class="sep">|</span>
          <time datetime="${publicado}">${dataLegivel}</time>
        </p>
        <div class="compartilhar">
          <span class="compartilhar-rotulo">Compartilhe</span>
          <a href="${escapar(compartilhar.whatsapp)}" target="_blank" rel="noopener" aria-label="Compartilhar no WhatsApp"><i class="fa-brands fa-whatsapp"></i></a>
          <a href="${escapar(compartilhar.facebook)}" target="_blank" rel="noopener" aria-label="Compartilhar no Facebook"><i class="fa-brands fa-facebook-f"></i></a>
          <!-- fa-twitter, não fa-x-twitter: o site carrega Font Awesome 6.4.0 e o
               ícone novo só existe a partir da 6.4.2 — lá ele sai em branco. -->
          <a href="${escapar(compartilhar.x)}" target="_blank" rel="noopener" aria-label="Compartilhar no X"><i class="fa-brands fa-twitter"></i></a>
          <a href="${escapar(compartilhar.linkedin)}" target="_blank" rel="noopener" aria-label="Compartilhar no LinkedIn"><i class="fa-brands fa-linkedin-in"></i></a>
          <button type="button" class="copiar-link" data-url="${escapar(canonica)}" aria-label="Copiar o endereço da página"><i class="fa-regular fa-copy"></i></button>
        </div>
      </div>
      ${htmlDaCapa}
      <div class="coluna">
        <article>
      ${renderBlocos(corpoBlocos, arquivos)}
        </article>
        <p class="materia-fim">Publicado por ${escapar(org)}. <a href="${escapar(home)}">Ver mais do nosso trabalho</a>.</p>
      </div>
    </main>

    ${rodapeDoSite(origem, ano)}

    <a class="wpp-float" href="https://wa.me/5521999922864?text=Ol%C3%A1!%20Tenho%20uma%20d%C3%BAvida%20sobre%20os%20cursos%20da%20Escola%20de%20Capacita%C3%A7%C3%A3o." target="_blank" rel="noopener" aria-label="Falar no WhatsApp">
      <i class="fa-brands fa-whatsapp"></i>
    </a>
    ${scriptDoMenu()}
    <script>
      document.querySelector('.copiar-link')?.addEventListener('click', async function() {
        try { await navigator.clipboard.writeText(this.dataset.url); } catch { return; }
        const icone = this.querySelector('i');
        this.classList.add('copiado');
        icone.className = 'fa-solid fa-check';
        setTimeout(() => { this.classList.remove('copiado'); icone.className = 'fa-regular fa-copy'; }, 1800);
      });
    </script>
  </body>
</html>
`
}
