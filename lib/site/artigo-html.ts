import { caminhoDoBlobPrivado, hrefInterno, parseContentBlocks, textoDosTrechos, type ContentBlock, type InlineToken } from '@/lib/content-blocks'
import {
  IMAGEM_PADRAO_DO_SITE, NOME_DO_SITE, cortarNoLimite, escapar, montarPaginaDoSite, noDaOrganizacao, normalizarDescricao, origemDoSite,
  type ImagemDaPagina,
} from '@/lib/site/esqueleto'
import { svgDaMarca } from '@/lib/marcas'
export { escapar } from '@/lib/site/esqueleto'

/**
 * Monta a página de uma matéria para o site institucional.
 *
 * Uma página só, sem framework: o servidor é FTP na Hostinger. CSS vai
 * embutido. Cabeçalho, rodapé, <head> e paleta vêm do esqueleto do site
 * (lib/site/esqueleto.ts) — os mesmos da central de notícias e das páginas
 * de base. Paths de marca apontam para /assets na origem do domínio, não para
 * a pasta da matéria.
 *
 * Módulo puro: roda também no navegador, na prévia do hub (onde as mídias
 * ainda são endereços da Biblioteca). As guardas de "nada interno na página
 * publicada" ficam na publicação (lib/site/guarda-da-pagina.ts), não aqui.
 */

/** Endereços que podem virar href. Barra a porta para javascript: e data:. */
function hrefSeguro(url: string): string | null {
  try {
    const u = new URL(url, 'https://exemplo.invalido')
    if (!['http:', 'https:', 'mailto:'].includes(u.protocol)) return null
    return url.trim()
  } catch {
    return null
  }
}

/**
 * Endereços antigos do site que hoje respondem 301 (ver o .htaccess da raiz,
 * no repositório do site). Link interno que passa por redirecionamento custa
 * um salto a cada visita e conta contra a página na busca — e oito matérias no
 * banco ainda apontam para eles. O link sai direto para o destino, com a
 * consulta e a âncora que tinha.
 */
export const LINKS_ANTIGOS_DO_SITE: Readonly<Record<string, string>> = {
  '/cursos.html': '/matricula-cursos-presenciais/',
  '/cursos': '/matricula-cursos-presenciais/',
  '/cursos/': '/matricula-cursos-presenciais/',
  '/doacao.html': '/doe/',
  '/privacidade': '/privacidade/',
  '/termos': '/termos/',
  '/index.html': '/',
}

const HOSTS_DO_SITE = new Set(['cruzvermelhariodejaneiro.org', 'www.cruzvermelhariodejaneiro.org'])
/** Domínio antigo da filial, em disputa judicial: não se cita nem se linka. */
const DOMINIO_EM_DISPUTA = /(^|[./@])cruzvermelharj\.org\.br/i

/**
 * Link para o próprio site: sai a partir da raiz (/doe/), sem o domínio, e
 * sem passar pelos endereços antigos. Link para fora sai como veio.
 */
