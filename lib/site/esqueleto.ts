import { blocoDoAnalytics } from '@/lib/site/analytics'
import { svgDaMarca } from '@/lib/marcas'
import { DADOS_DA_FILIAL } from '@/lib/site/juridico'

/**
 * O esqueleto das páginas do site institucional: tokens, cabeçalho, rodapé,
 * menu e o <head> com rastreamento.
 *
 * Antes isto vivia dentro do gerador de matérias, e cada página nova ia
 * exigir uma cópia — e cópia de chrome é como um site ganha dois rodapés
 * diferentes em seis meses. A matéria, a central de notícias, o acervo e o
 * portal agora vestem o MESMO esqueleto, deste arquivo. (A privacidade, os
 * termos e as demais políticas são do repositório do site, em
 * scripts/gerar_politicas.py.)
 *
 * Cabeçalho e rodapé seguem os da home do site (site/index.html, no
 * repositório do site): mesmos links, mesma ordem, mesmos ícones em SVG — sem
 * a folha do Font Awesome, que custava uma requisição a um CDN por página.
 * Abertura da trilha pública (05/10/2026): "História" e "Transparência" no
 * menu; no rodapé, o portal, os canais oficiais e "Verificar um documento".
 * A home recebe os mesmos links no repositório do site.
 * Menu do pedido do Google Ad Grants (19/10/2026), o mesmo da home: seis
 * itens — "Quem somos" e "Como ajudar" em grupo, Notícias, Transparência,
 * Escola (link único para a matrícula) e Contato — e o botão vermelho "Doe"
 * no lugar de "Plataforma", com a doação online religada. No rodapé, o CNPJ e
 * o endereço completo em toda página; saíram a Wikipédia (verbete escrito
 * pela própria filial, não é prova independente) e o Acervo, que não tem
 * item publicado.
 *
 * Módulo puro, sem nada de servidor: a prévia do hub (no navegador) monta a
 * matéria com ele.
 */

const ESCAPES: Record<string, string> = {
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
}

