import { IMAGEM_PADRAO_DO_SITE, NOME_DO_SITE, montarPaginaDoSite, escapar, noDaOrganizacao, noDoSite } from '@/lib/site/esqueleto'
import { alternativasDaPagina } from '@/lib/site/traducoes'
import { NOME_DO_CANAL, resumoDoPost, type ItemDaLinha } from '@/lib/site/linha-do-tempo'
import { svgDaMarca } from '@/lib/marcas'
import { ORDEM_DOS_CADERNOS, editoriaDaMateria, type Editoria } from '@/lib/site/editorias'

/**
 * A central de notícias — /noticias/ com cara de primeira página de jornal.
 *
 * Até aqui o endereço servia o que o acaso deixou lá: a última matéria de
 * teste publicada virava o "índice" do noticiário, visível ao público e ao
 * Google. Agora o índice é gerado da lista real de matérias publicadas e
 * REGERADO a cada publicação — empilha sozinho, como o usuário pediu.
 *
 * A página se monta como uma edição (montarEdicao), do alto para baixo:
 *   1. o cabeçalho do jornal — data da última matéria, o nome, a barra de cadernos;
 *   2. a primeira página — manchete, três chamadas com foto e a coluna "Últimas";
 *   3. os cadernos por editoria (lib/site/editorias.ts), cada um com um destaque
 *      e uma lista;
 *   4. o arquivo, em linhas compactas, aberto de dez em dez ("Ver mais notícias");
 *   5. a linha do tempo dos outros canais.
 * O desenho veio de um levantamento de primeiras páginas (Folha, The Guardian,
 * G1, BBC Brasil, 10/11/2026): chapéu com o assunto em vez de "Notícias" em
 * tudo, hierarquia de tamanhos, filetes entre colunas e, no celular, chamadas
 * em linha com miniatura — a grade única de 90 cartões dava 41 mil px de
 * rolagem em 390 px de largura.
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
 * Quanto cada capa ocupa na tela (a folha CSS_INDICE), para o navegador
 * escolher a versão WebP certa. Folga de 20 px de cada lado no celular.
 */
const TAMANHOS = {
  manchete: '(max-width: 860px) calc(100vw - 40px), 520px',
  destaque: '(max-width: 860px) calc(100vw - 40px), 540px',
  secundaria: '(max-width: 860px) 112px, 260px',
  miniatura: '(max-width: 860px) 112px, 168px',
} as const

/** Quantas matérias cada parte da primeira página leva. */
const SECUNDARIAS = 3
const ULTIMAS = 5
/** Um caderno só abre com pelo menos tantas matérias; leva no máximo CADERNO_MAX (a 1ª em destaque). */
const CADERNO_MIN = 3
const CADERNO_MAX = 5
/** O arquivo mostra tantas de cada vez; o botão "Ver mais notícias" abre as seguintes. */
const LOTE_DO_ARQUIVO = 10

