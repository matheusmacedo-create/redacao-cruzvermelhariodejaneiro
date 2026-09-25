import { escapar, montarPaginaDoSite, noDaOrganizacao, noDoSite, tituloDaAba } from '@/lib/site/esqueleto'
import type { EntradaDoMapa } from '@/lib/site/sitemap'
import { COLECAO, COLECOES, DIREITO, dataIso, dataLegivel, tipoDoArquivo, type Colecao, type Direitos, type Precisao } from './regras'

/**
 * As páginas públicas do acervo em cruzvermelhariodejaneiro.org/acervo/ (docs/acervo.md):
 *
 *   /acervo/                         início: o que é, as coleções, o que chegou, como contribuir
 *   /acervo/<coleção>/               a coleção, 24 itens por página (/pagina/2/, /pagina/3/…)
 *   /acervo/<coleção>/<slug>/        o item: arquivo, ficha, direitos, como citar
 *   /acervo/arquivos/                as versões para a web (WebP) e os PDFs
 *
 * Tudo estático, com o esqueleto do site, JSON-LD (CollectionPage, ItemList, ImageObject com os
 * dados de licença que o Google Imagens lê, DigitalDocument, VideoObject e BreadcrumbList), cartão
 * de compartilhamento e endereço canônico. Coleção sem item público não ganha página (página vazia
 * não entra no Google); o início mostra "em breve".
 */

export const ORIGEM_DO_ACERVO = 'https://cruzvermelhariodejaneiro.org'
export const POR_PAGINA = 24
export const IMAGEM_PADRAO = { url: `${ORIGEM_DO_ACERVO}/assets/otim/og-acervo.jpg`, largura: 1200, altura: 630, alt: 'Acervo da Cruz Vermelha Brasileira Rio de Janeiro' }
export const ENDERECO_DA_EQUIPE = 'https://redacao.cruzvermelhariodejaneiro.org/acervo'
const NOME_DA_FILIAL = 'Cruz Vermelha Brasileira Rio de Janeiro'
const EMAIL = 'contato@cruzvermelhariodejaneiro.org'

export type ArquivosNoSite = {
  /** Versões WebP da imagem, da menor para a maior. */
  imagens?: { largura: number; altura: number; arquivo: string }[]
  /** O PDF publicado, em /acervo/arquivos/. */
  pdf?: string
  /** Vídeo do YouTube ou do Vimeo: endereço do player e miniatura. */
  video?: { embed: string; pagina: string; miniatura: string | null }
}

export type ItemPublico = {
  id: string
  colecao: Colecao
  slug: string
  titulo: string
  descricao: string | null
  data_item: string | null
  data_precisao: Precisao
  autoria: string | null
  local: string | null
  direitos: Direitos
  credito: string | null
  texto_alternativo: string | null
  palavras_chave: string[]
  url_video: string | null
  tipo_mime: string | null
  tamanho: number | null
  publicado_em: string
  atualizado_no_site_em: string | null
  arquivos: ArquivosNoSite | null
}

// ---------------------------------------------------------------- endereços

export const caminhoDaColecao = (c: Colecao, pagina = 1) => `/acervo/${c}/${pagina > 1 ? `pagina/${pagina}/` : ''}`
export const caminhoDoItem = (i: Pick<ItemPublico, 'colecao' | 'slug'>) => `/acervo/${i.colecao}/${i.slug}/`
export const urlDoArquivo = (nome: string, origem = ORIGEM_DO_ACERVO) => `${origem}/acervo/arquivos/${nome}`
const e = escapar

const maiorImagem = (i: ItemPublico) => i.arquivos?.imagens?.[i.arquivos.imagens.length - 1] ?? null
const imagemDoCartao = (i: ItemPublico) => i.arquivos?.imagens?.find((v) => v.largura >= 480) ?? i.arquivos?.imagens?.[0] ?? null

/** A imagem que representa o item (a maior versão, ou a miniatura do vídeo). */
function imagemDoItem(i: ItemPublico, origem: string): { url: string; largura?: number; altura?: number } | null {
  const maior = maiorImagem(i)
  if (maior) return { url: urlDoArquivo(maior.arquivo, origem), largura: maior.largura, altura: maior.altura }
  if (i.arquivos?.video?.miniatura) return { url: i.arquivos.video.miniatura }
  return null
}

const dataDoItem = (i: ItemPublico) => dataLegivel(i.data_item, i.data_precisao)
const tamanhoLegivel = (bytes: number | null) => {
  if (!bytes) return ''
  const mb = bytes / 1024 ** 2
  return mb >= 1 ? `${mb.toLocaleString('pt-BR', { maximumFractionDigits: 1 })} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`
}

