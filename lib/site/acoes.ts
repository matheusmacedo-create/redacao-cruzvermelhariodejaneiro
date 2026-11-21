import {
  escapar, montarPaginaDoSite, noDaOrganizacao, noDoSite, NOME_DO_SITE, IMAGEM_PADRAO_DO_SITE,
} from '@/lib/site/esqueleto'
import type { NoticiaDoIndice } from '@/lib/site/indice-noticias'
import { CAMINHO_DAS_ACOES, dataDaAcaoLegivel, type AcaoDoMestre } from '@/lib/site/marca-de-acao'

export * from '@/lib/site/marca-de-acao'

/**
 * "Nossas ações" (/acoes/): o histórico do que a filial já fez, para quem chega
 * de fora (um patrocinador, um parceiro, a imprensa) ver tudo num lugar só,
 * com foto, data, local e um texto curto de cada ação.
 *
 * Não é outro jornal. /noticias/ mistura matéria de serviço com o que a filial
 * faz, na ordem em que foi publicado; aqui entra SÓ o que a filial fez, na
 * ordem em que ACONTECEU (a data da ação, não a da publicação: a ação de março
 * escrita em novembro aparece em março).
 *
 * Uma ação é uma matéria no ar cujo pacote foi marcado na tela de Publicações
 * ("Nossas ações"). A marca, com a conferência dela, está em
 * lib/site/marca-de-acao.ts; aqui ficam a seleção e a página.
 *
 * Módulo puro (sem banco, sem rede), conferido por
 * `npx tsx scripts/conferir-pagina-de-acoes.ts`.
 */

/** Uma ação na página: a matéria no ar, mais quando e onde aconteceu. */
export type AcaoNoSite = Omit<NoticiaDoIndice, 'publicadaEm'> & {
  /** AAAA-MM-DD. */
  data: string
  local: string
}

/**
 * Junta as matérias no ar com as marcas dos pacotes. Só entra matéria que está
 * no ar E tem marca; a ordem é a da ação, da mais recente para a mais antiga
 * (no mesmo dia, pelo título, para a página não mudar de ordem a cada regeração).
 */
export function acoesDoSite(noticias: (NoticiaDoIndice & { id?: string })[], marcas: Map<string, AcaoDoMestre>): AcaoNoSite[] {
  const saida: AcaoNoSite[] = []
  const vistas = new Set<string>()
  for (const n of noticias) {
    const marca = n.id ? marcas.get(n.id) : undefined
    if (!marca || vistas.has(n.url)) continue
    vistas.add(n.url)
    saida.push({
      titulo: n.titulo, descricao: n.descricao, url: n.url, capa: n.capa,
      capaLargura: n.capaLargura, capaAltura: n.capaAltura, capaVersoes: n.capaVersoes,
      data: marca.data, local: marca.local,
    })
  }
  return saida.sort((a, b) => (a.data === b.data ? a.titulo.localeCompare(b.titulo, 'pt-BR') : a.data < b.data ? 1 : -1))
}