const CSS_INDICE = `
body{background:var(--news-paper)}
.jornal{max-width:var(--max-folio);margin:0 auto;padding:0 20px 72px}
.jornal a{text-decoration:none;color:inherit}
.jornal a:focus-visible,.jornal button:focus-visible{outline:2px solid var(--brand);outline-offset:3px}
.jornal figure{margin:0}
.jornal img{display:block;width:100%;height:auto;object-fit:cover;background:var(--box);border-radius:0}
.jornal time{color:var(--news-muted);font-size:14px}
.jornal .kicker{display:block;color:var(--brand);font-weight:700;font-size:13px;letter-spacing:.1em;text-transform:uppercase;margin:0 0 6px}
.jornal a:hover h2,.jornal a:hover h3{color:var(--brand)}
.jornal a:hover img{opacity:.92}

/* O cabeçalho do jornal: linha de data, o nome centrado e o filete duplo. */
.jornal-topo{text-align:center;padding-top:14px}
.jornal-data{display:flex;justify-content:space-between;gap:6px 16px;flex-wrap:wrap;font-size:13px;font-weight:600;letter-spacing:.06em;text-transform:uppercase;color:var(--ink-2);border-top:3px solid var(--brand);border-bottom:1px solid var(--news-line);padding:10px 0}
.jornal-topo h1{font-family:var(--serif);font-weight:800;font-size:clamp(44px,8vw,76px);letter-spacing:-.03em;line-height:1;margin:22px 0 8px;color:var(--news-ink)}
.jornal-topo .lema{font-family:var(--serif);font-style:italic;color:var(--news-muted);margin:0 0 20px;font-size:17px;line-height:1.4}
.cadernos-nav{border-top:1px solid var(--news-ink);border-bottom:3px double var(--news-ink)}
.cadernos-nav ul{list-style:none;margin:0;padding:0 4px;display:flex;flex-wrap:wrap;justify-content:center;gap:0 26px}
.cadernos-nav ul::-webkit-scrollbar{display:none}
.cadernos-nav a{display:flex;align-items:center;min-height:46px;white-space:nowrap;font-size:14px;font-weight:700;letter-spacing:.04em;text-transform:uppercase;color:var(--news-ink)}
.cadernos-nav a:hover{color:var(--brand)}

/* A primeira página: manchete e chamadas à esquerda, "Últimas" na coluna da direita. */
.capa{display:grid;grid-template-columns:minmax(0,1fr) 300px;gap:0 32px;padding-top:28px}
.capa-principal{min-width:0}
.manchete{display:block}
.manchete h2{font-family:var(--serif);font-weight:800;font-size:clamp(30px,4.4vw,50px);line-height:1.08;letter-spacing:-.025em;margin:0 0 18px;color:var(--news-ink);text-wrap:balance}
.manchete .miolo{display:grid;grid-template-columns:minmax(0,1.9fr) minmax(0,1fr);gap:24px;align-items:start}
.manchete.sem-capa .miolo{grid-template-columns:1fr}
.manchete img{aspect-ratio:3/2}
.manchete .linha-fina{font-family:var(--serif);font-size:19px;line-height:1.45;color:var(--ink-2);margin:0 0 12px}
.manchete .ler{display:block;margin-top:14px;font-weight:700;font-size:15px;color:var(--brand)}
.secundarias{list-style:none;margin:28px 0 0;padding:22px 0 0;border-top:1px solid var(--news-ink);display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:0 24px}
.secundarias li+li{border-left:1px solid var(--news-line);padding-left:24px}
.secundarias a{display:block}
.secundarias img{aspect-ratio:3/2;margin-bottom:12px}
.secundarias h3{font-family:var(--serif);font-weight:700;font-size:20px;line-height:1.22;letter-spacing:-.01em;margin:0 0 8px;color:var(--news-ink)}
.ultimas{border-left:1px solid var(--news-line);padding-left:32px;min-width:0}
.rotulo{font-family:var(--sans);font-size:14px;font-weight:800;letter-spacing:.1em;text-transform:uppercase;color:var(--news-ink);margin:0;padding-bottom:10px;border-bottom:1px solid var(--news-ink);display:flex;align-items:center;gap:10px}
.rotulo::before{content:'';width:10px;height:10px;background:var(--brand);flex:none}
.ultimas ol{list-style:none;margin:0;padding:0}
.ultimas li{border-bottom:1px solid var(--news-line)}
.ultimas a{display:block;padding:14px 0}
.ultimas h3{font-family:var(--serif);font-weight:700;font-size:18px;line-height:1.25;margin:0 0 6px;color:var(--news-ink)}

/* Os cadernos: um por editoria, a primeira matéria em destaque e as demais em lista. */
.caderno,.arquivo{margin-top:48px;scroll-margin-top:96px}
.caderno-topo{display:flex;align-items:baseline;justify-content:space-between;gap:12px;border-top:3px solid var(--news-ink);border-bottom:1px solid var(--news-line);padding:12px 0}
.caderno-topo h2{font-family:var(--serif);font-weight:800;font-size:clamp(24px,3vw,30px);letter-spacing:-.015em;line-height:1.15;margin:0;color:var(--news-ink)}
.caderno-topo h2::before{content:'';display:inline-block;width:12px;height:12px;background:var(--brand);margin-right:10px}
.caderno-topo span{font-size:14px;color:var(--news-muted);white-space:nowrap}
.caderno-corpo{display:grid;grid-template-columns:minmax(0,1.1fr) minmax(0,1fr);gap:0 32px;padding-top:22px}
.destaque{display:block}
.destaque img{aspect-ratio:16/9;margin-bottom:14px}
.destaque h3{font-family:var(--serif);font-weight:800;font-size:clamp(23px,2.6vw,29px);line-height:1.15;letter-spacing:-.015em;margin:0 0 10px;color:var(--news-ink)}
.destaque p{font-family:var(--serif);font-size:17px;line-height:1.5;color:var(--ink-2);margin:0 0 10px}
.lista{list-style:none;margin:0;padding:0}
.caderno-corpo .lista{border-left:1px solid var(--news-line);padding-left:32px}
.lista li{border-bottom:1px solid var(--news-line)}
.caderno-corpo .lista li:first-child a{padding-top:0}
.lista a{display:flex;gap:16px;align-items:flex-start;padding:16px 0}
.lista figure{flex:0 0 132px}
.lista img{aspect-ratio:4/3}
.lista .texto{min-width:0;flex:1}
.lista h3{font-family:var(--serif);font-weight:700;font-size:19px;line-height:1.25;letter-spacing:-.005em;margin:0 0 6px;color:var(--news-ink)}

/* O arquivo: todo o resto, em linhas compactas, aberto aos poucos. */
.arquivo .lista{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:0 48px}
.arquivo .lista figure{flex-basis:168px}
.arquivo .lista p{font-size:16px;line-height:1.45;color:var(--news-muted);margin:0 0 6px;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}
.arquivo li[hidden]{display:none}
.ver-mais{display:block;margin:28px auto 0;min-height:52px;padding:12px 32px;border:2px solid var(--news-ink);background:var(--news-paper);color:var(--news-ink);font:700 17px var(--sans);cursor:pointer}
.ver-mais:hover{background:var(--news-ink);color:#fff}

@media(max-width:1023px){
  .capa{grid-template-columns:minmax(0,1fr) 250px;gap:0 24px}
  .ultimas{padding-left:24px}
  .arquivo .lista{gap:0 32px}
  .arquivo .lista figure{flex-basis:120px}
  .arquivo .lista p{display:none}
}
/* Celular: uma coluna só. A foto da manchete vem logo abaixo do título, e
   tudo o mais vira linha com miniatura — a página fica curta e cada chamada
   é um alvo de toque largo. */
@media(max-width:860px){
  .jornal-data{justify-content:center}
  .jornal-data span:not(.quando){display:none}
  .cadernos-nav{margin:0 -20px}
  .cadernos-nav ul{flex-wrap:nowrap;justify-content:flex-start;padding:0 20px;gap:0 22px;overflow-x:auto;scrollbar-width:none;-webkit-overflow-scrolling:touch}
  .capa{display:block;padding-top:22px}
  .manchete h2{margin-bottom:14px}
  .manchete .miolo{grid-template-columns:1fr;gap:14px}
  .secundarias{display:block;margin-top:22px;padding-top:0}
  .secundarias li+li{border-left:0;padding-left:0}
  .secundarias li{border-bottom:1px solid var(--news-line)}
  .secundarias a{display:flex;gap:14px;align-items:flex-start;padding:16px 0}
  .secundarias figure{flex:0 0 112px;order:2}
  .secundarias img{aspect-ratio:1/1;margin:0}
  .secundarias .texto{flex:1;min-width:0}
  .secundarias h3{font-size:19px}
  .ultimas{border-left:0;padding-left:0;margin-top:36px}
  .ultimas h3{font-size:19px}
  .caderno,.arquivo{margin-top:40px}
  .caderno-corpo{display:block}
  .caderno-corpo .lista{border-left:0;padding-left:0;border-top:1px solid var(--news-line);margin-top:18px}
  .caderno-corpo .lista li:first-child a{padding-top:16px}
  .lista a{gap:14px}
  .lista figure,.arquivo .lista figure{flex:0 0 112px;order:2}
  .lista img{aspect-ratio:1/1}
  .arquivo .lista{display:block}
  .ver-mais{width:100%}
}
.jornal-vazio{padding:48px 0;color:var(--news-muted);font-size:16px}
.tempo{margin-top:56px}
.tempo-topo{border-bottom:1px solid var(--news-line);padding-bottom:10px;margin-bottom:4px}
.tempo-topo h2{font-family:var(--serif);font-size:clamp(22px,3vw,28px);letter-spacing:-.01em;margin:0;color:var(--news-ink)}
.tempo-topo p{color:var(--news-muted);margin:4px 0 0;font-size:15px}
.tempo ol{list-style:none;margin:0;padding:0}
.tempo li{display:flex;gap:14px;padding:16px 0;border-bottom:1px solid var(--line)}
.tempo time{flex:0 0 98px;color:var(--news-muted);font-size:14px;padding-top:3px}
/* A marca oficial do canal + o nome: sem pílula, o logo é a identidade. */
.tempo .canal{display:inline-flex;align-items:center;gap:7px;flex:0 0 auto;align-self:flex-start;padding-top:2px;font-size:14px;font-weight:700;letter-spacing:.2px;color:var(--ink);min-width:108px}
.tempo .canal svg{flex:none}
.tempo .fala{min-width:0;flex:1}
.tempo .fala p{margin:0;font-size:15.5px;line-height:1.6;color:var(--text)}
.tempo .fala a{color:var(--blue);font-weight:600;font-size:15px;text-decoration:none;display:inline-flex;align-items:center;min-height:44px}
.tempo .fala a:hover{color:var(--red)}
@media(max-width:640px){.tempo li{flex-wrap:wrap}.tempo time{flex-basis:100%}}
`

