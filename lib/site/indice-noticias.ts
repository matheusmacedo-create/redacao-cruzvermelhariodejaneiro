import { IMAGEM_PADRAO_DO_SITE, NOME_DO_SITE, montarPaginaDoSite, escapar, noDaOrganizacao, noDoSite } from '@/lib/site/esqueleto'
import { alternativasDaPagina } from '@/lib/site/traducoes'
import { NOME_DO_CANAL, resumoDoPost, type ItemDaLinha } from '@/lib/site/linha-do-tempo'
import { svgDaMarca } from '@/lib/marcas'

/**
 * A central de notícias — /noticias/ com cara de primeira página de jornal.
 *
 * Até aqui o endereço servia o que o acaso deixou lá: a última matéria de
 * teste publicada virava o "índice" do noticiário, visível ao público e ao
 * Google. Agora o índice é gerado da lista real de matérias publicadas e
 * REGERADO a cada publicação — empilha sozinho, como o usuário pediu.
 *
 * A mais recente abre como manchete, com a capa grande ao lado; as demais
 * empilham em ordem, com miniatura quem tiver.
 *
 * A capa vem de `site_cover_url`, gravada na publicação — é a MESMA imagem que
 * vira og:image da matéria. Antes o índice não tinha como saber o nome do
 * arquivo (ele nasce da legenda, em nomeSeoDaMidia) e por isso saía só de
 * texto. Matéria sem imagem continua saindo só de texto, no mesmo lugar: o
 * layout não reserva buraco para imagem que não existe.
 */

export type NoticiaDoIndice = {
  titulo: string
  /** Linha fina ou resumo — pode faltar. */
  descricao?: string | null
  /** Endereço completo da matéria publicada. */
  url: string
  publicadaEm: Date
  /** Capa publicada (a mesma do og:image). Falta nas matérias sem imagem. */
  capa?: string | null
  /** Medidas da capa, quando conhecidas — vão no og:image do índice e no width/height do cartão. */
  capaLargura?: number
  capaAltura?: number
  /**
   * As versões WebP da capa que a publicação gerou (imagens-da-materia.ts),
   * da menor para a maior. Sem elas o cartão usa o JPEG canônico.
   */
  capaVersoes?: { largura: number; url: string }[]
}

/** As larguras das versões WebP (as mesmas de LARGURAS_WEBP em imagens-da-materia.ts, que é só do servidor). */
const LARGURAS_DAS_VERSOES = [480, 960, 1600] as const

/**
 * Os endereços das versões WebP de uma capa, deduzidos do JPEG canônico:
 * a publicação grava "<nome>.jpg" e, ao lado, "<nome>-<largura>.webp" para
 * cada largura, nunca maior que a foto (uma foto de 700 px vira -480 e
 * -700). Só vale para o JPEG que a Redação gerou e com a largura conhecida —
 * fora disso, vazio, e quem chama confere se a menor existe antes de usar.
 */
export function versoesDaCapa(capa: string, largura?: number): { largura: number; url: string }[] {
  if (!largura || !/\.jpg$/i.test(capa)) return []
  const raiz = capa.slice(0, -'.jpg'.length)
  return [...new Set(LARGURAS_DAS_VERSOES.map((w) => Math.min(w, largura)))].map((w) => ({ largura: w, url: `${raiz}-${w}.webp` }))
}

/**
 * Quanto a capa ocupa na tela (a folha CSS_INDICE): a manchete tem uma coluna
 * de .95fr ao lado do texto e vira coluna única até 860 px; os cartões da grade
 * são 3, 2 ou 1 por linha. Folga de 24 px de cada lado (.jornal).
 */
const TAMANHO_DA_MANCHETE = '(max-width: 860px) calc(100vw - 48px), (max-width: 1180px) calc((100vw - 80px) * .475), 524px'
const TAMANHO_DO_CARTAO = '(max-width: 680px) calc(100vw - 48px), (max-width: 1023px) calc((100vw - 80px) / 2), (max-width: 1180px) calc((100vw - 112px) / 3), 356px'