/** Descrição para a busca: a do item, ou uma frase montada com o que se sabe (até ~155 caracteres). */
export function descricaoDoItem(i: ItemPublico): string {
  const base = i.descricao?.replace(/\s+/g, ' ').trim()
  if (base) return base.length <= 158 ? base : `${base.slice(0, 155).replace(/\s+\S*$/, '')}…`
  const data = dataDoItem(i)
  return `${COLECAO[i.colecao].singular} do acervo da ${NOME_DA_FILIAL}${data ? `, ${data}` : ''}: ${i.titulo}.`
}

// ---------------------------------------------------------------- estilos

const CSS_DO_ACERVO = `
.acervo{max-width:var(--max);margin:0 auto;padding:28px 20px 64px}
.acervo-trilha{font-size:.88rem;color:var(--muted);margin:0 0 22px}
.acervo-trilha ol{list-style:none;display:flex;flex-wrap:wrap;gap:6px;margin:0;padding:0}
.acervo-trilha li+li::before{content:"›";margin-right:6px;color:var(--muted)}
.acervo-trilha a{color:var(--red);text-decoration:underline;text-underline-offset:2px}
.acervo-topo{border-bottom:1px solid var(--line);padding-bottom:28px;margin-bottom:32px}
.acervo-selo{display:inline-block;background:var(--red);color:#fff;font-weight:800;font-size:.75rem;letter-spacing:.08em;text-transform:uppercase;padding:4px 10px;border-radius:999px;margin:0 0 14px}
.acervo h1{font-size:clamp(1.8rem,3.2vw,2.6rem);line-height:1.15;color:var(--black);margin:0 0 14px}
.acervo h2{font-size:1.35rem;color:var(--black);margin:0 0 16px}
.acervo-intro{font-size:1.08rem;color:#3d4550;max-width:760px;margin:0}
.acervo-idiomas{font-size:.9rem;color:var(--muted);margin:14px 0 0}
.acervo-idiomas a,.acervo-texto a,.acervo-ficha a,.acervo-nota a{color:var(--red);text-decoration:underline;text-underline-offset:2px}
.acervo-secao{margin:0 0 44px}
.acervo-colecoes{list-style:none;display:grid;grid-template-columns:repeat(auto-fill,minmax(210px,1fr));gap:16px;margin:0;padding:0}
.acervo-colecoes li{border:1px solid var(--line);border-radius:14px;background:#fff;display:flex}
.acervo-colecoes a,.acervo-colecoes .acervo-breve{display:flex;flex-direction:column;gap:6px;padding:18px 20px;width:100%}
.acervo-colecoes a:hover{background:var(--soft)}
.acervo-colecoes strong{font-size:1.05rem;color:var(--black)}
.acervo-colecoes span{color:var(--muted);font-size:.9rem}
.acervo-colecoes em{font-style:normal;font-weight:700;font-size:.85rem;color:var(--red)}
.acervo-breve em{color:var(--muted)}
.acervo-grade{list-style:none;display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:20px;margin:0;padding:0}
.acervo-cartao{border:1px solid var(--line);border-radius:14px;overflow:hidden;background:#fff;height:100%}
.acervo-cartao a{display:flex;flex-direction:column;height:100%}
.acervo-cartao a:hover h3{color:var(--red)}
.acervo-capa{aspect-ratio:4/3;background:var(--soft);display:flex;align-items:center;justify-content:center;position:relative;overflow:hidden}
.acervo-capa img{width:100%;height:100%;object-fit:cover}
.acervo-capa .acervo-icone{font-weight:800;font-size:1.1rem;color:var(--red);border:2px solid var(--red);border-radius:8px;padding:10px 14px}
.acervo-capa .acervo-play{position:absolute;inset:auto auto 12px 12px;background:rgba(15,19,24,.82);color:#fff;border-radius:999px;padding:6px 12px;font-size:.8rem;font-weight:700}
.acervo-cartao-corpo{padding:14px 16px 16px;display:flex;flex-direction:column;gap:4px}
.acervo-cartao h3{font-size:1rem;line-height:1.3;margin:0;color:var(--black)}
.acervo-cartao p{margin:0;color:var(--muted);font-size:.85rem}
.acervo-paginas{display:flex;flex-wrap:wrap;gap:8px;margin:28px 0 0;padding:0;list-style:none}
.acervo-paginas a,.acervo-paginas span{display:inline-block;min-width:40px;text-align:center;padding:8px 12px;border:1px solid var(--line);border-radius:10px}
.acervo-paginas [aria-current]{background:var(--red);border-color:var(--red);color:#fff;font-weight:700}
.acervo-item{display:grid;grid-template-columns:minmax(0,1.6fr) minmax(0,1fr);gap:36px;align-items:start}
.acervo-figura{margin:0}
.acervo-figura img{width:100%;height:auto;border-radius:12px;background:var(--soft)}
.acervo-figura figcaption{font-size:.85rem;color:var(--muted);margin-top:8px}
.acervo-documento{border:1px solid var(--line);border-radius:14px;padding:28px;background:var(--soft);display:flex;flex-direction:column;gap:12px;align-items:flex-start}
.acervo .acervo-botao{display:inline-flex;align-items:center;gap:8px;background:var(--red);color:#fff;font-weight:700;padding:11px 18px;border-radius:10px;text-decoration:none}
.acervo .acervo-botao:hover{background:var(--red-dark)}
.acervo .acervo-botao-claro{background:#fff;color:var(--red);border:1px solid var(--red)}
.acervo .acervo-botao-claro:hover{background:var(--soft)}
.acervo-video{position:relative;display:block;aspect-ratio:16/9;border-radius:12px;overflow:hidden;background:#000}
.acervo-video img{width:100%;height:100%;object-fit:cover;opacity:.85}
.acervo-video span{position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);background:var(--red);color:#fff;font-weight:800;border-radius:999px;padding:14px 22px}
.acervo-video iframe{position:absolute;inset:0;width:100%;height:100%;border:0}
.acervo-ficha{margin:0;display:grid;grid-template-columns:auto 1fr;gap:10px 16px;font-size:.95rem}
.acervo-ficha dt{color:var(--muted);font-weight:600}
.acervo-ficha dd{margin:0;color:var(--text)}
.acervo-texto{font-size:1.02rem;max-width:760px}
.acervo-texto p{margin:0 0 14px}
.acervo-etiquetas{list-style:none;display:flex;flex-wrap:wrap;gap:8px;margin:14px 0 0;padding:0}
.acervo-etiquetas li{background:var(--soft);border:1px solid var(--line);border-radius:999px;padding:4px 12px;font-size:.85rem;color:#3d4550}
.acervo-citacao{background:var(--soft);border-left:4px solid var(--red);padding:14px 18px;font-size:.9rem;border-radius:0 10px 10px 0;margin:0}
.acervo-nota{color:var(--muted);font-size:.9rem;max-width:760px}
.acervo-equipe{margin-top:40px;font-size:.85rem;color:var(--muted)}
.acervo-equipe a{color:var(--muted);text-decoration:underline}
@media (max-width:860px){.acervo-item{grid-template-columns:1fr;gap:24px}}
`