const CSS_DAS_ACOES = `
.acoes{max-width:var(--max-folio);margin:0 auto;padding:0 20px 72px}
.acoes a:focus-visible{outline:3px solid var(--brand);outline-offset:3px}
.acoes-topo{padding:36px 0 8px;max-width:760px}
.acoes-topo .chapeu{color:var(--brand);font-weight:800;font-size:14px;letter-spacing:.12em;text-transform:uppercase;margin:0 0 10px}
.acoes-topo h1{font-family:var(--serif);font-weight:800;font-size:clamp(34px,6vw,54px);line-height:1.08;letter-spacing:-.02em;margin:0 0 16px;color:var(--news-ink);text-wrap:balance}
.acoes-topo .lead{font-size:19px;line-height:1.55;color:var(--ink-2);margin:0 0 14px}
.acoes-topo .conta{font-size:17px;font-weight:700;color:var(--news-ink);margin:0}
.acoes-anos{display:flex;flex-wrap:wrap;gap:10px;list-style:none;margin:26px 0 0;padding:0}
.acoes-anos a{display:inline-flex;align-items:center;justify-content:center;min-height:48px;min-width:76px;padding:0 18px;border:2px solid var(--news-ink);border-radius:999px;font-weight:800;font-size:17px;color:var(--news-ink)}
.acoes-anos a:hover{background:var(--news-ink);color:#fff}
.acoes-ano{margin-top:44px;scroll-margin-top:96px}
.acoes-ano-topo{display:flex;align-items:baseline;justify-content:space-between;gap:12px;border-top:3px solid var(--news-ink);border-bottom:1px solid var(--news-line);padding:12px 0}
.acoes-ano-topo h2{font-family:var(--serif);font-weight:800;font-size:clamp(28px,4vw,36px);line-height:1.1;margin:0;color:var(--news-ink)}
.acoes-ano-topo h2::before{content:'';display:inline-block;width:12px;height:12px;background:var(--brand);margin-right:10px}
.acoes-ano-topo span{font-size:16px;color:var(--news-muted);white-space:nowrap}
.acoes-grade{list-style:none;margin:0;padding:24px 0 0;display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:36px 28px}
.acao{display:flex;flex-direction:column;height:100%;color:inherit}
.acao figure{margin:0 0 14px}
.acao img{display:block;width:100%;height:auto;aspect-ratio:4/3;object-fit:cover;background:var(--box)}
.acao .sem-foto{aspect-ratio:4/3;background:var(--box) url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 48 48'%3E%3Cpath fill='%23d9d9d6' d='M16 0h16v16h16v16H32v16H16V32H0V16h16z'/%3E%3C/svg%3E") center/56px no-repeat;margin:0 0 14px}
.acao .quando{display:block;color:var(--brand);font-weight:800;font-size:16px;margin:0 0 2px}
.acao .onde{display:block;color:var(--news-muted);font-size:16px;margin:0 0 8px}
.acao h3{font-family:var(--serif);font-weight:800;font-size:23px;line-height:1.2;letter-spacing:-.01em;margin:0 0 8px;color:var(--news-ink)}
.acao p{font-size:17px;line-height:1.5;color:var(--ink-2);margin:0 0 12px}
.acao .ver{margin-top:auto;font-weight:700;font-size:17px;color:var(--brand);min-height:44px;display:flex;align-items:center}
.acao:hover h3{color:var(--brand)}
.acao:hover img{opacity:.92}
.acoes-vazio{max-width:680px;margin:28px 0 0;padding:24px;border:1px solid var(--news-line);border-left:6px solid var(--brand);font-size:18px;line-height:1.55;color:var(--ink-2)}
.acoes-vazio p{margin:0 0 12px}
.acoes-vazio p:last-child{margin:0}
.acoes-vazio a{color:var(--brand);font-weight:700;text-decoration:underline;display:inline-block;padding:11px 0}
.acoes-convite{margin-top:56px;padding:28px 24px;background:var(--box);border-top:3px solid var(--brand)}
.acoes-convite h2{font-family:var(--serif);font-weight:800;font-size:clamp(24px,3.4vw,30px);line-height:1.15;margin:0 0 10px;color:var(--news-ink)}
.acoes-convite p{font-size:18px;line-height:1.55;color:var(--ink-2);margin:0 0 18px;max-width:680px}
.acoes-botoes{display:flex;flex-wrap:wrap;gap:12px}
.acoes-botoes a{display:inline-flex;align-items:center;justify-content:center;min-height:52px;padding:0 24px;border-radius:999px;font-weight:800;font-size:17px;border:2px solid var(--brand);color:var(--brand);background:#fff;text-align:center}
.acoes-botoes a.cheio{background:var(--brand);color:#fff}
.acoes-botoes a:hover{background:var(--brand-dark);border-color:var(--brand-dark);color:#fff}
@media (max-width:980px){.acoes-grade{grid-template-columns:repeat(2,minmax(0,1fr))}}
@media (max-width:620px){
  .acoes{padding:0 16px 56px}
  .acoes-topo{padding-top:24px}
  .acoes-grade{grid-template-columns:1fr;gap:0}
  .acoes-grade li{padding:22px 0;border-bottom:1px solid var(--news-line)}
  .acoes-grade li:last-child{border-bottom:0}
  .acoes-botoes a{width:100%}
}
`