export function linkDoSite(href: string): string {
  const bruto = href.trim()
  let caminho: string
  if (/^https?:\/\//i.test(bruto)) {
    let u: URL
    try { u = new URL(bruto) } catch { return bruto }
    if (!HOSTS_DO_SITE.has(u.hostname.toLowerCase())) return bruto
    caminho = `${u.pathname}${u.search}${u.hash}`
  } else if (bruto.startsWith('/') && !bruto.startsWith('//')) {
    caminho = bruto
  } else if (/^(cursos|doacao|index)\.html(?=$|[?#])/.test(bruto)) {
    // Relativo, escrito para a home: numa matéria (em /noticias/slug/) ele
    // quebraria. É a mesma página na raiz.
    caminho = `/${bruto}`
  } else {
    return bruto
  }
  const [, pasta, resto] = /^([^?#]*)(.*)$/.exec(caminho)!
  return `${LINKS_ANTIGOS_DO_SITE[pasta] ?? (pasta || '/')}${resto}`
}

/**
 * A legenda da foto serve de texto alternativo — mas não qualquer uma. O
 * editor punha o NOME DO ARQUIVO como legenda ("IMG_1234.jpg", "WhatsApp
 * Image 2026-09-07…") e há fotos com "aaa": nada disso descreve a imagem para
 * quem não a vê. Devolve a legenda aproveitável, ou vazio.
 */
export function altUtil(texto: string | null | undefined): string {
  const t = String(texto ?? '').replace(/\s+/g, ' ').trim()
  if (t.length < 4) return ''
  const letras = t.toLowerCase().replace(/[^\p{L}\p{N}]/gu, '')
  if (letras.length < 3) return ''
  // Uma letra repetida, ou duas se alternando: "aaaa", "abab", "kkkk".
  if (/^(.)\1+$/u.test(letras) || /^(..)\1+$/u.test(letras)) return ''
  if (/^(asdf|qwer|zxcv|sdfg|fdsa|hjkl|teste?\d*|test\d*|foto\d*|imagem\d*|image\d*|img\d*|picture\d*|sem ?t[ií]tulo|untitled)$/iu.test(letras)) return ''
  // Cara de nome de arquivo.
  if (/\.(jpe?g|png|gif|webp|heic|heif|avif|bmp|tiff?|svg|mp4|mov|webm|m4v|mp3|wav|ogg|m4a|pdf)$/i.test(t)) return ''
  if (/^(img|dsc|dscn|dcim|pxl|mvimg|photo|foto|screenshot|captura de tela|whatsapp image|whatsapp video|imagem do whatsapp|video do whatsapp|vídeo do whatsapp)[\s_-]*\d/i.test(t)) return ''
  if (/^[\w.-]+$/.test(t) && /[_-]/.test(t) && /\d/.test(t)) return ''
  if (/^[0-9a-f-]{16,}$/i.test(t)) return ''
  return t
}

const ROTULO_DE_CREDITO = /^(fotos?|imagens?|imagem|v[ií]deos?|cr[eé]ditos?|[aá]udio|arte|ilustra[cç][aã]o|reprodu[cç][aã]o)\s*:/i

export type ArquivoLocal = {
  /** O arquivo na pasta da matéria (a imagem canônica, em JPEG, para foto). */
  nome: string
  alt: string
  largura?: number
  altura?: number
  /** Versões WebP da foto, da menor para a maior (srcset). */
  webp?: { largura: number; nome: string }[]
}

type Contexto = {
  titulo: string
  arquivos: Map<string, ArquivoLocal>
  porCaminho: Map<string, ArquivoLocal>
  registro?: string[]
  prioridadeUsada: boolean
}

/**
 * Legenda no padrão do jornalismo: descrição — crédito.
 *
 * Quem digita só o nome ("Reprodução/TV Globo") não deveria ter de lembrar do
 * prefixo, então ele entra sozinho; quem já escreveu "Foto: Ana" não ganha um
 * segundo "Foto:". Antes bastava haver dois-pontos em qualquer lugar — e um
 * crédito que era só um endereço (https://…) saía cru, sem prefixo. Agora o
 * endereço vira link com o nome do site.
 */
function legendaDaMidia(tipo: 'image' | 'video' | 'audio', descricao: string, credito: string | undefined, ctx: Contexto): string {
  const partes: string[] = []
  if (descricao) partes.push(escapar(descricao))
  const bruto = credito?.trim()
  if (bruto) {
    const prefixo = tipo === 'image' ? 'Foto: ' : tipo === 'video' ? 'Vídeo: ' : 'Áudio: '
    if (hrefInterno(bruto) || caminhoDoBlobPrivado(bruto)) {
      ctx.registro?.push(`crédito com endereço interno removido da legenda de "${descricao || 'uma mídia'}"`)
    } else if (/^https?:\/\/\S+$/i.test(bruto) && hrefSeguro(bruto)) {
      let host = bruto
      try { host = new URL(bruto).hostname.replace(/^www\./, '') } catch { /* fica o endereço */ }
      partes.push(`<span class="credito">${prefixo}<a href="${escapar(bruto)}" rel="nofollow noopener" target="_blank">${escapar(host)}</a></span>`)
    } else {
      partes.push(`<span class="credito">${escapar(ROTULO_DE_CREDITO.test(bruto) ? bruto : `${prefixo}${bruto}`)}</span>`)
    }
  }
  return partes.length ? `<figcaption>${partes.join(' — ')}</figcaption>` : ''
}

type BlocoDeMidia = { type: 'image' | 'video' | 'audio'; url: string; alt: string; credito?: string }

/** A largura com que a foto aparece: a coluna da matéria (760 px no máximo). */
const TAMANHOS = '(max-width: 767px) calc(100vw - 36px), (max-width: 1023px) calc(100vw - 48px), 760px'

function renderMidia(bloco: BlocoDeMidia, local: ArquivoLocal, ctx: Contexto, classe = ''): string {
  // A LEGENDA É DO BLOCO, não do arquivo. O bloco carrega o que alguém
  // escreveu sobre esta foto nesta matéria; `local` descreve o arquivo que vai
  // para o servidor. Quando o arquivo vinha primeiro, um chamador que
  // preenchia `local.alt` com o nome do arquivo fazia a página sair com
  // "cerebro-9093f620.jpg" embaixo da imagem — e não havia legenda escrita
  // que ganhasse dela.
  const descricao = altUtil(bloco.alt) || altUtil(local.alt)
  const legenda = legendaDaMidia(bloco.type, descricao, bloco.credito, ctx)
  const src = escapar(local.nome)
  let corpo: string
  if (bloco.type === 'image') {
    const alt = escapar(descricao || `Foto da matéria: ${ctx.titulo}`)
    const medidas = local.largura && local.altura ? ` width="${local.largura}" height="${local.altura}"` : ''
    // A primeira foto da página é o LCP: nunca lazy, e com prioridade de busca.
    const carga = ctx.prioridadeUsada ? 'loading="lazy" decoding="async"' : 'fetchpriority="high" decoding="async"'
    ctx.prioridadeUsada = true
    const img = `<img src="${src}"${medidas} alt="${alt}" ${carga}>`
    corpo = local.webp?.length
      ? `<picture><source type="image/webp" srcset="${local.webp.map((v) => `${escapar(v.nome)} ${v.largura}w`).join(', ')}" sizes="${TAMANHOS}">${img}</picture>`
      : img
  } else if (bloco.type === 'video') {
    corpo = `<video src="${src}" controls playsinline preload="metadata"></video>`
  } else {
    corpo = `<audio src="${src}" controls preload="metadata"></audio>`
  }
  return `<figure${classe ? ` class="${classe}"` : ''}>${corpo}${legenda}</figure>`
}

function renderInline(tokens: InlineToken[], ctx: Contexto): string {
  return tokens.map((t) => {
    if (t.type === 'bold') return `<strong>${renderInline(t.children, ctx)}</strong>`
    if (t.type === 'italic') return `<em>${renderInline(t.children, ctx)}</em>`
    if (t.type === 'link') return renderLink(t, ctx)
    return escapar(t.text)
  }).join('')
}

/**
 * O link do corpo da matéria. Endereço da Biblioteca (arquivo privado) vira o
 * arquivo publicado junto com a página, quando é uma das mídias dela; senão o
 * link sai e fica o texto — um /api/private-blob na página pública é um erro
 * para o visitante e expõe o caminho do arquivo. O mesmo para qualquer rota
 * interna da Redação.
 */
function renderLink(t: Extract<InlineToken, { type: 'link' }>, ctx: Contexto): string {
  const conteudo = renderInline(t.children.length ? t.children : [{ type: 'text', text: t.text }], ctx)
  const privado = caminhoDoBlobPrivado(t.href)
  if (privado) {
    const arquivo = ctx.porCaminho.get(privado)
    if (arquivo) return `<a href="${escapar(arquivo.nome)}">${conteudo}</a>`
    ctx.registro?.push(`link para arquivo interno removido (ficou o texto "${t.text}")`)
    return conteudo
  }
  if (hrefInterno(t.href)) {
    ctx.registro?.push(`link para endereço interno do Palácio Virtual removido (ficou o texto "${t.text}")`)
    return conteudo
  }
  const href = hrefSeguro(t.href)
  if (!href) return conteudo
  if (DOMINIO_EM_DISPUTA.test(href)) {
    ctx.registro?.push(`link para o domínio antigo da filial removido (ficou o texto "${t.text}")`)
    return conteudo
  }
  const final = linkDoSite(href)
  return `<a href="${escapar(final)}"${/^https?:\/\//i.test(final) ? ' rel="noopener"' : ''}>${conteudo}</a>`
}

/** O parágrafo que é só um link (inclusive em negrito): candidato a botão. */
function linkSozinho(bloco: ContentBlock): Extract<InlineToken, { type: 'link' }> | null {
  if (bloco.type !== 'text') return null
  let tokens = bloco.inline.filter((t) => t.type !== 'text' || t.text.trim())
  while (tokens.length === 1 && (tokens[0].type === 'bold' || tokens[0].type === 'italic')) {
    tokens = tokens[0].children.filter((t) => t.type !== 'text' || t.text.trim())
  }
  return tokens.length === 1 && tokens[0].type === 'link' ? tokens[0] : null
}

function renderBlocos(blocos: ContentBlock[], ctx: Contexto, botao?: string): string {
  const partes: string[] = []
  for (const bloco of blocos) {
    // O botão de matrícula do advertorial: um parágrafo que é só o link rastreado.
    const soLink = botao ? linkSozinho(bloco) : null
    if (botao && soLink && soLink.href.startsWith(botao) && hrefSeguro(soLink.href)) {
      partes.push(`<p class="news-cta"><a class="news-cta-botao" href="${escapar(soLink.href)}" rel="nofollow">${escapar(soLink.text)}</a></p>`)
      continue
    }
    if (bloco.type === 'image' || bloco.type === 'video' || bloco.type === 'audio') {
      // Mídia sem arquivo não sai (quem a preparou já registrou o porquê).
      const local = ctx.arquivos.get(bloco.url)
      if (!local) continue
      partes.push(renderMidia(bloco, local, ctx))
      continue
    }
    if (bloco.type === 'heading') { partes.push(`<h2>${renderInline(bloco.inline, ctx)}</h2>`); continue }
    if (bloco.type === 'quote') { partes.push(`<blockquote>${renderInline(bloco.inline, ctx)}</blockquote>`); continue }
    if (bloco.type === 'list') {
      const tag = bloco.ordenada ? 'ol' : 'ul'
      partes.push(`<${tag}>${bloco.items.map((i) => `<li>${renderInline(i, ctx)}</li>`).join('')}</${tag}>`)
      continue
    }
    partes.push(`<p>${renderInline(bloco.inline, ctx)}</p>`)
  }
  return partes.join('\n      ')
}

/** Resumo para a meta description e para o card das redes. */
export function resumoDoCorpo(blocos: ContentBlock[], limite = 155): string {
  const primeiro = blocos.find((b) => b.type === 'text' || b.type === 'quote')
  if (!primeiro || !('inline' in primeiro)) return ''
  return normalizarDescricao(textoDosTrechos(primeiro.inline), limite)
}

/** Tempo de leitura no padrão de redação: palavras / 200, mínimo 1 minuto. */
export function tempoDeLeitura(blocos: ContentBlock[]): number {
  let palavras = 0
  for (const b of blocos) {
    if ('inline' in b) palavras += textoDosTrechos(b.inline).split(/\s+/).filter(Boolean).length
    if (b.type === 'list') for (const item of b.items) palavras += textoDosTrechos(item).split(/\s+/).filter(Boolean).length
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
  /** A PRIMEIRA publicação: republicar ou regerar não mexe nela. */
  publicadoEm: Date
  /** A última mudança de conteúdo (não a última regravação). */
  atualizadoEm?: Date | null
  autor?: string | null
  /** Quem assina quando não há autor. Em branco, o nome da filial. */
  organizacao?: string
  arquivos?: Map<string, ArquivoLocal>
  /** A seção acima da manchete. Em branco, "Notícias". */
  kicker?: string
  /** As outras matérias publicadas — alimentam o rail e a faixa final. */
  relacionadas?: NoticiaRelacionada[]
  /**
   * Advertorial da escola: o pixel de visita e o endereço do botão de
   * matrícula (a linha que é só um link para ele vira botão, e o link leva
   * junto as UTMs do anúncio que trouxe a pessoa).
   */
  rastreio?: { pixel: string; botao: string }
  /** Recebe um aviso por mídia ou link que não pôde ir para a página. */
  registro?: string[]
  /** As tags do chat do site (sem isto, vale o que o servidor deixou pronto). */
  chat?: string
}

const formatoCurto = (d: Date) =>
  new Intl.DateTimeFormat('pt-BR', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'America/Sao_Paulo' })
    .format(d).replace(/\. de /g, ' ').replace('.', '')

export function montarPaginaDoArtigo(dados: DadosDoArtigo): string {
  const assinatura = dados.organizacao?.trim() || NOME_DO_SITE
  const arquivos = dados.arquivos ?? new Map<string, ArquivoLocal>()
  const blocos = parseContentBlocks(dados.corpo)
  const titulo = dados.titulo.trim()

  const base = dados.baseUrl.replace(/\/+$/, '')
  const origem = origemDoSite(base)
  const home = `${origem}/`
  const canonica = `${base}/${dados.slug}/`

  const descricao = normalizarDescricao(dados.subtitulo?.trim() || resumoDoCorpo(blocos, 160) || titulo)

  const ctx: Contexto = {
    titulo,
    arquivos,
    porCaminho: new Map([...arquivos].map(([url, a]) => [caminhoDoBlobPrivado(url) ?? url, a])),
    registro: dados.registro,
    prioridadeUsada: false,
  }

  // A foto de abertura do noticiário: ela só sobe para o topo se o autor já a
  // escreveu antes do texto. Quem enterrou a foto no meio da matéria quis ela
  // ali — mover por conta própria seria reescrever a edição de outra pessoa.
  const iImagem = blocos.findIndex((b) => b.type === 'image' || b.type === 'video')
  const iTexto = blocos.findIndex((b) => b.type === 'text' || b.type === 'heading' || b.type === 'quote' || b.type === 'list')
  const iCapa = iImagem >= 0 && (iTexto === -1 || iImagem < iTexto) ? iImagem : -1
  const blocoCapa = iCapa >= 0 ? (blocos[iCapa] as BlocoDeMidia) : undefined
  const corpoBlocos = iCapa >= 0 ? blocos.filter((_, i) => i !== iCapa) : blocos
  const arquivoDaCapa = blocoCapa ? arquivos.get(blocoCapa.url) : undefined
  const htmlDaCapa = blocoCapa && arquivoDaCapa ? renderMidia(blocoCapa, arquivoDaCapa, ctx, 'news-hero') : ''
  const htmlDoCorpo = renderBlocos(corpoBlocos, ctx, dados.rastreio?.botao)

  // As fotos da página, na ordem, com o endereço público e as medidas. A
  // primeira é o og:image — a miniatura que o WhatsApp e o Facebook mostram —,
  // esteja ela na capa ou no meio do texto. SVG não serve de miniatura.
  const fotos: ImagemDaPagina[] = []
  for (const b of blocos) {
    if (b.type !== 'image') continue
    const a = arquivos.get(b.url)
    if (!a || /\.svg$/i.test(a.nome) || fotos.some((f) => f.url === `${canonica}${a.nome}`)) continue
    fotos.push({ url: /^https?:\/\//i.test(a.nome) ? a.nome : `${canonica}${a.nome}`, largura: a.largura, altura: a.altura, alt: altUtil(b.alt) || altUtil(a.alt) || `Foto da matéria: ${titulo}` })
  }
  const capa = fotos[0]

  // Endereços de compartilhamento: links estáticos, sem script de terceiros e
  // sem rastreador — a página não carrega nada das redes para existir.
  const compartilhar = {
    facebook: `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(canonica)}`,
    x: `https://x.com/intent/post?url=${encodeURIComponent(canonica)}&text=${encodeURIComponent(titulo)}`,
    linkedin: `https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(canonica)}`,
  }

  const publicadoEm = dados.publicadoEm
  const modificadoEm = dados.atualizadoEm && dados.atualizadoEm.getTime() > publicadoEm.getTime() ? dados.atualizadoEm : publicadoEm
  const publicado = publicadoEm.toISOString()
  const dataLegivel = new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit', month: 'long', year: 'numeric', timeZone: 'America/Sao_Paulo',
  }).format(publicadoEm)

  const organizacao = noDaOrganizacao()
  const jsonLd = {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'NewsArticle',
        '@id': `${canonica}#materia`,
        headline: cortarNoLimite(titulo, 110),
        description: descricao,
        image: (fotos.length ? fotos : [IMAGEM_PADRAO_DO_SITE]).map((f) => ({
          '@type': 'ImageObject',
          url: f.url,
          ...(f.largura && f.altura ? { width: f.largura, height: f.altura } : {}),
        })),
        datePublished: publicado,
        dateModified: modificadoEm.toISOString(),
        author: dados.autor?.trim() ? { '@type': 'Person', name: dados.autor.trim() } : organizacao,
        publisher: organizacao,
        mainEntityOfPage: { '@type': 'WebPage', '@id': canonica },
        inLanguage: 'pt-BR',
        isAccessibleForFree: true,
      },
      {
        '@type': 'BreadcrumbList',
        '@id': `${canonica}#trilha`,
        itemListElement: [
          { '@type': 'ListItem', position: 1, name: 'Início', item: home },
          { '@type': 'ListItem', position: 2, name: 'Notícias', item: `${origem}/noticias/` },
          { '@type': 'ListItem', position: 3, name: titulo, item: canonica },
        ],
      },
    ],
  }

  // A testata e o tempo de leitura: sinais de jornal, calculados aqui.
  const minutos = tempoDeLeitura(blocos)
  const dataTestata = new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit', month: 'short', year: 'numeric', timeZone: 'America/Sao_Paulo',
  }).format(publicadoEm).replace(/\. de /g, ' ').replace('.', '').toUpperCase()
  const kicker = dados.kicker?.trim() || 'Notícias'

  // Os ícones de share saem das marcas oficiais embutidas (é o que garante o
  // X no lugar do pássaro, sem depender de biblioteca de ícones).
  const iconeDeCopiar = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>`
  const share = `<div class="news-share">
            <a href="${escapar(compartilhar.facebook)}" target="_blank" rel="noopener" aria-label="Compartilhar no Facebook">${svgDaMarca('facebook', 17, 'currentColor')}</a>
            <a href="${escapar(compartilhar.x)}" target="_blank" rel="noopener" aria-label="Compartilhar no X">${svgDaMarca('x', 16, 'currentColor')}</a>
            <a href="${escapar(compartilhar.linkedin)}" target="_blank" rel="noopener" aria-label="Compartilhar no LinkedIn">${svgDaMarca('linkedin', 17, 'currentColor')}</a>
            <button type="button" class="copiar-link" data-url="${escapar(canonica)}" aria-label="Copiar o endereço da página">${iconeDeCopiar}</button>
          </div>`

  // Rail e faixa final: continuidade de leitura. No fim da matéria o leitor
  // cai em outra notícia, não num footer de campanha.
  const relacionadas = (dados.relacionadas ?? []).filter((n) => n.url !== canonica)
  const doRail = relacionadas.slice(0, 5)
  const daFaixa = relacionadas.slice(0, 3)
  const hrefDaIrma = (url: string) => escapar(linkDoSite(url))

  const leiaTambem = doRail.length
    ? `<section>
          <h2 class="rail-titulo">Leia também</h2>
          <ul class="rail-lista">
            ${doRail.map((n) => `<li><a href="${hrefDaIrma(n.url)}">
              <span class="t">${escapar(n.titulo)}</span>
              <time datetime="${n.publicadaEm.toISOString()}">${escapar(formatoCurto(n.publicadaEm))}</time>
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
            <li>No Rio de Janeiro, a filial atua na formação de voluntários, na capacitação em primeiros socorros, na educação preventiva e no apoio comunitário.</li>
            <li>A filial forma os próprios voluntários, na sede, no Centro do Rio.</li>
          </ul>
        </section>
        <p class="rail-cta"><a href="/#contato">Seja voluntário no Rio →</a></p>
      </aside>`

  const maisNoticias = daFaixa.length
    ? `<section class="news-more">
        <h2>Mais notícias</h2>
        <div class="cartoes">
          ${daFaixa.map((n) => `<a href="${hrefDaIrma(n.url)}">
            <span class="kicker">Notícias</span>
            <span class="t">${escapar(n.titulo)}</span>
            <time datetime="${n.publicadaEm.toISOString()}">${escapar(formatoCurto(n.publicadaEm))}</time>
          </a>`).join('\n          ')}
        </div>
      </section>`
    : ''

  const corpo = `<div class="news-folio">
      <div class="news-masthead"><span>Notícias</span><span class="dot">·</span><span>${NOME_DO_SITE}</span><span class="dot">·</span><span>${escapar(dataTestata)}</span></div>
      <div class="news-grid">
        <article class="news-article">
          <header class="news-header">
            <p class="kicker">${escapar(kicker)}</p>
            <h1>${escapar(titulo)}</h1>
            ${dados.subtitulo?.trim() ? `<p class="deck">${escapar(dados.subtitulo.trim())}</p>` : ''}
            <div class="meta-bar">
              <p class="byline"><b>Por ${escapar(dados.autor?.trim() || assinatura)}</b><span class="dot">·</span><time datetime="${publicado}">${dataLegivel}</time><span class="dot">·</span><span>${minutos} min de leitura</span></p>
              ${share}
            </div>
          </header>
          ${htmlDaCapa}
          <div class="news-body">
      ${htmlDoCorpo}
          </div>
          <footer class="news-source">Publicado por ${escapar(assinatura)}. <a href="/">Ver mais do nosso trabalho</a>.</footer>
        </article>
        ${rail}
      </div>
      ${maisNoticias}
    </div>`

  const scripts = `${dados.rastreio ? `${blocoDeRastreio(dados.rastreio)}\n    ` : ''}<script>
      document.querySelector('.copiar-link')?.addEventListener('click', async function() {
        try { await navigator.clipboard.writeText(this.dataset.url); } catch { return; }
        this.classList.add('copiado');
        setTimeout(() => this.classList.remove('copiado'), 1800);
      });
    </script>`

  return montarPaginaDoSite({
    titulo,
    descricao,
    caminho: `${canonica.slice(origem.length)}`,
    origem,
    corpo,
    cssExtra: dados.rastreio ? CSS_DO_BOTAO : '',
    jsonLd,
    ativo: 'noticias',
    agora: publicadoEm,
    imagem: capa ?? IMAGEM_PADRAO_DO_SITE,
    tipoOg: 'article',
    publicadoEm,
    modificadoEm,
    classeDoCorpo: 'single-noticia',
    scriptsDoFim: scripts,
    ...(dados.chat !== undefined ? { chat: dados.chat } : {}),
  })
}

/** O botão de matrícula do advertorial, na cor da marca. */
const CSS_DO_BOTAO = `.news-cta{margin:2rem 0;text-align:center}.news-body a.news-cta-botao{display:inline-block;background:var(--brand);color:#fff;text-decoration:none;font-weight:700;padding:.95rem 1.6rem;border-radius:.6rem;font-size:1.05rem;line-height:1.3;max-width:100%}.news-body a.news-cta-botao:hover{background:var(--brand-dark);color:#fff}`

/**
 * O pixel de visita (sem cookie, só conta) e o repasse das UTMs do anúncio
 * para o botão de matrícula: quem chegou por ?utm_source=facebook&… leva
 * isso até a página de inscrição, e a matrícula volta atribuída ao anúncio e
 * ao advertorial.
 */
function blocoDeRastreio(r: { pixel: string; botao: string }): string {
  return `<img src="${escapar(r.pixel)}" alt="" width="1" height="1" style="position:absolute;left:-9999px;width:1px;height:1px" referrerpolicy="no-referrer-when-downgrade">
    <script>
      (function(){
        var q = new URLSearchParams(location.search), ks = ['utm_source','utm_medium','utm_campaign','utm_term','fbclid','gclid'];
        document.querySelectorAll('a[href^=${JSON.stringify(r.botao).replace(/</g, '\\u003c')}]').forEach(function(a){
          try { var u = new URL(a.href); ks.forEach(function(k){ var v = q.get(k); if (v) u.searchParams.set(k, v); }); a.href = u.toString(); } catch (e) {}
        });
      })();
    </script>`
}