// ---------------------------------------------------------------- pedaços

function trilha(passos: { nome: string; url?: string }[]): string {
  return `<nav class="acervo-trilha" aria-label="Você está em"><ol>${passos.map((p, n) =>
    n === passos.length - 1 ? `<li><span aria-current="page">${e(p.nome)}</span></li>` : `<li><a href="${e(p.url!)}">${e(p.nome)}</a></li>`).join('')}</ol></nav>`
}

function jsonLdDaTrilha(passos: { nome: string; url: string }[]) {
  return { '@type': 'BreadcrumbList', itemListElement: passos.map((p, n) => ({ '@type': 'ListItem', position: n + 1, name: p.nome, item: p.url })) }
}

function cartao(i: ItemPublico, origem: string, prioridade = false): string {
  const tipo = tipoDoArquivo(i.tipo_mime)
  const img = imagemDoCartao(i)
  const imagens = i.arquivos?.imagens ?? []
  let capa: string
  if (img) {
    const srcset = imagens.filter((v) => v.largura <= 960).map((v) => `${e(urlDoArquivo(v.arquivo, origem))} ${v.largura}w`).join(', ')
    capa = `<img src="${e(urlDoArquivo(img.arquivo, origem))}"${srcset ? ` srcset="${srcset}" sizes="(max-width: 520px) 100vw, 260px"` : ''} width="${img.largura}" height="${img.altura}" alt="${e(i.texto_alternativo ?? i.titulo)}" loading="${prioridade ? 'eager' : 'lazy'}" decoding="async">`
  } else if (i.arquivos?.video?.miniatura) {
    capa = `<img src="${e(i.arquivos.video.miniatura)}" width="480" height="360" alt="" loading="lazy" decoding="async"><span class="acervo-play">▶ Vídeo</span>`
  } else {
    capa = `<span class="acervo-icone" aria-hidden="true">${tipo === 'pdf' ? 'PDF' : COLECAO[i.colecao].singular}</span>`
  }
  const data = dataDoItem(i)
  return `<li class="acervo-cartao"><a href="${e(origem + caminhoDoItem(i))}"><div class="acervo-capa">${capa}</div><div class="acervo-cartao-corpo"><h3>${e(i.titulo)}</h3><p>${e([COLECAO[i.colecao].singular, data].filter(Boolean).join(' · '))}</p></div></a></li>`
}

const ordemDoAcervo = (a: ItemPublico, b: ItemPublico) => (b.publicado_em ?? '').localeCompare(a.publicado_em ?? '')