const CSS_INDICE = `
body{background:var(--news-paper)}
.jornal{max-width:var(--max-folio);margin:0 auto;padding:0 24px 72px}
.jornal-topo{border-top:3px solid var(--brand);padding:24px 0 16px;border-bottom:1px solid var(--news-line);margin-bottom:8px}
.jornal-topo h1{font-family:var(--serif);font-weight:800;font-size:clamp(32px,4.5vw,42px);letter-spacing:-.02em;line-height:1.1;margin:0;color:var(--news-ink)}
.jornal-topo p{color:var(--news-muted);margin:8px 0 0;font-size:15px;font-family:var(--serif)}
.manchete{display:block;text-decoration:none;color:inherit;padding:30px 0;border-bottom:1px solid var(--news-line)}
.manchete.tem-capa{display:grid;grid-template-columns:1.05fr .95fr;gap:32px;align-items:start}
.manchete .texto{min-width:0}
.manchete figure{margin:0;order:2}
.manchete img{display:block;width:100%;aspect-ratio:3/2;object-fit:cover;background:var(--news-line)}
.manchete .kicker{color:var(--brand);font-weight:700;font-size:11px;letter-spacing:.14em;text-transform:uppercase}
.manchete h2{font-family:var(--serif);font-weight:800;font-size:clamp(26px,3.6vw,38px);line-height:1.15;letter-spacing:-.02em;margin:10px 0 10px;color:var(--news-ink)}
.manchete p{font-family:var(--serif);font-size:19px;line-height:1.45;color:var(--news-muted);margin:0 0 10px}
.manchete time{color:var(--news-muted);font-size:13px}
.manchete:hover h2{color:var(--brand)}
.grade{list-style:none;margin:0;padding:28px 0 0;display:grid;grid-template-columns:repeat(3,1fr);gap:0 32px}
.grade li{border-bottom:1px solid var(--news-line)}
.grade a{display:block;text-decoration:none;color:inherit;padding:20px 0}
.grade figure{margin:0 0 12px}
.grade img{display:block;width:100%;aspect-ratio:16/9;object-fit:cover;background:var(--news-line)}
.grade a:hover img,.manchete:hover img{opacity:.92}
.grade .kicker{color:var(--brand);font-weight:700;font-size:11px;letter-spacing:.12em;text-transform:uppercase;display:block;margin-bottom:6px}
.grade h3{font-family:var(--serif);font-weight:700;font-size:20px;line-height:1.25;letter-spacing:-.01em;margin:0 0 6px;color:var(--news-ink)}
.grade p{font-size:14.5px;line-height:1.5;color:var(--news-muted);margin:0 0 8px}
.grade time{color:var(--news-muted);font-size:12px}
.grade a:hover h3{color:var(--brand)}
@media(max-width:1023px){.grade{grid-template-columns:repeat(2,1fr)}}
/* Numa coluna só, a capa da manchete vem ANTES do título — é o que faz a
   página abrir com imagem, como a primeira página de um jornal. order:0 não
   subiria nada: .texto também é 0 e vem antes no HTML. */
@media(max-width:860px){.manchete.tem-capa{grid-template-columns:1fr;gap:18px}.manchete figure{order:-1}}
@media(max-width:680px){.grade{grid-template-columns:1fr}}

.jornal-vazio{padding:48px 0;color:var(--news-muted);font-size:16px}
.tempo{margin-top:56px}
.tempo-topo{border-bottom:1px solid var(--news-line);padding-bottom:10px;margin-bottom:4px}
.tempo-topo h2{font-family:var(--serif);font-size:clamp(22px,3vw,28px);letter-spacing:-.01em;margin:0;color:var(--news-ink)}
.tempo-topo p{color:var(--muted);margin:4px 0 0;font-size:14px}
.tempo ol{list-style:none;margin:0;padding:0}
.tempo li{display:flex;gap:14px;padding:16px 0;border-bottom:1px solid var(--line)}
.tempo time{flex:0 0 92px;color:var(--muted);font-size:13px;padding-top:3px}
/* A marca oficial do canal + o nome: sem pílula, o logo é a identidade. */
.tempo .canal{display:inline-flex;align-items:center;gap:7px;flex:0 0 auto;align-self:flex-start;padding-top:2px;font-size:12.5px;font-weight:700;letter-spacing:.2px;color:var(--ink);min-width:108px}
.tempo .canal svg{flex:none}
.tempo .fala{min-width:0;flex:1}
.tempo .fala p{margin:0;font-size:15.5px;line-height:1.6;color:var(--text)}
.tempo .fala a{color:var(--blue);font-weight:600;font-size:13.5px;text-decoration:none}
.tempo .fala a:hover{color:var(--red)}
@media(max-width:640px){.tempo li{flex-wrap:wrap}.tempo time{flex-basis:100%}}
`