const dataLegivel = (d: Date) =>
  new Intl.DateTimeFormat('pt-BR', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'America/Sao_Paulo' }).format(d)

/**
 * Matérias que vendem curso da escola (achado C7 da auditoria do Ad Grants,
 * 19/10/2026), pelo slug — que não muda quando o título é revisto. Elas
 * continuam no índice, no caderno de cursos, mas não entram na primeira
 * página de /noticias/ (manchete, chamadas, Últimas): o site da ONG não pode
 * receber o visitante com um anúncio de curso. É a mesma
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

/** Uma edição do jornal: o que vai em cada parte da página. Cada matéria aparece uma vez só. */
export type Edicao = {
  manchete?: NoticiaDoIndice
  /** As chamadas com foto, abaixo da manchete. */
  secundarias: NoticiaDoIndice[]
  /** A coluna "Últimas", só de texto. */
  ultimas: NoticiaDoIndice[]
  /** Os cadernos por editoria: a 1ª matéria é o destaque. `total` conta todas as da editoria na edição. */
  cadernos: { editoria: Editoria; materias: NoticiaDoIndice[]; total: number }[]
  /** O resto, da mais nova para a mais velha. */
  arquivo: NoticiaDoIndice[]
}

/**
 * Distribui as matérias (já da mais nova para a mais velha) pela página.
 *
 * Matéria de curso não entra na primeira página (manchete, chamadas, Últimas):
 * fica no caderno dela, o último. Sem nenhuma outra, a mais recente abre mesmo assim.
 */