/** As larguras em que o cartão aparece: três colunas, duas, uma. */
const TAMANHO_DO_CARTAO = '(max-width: 620px) calc(100vw - 32px), (max-width: 980px) calc(50vw - 34px), 360px'

const plural = (n: number, um: string, varios: string) => `${n} ${n === 1 ? um : varios}`

/**
 * A página inteira. Sem ação nenhuma, sai com um aviso curto e `noindex`: o
 * endereço já responde (o menu e a home podem apontar para ele), mas o Google
 * não guarda uma página vazia.
 */
export function paginaDeAcoes(acoes: AcaoNoSite[], agora: Date = new Date(), chat?: string): string {
  const origem = 'https://cruzvermelhariodejaneiro.org'
  const url = `${origem}${CAMINHO_DAS_ACOES}`
  const anos = [...new Set(acoes.map((a) => a.data.slice(0, 4)))]

  const cartao = (a: AcaoNoSite, primeira: boolean) => {
    const capa = a.capa?.trim()
    // A foto é decorativa aqui: o título da ação é o texto do mesmo link.
    const carga = primeira ? 'fetchpriority="high" decoding="async"' : 'loading="lazy" decoding="async"'
    const medidas = a.capaLargura && a.capaAltura ? ` width="${a.capaLargura}" height="${a.capaAltura}"` : ''
    const img = capa ? `<img src="${escapar(capa)}"${medidas} alt="" ${carga}>` : ''
    const versoes = a.capaVersoes ?? []
    const foto = !capa
      ? '<div class="sem-foto" aria-hidden="true"></div>'
      : versoes.length
        ? `<figure><picture><source type="image/webp" srcset="${versoes.map((v) => `${escapar(v.url)} ${v.largura}w`).join(', ')}" sizes="${TAMANHO_DO_CARTAO}">${img}</picture></figure>`
        : `<figure>${img}</figure>`
    return `<li><a class="acao" href="${escapar(a.url)}">
            ${foto}
            <time class="quando" datetime="${a.data}">${dataDaAcaoLegivel(a.data)}</time>
            ${a.local ? `<span class="onde">${escapar(a.local)}</span>` : ''}
            <h3>${escapar(a.titulo)}</h3>
            ${a.descricao?.trim() ? `<p>${escapar(a.descricao.trim())}</p>` : ''}
            <span class="ver">Ver o relato e as fotos →</span>
          </a></li>`
  }

  let jaTeveFoto = false
  const secoes = anos.map((ano) => {
    const doAno = acoes.filter((a) => a.data.startsWith(ano))
    return `<section class="acoes-ano" id="ano-${ano}" aria-labelledby="ano-${ano}-titulo">
        <div class="acoes-ano-topo">
          <h2 id="ano-${ano}-titulo">${ano}</h2>
          <span>${plural(doAno.length, 'ação', 'ações')}</span>
        </div>
        <ul class="acoes-grade">
          ${doAno.map((a) => {
            const primeira = !jaTeveFoto && Boolean(a.capa?.trim())
            if (primeira) jaTeveFoto = true
            return cartao(a, primeira)
          }).join('\n          ')}
        </ul>
      </section>`
  }).join('\n      ')

  const maisAntiga = acoes.length ? acoes[acoes.length - 1].data.slice(0, 4) : ''
  const conta = !acoes.length ? ''
    : `<p class="conta">${plural(acoes.length, 'ação registrada', 'ações registradas')}${anos.length > 1 ? `, de ${maisAntiga} a ${anos[0]}` : ` em ${anos[0]}`}.</p>`
  const navDosAnos = anos.length > 1
    ? `<nav aria-label="Ações por ano"><ul class="acoes-anos">${anos.map((ano) => `<li><a href="#ano-${ano}">${ano}</a></li>`).join('')}</ul></nav>`
    : ''
  const vazio = acoes.length ? '' : `<div class="acoes-vazio">
        <p>Estamos reunindo aqui o registro das ações da filial, com as fotos e o relato de cada uma.</p>
        <p>Enquanto isso, acompanhe pelo <a href="https://www.instagram.com/cruzvermelhabrasileirarj/" rel="noopener">Instagram da filial</a> e pelas <a href="${origem}/noticias/">notícias</a>.</p>
      </div>`

  const corpo = `<main class="acoes">
      <header class="acoes-topo">
        <p class="chapeu">Nossas ações</p>
        <h1>O que a filial já fez, com data, local e fotos</h1>
        <p class="lead">Atendimentos, campanhas, formações e apoio a eventos realizados pela ${NOME_DO_SITE}. Cada ação tem o relato do que aconteceu e as fotos do dia.</p>
        ${conta}
        ${navDosAnos}
      </header>
      ${vazio}
      ${secoes}
      <section class="acoes-convite" aria-labelledby="convite-titulo">
        <h2 id="convite-titulo">Quer fazer parte das próximas?</h2>
        <p>As ações acontecem com o trabalho de voluntários e o apoio de empresas e órgãos públicos parceiros.</p>
        <div class="acoes-botoes">
          <a class="cheio" href="${origem}/empresas-e-orgaos-publicos/">Apoiar como empresa ou órgão público</a>
          <a href="${origem}/voluntariado/">Ser voluntário</a>
        </div>
      </section>
    </main>`

  const descricao = `O histórico das ações da ${NOME_DO_SITE}: atendimentos, campanhas, formações e apoio a eventos, com data, local, relato e fotos.`
  const comCapa = acoes.find((a) => a.capa?.trim())
  const imagem = comCapa
    ? { url: comCapa.capa!.trim(), largura: comCapa.capaLargura, altura: comCapa.capaAltura, alt: `Foto da ação: ${comCapa.titulo}` }
    : IMAGEM_PADRAO_DO_SITE

  return montarPaginaDoSite({
    titulo: 'Nossas ações',
    descricao,
    caminho: CAMINHO_DAS_ACOES,
    corpo,
    cssExtra: CSS_DAS_ACOES,
    agora,
    imagem,
    chat,
    indexar: acoes.length > 0,
    jsonLd: {
      '@context': 'https://schema.org',
      '@graph': [
        {
          '@type': 'CollectionPage',
          '@id': `${url}#pagina`,
          url,
          name: `Nossas ações | ${NOME_DO_SITE}`,
          description: descricao,
          inLanguage: 'pt-BR',
          isPartOf: noDoSite(),
          publisher: noDaOrganizacao(),
          breadcrumb: { '@id': `${url}#trilha` },
          mainEntity: {
            '@type': 'ItemList',
            '@id': `${url}#lista`,
            numberOfItems: acoes.length,
            itemListElement: acoes.map((a, i) => ({ '@type': 'ListItem', position: i + 1, url: a.url, name: a.titulo })),
          },
        },
        {
          '@type': 'BreadcrumbList',
          '@id': `${url}#trilha`,
          itemListElement: [
            { '@type': 'ListItem', position: 1, name: 'Início', item: `${origem}/` },
            { '@type': 'ListItem', position: 2, name: 'Nossas ações', item: url },
          ],
        },
      ],
    },
  })
}