// ---------------------------------------------------------------- início

export function paginaInicialDoAcervo(p: { itens: ItemPublico[]; origem?: string; agora?: Date }): string {
  const origem = p.origem ?? ORIGEM_DO_ACERVO
  const url = `${origem}/acervo/`
  const porColecao = new Map<Colecao, ItemPublico[]>(COLECOES.map((c) => [c, p.itens.filter((i) => i.colecao === c)]))
  const recentes = [...p.itens].sort(ordemDoAcervo).slice(0, 12)
  const descricao = 'Acervo da Cruz Vermelha Brasileira Rio de Janeiro: documentos, fotografias, vídeos, recortes de imprensa e a história da filial, para consulta pública.'
  const colecoes = COLECOES.map((c) => {
    const n = porColecao.get(c)!.length
    return n
      ? `<li><a href="${e(origem + caminhoDaColecao(c))}"><strong>${e(COLECAO[c].nome)}</strong><span>${e(COLECAO[c].resumo)}</span><em>${n} ${n === 1 ? 'item' : 'itens'}</em></a></li>`
      : `<li><div class="acervo-breve"><strong>${e(COLECAO[c].nome)}</strong><span>${e(COLECAO[c].resumo)}</span><em>Em breve</em></div></li>`
  }).join('')
  const passos = [{ nome: 'Início', url: `${origem}/` }, { nome: 'Acervo', url }]
  const corpo = `<main class="acervo" id="conteudo">
      ${trilha(passos)}
      <header class="acervo-topo">
        <p class="acervo-selo">Acervo</p>
        <h1>Acervo da Cruz Vermelha Brasileira Rio de Janeiro</h1>
        <p class="acervo-intro">Documentos, fotografias, vídeos, o que a imprensa publicou e os registros da história da filial, organizados para consulta. É a memória da ação humanitária da Cruz Vermelha Brasileira no Rio de Janeiro, guardada com a data, a autoria e as condições de uso de cada item.</p>
        <p class="acervo-idiomas">Also in <a href="${e(origem)}/en/archive/" hreflang="en" lang="en">English</a> · También en <a href="${e(origem)}/es/acervo/" hreflang="es" lang="es">español</a></p>
      </header>
      <section class="acervo-secao" aria-labelledby="colecoes">
        <h2 id="colecoes">Coleções</h2>
        <ul class="acervo-colecoes">${colecoes}</ul>
      </section>
      ${recentes.length ? `<section class="acervo-secao" aria-labelledby="recentes">
        <h2 id="recentes">Chegaram ao acervo</h2>
        <ul class="acervo-grade">${recentes.map((i, n) => cartao(i, origem, n < 4)).join('')}</ul>
      </section>` : ''}
      <section class="acervo-secao acervo-texto" aria-labelledby="contribua">
        <h2 id="contribua">Contribua com o acervo</h2>
        <p>Tem fotos, documentos, recortes de jornal ou lembranças ligadas à filial? Escreva para <a href="mailto:${EMAIL}">${EMAIL}</a> contando o que você tem, a data aproximada, o lugar e quem produziu o material ou aparece nele. A equipe responde, combina a digitalização e registra a autoria de quem contribuiu.</p>
      </section>
      <section class="acervo-secao acervo-texto" aria-labelledby="como-usar">
        <h2 id="como-usar">Como usar o material</h2>
        <p>Cada item informa a autoria, o crédito e as condições de uso. Itens em Creative Commons ou em domínio público podem ser usados como a licença indica, sempre com o crédito. Para reproduzir um item com todos os direitos reservados, peça autorização por <a href="mailto:${EMAIL}">${EMAIL}</a>, informando o endereço da página do item.</p>
        <p>Cada página de item traz também a forma de citar o material em trabalhos e reportagens.</p>
      </section>
      <p class="acervo-equipe">Faz parte da equipe da filial? <a href="${e(origem)}/acervo/equipe/" rel="nofollow">Acesse o acervo completo</a>.</p>
    </main>`
  const jsonLd = {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'CollectionPage', '@id': `${url}#pagina`, url, name: 'Acervo', description: descricao, inLanguage: 'pt-BR',
        isPartOf: noDoSite(), about: noDaOrganizacao(), breadcrumb: { '@id': `${url}#trilha` },
        mainEntity: { '@id': `${url}#acervo` },
      },
      {
        '@type': 'Collection', '@id': `${url}#acervo`, name: `Acervo da ${NOME_DA_FILIAL}`, description: descricao, url, inLanguage: 'pt-BR',
        publisher: noDaOrganizacao(), collectionSize: p.itens.length,
        hasPart: COLECOES.filter((c) => porColecao.get(c)!.length).map((c) => ({
          '@type': 'Collection', name: `${COLECAO[c].nome} — Acervo`, url: origem + caminhoDaColecao(c), collectionSize: porColecao.get(c)!.length,
        })),
      },
      { ...jsonLdDaTrilha(passos), '@id': `${url}#trilha` },
    ],
  }
  return montarPaginaDoSite({
    titulo: 'Acervo', descricao, caminho: '/acervo/', origem, corpo, cssExtra: CSS_DO_ACERVO, jsonLd, agora: p.agora, ativo: 'acervo',
    imagem: IMAGEM_PADRAO,
    alternativas: [
      { hreflang: 'pt-BR', url }, { hreflang: 'en', url: `${origem}/en/archive/` },
      { hreflang: 'es', url: `${origem}/es/acervo/` }, { hreflang: 'x-default', url },
    ],
  })
}