const dataLegivel = (d: Date) =>
  new Intl.DateTimeFormat('pt-BR', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'America/Sao_Paulo' }).format(d)

/**
 * Matérias que vendem curso da escola (achado C7 da auditoria do Ad Grants,
 * 19/10/2026), pelo slug — que não muda quando o título é revisto. Elas
 * continuam no índice, na grade, mas não abrem /noticias/ como manchete: o
 * site da ONG não pode receber o visitante com um anúncio de curso. É a mesma
 * lista de FORA_DA_HOME em scripts/gerar_noticias_home.py (repositório do
 * site), que tira essas matérias da home; mantenha as duas iguais.
 */
export const MATERIAS_DE_CURSO = new Set([
  'homologacao-de-bombeiro-civil-no-cbmerj-como-funciona',
  'curso-de-socorrista-o-que-e-e-o-que-um-curso-livre-ensina',
  'conhecimento-tambem-salva-vidas-cruz-vermelha-brasileira-rio-de-janeiro-leva',
  'curso-de-primeiros-socorros-lei-lucas-o-que-a-lei-exige-das-escolas',
  'curso-de-suporte-basico-de-vida-o-que-e-e-quem-deveria-fazer',
  'curso-de-puncao-venosa-para-quem-e-e-o-que-aprofunda',
  'curso-de-primeiros-socorros-basico-para-o-dia-a-dia-em-casa',
  'curso-de-micropigmentacao-labial-o-que-e-e-como-se-especializar',
  'curso-de-cuidador-de-idosos-o-que-faz-e-como-se-capacitar',
  'curso-de-bombeiro-civil-o-que-faz-e-como-se-formar',
  'curso-de-primeiros-socorros-domine-com-poucas-aulas',
])

const ehDeCurso = (n: NoticiaDoIndice) => MATERIAS_DE_CURSO.has(n.url.replace(/\/+$/, '').split('/').pop() ?? '')