export function montarEdicao(ordenadas: NoticiaDoIndice[]): Edicao {
  const usadas = new Set<NoticiaDoIndice>()
  const pegar = (n: NoticiaDoIndice | undefined) => { if (n) usadas.add(n); return n }
  const temCapa = (n: NoticiaDoIndice) => Boolean(n.capa?.trim())
  const livres = () => ordenadas.filter((n) => !usadas.has(n))

  const manchete = pegar(ordenadas.find((n) => !ehDeCurso(n)) ?? ordenadas[0])
  const daCapa = () => livres().filter((n) => !ehDeCurso(n))
  // As chamadas pedem foto; sem fotos bastantes, o lugar fica para a coluna de texto.
  const secundarias = daCapa().filter(temCapa).slice(0, SECUNDARIAS)
  secundarias.forEach(pegar)
  const ultimas = daCapa().slice(0, ULTIMAS)
  ultimas.forEach(pegar)

  const cadernos: Edicao['cadernos'] = []
  for (const editoria of ORDEM_DOS_CADERNOS) {
    const daEditoria = (n: NoticiaDoIndice) => editoriaDaMateria(n.titulo, n.url).id === editoria.id
    const candidatas = livres().filter(daEditoria)
    if (candidatas.length < CADERNO_MIN) continue
    // O destaque é a mais nova com foto; as demais seguem em ordem.
    const destaque = candidatas.find(temCapa) ?? candidatas[0]
    const materias = [destaque, ...candidatas.filter((n) => n !== destaque)].slice(0, CADERNO_MAX)
    materias.forEach(pegar)
    cadernos.push({ editoria, materias, total: ordenadas.filter(daEditoria).length })
  }
  return { manchete, secundarias, ultimas, cadernos, arquivo: livres() }
}