// ---------------------------------------------------------------- coleção

/** As páginas de uma coleção: [caminho relativo a /acervo/, html]. Vazia: nenhuma. */
export function paginasDaColecao(p: { colecao: Colecao; itens: ItemPublico[]; origem?: string; agora?: Date }): { relativo: string; html: string }[] {
  const origem = p.origem ?? ORIGEM_DO_ACERVO
  const itens = p.itens.filter((i) => i.colecao === p.colecao).sort(ordemDoAcervo)
  if (!itens.length) return []
  const total = Math.ceil(itens.length / POR_PAGINA)
  const c = COLECAO[p.colecao]
  return Array.from({ length: total }, (_, n) => {
    const pagina = n + 1
    const caminho = caminhoDaColecao(p.colecao, pagina)
    const url = origem + caminho
    const daPagina = itens.slice(n * POR_PAGINA, (n + 1) * POR_PAGINA)
    const sufixo = pagina > 1 ? ` (página ${pagina} de ${total})` : ''
    const passos = [{ nome: 'Início', url: `${origem}/` }, { nome: 'Acervo', url: `${origem}/acervo/` }, { nome: c.nome, url: origem + caminhoDaColecao(p.colecao) }]
    if (pagina > 1) passos.push({ nome: `Página ${pagina}`, url })
    const navegacao = total > 1 ? `<nav aria-label="Páginas da coleção"><ul class="acervo-paginas">${Array.from({ length: total }, (_, k) => {
      const alvo = k + 1
      // O Google ignora prev/next desde 2019; o Bing ainda usa para entender a sequência.
      const rel = alvo === pagina - 1 ? ' rel="prev"' : alvo === pagina + 1 ? ' rel="next"' : ''
      return alvo === pagina ? `<li><span aria-current="page">${alvo}</span></li>` : `<li><a href="${e(origem + caminhoDaColecao(p.colecao, alvo))}"${rel}>${alvo}</a></li>`
    }).join('')}</ul></nav>` : ''
    const corpo = `<main class="acervo" id="conteudo">
      ${trilha(passos)}
      <header class="acervo-topo">
        <p class="acervo-selo">Acervo</p>
        <h1>${e(c.nome)} do acervo${e(sufixo)}</h1>
        <p class="acervo-intro">${e(c.descricao)}</p>
        <p class="acervo-idiomas">${itens.length} ${itens.length === 1 ? 'item público' : 'itens públicos'} nesta coleção. <a href="${e(origem)}/acervo/">Ver todas as coleções</a>.</p>
      </header>
      <ul class="acervo-grade">${daPagina.map((i, k) => cartao(i, origem, k < 4)).join('')}</ul>
      ${navegacao}
    </main>`
    const jsonLd = {
      '@context': 'https://schema.org',
      '@graph': [
        {
          '@type': 'CollectionPage', '@id': `${url}#pagina`, url, name: `${c.nome} — Acervo${sufixo}`, description: c.descricao, inLanguage: 'pt-BR',
          isPartOf: { '@type': 'Collection', '@id': `${origem}/acervo/#acervo`, name: `Acervo da ${NOME_DA_FILIAL}`, url: `${origem}/acervo/` }, breadcrumb: { '@id': `${url}#trilha` }, mainEntity: { '@id': `${url}#lista` },
        },
        {
          '@type': 'ItemList', '@id': `${url}#lista`, numberOfItems: daPagina.length,
          itemListElement: daPagina.map((i, k) => ({ '@type': 'ListItem', position: n * POR_PAGINA + k + 1, url: origem + caminhoDoItem(i), name: i.titulo })),
        },
        { ...jsonLdDaTrilha(passos), '@id': `${url}#trilha` },
      ],
    }
    const capa = daPagina.map((i) => imagemDoItem(i, origem)).find(Boolean)
    const html = montarPaginaDoSite({
      titulo: `${c.nome} — Acervo${sufixo}`, descricao: c.descricao, caminho, origem, corpo, cssExtra: CSS_DO_ACERVO, jsonLd, agora: p.agora, ativo: 'acervo',
      imagem: capa ? { ...capa, alt: `${c.nome} do acervo` } : IMAGEM_PADRAO,
    })
    return { relativo: `${p.colecao}/${pagina > 1 ? `pagina/${pagina}/` : ''}index.html`, html }
  })
}