/** Todo texto que vem do banco passa por aqui antes de virar HTML. */
export function escapar(texto: string): string {
  return texto.replace(/[&<>"']/g, (c) => ESCAPES[c])
}

const ORIGEM_PADRAO = 'https://cruzvermelhariodejaneiro.org'

export function origemDoSite(baseUrl: string): string {
  try {
    return new URL(baseUrl).origin
  } catch {
    return ORIGEM_PADRAO
  }
}

/** O nome da filial em texto visível, títulos, descrições, alt e dados estruturados. */
export const NOME_DO_SITE = 'Cruz Vermelha Brasileira Rio de Janeiro'
/** O nome formal, o mesmo do nó da organização no JSON-LD da home. */
export const NOME_FORMAL_DA_FILIAL = 'Cruz Vermelha Brasileira - Filial do Estado do Rio de Janeiro'

/** A imagem de compartilhamento da home: vale para toda página que não tem a sua. */
export const IMAGEM_PADRAO_DO_SITE = {
  url: `${ORIGEM_PADRAO}/assets/otim/og-home.jpg`,
  largura: 1200,
  altura: 630,
  alt: NOME_DO_SITE,
} as const

/**
 * O nó da organização, com o MESMO @id da home. O nome e o logo vão junto,
 * em toda página que cita o nó: o validador do site (e o Google) não seguem o
 * @id até a home — referência sem definição na própria página vira nó vazio.
 */
export function noDaOrganizacao(): Record<string, unknown> {
  return {
    '@type': 'NGO',
    '@id': `${ORIGEM_PADRAO}/#organizacao`,
    name: NOME_FORMAL_DA_FILIAL,
    url: `${ORIGEM_PADRAO}/`,
    logo: { '@type': 'ImageObject', url: `${ORIGEM_PADRAO}/assets/logo-cvb-rj.png` },
  }
}

/** O nó do site (o mesmo @id da home), definido por inteiro pelo mesmo motivo. */
export function noDoSite(): Record<string, unknown> {
  return {
    '@type': 'WebSite',
    '@id': `${ORIGEM_PADRAO}/#site`,
    url: `${ORIGEM_PADRAO}/`,
    name: NOME_DO_SITE,
    inLanguage: 'pt-BR',
  }
}

// ---------------------------------------------------------------- ícones

/** Os caminhos do sprite da home (site/index.html, <svg id="sprite-icones">). */
const CAMINHOS = {
  bars: ['0 0 448 512', 'M0 96C0 78.3 14.3 64 32 64H416c17.7 0 32 14.3 32 32s-14.3 32-32 32H32C14.3 128 0 113.7 0 96zM0 256c0-17.7 14.3-32 32-32H416c17.7 0 32 14.3 32 32s-14.3 32-32 32H32c-17.7 0-32-14.3-32-32zM448 416c0 17.7-14.3 32-32 32H32c-17.7 0-32-14.3-32-32s14.3-32 32-32H416c17.7 0 32 14.3 32 32z'],
  xmark: ['0 0 384 512', 'M342.6 150.6c12.5-12.5 12.5-32.8 0-45.3s-32.8-12.5-45.3 0L192 210.7 86.6 105.4c-12.5-12.5-32.8-12.5-45.3 0s-12.5 32.8 0 45.3L146.7 256 41.4 361.4c-12.5 12.5-12.5 32.8 0 45.3s32.8 12.5 45.3 0L192 301.3 297.4 406.6c12.5 12.5 32.8 12.5 45.3 0s12.5-32.8 0-45.3L237.3 256 342.6 150.6z'],
  'location-dot': ['0 0 384 512', 'M215.7 499.2C267 435 384 279.4 384 192C384 86 298 0 192 0S0 86 0 192c0 87.4 117 243 168.3 307.2c12.3 15.3 35.1 15.3 47.4 0zM192 128a64 64 0 1 1 0 128 64 64 0 1 1 0-128z'],
  phone: ['0 0 512 512', 'M164.9 24.6c-7.7-18.6-28-28.5-47.4-23.2l-88 24C12.1 30.2 0 46 0 64C0 311.4 200.6 512 448 512c18 0 33.8-12.1 38.6-29.5l24-88c5.3-19.4-4.6-39.7-23.2-47.4l-96-40c-16.3-6.8-35.2-2.1-46.3 11.6L304.7 368C234.3 334.7 177.3 277.7 144 207.3L193.3 167c13.7-11.2 18.4-30 11.6-46.3l-40-96z'],
  envelope: ['0 0 512 512', 'M64 112c-8.8 0-16 7.2-16 16v22.1L220.5 291.7c20.7 17 50.4 17 71.1 0L464 150.1V128c0-8.8-7.2-16-16-16H64zM48 212.2V384c0 8.8 7.2 16 16 16H448c8.8 0 16-7.2 16-16V212.2L322 328.8c-38.4 31.5-93.7 31.5-132 0L48 212.2zM0 128C0 92.7 28.7 64 64 64H448c35.3 0 64 28.7 64 64V384c0 35.3-28.7 64-64 64H64c-35.3 0-64-28.7-64-64V128z'],
} as const

/** Um ícone do sprite, em SVG embutido. Decorativo: quem dá nome ao botão é o aria-label dele. */
export function icone(nome: keyof typeof CAMINHOS): string {
  const [viewBox, d] = CAMINHOS[nome]
  return `<svg class="ico ico-${nome}" viewBox="${viewBox}" aria-hidden="true" focusable="false"><path d="${d}"/></svg>`
}

// ---------------------------------------------------------------- textos da busca

const PONTUACAO_NO_FIM = /[\s,;:|–—\-([{"'“‘]+$/u
/** Palavras que não fecham frase: artigo, preposição, conjunção. As de até 3 letras entram pela regra do tamanho. */
const PALAVRAS_DE_LIGACAO = new Set(['para', 'pela', 'pelo', 'pelas', 'pelos', 'entre', 'sobre', 'como', 'umas', 'numa', 'desde', 'até', 'após', 'contra', 'perante', 'quando', 'onde'])

/** Artigo e preposição no fim de um corte: "… cadastro para" lê pior que "… cadastro". */
function semPalavraCurtaNoFim(texto: string): string {
  let t = texto.replace(PONTUACAO_NO_FIM, '')
  for (let i = 0; i < 3; i++) {
    const ultima = /\s(\S+)$/u.exec(t)
    if (!ultima) break
    const palavra = ultima[1]
    if (!/^[a-zà-öø-ÿ]{1,3}$/u.test(palavra) && !PALAVRAS_DE_LIGACAO.has(palavra)) break
    t = t.slice(0, ultima.index).replace(PONTUACAO_NO_FIM, '')
  }
  return t
}

/** Corta um texto no limite, numa palavra inteira, com reticências. */
export function cortarNoLimite(texto: string, limite: number): string {
  const limpo = texto.replace(/\s+/g, ' ').trim()
  if (limpo.length <= limite) return limpo
  const cabe = limpo.slice(0, limite - 1)
  const espaco = cabe.lastIndexOf(' ')
  const cortado = semPalavraCurtaNoFim(espaco > limite * 0.6 ? cabe.slice(0, espaco) : cabe)
  return `${cortado}…`
}

/**
 * A descrição que vai para a busca e para o cartão das redes: texto corrido,
 * sem marcação, até 160 caracteres, cortada numa palavra.
 *
 * O resumo automático sai do corpo da matéria, e o corpo tem Markdown — sem
 * limpar, o Google mostrava "**" e "![foto](…)" no resultado da busca.
 */
export function normalizarDescricao(texto: string | null | undefined, limite = 160): string {
  const limpo = String(texto ?? '')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ')
    .replace(/\[([^\]]+)\]\((?:[^()\s]|\([^()\s]*\))+\)/g, '$1')
    .replace(/<[^>]*>/g, ' ')
    .replace(/(^|\n)[ \t]*#{1,6}[ \t]+/g, '$1')
    .replace(/(^|\n)[ \t]*>[ \t]?/g, '$1')
    .replace(/(^|\n)[ \t]*(?:-|\d+\.)[ \t]+/g, '$1')
    .replace(/\*\*|__|\*|`/g, '')
    .replace(/\s+/g, ' ')
    .trim()
  if (limpo.length <= limite) return limpo.replace(/[\s,;:|–—-]+$/u, '')
  return cortarNoLimite(limpo, limite)
}

/** A assinatura dos títulos do site: "Assunto | Cruz Vermelha Brasileira Rio de Janeiro". */
export const ASSINATURA_DA_ABA = ` | ${NOME_DO_SITE}`

/**
 * O <title> da aba, em até 60 caracteres, no padrão do site:
 * "Assunto | Cruz Vermelha Brasileira Rio de Janeiro".
 *
 * A assinatura tem 42 caracteres: com ela, qualquer assunto acima de 18
 * passaria do limite que a busca mostra, e o que ficaria visível seria a
 * assinatura em vez do assunto. Então o assunto manda: a assinatura só entra
 * quando cabe inteira. Assunto maior que o limite é cortado na última pausa
 * perto do fim (dois-pontos, travessão, vírgula) ou, na falta, na última
 * palavra, sem terminar em preposição e sem partir o nome da instituição
 * (o corte vai para antes dele). O <h1> e o og:title continuam com o texto
 * inteiro.
 */
export function tituloDaAba(titulo: string, limite = 60): string {
  const limpo = titulo.replace(/\s+/g, ' ').trim()
  if (limpo.length + ASSINATURA_DA_ABA.length <= limite) return limpo + ASSINATURA_DA_ABA
  if (limpo.length <= limite) return limpo
  const cabe = limpo.slice(0, limite - 1)
  const pausa = Math.max(cabe.lastIndexOf(': '), cabe.lastIndexOf(' — '), cabe.lastIndexOf(' – '), cabe.lastIndexOf(' | '), cabe.lastIndexOf(', '))
  // A pausa só vale se estiver perto do fim: uma vírgula no meio da manchete
  // cortaria cedo demais e jogaria fora metade do espaço que a busca mostra.
  let corte = pausa >= limite * 0.66 ? pausa : cabe.lastIndexOf(' ')
  for (const nome of [NOME_FORMAL_DA_FILIAL, NOME_DO_SITE]) {
    const inicio = limpo.indexOf(nome)
    if (inicio > 0 && corte > inicio && corte < inicio + nome.length) corte = inicio
  }
  const cortado = semPalavraCurtaNoFim(corte > 0 ? cabe.slice(0, corte) : cabe)
  return `${cortado}…`
}

// ---------------------------------------------------------------- chat do site

/**
 * As duas tags do chat "Fale com a gente", com a versão (?v=) que a home usa.
 *
 * Quem preenche é `prepararChatDoSite()` (lib/site/chat-do-site.ts), no
 * servidor, antes de gerar as páginas; este módulo só guarda e devolve, porque
 * também roda no navegador (prévia do hub), onde não há chat. Sem versão
 * conhecida fica vazio e a página sai sem o chat — nunca com endereço sem
 * versão, que o cache de um ano do site deixaria velho para sempre.
 */
let tagsDoChat = ''

export function usarChatDoSite(tags: string): void {
  tagsDoChat = tags
}

export function chatDoSite(): string {
  return tagsDoChat
}

// ---------------------------------------------------------------- folha de estilo

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
picture{display:block}
a{color:inherit;text-decoration:none}
.ico{display:inline-block;width:1em;height:1em;fill:currentColor;vertical-align:-.125em;overflow:visible;flex:none}
.main-header{background:var(--paper);position:sticky;top:0;z-index:1000;box-shadow:0 12px 28px rgba(16,24,40,.10)}
.header-container{width:100%;display:flex;justify-content:space-between;align-items:center;padding:16px 32px;gap:16px;position:relative}
.logo-area{display:flex;align-items:center;gap:12px;flex-shrink:0;color:inherit}
.logo-img{height:52px;width:auto;display:block;flex-shrink:0;object-fit:contain}
.nav-links{display:flex;gap:32px;position:absolute;left:50%;transform:translateX(-50%);justify-content:center}
.nav-links a{color:var(--muted);font-weight:600;font-size:13.5px;letter-spacing:.2px;transition:color .2s;position:relative;padding-bottom:2px}
.nav-links a::after{content:'';position:absolute;bottom:-2px;left:0;width:0;height:2px;background:var(--red);transition:width .2s}
.nav-links a:hover,.nav-links a[aria-current="page"]{color:var(--red)}
.nav-links a:hover::after,.nav-links a[aria-current="page"]::after{width:100%}
.nav-links .nav-nowrap{white-space:nowrap}
.nav-toggle{display:none;border:0;background:transparent;font-size:24px;color:var(--ink);cursor:pointer;margin-left:auto;padding:4px}
.nav-toggle .ico-xmark{display:none}
.main-header.nav-open .nav-toggle .ico-bars{display:none}
.main-header.nav-open .nav-toggle .ico-xmark{display:inline-block}
.header-collapse{display:flex;align-items:center;gap:24px;margin-left:auto}
.header-actions{display:flex;gap:12px;align-items:center}
/* Seletor de idioma, o mesmo da home e das páginas internas do site: EN e ES levam às versões traduzidas da home. */
.seletor-idioma{display:flex;gap:2px;align-items:center;font-size:.78rem;font-weight:800;letter-spacing:.04em}
.seletor-idioma a,.seletor-idioma .idioma-atual{padding:5px 9px;border-radius:8px;text-decoration:none;line-height:1}
.seletor-idioma a{color:var(--muted)}
.seletor-idioma a:hover,.seletor-idioma a:focus-visible{color:var(--red);background:rgba(204,0,0,.08)}
.seletor-idioma .idioma-atual{color:var(--red);background:rgba(204,0,0,.08)}
/* O botão de destaque do cabeçalho: "Doe", em vermelho. */
.btn-doe{background:var(--red);color:#fff;font-weight:700;font-size:13.5px;display:inline-flex;align-items:center;justify-content:center;padding:9px 20px;border-radius:999px;transition:background .2s;white-space:nowrap}
.btn-doe:hover,.btn-doe:focus-visible{background:var(--red-dark);color:#fff}
/* Menu em grupos, como o da home: "Quem somos" e "Como ajudar" abrem uma
   lista — no computador ao passar o mouse, focar ou clicar; no menu sanfona
   (até 1180 px), por clique, dentro da lista. */
.nav-links{align-items:center}
.nav-links>a,.nav-grupo-botao{line-height:1.5}
.nav-grupo{position:relative}
.nav-grupo-botao{font:inherit;font-weight:600;font-size:13.5px;letter-spacing:.2px;color:var(--muted);background:none;border:0;padding:0 0 2px;cursor:pointer;display:inline-flex;align-items:center;gap:6px}
.nav-grupo-botao::after{content:"";width:6px;height:6px;border-right:2px solid currentColor;border-bottom:2px solid currentColor;transform:translateY(-2px) rotate(45deg);transition:transform .2s}
.nav-grupo-botao:hover,.nav-grupo.aberto .nav-grupo-botao,.nav-grupo-botao[aria-current="true"]{color:var(--red)}
.nav-grupo.aberto .nav-grupo-botao::after{transform:translateY(1px) rotate(-135deg)}
.nav-sub{display:none;position:absolute;top:calc(100% + 14px);left:50%;transform:translateX(-50%);min-width:260px;padding:10px;background:var(--paper);border:1px solid var(--line);border-radius:14px;box-shadow:0 18px 40px rgba(11,18,32,.14);z-index:1001}
.nav-sub::before{content:"";position:absolute;left:0;right:0;top:-16px;height:16px}
.nav-grupo.aberto .nav-sub{display:grid}
@media(min-width:1181px) and (hover:hover){
  .nav-grupo:hover .nav-sub{display:grid}
  /* Um grupo aberto por clique some quando o mouse passa para o outro: nunca duas listas ao mesmo tempo. */
  .nav-links:has(.nav-grupo:hover) .nav-grupo.aberto:not(:hover) .nav-sub{display:none}
}
.nav-links .nav-sub a{display:block;padding:9px 12px;border-radius:9px;color:var(--text);font-size:13.5px;white-space:nowrap}
.nav-links .nav-sub a::after{display:none}
.nav-links .nav-sub a:hover,.nav-links .nav-sub a:focus-visible{background:rgba(204,0,0,.07);color:var(--red)}
.nav-links .nav-sub a[aria-current="page"]{color:var(--red);background:rgba(204,0,0,.07)}
/* Abaixo de 1500px o menu centralizado na página encostaria no seletor de
   idioma (na home, entre 1181 e 1280px, ele passa por cima): aqui ele segue
   o fluxo, entre o logo e as ações, e nunca as cobre. */
@media(min-width:1181px) and (max-width:1499px){
  .header-collapse{flex:1;min-width:0;gap:12px}
  .nav-links{position:static;transform:none;margin:0 auto}
}
@media(min-width:1181px) and (max-width:1299px){
  .header-container{padding-left:20px;padding-right:20px}
  .nav-links{gap:12px}
  .seletor-idioma a,.seletor-idioma .idioma-atual{padding:5px 6px}
  .btn-doe{padding:8px 14px}
}
@media(max-width:1180px){
  .header-container{flex-wrap:nowrap;justify-content:space-between;gap:10px;padding:14px 20px}
  .nav-toggle{display:inline-flex}
  .header-collapse{display:none;position:absolute;top:100%;left:0;right:0;background:var(--paper);flex-direction:column;padding:8px 20px 18px;box-shadow:0 18px 40px rgba(11,18,32,.12);border-top:1px solid var(--line);margin-left:0}
  .main-header.nav-open .header-collapse{display:flex}
  .nav-links{position:static;transform:none;left:auto;flex-direction:column;gap:0;width:100%}
  .nav-links a{padding:14px 4px;border-bottom:1px solid var(--line);width:100%}
  .nav-links a::after{display:none}
  .header-actions{display:flex;flex-direction:column;align-items:stretch;width:100%;gap:10px;margin-top:10px}
  .header-actions .btn-doe{width:100%;padding:12px 20px}
  .nav-links{align-items:stretch}
  .nav-grupo{width:100%;border-bottom:1px solid var(--line)}
  .nav-grupo-botao{width:100%;justify-content:space-between;padding:14px 4px;font-size:.95rem}
  .nav-sub{position:static;transform:none;min-width:0;box-shadow:none;border:0;border-radius:0;padding:0 0 10px 10px}
  .nav-sub::before{display:none}
  .nav-links .nav-sub a{padding:10px 8px;border-bottom:0;white-space:normal}
  /* Com os dois grupos abertos, a lista passa da altura da tela: o painel rola sozinho, sem rolar a página. */
  .main-header.nav-open .header-collapse{max-height:calc(100vh - 76px);max-height:calc(100dvh - 76px);overflow-y:auto;overscroll-behavior:contain}
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
.footer-col p .ico{color:var(--red);margin-right:6px}
.footer-col p a{color:var(--black);font-weight:600}
.footer-col p a:hover{color:var(--red)}
.footer-social{display:flex;gap:10px;margin-top:4px}
.footer-social a{width:34px;height:34px;border-radius:50%;background:var(--line);color:var(--muted);display:flex;align-items:center;justify-content:center;font-size:14px;transition:background .2s,color .2s}
.footer-social a:hover{background:var(--red);color:#fff}
.footer-bottom{border-top:1px solid var(--line);background:var(--line);padding:16px 0}
/* A faixa de baixo como a home a mostra: largura toda, links cinza, separadores da cor da faixa. */
.footer-inner{display:flex;flex-wrap:wrap;justify-content:center;align-items:center;gap:10px;font-size:12px;color:var(--muted);padding:0 16px}
.footer-inner a{color:var(--muted);font-weight:600}
.footer-inner a:hover{color:var(--red)}
.footer-inner .sep{color:var(--line)}
@media(max-width:920px){
  .footer-grid{grid-template-columns:1fr;padding:36px 20px 28px}
  .coluna,.coluna-larga{width:calc(100% - 32px)}
  .cabecalho{padding-top:28px}
  .materia{padding-bottom:48px}
  article p,article li{font-size:1.0625rem}
}
@media print{
  .main-header,footer,.compartilhar,.news-share,.cv-chat{display:none}
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
.single-noticia .btn-doe{font-size:13px}
.news-folio{max-width:var(--max-folio);margin:0 auto;padding:0 24px 56px}
.news-masthead{border-top:3px solid var(--brand);padding:14px 0 10px;font-size:11px;font-weight:700;letter-spacing:.14em;text-transform:uppercase;color:var(--ink-2);display:flex;align-items:center;gap:10px;flex-wrap:wrap}
.news-masthead .dot{color:var(--news-line)}
.news-grid{display:grid;grid-template-columns:minmax(0,1fr) var(--col-rail);gap:var(--gutter);align-items:start;padding-top:26px}
.news-article{max-width:760px;min-width:0}
.news-article .kicker{color:var(--brand);font-size:11px;font-weight:700;letter-spacing:.14em;text-transform:uppercase;margin:0 0 8px}
.news-article h1{font-family:var(--serif);font-weight:800;font-size:48px;line-height:1.12;letter-spacing:-.02em;color:var(--news-ink);margin:0;overflow-wrap:break-word}
.news-article .deck{font-family:var(--serif);font-size:21px;line-height:1.35;color:var(--news-muted);margin:12px 0 18px;font-weight:400}
.meta-bar{display:flex;justify-content:space-between;align-items:center;gap:10px 16px;flex-wrap:wrap;padding-bottom:12px;border-bottom:1px solid var(--news-line);margin-bottom:26px}
.meta-bar .byline{font-size:13px;color:var(--news-muted);display:flex;flex-wrap:wrap;align-items:baseline;gap:6px 8px;margin:0}
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
.news-body p{font-family:var(--serif);font-size:20px;line-height:1.58;color:var(--news-ink);margin:0 0 .85em;text-align:left;overflow-wrap:break-word}
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
.news-body figcaption .credito a{color:inherit}
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

// ---------------------------------------------------------------- cabeçalho e rodapé

const LOGO = (o: string) => `${o}/assets/otim/logo-cvb-rj-520.webp`

/** As páginas que o menu marca como a atual (aria-current + filete). */
export type ItemDoMenu = 'noticias' | 'acervo' | 'transparencia'

/**
 * O cabeçalho com o menu — o mesmo da home. `ativo` marca a página atual.
 *
 * Seis itens no primeiro nível, nesta ordem: Quem somos (grupo), Como ajudar
 * (grupo), Notícias, Transparência, Escola e Contato. A escola é um link só,
 * para a matrícula; a plataforma dela fica fora do menu da filial.
 */
export function cabecalhoDoSite(origem: string, ativo?: ItemDoMenu): string {
  const o = escapar(origem)
  const atual = (item: ItemDoMenu) => (ativo === item ? ' aria-current="page"' : '')
  return `<header class="main-header">
      <div class="header-container">
        <a href="${o}/" class="logo-area">
          <img src="${escapar(LOGO(origem))}" width="520" height="156" alt="${NOME_DO_SITE}" class="logo-img">
        </a>
        <button class="nav-toggle" type="button" aria-label="Abrir menu" aria-expanded="false" aria-controls="menu-painel">${icone('bars')}${icone('xmark')}</button>
        <div class="header-collapse" id="menu-painel">
          <nav class="nav-links" aria-label="Menu principal">
            <div class="nav-grupo">
              <button class="nav-grupo-botao" type="button" aria-expanded="false" aria-controls="menu-quem-somos">Quem somos</button>
              <div class="nav-sub" id="menu-quem-somos">
                <a href="${o}/quem-somos/">Quem somos</a>
                <a href="${o}/historia/">Nossa história</a>
                <a href="${o}/equipe.html">Equipe</a>
                <a href="${o}/principios-fundamentais/">Princípios Fundamentais</a>
                <a href="${o}/emblema/">O emblema</a>
                <a href="${o}/movimento-internacional/">Movimento Internacional</a>
                <a href="${o}/direito-internacional-humanitario/">Direito Internacional Humanitário</a>
                <a href="${o}/base-legal/">Base legal</a>
              </div>
            </div>
            <div class="nav-grupo">
              <button class="nav-grupo-botao" type="button" aria-expanded="false" aria-controls="menu-como-ajudar">Como ajudar</button>
              <div class="nav-sub" id="menu-como-ajudar">
                <a href="${o}/doe/">Doe</a>
                <a href="${o}/voluntariado/">Seja voluntário</a>
                <a href="${o}/cursos-gratuitos/">Formação de voluntários</a>
                <a href="${o}/#campanhas">Campanhas</a>
              </div>
            </div>
            <a href="${o}/noticias/"${atual('noticias')}>Notícias</a>
            <a href="${o}/transparencia/"${atual('transparencia')}>Transparência</a>
            <a href="${o}/matricula-cursos-presenciais/">Escola</a>
            <a href="${o}/#contato">Contato</a>
          </nav>
          <div class="header-actions">
            <div class="seletor-idioma" role="navigation" aria-label="Idioma">
              <span class="idioma-atual" aria-current="true" lang="pt-BR">PT</span>
              <a href="${o}/en/" hreflang="en" lang="en" aria-label="English">EN</a>
              <a href="${o}/es/" hreflang="es" lang="es" aria-label="Español">ES</a>
            </div>
            <a href="${o}/doe/" class="btn-doe">Doe</a>
          </div>
        </div>
      </div>
    </header>`
}

/**
 * O rodapé — as mesmas colunas da home. CNPJ e endereço completo em toda
 * página (é o que um revisor procura para saber quem responde pelo site). Na
 * faixa de baixo, as políticas (do repositório do site) e "Preferências de
 * cookies": o aviso de cookies transforma o clique em qualquer
 * [data-cvrj-cookies] na abertura das preferências; sem o aviso, o link leva à
 * Política de Cookies.
 *
 * Fora daqui de propósito: a Wikipédia (o verbete foi escrito pela conta da
 * própria filial e cita o site como fonte — não é prova independente) e o
 * Acervo, enquanto não houver item publicado (lib/acervo/paginas.ts).
 */
export function rodapeDoSite(origem: string, ano: number | string): string {
  const o = escapar(origem)
  const f = DADOS_DA_FILIAL
  return `<footer>
      <div class="footer-grid">
        <div class="footer-brand">
          <img class="footer-logo" src="${escapar(LOGO(origem))}" width="520" height="156" alt="${NOME_DO_SITE}" loading="lazy" decoding="async">
          <p>Humanidade, imparcialidade, neutralidade, independência, voluntariado, unidade e universalidade.</p>
        </div>
        <div class="footer-col">
          <h4>Sobre</h4>
          <p>Cruz Vermelha Brasileira<br>Filial do Estado do Rio de Janeiro<br>CNPJ ${f.cnpj}</p>
          <p><a href="${o}/quem-somos/">Quem somos</a></p>
          <p><a href="${o}/transparencia/">Portal da transparência</a></p>
          <p><a href="${o}/canais-oficiais/">Canais oficiais</a></p>
          <p><a href="${o}/verificar/">Verificar um documento</a></p>
          <p><a href="${o}/bio/">Links oficiais</a></p>
          <p><a href="${o}/matricula-cursos-presenciais/">Escola de Educação e Saúde</a></p>
        </div>
        <div class="footer-col">
          <h4>Contato</h4>
          <p>${icone('location-dot')} Praça da Cruz Vermelha, 10 · Centro · Rio de Janeiro – RJ · CEP 20230-130</p>
          <p>${icone('phone')} ${f.telefone}</p>
          <p>${icone('envelope')} ${f.email}</p>
        </div>
        <div class="footer-col">
          <h4>Siga-nos</h4>
          <div class="footer-social">
            <a href="https://www.facebook.com/profile.php?id=61591390052128" target="_blank" rel="noopener" aria-label="Facebook">${svgDaMarca('facebook', 16, 'currentColor')}</a>
            <a href="https://www.instagram.com/cruzvermelhabrasileirarj/" target="_blank" rel="noopener" aria-label="Instagram">${svgDaMarca('instagram', 16, 'currentColor')}</a>
          </div>
        </div>
      </div>
      <div class="footer-bottom">
        <div class="footer-inner">
          <span>&copy; ${escapar(String(ano))} Cruz Vermelha Brasileira – Filial do Estado do Rio de Janeiro · CNPJ ${f.cnpj}</span>
          <span class="sep">|</span>
          <a href="${o}/noticias/">Notícias</a>
          <span class="sep">|</span>
          <a href="${o}/transparencia/">Transparência</a>
          <span class="sep">|</span>
          <a href="${o}/canais-oficiais/">Canais oficiais</a>
          <span class="sep">|</span>
          <a href="${o}/verificar/">Verificar documento</a>
          <span class="sep">|</span>
          <a href="${o}/matricula-cursos-presenciais/">Escola de Educação e Saúde</a>
          <span class="sep">|</span>
          <a href="${o}/privacidade/">Política de Privacidade</a>
          <span class="sep">|</span>
          <a href="${o}/termos/">Termos de Uso</a>
          <span class="sep">|</span>
          <a href="${o}/cookies/">Política de Cookies</a>
          <span class="sep">|</span>
          <a href="${o}/reembolso/">Cancelamento e reembolso</a>
          <span class="sep">|</span>
          <a href="${o}/cookies/#preferencias" data-cvrj-cookies>Preferências de cookies</a>
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
        this.setAttribute('aria-label', isOpen ? 'Fechar menu' : 'Abrir menu');
      });
      document.querySelectorAll('.nav-links a').forEach(function(link) {
        link.addEventListener('click', function() {
          const header = link.closest('.main-header');
          header?.classList.remove('nav-open');
          document.querySelector('.nav-toggle')?.setAttribute('aria-expanded', 'false');
          document.querySelector('.nav-toggle')?.setAttribute('aria-label', 'Abrir menu');
        });
      });
      // Grupos do menu ("Quem somos", "Como ajudar"): abrem por clique ou teclado; Esc ou clique fora fecham.
      (function() {
        const grupos = Array.from(document.querySelectorAll('.nav-grupo'));
        const mouse = window.matchMedia('(min-width: 1181px) and (hover: hover)');
        function fechar(exceto) {
          grupos.forEach(function(g) { if (g !== exceto) { g.classList.remove('aberto'); g.querySelector('.nav-grupo-botao')?.setAttribute('aria-expanded', 'false'); } });
        }
        grupos.forEach(function(g) {
          const botao = g.querySelector('.nav-grupo-botao');
          botao?.addEventListener('click', function() {
            const abrir = !g.classList.contains('aberto');
            fechar(g);
            g.classList.toggle('aberto', abrir);
            botao.setAttribute('aria-expanded', String(abrir));
          });
          if (g.querySelector('a[aria-current="page"]')) botao?.setAttribute('aria-current', 'true');
          // No computador, passar o mouse num grupo fecha o outro; sair com o Tab de um grupo o fecha.
          g.addEventListener('mouseenter', function() { if (mouse.matches) fechar(g); });
          g.addEventListener('focusout', function(e) {
            if (e.relatedTarget && !g.contains(e.relatedTarget)) { g.classList.remove('aberto'); botao?.setAttribute('aria-expanded', 'false'); }
          });
        });
        document.addEventListener('click', function(e) { if (!e.target.closest('.nav-grupo')) fechar(null); });
        document.addEventListener('keydown', function(e) {
          if (e.key !== 'Escape') return;
          const aberto = grupos.find(function(g) { return g.classList.contains('aberto'); });
          if (aberto) { fechar(null); aberto.querySelector('.nav-grupo-botao')?.focus(); }
        });
      })();
    </script>`
}

// ---------------------------------------------------------------- página

export type ImagemDaPagina = { url: string; largura?: number; altura?: number; alt?: string }

export type DadosDaPagina = {
  titulo: string
  /** O assunto do <title>, quando o título é longo demais para levar a
   * assinatura (o <h1> e o og:title seguem com `titulo`). */
  assuntoDaAba?: string
  descricao: string
  /** Caminho canônico com barra final, ex.: /noticias/ */
  caminho: string
  origem?: string
  /** HTML do miolo — tudo entre o cabeçalho e o rodapé. */
  corpo: string
  cssExtra?: string
  jsonLd?: object
  agora?: Date
  /** Item do menu a marcar como página atual. */
  ativo?: ItemDoMenu
  /** false: a página sai com noindex (lançamento oculto; o sitemap também não a lista). */
  indexar?: boolean
  /** Imagem de compartilhamento (og:image e cartão grande do X). Sem ela, vale a da home. */
  imagem?: ImagemDaPagina
  /** As versões da página em outros idiomas (hreflang), a própria incluída. */
  alternativas?: { hreflang: string; url: string }[]
  /** og:type (padrão "website"). */
  tipoOg?: 'website' | 'article'
  /** Datas de artigo (article:published_time / modified_time), quando fizer sentido. */
  publicadoEm?: Date
  modificadoEm?: Date
  /** Classe do <body> (a matéria usa "single-noticia"). */
  classeDoCorpo?: string
  /** Scripts da própria página, depois do rodapé. */
  scriptsDoFim?: string
  /** As tags do chat; sem isto, vale o que `prepararChatDoSite()` deixou pronto. */
  chat?: string
  /**
   * A foto que é o LCP da página (a de abertura da matéria): sai num
   * <link rel=preload> no <head>, com o mesmo srcset/sizes do <picture>, para
   * o celular começar a baixá-la antes de ler o CSS e o resto do cabeçalho.
   */
  imagemPrioritaria?: { srcset: string; sizes: string; tipo?: string }
}

/**
 * As fontes das páginas: Inter no chrome/UI, Source Serif 4 na leitura, só
 * nos pesos que a folha usa (Inter 400/600/700/800; Serif 400/700/800 e o
 * itálico 400 das citações — o navegador só baixa o itálico se houver citação
 * na página).
 *
 * Sem o eixo de tamanho óptico (opsz) da Source Serif: era ele que fazia o
 * arquivo da serifada pesar 122 KB. E sem bloquear a pintura: a folha do
 * Google entra por preload e vira stylesheet quando chega (como na home);
 * com display=swap o texto aparece na fonte do sistema até lá. O <noscript>
 * cobre quem navega sem JavaScript.
 */
export const URL_DAS_FONTES =
  'https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700;800&family=Source+Serif+4:ital,wght@0,400;0,700;0,800;1,400&display=swap'
export const LINK_DAS_FONTES =
  `<link rel="preload" href="${URL_DAS_FONTES}" as="style" onload="this.onload=null;this.rel='stylesheet'">
    <noscript><link rel="stylesheet" href="${URL_DAS_FONTES}"></noscript>`

/** Uma página institucional completa, vestida com o esqueleto do site. */
export function montarPaginaDoSite(dados: DadosDaPagina): string {
  const origem = dados.origem ?? ORIGEM_PADRAO
  const canonica = `${origem}${dados.caminho}`
  const ano = new Intl.DateTimeFormat('pt-BR', { year: 'numeric', timeZone: 'America/Sao_Paulo' }).format(dados.agora ?? new Date())
  const descricao = normalizarDescricao(dados.descricao)
  const imagem = dados.imagem?.url ? dados.imagem : IMAGEM_PADRAO_DO_SITE
  const altDaImagem = normalizarDescricao(imagem.alt || NOME_DO_SITE, 300)
  const o = escapar(origem)
  const meta = [
    `<meta charset="utf-8">`,
    `<meta name="viewport" content="width=device-width, initial-scale=1">`,
    `<title>${escapar(tituloDaAba(dados.assuntoDaAba ?? dados.titulo))}</title>`,
    `<meta name="description" content="${escapar(descricao)}">`,
    `<link rel="canonical" href="${escapar(canonica)}">`,
    `<link rel="icon" type="image/svg+xml" href="${o}/assets/favicon.svg">`,
    `<link rel="icon" type="image/png" href="${o}/assets/favicon.png">`,
    `<meta name="theme-color" content="#cc0000">`,
    `<meta name="robots" content="${dados.indexar === false ? 'noindex, nofollow, noarchive' : 'index, follow, max-image-preview:large'}">`,
    ...(dados.alternativas ?? []).map((a) => `<link rel="alternate" hreflang="${escapar(a.hreflang)}" href="${escapar(a.url)}">`),
    `<meta property="og:type" content="${dados.tipoOg ?? 'website'}">`,
    `<meta property="og:site_name" content="${NOME_DO_SITE}">`,
    `<meta property="og:locale" content="pt_BR">`,
    `<meta property="og:title" content="${escapar(dados.titulo)}">`,
    `<meta property="og:description" content="${escapar(descricao)}">`,
    `<meta property="og:url" content="${escapar(canonica)}">`,
    `<meta property="og:image" content="${escapar(imagem.url)}">`,
    ...(imagem.largura && imagem.altura ? [`<meta property="og:image:width" content="${imagem.largura}">`, `<meta property="og:image:height" content="${imagem.altura}">`] : []),
    `<meta property="og:image:alt" content="${escapar(altDaImagem)}">`,
    ...(dados.publicadoEm ? [`<meta property="article:published_time" content="${dados.publicadoEm.toISOString()}">`] : []),
    ...(dados.modificadoEm ? [`<meta property="article:modified_time" content="${dados.modificadoEm.toISOString()}">`] : []),
    `<meta name="twitter:card" content="summary_large_image">`,
    `<meta name="twitter:title" content="${escapar(dados.titulo)}">`,
    `<meta name="twitter:description" content="${escapar(descricao)}">`,
    `<meta name="twitter:image" content="${escapar(imagem.url)}">`,
    `<meta name="twitter:image:alt" content="${escapar(altDaImagem)}">`,
    ...(dados.imagemPrioritaria ? [`<link rel="preload" as="image"${dados.imagemPrioritaria.tipo ? ` type="${escapar(dados.imagemPrioritaria.tipo)}"` : ''} imagesrcset="${escapar(dados.imagemPrioritaria.srcset)}" imagesizes="${escapar(dados.imagemPrioritaria.sizes)}" fetchpriority="high">`] : []),
    `<link rel="preconnect" href="https://fonts.googleapis.com">`,
    `<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>`,
    LINK_DAS_FONTES,
  ].join('\n    ')

  const chat = dados.chat ?? chatDoSite()
  return `<!doctype html>
<html lang="pt-BR">
  <head>
    ${meta}
    ${blocoDoAnalytics()}
    <style>${CSS_DO_SITE}${dados.cssExtra ?? ''}</style>${dados.jsonLd ? `
    <script type="application/ld+json">${JSON.stringify(dados.jsonLd).replace(/</g, '\\u003c')}</script>` : ''}
  </head>
  <body${dados.classeDoCorpo ? ` class="${escapar(dados.classeDoCorpo)}"` : ''}>
    ${cabecalhoDoSite(origem, dados.ativo)}

    ${dados.corpo}

    ${rodapeDoSite(origem, ano)}
    ${scriptDoMenu()}${dados.scriptsDoFim ? `
    ${dados.scriptsDoFim}` : ''}${chat ? `
    ${chat}` : ''}
  </body>
</html>
`
}