export function paginaDeNoticias(
  noticias: NoticiaDoIndice[],
  agora: Date = new Date(),
  /** A vida nos outros canais — post de rede, edição de newsletter. */
  linhaDoTempo: ItemDaLinha[] = [],
  /** As tags do chat do site (prepararChatDoSite). */
  chat?: string,
): string {
  const ordenadas = [...noticias].sort((a, b) => b.publicadaEm.getTime() - a.publicadaEm.getTime())
  const { manchete, secundarias, ultimas, cadernos, arquivo } = montarEdicao(ordenadas)

  // A capa é decorativa AQUI: o título da matéria é o texto do mesmo link, e
  // repeti-lo no alt faria o leitor de tela ouvir a manchete duas vezes.
  // A capa sai num <picture> com as versões WebP (480/960 px no celular, em
  // vez do JPEG de 1600 px), com width/height para a página não pular
  // enquanto as fotos chegam. Só a da manchete vem logo; as demais, que
  // ficam abaixo da primeira dobra no celular, esperam a rolagem.
  const capaDe = (n: NoticiaDoIndice, lugar: keyof typeof TAMANHOS) => {
    const url = n.capa?.trim()
    if (!url) return ''
    const carga = lugar === 'manchete'
      ? 'fetchpriority="high" decoding="async"'   // a capa da manchete é o LCP
      : 'loading="lazy" decoding="async"'
    const medidas = n.capaLargura && n.capaAltura ? ` width="${n.capaLargura}" height="${n.capaAltura}"` : ''
    const img = `<img src="${escapar(url)}"${medidas} alt="" ${carga}>`
    const versoes = n.capaVersoes ?? []
    if (!versoes.length) return `<figure>${img}</figure>`
    const srcset = versoes.map((v) => `${escapar(v.url)} ${v.largura}w`).join(', ')
    return `<figure><picture><source type="image/webp" srcset="${srcset}" sizes="${TAMANHOS[lugar]}">${img}</picture></figure>`
  }
  const chapeu = (n: NoticiaDoIndice) => `<span class="kicker">${escapar(editoriaDaMateria(n.titulo, n.url).nome)}</span>`
  const quando = (n: NoticiaDoIndice) => `<time datetime="${n.publicadaEm.toISOString()}">${dataLegivel(n.publicadaEm)}</time>`
  const linhaFina = (n: NoticiaDoIndice, classe = '') =>
    n.descricao?.trim() ? `<p${classe ? ` class="${classe}"` : ''}>${escapar(n.descricao.trim())}</p>` : ''

  /** Uma chamada em linha: texto de um lado, miniatura do outro. `comChapeu` falso dentro do caderno, que já diz a editoria. */
  const linha = (n: NoticiaDoIndice, o: { comChapeu: boolean; comResumo?: boolean; oculta?: boolean }) =>
    `<li${o.oculta ? ' data-mais' : ''}><a href="${escapar(n.url)}">
          ${capaDe(n, 'miniatura')}
          <div class="texto">
            ${o.comChapeu ? chapeu(n) : ''}
            <h3>${escapar(n.titulo)}</h3>
            ${o.comResumo ? linhaFina(n) : ''}
            ${quando(n)}
          </div>
        </a></li>`

  const primeiraPagina = !manchete ? '' : `<section class="capa" aria-label="Destaques">
        <div class="capa-principal">
          <a class="manchete${manchete.capa?.trim() ? '' : ' sem-capa'}" href="${escapar(manchete.url)}">
            ${chapeu(manchete)}
            <h2>${escapar(manchete.titulo)}</h2>
            <div class="miolo">
              ${capaDe(manchete, 'manchete')}
              <div class="texto">
                ${linhaFina(manchete, 'linha-fina')}
                ${quando(manchete)}
                <span class="ler">Ler a matéria →</span>
              </div>
            </div>
          </a>
          ${secundarias.length ? `<ul class="secundarias">
            ${secundarias.map((n) => `<li><a href="${escapar(n.url)}">
              ${capaDe(n, 'secundaria')}
              <div class="texto">
                ${chapeu(n)}
                <h3>${escapar(n.titulo)}</h3>
                ${quando(n)}
              </div>
            </a></li>`).join('\n            ')}
          </ul>` : ''}
        </div>
        ${ultimas.length ? `<aside class="ultimas" aria-labelledby="ultimas-titulo">
          <h2 class="rotulo" id="ultimas-titulo">Últimas</h2>
          <ol>
            ${ultimas.map((n) => `<li><a href="${escapar(n.url)}">
              ${chapeu(n)}
              <h3>${escapar(n.titulo)}</h3>
              ${quando(n)}
            </a></li>`).join('\n            ')}
          </ol>
        </aside>` : ''}
      </section>`

  const htmlDosCadernos = cadernos.map(({ editoria, materias, total }) => {
    const [destaque, ...resto] = materias
    return `<section class="caderno" id="${editoria.id}" aria-labelledby="${editoria.id}-titulo">
        <div class="caderno-topo">
          <h2 id="${editoria.id}-titulo">${escapar(editoria.nome)}</h2>
          <span>${total} matérias</span>
        </div>
        <div class="caderno-corpo">
          <a class="destaque" href="${escapar(destaque.url)}">
            ${capaDe(destaque, 'destaque')}
            <h3>${escapar(destaque.titulo)}</h3>
            ${linhaFina(destaque)}
            ${quando(destaque)}
          </a>
          <ul class="lista">
            ${resto.map((n) => linha(n, { comChapeu: false })).join('\n            ')}
          </ul>
        </div>
      </section>`
  }).join('\n      ')

  // O arquivo já vem inteiro no HTML (o Google e quem navega sem script veem
  // tudo); o script só recolhe o que passa do primeiro lote e põe o botão.
  const htmlDoArquivo = arquivo.length ? `<section class="arquivo" id="mais" aria-labelledby="mais-titulo">
        <div class="caderno-topo">
          <h2 id="mais-titulo">${cadernos.length ? 'Mais notícias' : 'Todas as notícias'}</h2>
          <span>${arquivo.length} matérias</span>
        </div>
        <ul class="lista">
          ${arquivo.map((n, i) => linha(n, { comChapeu: true, comResumo: true, oculta: i >= LOTE_DO_ARQUIVO })).join('\n          ')}
        </ul>
        ${arquivo.length > LOTE_DO_ARQUIVO ? `<script>
(function(){
  var lista=document.querySelector('.arquivo .lista');if(!lista)return;
  var resto=[].slice.call(lista.querySelectorAll('li[data-mais]'));if(!resto.length)return;
  resto.forEach(function(li){li.hidden=true});
  var botao=document.createElement('button');botao.type='button';botao.className='ver-mais';
  function rotulo(){botao.textContent='Ver mais notícias ('+resto.length+')'}
  rotulo();
  botao.addEventListener('click',function(){
    var lote=resto.splice(0,${LOTE_DO_ARQUIVO});
    lote.forEach(function(li){li.hidden=false});
    var a=lote[0]&&lote[0].querySelector('a');if(a)a.focus({preventScroll:true});
    if(resto.length)rotulo();else botao.remove();
  });
  lista.after(botao);
})();
</script>` : ''}
      </section>` : ''

  const miolo = !manchete
    ? '<p class="jornal-vazio">As primeiras notícias estão a caminho.</p>'
    : `${primeiraPagina}
      ${htmlDosCadernos}
      ${htmlDoArquivo}`

  // A barra de cadernos: só os que abriram nesta edição, mais o arquivo.
  const atalhos = [
    ...cadernos.map((c) => ({ id: c.editoria.id, nome: c.editoria.nome })),
    ...(arquivo.length && cadernos.length ? [{ id: 'mais', nome: 'Mais notícias' }] : []),
  ]
  const barra = atalhos.length > 1
    ? `<nav class="cadernos-nav" aria-label="Assuntos"><ul>
          ${atalhos.map((a) => `<li><a href="#${a.id}">${escapar(a.nome)}</a></li>`).join('\n          ')}
        </ul></nav>`
    : ''

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

  // A data do cabeçalho é a da matéria mais nova, não a de hoje: a página é
  // estática e só muda quando algo é publicado — "hoje" ficaria velho sozinho.
  const corpo = `<main class="jornal">
      <header class="jornal-topo">
        ${manchete ? `<p class="jornal-data"><span>Rio de Janeiro</span><span class="quando">Atualizado em ${dataLegivel(manchete.publicadaEm)}</span><span>${ordenadas.length} matérias</span></p>` : ''}
        <h1>Notícias</h1>
        <p class="lema">O trabalho da ${NOME_DO_SITE}, contado por quem o faz.</p>
        ${barra}
      </header>
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
  const imagem = manchete && capaDaManchete
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