// ---------------------------------------------------------------- item

function citacao(i: ItemPublico, url: string): string {
  const data = dataDoItem(i)
  const autoria = i.autoria ? `${i.autoria}. ` : ''
  return `${e(NOME_DA_FILIAL.toUpperCase())}. ${e(autoria)}<em>${e(i.titulo)}</em>.${data ? ` ${e(data)}.` : ''} Acervo da ${e(NOME_DA_FILIAL)}. Disponível em: ${e(url)}. Acesso em: <span data-hoje>data da consulta</span>.`
}

function midiaDoItem(i: ItemPublico, origem: string): string {
  const imagens = i.arquivos?.imagens ?? []
  if (imagens.length) {
    const maior = imagens[imagens.length - 1]
    const media = imagens.find((v) => v.largura >= 960) ?? maior
    const srcset = imagens.map((v) => `${e(urlDoArquivo(v.arquivo, origem))} ${v.largura}w`).join(', ')
    const legenda = [i.credito ?? (i.autoria ? `Autoria: ${i.autoria}` : null)].filter(Boolean).join(' · ')
    return `<figure class="acervo-figura">
        <img src="${e(urlDoArquivo(media.arquivo, origem))}" srcset="${srcset}" sizes="(max-width: 860px) 100vw, 640px" width="${media.largura}" height="${media.altura}" alt="${e(i.texto_alternativo ?? i.titulo)}" fetchpriority="high" decoding="async">
        ${legenda ? `<figcaption>${e(legenda)}</figcaption>` : ''}
      </figure>
      <p><a class="acervo-botao acervo-botao-claro" href="${e(urlDoArquivo(maior.arquivo, origem))}" download>Baixar a imagem (${maior.largura} × ${maior.altura})</a></p>`
  }
  if (i.arquivos?.video) {
    const v = i.arquivos.video
    return `<a class="acervo-video" href="${e(v.pagina)}" data-embed="${e(v.embed)}" rel="noopener">
        ${v.miniatura ? `<img src="${e(v.miniatura)}" alt="" width="480" height="360" loading="eager" decoding="async">` : ''}
        <span>▶ Assistir</span>
      </a>
      <script>
        document.querySelectorAll('.acervo-video[data-embed]').forEach(function (a) {
          a.addEventListener('click', function (ev) {
            ev.preventDefault();
            var f = document.createElement('iframe');
            f.src = a.getAttribute('data-embed') + (a.getAttribute('data-embed').indexOf('?') < 0 ? '?' : '&') + 'autoplay=1';
            f.title = ${JSON.stringify(i.titulo).replace(/</g, '\\u003c')};
            f.allow = 'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share';
            f.allowFullscreen = true;
            var d = document.createElement('div');
            d.className = 'acervo-video';
            d.appendChild(f);
            a.replaceWith(d);
          });
        });
      </script>`
  }
  if (i.arquivos?.pdf) {
    return `<div class="acervo-documento">
        <strong>Documento em PDF${i.tamanho ? ` · ${e(tamanhoLegivel(i.tamanho))}` : ''}</strong>
        <a class="acervo-botao" href="${e(urlDoArquivo(i.arquivos.pdf, origem))}">Abrir o documento</a>
      </div>`
  }
  return ''
}