export function paginaDeNoticias(
  noticias: NoticiaDoIndice[],
  agora: Date = new Date(),
  /** A vida nos outros canais — post de rede, edição de newsletter. */
  linhaDoTempo: ItemDaLinha[] = [],
  /** As tags do chat do site (prepararChatDoSite). */
  chat?: string,
): string {
  const ordenadas = [...noticias].sort((a, b) => b.publicadaEm.getTime() - a.publicadaEm.getTime())
  // A manchete é a mais recente que não vende curso; sem nenhuma, a mais recente mesmo.
  const iManchete = Math.max(0, ordenadas.findIndex((n) => !ehDeCurso(n)))
  const manchete = ordenadas[iManchete]
  const fila = ordenadas.filter((_, i) => i !== iManchete)

  // Destaque full-width + grade 3×N, como pede o briefing do jornal. Cards
  // sem sombra, título serifado, data pequena — filete no lugar de caixa.
  // A capa é decorativa AQUI: o título da matéria é o texto do mesmo link, e
  // repeti-lo no alt faria o leitor de tela ouvir a manchete duas vezes.
  // A capa sai num <picture> com as versões WebP (480/960 px no celular, em
  // vez do JPEG de 1600 px), com width/height para a página não pular
  // enquanto as fotos chegam. Só a da manchete vem logo; as da grade, que
  // ficam abaixo da primeira dobra no celular, esperam a rolagem.
  const capaDe = (n: NoticiaDoIndice, manchete: boolean) => {
    const url = n.capa?.trim()
    if (!url) return ''
    const carga = manchete
      ? 'fetchpriority="high" decoding="async"'   // a capa da manchete é o LCP
      : 'loading="lazy" decoding="async"'
    const medidas = n.capaLargura && n.capaAltura ? ` width="${n.capaLargura}" height="${n.capaAltura}"` : ''
    const img = `<img src="${escapar(url)}"${medidas} alt="" ${carga}>`
    const versoes = n.capaVersoes ?? []
    if (!versoes.length) return `<figure>${img}</figure>`
    const srcset = versoes.map((v) => `${escapar(v.url)} ${v.largura}w`).join(', ')
    return `<figure><picture><source type="image/webp" srcset="${srcset}" sizes="${manchete ? TAMANHO_DA_MANCHETE : TAMANHO_DO_CARTAO}">${img}</picture></figure>`
  }

  const miolo = !manchete
    ? '<p class="jornal-vazio">As primeiras notícias estão a caminho.</p>'
    : `<a class="manchete${manchete.capa?.trim() ? ' tem-capa' : ''}" href="${escapar(manchete.url)}">
        <div class="texto">
          <span class="kicker">Última notícia</span>
          <h2>${escapar(manchete.titulo)}</h2>
          ${manchete.descricao?.trim() ? `<p>${escapar(manchete.descricao.trim())}</p>` : ''}
          <time datetime="${manchete.publicadaEm.toISOString()}">${dataLegivel(manchete.publicadaEm)}</time>
        </div>
        ${capaDe(manchete, true)}
      </a>
      ${fila.length ? `<ul class="grade">
        ${fila.map((n) => `<li><a href="${escapar(n.url)}">
          ${capaDe(n, false)}
          <span class="kicker">Notícias</span>
          <h3>${escapar(n.titulo)}</h3>
          ${n.descricao?.trim() ? `<p>${escapar(n.descricao.trim())}</p>` : ''}
          <time datetime="${n.publicadaEm.toISOString()}">${dataLegivel(n.publicadaEm)}</time>
        </a></li>`).join('\n        ')}
      </ul>` : ''}`

  const dataCurta = (d: Date) =>
    new Intl.DateTimeFormat('pt-BR', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'America/Sao_Paulo' })
      .format(d).replace(/\. de /g, ' ').replace('.', '')

  // A linha do tempo: o que saiu em CADA canal, do mais novo ao mais velho —
  // no FIM da página, depois das matérias (briefing do jornal). Posts de
  // teste que sobraram no histórico não entram: numa primeira página de
  // jornal, "fdsfdsfds" custa credibilidade.
  const lixoDeTeste = /^(teste\d*|test\d*|fdsf|asdf|qwer|xxx+)/i
  const linhaLimpa = linhaDoTempo.filter((i) => {
    const resumo = resumoDoPost(i.texto).trim()
    return resumo === '' || !lixoDeTeste.test(resumo)
  })
  // Só os canais que aparecem de fato na linha (a filial não está em toda rede).
  const canais = [...new Set(linhaLimpa.map((i) => NOME_DO_CANAL[i.canal] ?? i.canal))]
  const listaDeCanais = canais.length > 1 ? `${canais.slice(0, -1).join(', ')} e ${canais[canais.length - 1]}` : canais[0] ?? ''
  const tempo = linhaLimpa.length
    ? `<section class="tempo">
        <div class="tempo-topo">
          <h2>Linha do tempo</h2>
          <p>O que publicamos ${canais.length > 1 ? 'em cada canal' : 'nas redes'} — ${escapar(listaDeCanais)}.</p>
        </div>
        <ol>
          ${linhaLimpa.map((i) => {
            const nome = NOME_DO_CANAL[i.canal] ?? i.canal
            const resumo = resumoDoPost(i.texto)
            const logo = svgDaMarca(i.canal, 18)
            return `<li>
            <time datetime="${i.quando.toISOString()}">${escapar(dataCurta(i.quando))}</time>
            <span class="canal">${logo}${escapar(nome)}</span>
            <div class="fala">
              ${resumo ? `<p>${escapar(resumo)}</p>` : ''}
              ${i.url ? `<a href="${escapar(i.url)}" target="_blank" rel="noopener">Ver no ${escapar(nome)} →</a>` : ''}
            </div>
          </li>`
          }).join('\n          ')}
        </ol>
      </section>`
    : ''

  const corpo = `<main class="jornal">
      <div class="jornal-topo">
        <h1>Notícias</h1>
        <p>O trabalho da ${NOME_DO_SITE}, contado por quem o faz.</p>
      </div>
      ${miolo}
      ${tempo}
    </main>`

  const origem = 'https://cruzvermelhariodejaneiro.org'
  const url = `${origem}/noticias/`
  const alternativasDoIndice = alternativasDaPagina('/noticias/', origem)
  const descricao = `Notícias da ${NOME_DO_SITE}: voluntariado, cursos de primeiros socorros, campanhas humanitárias e ações da filial no estado do Rio.`
  // O cartão de compartilhamento do índice é a capa da matéria mais nova;
  // sem capa, a imagem da home.
  const capaDaManchete = manchete?.capa?.trim()
  const imagem = capaDaManchete
    ? { url: capaDaManchete, largura: manchete.capaLargura, altura: manchete.capaAltura, alt: `Foto da matéria: ${manchete.titulo}` }
    : IMAGEM_PADRAO_DO_SITE

  return montarPaginaDoSite({
    titulo: 'Notícias',
    descricao,
    caminho: '/noticias/',
    corpo,
    cssExtra: CSS_INDICE,
    agora,
    ativo: 'noticias',
    imagem,
    chat,
    ...(alternativasDoIndice ? { alternativas: alternativasDoIndice } : {}),
    // A página é uma coleção; a lista vai como ItemList de endereços e títulos
    // (antes eram NewsArticle aninhados, incompletos, que o Google lia como
    // matérias sem autor, sem imagem e sem data de alteração).
    jsonLd: {
      '@context': 'https://schema.org',
      '@graph': [
        {
          '@type': 'CollectionPage',
          '@id': `${url}#pagina`,
          url,
          name: `Notícias da ${NOME_DO_SITE}`,
          description: descricao,
          inLanguage: 'pt-BR',
          isPartOf: noDoSite(),
          publisher: noDaOrganizacao(),
          breadcrumb: { '@id': `${url}#trilha` },
          mainEntity: {
            '@type': 'ItemList',
            '@id': `${url}#lista`,
            numberOfItems: ordenadas.length,
            itemListElement: ordenadas.map((n, i) => ({ '@type': 'ListItem', position: i + 1, url: n.url, name: n.titulo })),
          },
        },
        {
          '@type': 'BreadcrumbList',
          '@id': `${url}#trilha`,
          itemListElement: [
            { '@type': 'ListItem', position: 1, name: 'Início', item: `${origem}/` },
            { '@type': 'ListItem', position: 2, name: 'Notícias', item: url },
          ],
        },
      ],
    },
  })
}