export function paginaDoItem(p: { item: ItemPublico; origem?: string; agora?: Date }): string {
  const i = p.item
  const origem = p.origem ?? ORIGEM_DO_ACERVO
  const caminho = caminhoDoItem(i)
  const url = origem + caminho
  const c = COLECAO[i.colecao]
  const data = dataDoItem(i)
  const direitos = DIREITO[i.direitos]
  const descricao = descricaoDoItem(i)
  const tipo = tipoDoArquivo(i.tipo_mime)
  const passos = [
    { nome: 'Início', url: `${origem}/` }, { nome: 'Acervo', url: `${origem}/acervo/` },
    { nome: c.nome, url: origem + caminhoDaColecao(i.colecao) }, { nome: i.titulo, url },
  ]
  const ficha: [string, string][] = []
  if (data) ficha.push(['Data', e(data)])
  if (i.autoria) ficha.push(['Autoria', e(i.autoria)])
  if (i.local) ficha.push(['Local', e(i.local)])
  ficha.push(['Coleção', `<a href="${e(origem + caminhoDaColecao(i.colecao))}">${e(c.nome)}</a>`])
  ficha.push(['Direitos', direitos.licenca ? `<a href="${e(direitos.licenca)}" rel="license noopener" target="_blank">${e(direitos.nome)}</a>` : e(direitos.nome)])
  if (i.credito) ficha.push(['Crédito', e(i.credito)])
  const paragrafos = (i.descricao ?? '').split(/\n{2,}|\r\n\r\n/).map((t) => t.trim()).filter(Boolean)
  const corpo = `<main class="acervo" id="conteudo">
      ${trilha(passos)}
      <article>
        <header class="acervo-topo">
          <p class="acervo-selo">${e(c.singular)}</p>
          <h1>${e(i.titulo)}</h1>
          ${data ? `<p class="acervo-idiomas">${e(data)}${i.local ? ` · ${e(i.local)}` : ''}</p>` : ''}
        </header>
        <div class="acervo-item">
          <div>${midiaDoItem(i, origem)}</div>
          <div>
            <dl class="acervo-ficha">${ficha.map(([t, d]) => `<dt>${e(t)}</dt><dd>${d}</dd>`).join('')}</dl>
            ${i.direitos === 'todos_reservados' ? `<p class="acervo-nota">Para reproduzir, peça autorização: <a href="mailto:${EMAIL}?subject=${encodeURIComponent(`Autorização de uso: ${i.titulo}`)}">${EMAIL}</a>.</p>` : ''}
          </div>
        </div>
        ${paragrafos.length ? `<div class="acervo-texto acervo-secao" style="margin-top:32px">${paragrafos.map((t) => `<p>${e(t).replace(/\n/g, '<br>')}</p>`).join('')}</div>` : ''}
        ${i.palavras_chave.length ? `<ul class="acervo-etiquetas" aria-label="Assuntos">${i.palavras_chave.map((k) => `<li>${e(k)}</li>`).join('')}</ul>` : ''}
        <section class="acervo-secao" aria-labelledby="citar" style="margin-top:36px">
          <h2 id="citar">Como citar</h2>
          <p class="acervo-citacao">${citacao(i, url)}</p>
        </section>
        <p><a class="acervo-botao acervo-botao-claro" href="${e(origem + caminhoDaColecao(i.colecao))}">← Mais em ${e(c.nome)}</a></p>
      </article>
    </main>
    <script>document.querySelectorAll('[data-hoje]').forEach(function (s) { s.textContent = new Date().toLocaleDateString('pt-BR', { day: 'numeric', month: 'short', year: 'numeric' }); });</script>`

  const imagem = imagemDoItem(i, origem)
  const criador = i.autoria ? { '@type': 'Person', name: i.autoria } : noDaOrganizacao()
  const comum: Record<string, unknown> = {
    '@id': `${url}#item`, name: i.titulo, description: descricao, url, inLanguage: 'pt-BR',
    isPartOf: { '@type': 'Collection', name: `${c.nome} — Acervo`, url: origem + caminhoDaColecao(i.colecao) },
    publisher: noDaOrganizacao(), creator: criador,
    ...(dataIso(i.data_item, i.data_precisao) ? { dateCreated: dataIso(i.data_item, i.data_precisao) } : {}),
    datePublished: i.publicado_em,
    ...(i.local ? { contentLocation: { '@type': 'Place', name: i.local } } : {}),
    ...(i.palavras_chave.length ? { keywords: i.palavras_chave.join(', ') } : {}),
    ...(direitos.licenca ? { license: direitos.licenca } : {}),
    acquireLicensePage: `${origem}/acervo/#como-usar`,
    ...(i.credito ? { creditText: i.credito } : i.autoria ? { creditText: i.autoria } : {}),
    copyrightNotice: i.direitos === 'dominio_publico' ? 'Domínio público' : `${i.autoria ?? NOME_DA_FILIAL} — ${direitos.nome}`,
  }
  let principal: Record<string, unknown>
  const maior = maiorImagem(i)
  if (maior) {
    const cartaoImg = imagemDoCartao(i)
    principal = {
      '@type': 'ImageObject', ...comum, contentUrl: urlDoArquivo(maior.arquivo, origem),
      ...(cartaoImg ? { thumbnailUrl: urlDoArquivo(cartaoImg.arquivo, origem) } : {}),
      width: maior.largura, height: maior.altura, encodingFormat: 'image/webp',
      ...(i.texto_alternativo ? { caption: i.texto_alternativo } : {}),
    }
  } else if (i.arquivos?.video) {
    principal = {
      '@type': 'VideoObject', ...comum, embedUrl: i.arquivos.video.embed, contentUrl: i.arquivos.video.pagina,
      ...(i.arquivos.video.miniatura ? { thumbnailUrl: i.arquivos.video.miniatura } : {}), uploadDate: i.publicado_em,
    }
  } else {
    principal = {
      '@type': 'DigitalDocument', ...comum,
      ...(i.arquivos?.pdf ? { encoding: { '@type': 'MediaObject', contentUrl: urlDoArquivo(i.arquivos.pdf, origem), encodingFormat: 'application/pdf', ...(i.tamanho ? { contentSize: `${i.tamanho} B` } : {}) } } : {}),
    }
  }
  const jsonLd = {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'ItemPage', '@id': `${url}#pagina`, url, name: i.titulo, description: descricao, inLanguage: 'pt-BR',
        isPartOf: noDoSite(), breadcrumb: { '@id': `${url}#trilha` }, mainEntity: { '@id': `${url}#item` },
        ...(maior ? { primaryImageOfPage: { '@id': `${url}#item` } } : {}),
        datePublished: i.publicado_em, ...(i.atualizado_no_site_em ? { dateModified: i.atualizado_no_site_em } : {}),
      },
      principal,
      { ...jsonLdDaTrilha(passos), '@id': `${url}#trilha` },
    ],
  }
  return montarPaginaDoSite({
    titulo: `${i.titulo} — Acervo`, descricao, caminho, origem, corpo, cssExtra: CSS_DO_ACERVO, jsonLd, agora: p.agora, ativo: 'acervo',
    tipoOg: 'article',
    publicadoEm: new Date(i.publicado_em),
    ...(i.atualizado_no_site_em ? { modificadoEm: new Date(i.atualizado_no_site_em) } : {}),
    imagem: imagem ? { ...imagem, alt: i.texto_alternativo ?? i.titulo } : { ...IMAGEM_PADRAO, alt: `${i.titulo} — ${tipo === 'pdf' ? 'documento' : c.singular.toLowerCase()} do acervo` },
  })
}

// ---------------------------------------------------------------- servidor e mapa

/**
 * O .htaccess de /acervo/: a porta da equipe (vai para a Redação, com login), cache longo para os
 * arquivos (o nome muda quando o conteúdo muda) e, para cada PDF, o cabeçalho que aponta a página
 * do item como canônica — a busca mostra a página com o contexto, não o PDF solto.
 */
export function htaccessDoAcervo(p: { pdfs: { arquivo: string; pagina: string }[] }): string {
  const canonicos = p.pdfs
    .filter((d) => /^[a-z0-9][a-z0-9-]*-[0-9a-f]{12}\.pdf$/.test(d.arquivo))
    .map((d) => `  <Files "${d.arquivo}">\n    Header set Link "<${d.pagina}>; rel=\\"canonical\\""\n  </Files>`)
  return `# Gerado pela Redação (lib/acervo/paginas.ts). Editar lá, não aqui.
Options -Indexes
RedirectMatch 302 ^/acervo/equipe/?$ ${ENDERECO_DA_EQUIPE}
<IfModule mod_headers.c>
  <FilesMatch "\\.(webp|jpg|pdf)$">
    Header set Cache-Control "public, max-age=31536000, immutable"
  </FilesMatch>
  <FilesMatch "\\.html$">
    Header set Cache-Control "no-cache"
  </FilesMatch>
${canonicos.join('\n')}
</IfModule>
`
}

/** As entradas do acervo no sitemap.xml, com a imagem de cada item (Google Imagens). */
export function entradasDoAcervoNoMapa(itens: ItemPublico[], origem = ORIGEM_DO_ACERVO): EntradaDoMapa[] {
  if (!itens.length) return [{ url: `${origem}/acervo/` }]
  const maisRecente = (lista: ItemPublico[]) => new Date(lista.map((i) => i.atualizado_no_site_em ?? i.publicado_em).sort().reverse()[0])
  const entradas: EntradaDoMapa[] = [{ url: `${origem}/acervo/`, modificadaEm: maisRecente(itens) }]
  for (const c of COLECOES) {
    const daColecao = itens.filter((i) => i.colecao === c).sort(ordemDoAcervo)
    if (!daColecao.length) continue
    const total = Math.ceil(daColecao.length / POR_PAGINA)
    for (let n = 1; n <= total; n++) entradas.push({ url: origem + caminhoDaColecao(c, n), modificadaEm: maisRecente(daColecao.slice((n - 1) * POR_PAGINA, n * POR_PAGINA)) })
  }
  for (const i of itens) {
    const maior = maiorImagem(i)
    entradas.push({
      url: origem + caminhoDoItem(i),
      modificadaEm: new Date(i.atualizado_no_site_em ?? i.publicado_em),
      ...(maior ? { imagens: [urlDoArquivo(maior.arquivo, origem)] } : {}),
    })
  }
  return entradas
}

/** Título que a aba vai mostrar (para a tela da Redação conferir antes de publicar). */
export const tituloDoItemNaBusca = (titulo: string) => tituloDaAba(`${titulo} — Acervo`)
