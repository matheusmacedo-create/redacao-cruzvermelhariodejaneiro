/**
 * Mapa do ecossistema — o motor da tela (docs/mapa-do-ecossistema.md).
 *
 * Roda no navegador, dentro da moldura que `components/app/mapa/mapa-do-ecossistema.tsx`
 * desenha. É DOM direto (SVG para o mapa, HTML para a lista e o painel) por
 * uma razão: o mapa redesenha dezenas de nós a cada clique e anima posição,
 * e fazer isso em React a cada render custava mais do que ajudava. O React
 * cuida dos dados (carrega, chama as actions, recarrega); este módulo cuida
 * do desenho e da navegação.
 *
 * Navegação por foco: um nível por clique (raiz → sistema → categoria), o
 * item abre o painel lateral. O endereço vai no `#` (ex.: #palacio.pessoas),
 * o botão voltar do navegador funciona e o modo/zoom/filtros ficam no
 * localStorage. Nada de dado é guardado aqui: tudo vem de `montarArvore`.
 */
import {
  ESTADOS, NOME_DO_SISTEMA, ORDEM_DAS_SITUACOES, ROTULO_DA_SITUACAO, ROTULO_DO_TIPO, SITUACAO_DO_ESTADO,
  caminho as caminhoDe, filaDeProximos, montarArvore, percentualNoAr,
  type Estado, type ItemDoMapa, type No, type PendenciaDoMapa, type Situacao, type SituacaoDaPendencia, type Sistema,
} from './modelo'

export type OpcoesDoMapa = {
  podeEditar: boolean
  aoMarcarPendencia: (id: string, situacao: SituacaoDaPendencia) => Promise<string | null>
  aoMudarEstado: (id: string, estado: Estado) => Promise<string | null>
}
export type DadosParaATela = { itens: ItemDoMapa[]; pendencias: PendenciaDoMapa[] }
export type Instancia = { atualizar: (dados: DadosParaATela) => void; destruir: () => void }

type Pos = { x: number; y: number; w: number; h: number; lado?: number }
type Filtros = { status: Situacao | 'todos'; sistema: Sistema | 'todos'; soPend: boolean }
type Modo = 'mapa' | 'lista'

const NS = 'http://www.w3.org/2000/svg'
const SVG_ICONE: Record<string, string> = {
  system: 'M3 3h7v7H3zM14 3h7v7h-7zM3 14h7v7H3zM14 14h7v7h-7z',
  category: 'M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z',
  item: 'M6 3h8l4 4v14H6zM14 3v4h4',
  settings: 'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z',
  integration: 'M8 3 4 7l4 4M4 7h16M16 21l4-4-4-4M20 17H4',
  people: 'M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM23 21v-2a4 4 0 0 0-3-3.9M16 3.1a4 4 0 0 1 0 7.8',
  archive: 'M3 4h18v4H3zM5 8v12h14V8M10 12h4',
}
const COR_DO_SISTEMA: Record<Sistema, string> = { palacio: 'var(--mapa-palacio)', site: 'var(--mapa-site)', escola: 'var(--mapa-escola)' }
const COR_DA_SITUACAO: Record<Situacao, string> = { live: 'var(--mapa-live)', pending: 'var(--mapa-pending)', development: 'var(--mapa-dev)', disabled: 'var(--mapa-disabled)', idea: 'var(--mapa-idea)' }
const ROTULO_CURTO: Record<Situacao, string> = { live: 'no ar', pending: 'falta ligar', development: 'em andamento', disabled: 'fora do ar', idea: 'ideias' }
const PRIO = { agora: 0, 'em breve': 1, 'um dia': 2 } as Record<string, number>

const norm = (s: string) => (s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
const dataCurta = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`
const guardar = (k: string, v: unknown) => { try { localStorage.setItem('mapa-eco:' + k, JSON.stringify(v)) } catch { /* sem armazenamento */ } }
const lembrar = <T,>(k: string, padrao: T): T => { try { const v = localStorage.getItem('mapa-eco:' + k); return v === null ? padrao : (JSON.parse(v) as T) } catch { return padrao } }

type Atributos = Record<string, string | number | boolean | null | undefined | Record<string, string> | ((ev: Event) => void)>
type Filho = Node | string | number | null | undefined | false | Filho[]
function h(tag: string, attrs?: Atributos | null, ...kids: Filho[]): HTMLElement {
  const el = document.createElement(tag)
  if (attrs) for (const k of Object.keys(attrs)) {
    const v = attrs[k]
    if (v === null || v === undefined || v === false) continue
    if (k === 'class') el.className = String(v)
    else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v)
    else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v as EventListener)
    else el.setAttribute(k, v === true ? '' : String(v))
  }
  const juntar = (lista: Filho[]) => { for (const kid of lista) { if (Array.isArray(kid)) juntar(kid); else if (kid !== null && kid !== undefined && kid !== false) el.append(kid instanceof Node ? kid : document.createTextNode(String(kid))) } }
  juntar(kids)
  return el
}
function sv(tag: string, attrs: Record<string, string | number | null | undefined>): SVGElement {
  const e = document.createElementNS(NS, tag)
  for (const k of Object.keys(attrs)) { const v = attrs[k]; if (v !== null && v !== undefined) e.setAttribute(k, String(v)) }
  return e
}

export function montarMapaDoEcossistema(moldura: HTMLElement, dadosIniciais: DadosParaATela, opcoes: OpcoesDoMapa): Instancia {
  const $ = <T extends HTMLElement = HTMLElement>(sel: string): T => { const el = moldura.querySelector<T>(sel); if (!el) throw new Error(`mapa: falta ${sel} na moldura`); return el }
  const palco = $('[data-papel="palco"]'), svgEl = $<HTMLElement>('[data-papel="svg"]'), mundo = svgEl.querySelector('g') as SVGGElement
  const geral = $('[data-papel="geral"]'), lista = $('[data-papel="lista"]'), trilha = $('[data-papel="trilha"]'), drawer = $('[data-papel="painel"]')
  const chipsStatus = $('[data-papel="chips-status"]'), chipsSis = $('[data-papel="chips-sistema"]'), btnSoPend = $<HTMLButtonElement>('[data-papel="so-pend"]'), ativosEl = $('[data-papel="ativos"]')
  const avisoVazio = $('[data-papel="aviso-vazio"]'), controles = $('[data-papel="controles"]'), mini = $('[data-papel="minimap"]'), miniSvg = mini.querySelector('svg') as SVGSVGElement
  const tip = $('[data-papel="tip"]'), paleta = $('[data-papel="paleta"]'), pInput = $<HTMLInputElement>('[data-papel="paleta-input"]'), pRes = $('[data-papel="paleta-res"]')
  const pop = $('[data-papel="pop-opcoes"]'), btnMais = $<HTMLButtonElement>('[data-papel="mais-opcoes"]'), popLegenda = $('[data-papel="pop-legenda"]'), btnLegenda = $<HTMLButtonElement>('[data-papel="btn-legenda"]')
  const btnMapa = $<HTMLButtonElement>('[data-papel="modo-mapa"]'), btnLista = $<HTMLButtonElement>('[data-papel="modo-lista"]')

  // ---------- Estado ----------
  let arvore = montarArvore(dadosIniciais.itens, dadosIniciais.pendencias)
  let fila = filaDeProximos(dadosIniciais.pendencias)
  const estado: { focoId: string; modo: Modo; completa: boolean; filtros: Filtros; ordem: string; painelId: string | null } = {
    focoId: 'inicio',
    modo: lembrar<Modo>('modo', window.innerWidth < 720 ? 'lista' : 'mapa'),
    completa: false,
    filtros: { status: 'todos', sistema: 'todos', soPend: false, ...lembrar<Partial<Filtros>>('filtros', {}) },
    ordem: lembrar('ordem', 'nome'),
    painelId: null,
  }
  let vista = { x: 0, y: 0, k: lembrar<number>('zoom', 1) }
  let posicoes: Pos[] = []
  const limpezas: (() => void)[] = []
  const ouvir = <K extends keyof DocumentEventMap>(alvo: Document | Window | HTMLElement, tipo: K | string, fn: EventListener, opts?: AddEventListenerOptions) => { alvo.addEventListener(tipo, fn, opts); limpezas.push(() => alvo.removeEventListener(tipo, fn, opts)) }

  const no = (id: string) => arvore.porId.get(id)
  const pct = percentualNoAr
  const caminho = (n: No) => caminhoDe(n, arvore.porId)
  const sistemaDe = (n: No) => (n.system ? NOME_DO_SISTEMA[n.system] : null)
  const posNaFila = (id: string) => { const i = fila.findIndex((p) => p.id === id); return i < 0 ? null : i + 1 }
  const iconeDe = (n: No): string => {
    if (n.type === 'system') return 'system'
    const t = norm(n.name)
    if (n.type === 'category') { if (/pessoas|voluntari|aluno|diretorio|recursos humanos/.test(t)) return 'people'; if (/administra|configura|conta/.test(t)) return 'settings'; if (/integra|whatsapp|publica|medic/.test(t)) return 'integration'; if (/acervo|backup|arquivo/.test(t)) return 'archive'; return 'category' }
    if (/integra|whatsapp|api|conversoes|pixel|hreflang/.test(t)) return 'integration'
    if (/configura|usuarios|permiss|seguranca|acessos/.test(t)) return 'settings'
    if (/acervo|backup|biblioteca|arquivo/.test(t)) return 'archive'
    if (/pessoas|voluntari|aluno|diretorio|recursos humanos|equipe/.test(t)) return 'people'
    return 'item'
  }
  const svgIcone = (nome: string, cls?: string) => { const s = sv('svg', { viewBox: '0 0 24 24', class: cls ?? '' }); s.append(sv('path', { d: SVG_ICONE[nome] })); return s }

  // ---------- Filtros ----------
  const passa = (n: No) => {
    const f = estado.filtros
    if (f.sistema !== 'todos' && n.system && n.system !== f.sistema) return false
    if (f.status !== 'todos' && !(n.counts[f.status] > 0)) return false
    if (f.soPend && !(n.pend > 0)) return false
    return true
  }
  const filtrosAtivos = () => { const f = estado.filtros; const a: { k: keyof Filtros; r: string }[] = []; if (f.status !== 'todos') a.push({ k: 'status', r: ROTULO_DA_SITUACAO[f.status] }); if (f.sistema !== 'todos') a.push({ k: 'sistema', r: NOME_DO_SISTEMA[f.sistema].curto }); if (f.soPend) a.push({ k: 'soPend', r: 'Só com pendência' }); return a }
  function setFiltro<K extends keyof Filtros>(k: K, v: Filtros[K]) { estado.filtros[k] = v; guardar('filtros', estado.filtros); renderTudo() }
  function renderFiltros() {
    chipsStatus.innerHTML = ''
    chipsStatus.append(h('button', { class: 'chip', type: 'button', 'aria-pressed': String(estado.filtros.status === 'todos'), onclick: () => setFiltro('status', 'todos') }, 'Todos'))
    for (const k of ORDEM_DAS_SITUACOES) chipsStatus.append(h('button', { class: 'chip', type: 'button', 'aria-pressed': String(estado.filtros.status === k), 'aria-label': ROTULO_DA_SITUACAO[k], onclick: () => setFiltro('status', k) }, h('span', { class: `dot ${k}` }), k === 'pending' ? 'Pendências' : k === 'disabled' ? 'Fora do ar' : k === 'idea' ? 'Ideias' : ROTULO_DA_SITUACAO[k]))
    chipsSis.innerHTML = ''
    chipsSis.append(h('button', { class: 'chip', type: 'button', 'aria-pressed': String(estado.filtros.sistema === 'todos'), onclick: () => setFiltro('sistema', 'todos') }, 'Todos'))
    for (const s of arvore.raiz.children) if (s.system) chipsSis.append(h('button', { class: 'chip', type: 'button', 'aria-pressed': String(estado.filtros.sistema === s.system), onclick: () => setFiltro('sistema', s.system!) }, h('span', { class: 'sq', style: { background: COR_DO_SISTEMA[s.system] } }), NOME_DO_SISTEMA[s.system].curto))
    btnSoPend.setAttribute('aria-pressed', String(estado.filtros.soPend))
    ativosEl.innerHTML = ''
    const a = filtrosAtivos(); ativosEl.hidden = !a.length
    if (a.length) {
      ativosEl.append('Filtros ativos:')
      for (const x of a) ativosEl.append(h('span', { class: 'tag' }, x.r, h('button', { type: 'button', 'aria-label': `Remover filtro ${x.r}`, onclick: () => (x.k === 'soPend' ? setFiltro('soPend', false) : setFiltro(x.k, 'todos')) }, '×')))
      ativosEl.append(h('button', { class: 'btn ghost', type: 'button', onclick: () => { estado.filtros = { status: 'todos', sistema: 'todos', soPend: false }; guardar('filtros', estado.filtros); renderTudo() } }, 'Limpar filtros'))
    }
  }
  ouvir(btnSoPend, 'click', () => setFiltro('soPend', !estado.filtros.soPend))

  // ---------- Navegação / endereço ----------
  function irPara(id: string, opts: { semHistorico?: boolean } = {}) {
    const n = no(id); if (!n) return
    if (n.type === 'item') { estado.focoId = n.parentId ?? 'inicio'; abrirDrawer(n) } else { estado.focoId = id; fecharDrawer() }
    if (!opts.semHistorico) {
      const hash = '#' + (n.type === 'item' ? n.id : id === 'inicio' ? '' : id)
      if (location.hash !== hash) { try { history.pushState(null, '', hash || location.pathname + location.search) } catch { location.hash = hash } }
    }
    renderTudo()
    if (estado.modo === 'mapa' && !estado.completa) centralizar(true)
  }
  function lerHash() {
    const raw = decodeURIComponent(location.hash.replace(/^#\/?/, '')).replace(/\//g, '.')
    if (!raw) { estado.focoId = 'inicio'; fecharDrawer(); renderTudo(); return }
    if (no(raw)) irPara(raw, { semHistorico: true }); else { estado.focoId = 'inicio'; renderTudo() }
  }
  ouvir(window, 'popstate', lerHash)
  function voltar() { if (drawer.classList.contains('aberto')) { fecharDrawer(); return } const n = no(estado.focoId); if (n && n.parentId) irPara(n.parentId) }

  // ---------- Trilha ----------
  function renderTrilha() {
    trilha.innerHTML = ''
    const foco = no(estado.focoId) ?? arvore.raiz
    const cadeia = caminho(foco)
    if (estado.focoId !== 'inicio') trilha.append(h('button', { class: 'voltar', type: 'button', onclick: voltar, 'aria-label': 'Voltar um nível' }, '← Voltar'))
    cadeia.forEach((n, i) => {
      if (i) trilha.append(h('span', { class: 'sepv', 'aria-hidden': 'true' }, '›'))
      trilha.append(h('button', { type: 'button', onclick: () => irPara(n.id), 'aria-current': i === cadeia.length - 1 ? 'page' : null }, n.type === 'system' && n.system ? h('span', { class: 'sis', style: { background: COR_DO_SISTEMA[n.system] } }) : null, n.type === 'root' ? 'Início' : n.name))
    })
  }

  // ---------- Peças comuns ----------
  const barra = (n: No) => {
    const b = h('div', { class: 'barra', role: 'img', 'aria-label': `${n.counts.live} de ${n.total} no ar` })
    if (!n.total) return b
    for (const k of ORDEM_DAS_SITUACOES) if (n.counts[k]) b.append(h('i', { class: k, style: { width: `${(100 * n.counts[k]) / n.total}%` } }))
    return b
  }
  const composicao = (n: No) => h('div', { class: 'comp' }, ORDEM_DAS_SITUACOES.filter((k) => n.counts[k]).map((k) => h('span', { title: ROTULO_DA_SITUACAO[k] }, h('span', { class: `dot ${k}` }), `${n.counts[k]} ${ROTULO_CURTO[k]}`)))
  const chip = (cls: string, txt: string) => h('span', { class: `pill ${cls}` }, h('i'), txt)

  // ---------- Visão geral ----------
  function renderGeral() {
    geral.innerHTML = ''
    const raiz = arvore.raiz
    const miolo = h('div', { class: 'miolo' })
    miolo.append(h('header', null, h('div', { class: 'eyebrow' }, 'Ecossistema digital'), h('h2', null, 'Cruz Vermelha Brasileira do Rio de Janeiro'), h('p', null, `${raiz.children.length} sistemas · ${raiz.total} recursos · ${pct(raiz)}% no ar${raiz.updatedAt ? ` · última entrega em ${dataCurta(raiz.updatedAt)}` : ''}`)))
    const tiles = h('div', { class: 'sistemas' })
    for (const s of raiz.children) {
      if (!passa(s) || !s.system) continue
      tiles.append(h('button', { class: 'tile', type: 'button', style: { '--cor-sis': COR_DO_SISTEMA[s.system] } as Record<string, string>, onclick: () => irPara(s.id) },
        h('div', { class: 'cab' }, svgIcone('system'), h('h3', null, s.name)),
        h('div', { class: 'grande' }, s.total, h('small', null, 'recursos')),
        barra(s), h('div', { class: 'pct' }, `${s.counts.live} de ${s.total} no ar · ${pct(s)}%`),
        composicao(s),
        h('div', { class: 'acao' }, h('span', null, s.pend ? h('b', { class: 'pend' }, `⚠ ${s.pend} pendências`) : 'Sem pendências'), h('b', null, 'Explorar →'))))
    }
    if (!tiles.children.length) tiles.append(h('div', { class: 'vazio' }, 'Nenhum item corresponde aos filtros selecionados.'))
    miolo.append(tiles)
    const top: No[] = []; for (const s of raiz.children) for (const c of s.children) if (c.pend) top.push(c); top.sort((a, b) => b.pend - a.pend)
    const totalPend = raiz.pend, resolvidas = raiz.feitas
    miolo.append(h('div', { class: 'saude', 'data-papel': 'saude' },
      h('div', { class: 't' }, h('h3', null, 'Saúde do ecossistema'), h('div', { class: 'tot' }, raiz.total, h('small', null, 'recursos'))),
      h('div', { class: 'grade' },
        ORDEM_DAS_SITUACOES.map((k) => h('div', { class: 'kpi' }, h('div', { class: 'v' }, raiz.counts[k]), h('div', { class: 'r' }, h('span', { class: `dot ${k}` }), k === 'pending' ? 'aguardando integração' : k === 'development' ? 'em desenvolvimento' : ROTULO_CURTO[k]))),
        h('div', { class: 'kpi' }, h('div', { class: 'v pend' }, totalPend), h('div', { class: 'r' }, '⚠ pendências abertas')),
        h('div', { class: 'kpi' }, h('div', { class: 'v' }, resolvidas), h('div', { class: 'r' }, '✓ resolvidas'))),
      fila.length ? h('div', { class: 'proximo' }, h('span', { class: 'r' }, 'Próximo passo da fila:'), h('button', { type: 'button', onclick: () => { const p = fila[0]; if (p.item_id && no(p.item_id)) irPara(p.item_id); else irPara(p.sistema) } }, `#1 ${fila[0].titulo}`)) : null,
      h('details', null, h('summary', null, 'Ver resumo: áreas com mais pendências'), h('div', { class: 'top' }, top.slice(0, 8).map((c) => h('button', { type: 'button', onclick: () => irPara(c.id) }, h('span', null, h('span', { class: 'sis', style: { background: c.system ? COR_DO_SISTEMA[c.system] : '' } }), `${c.system ? NOME_DO_SISTEMA[c.system].curto : ''} › ${c.name}`), h('span', { class: 'c' }, `${c.pend} pend.`)))))))
    geral.append(miolo)
  }

  // ---------- Lista ----------
  function renderLista() {
    lista.innerHTML = ''
    const foco = no(estado.focoId) ?? arvore.raiz
    const filhos = foco.children.filter(passa)
    const sel = h('select', { 'aria-label': 'Ordenar por', onchange: (ev: Event) => { estado.ordem = (ev.target as HTMLSelectElement).value; guardar('ordem', estado.ordem); renderLista() } }) as HTMLSelectElement
    for (const [v, r] of [['nome', 'Nome'], ['pend', 'Mais pendências'], ['qtd', 'Maior quantidade'], ['prog', 'Menor progresso'], ['status', 'Estado']]) { const o = h('option', { value: v }, r) as HTMLOptionElement; o.selected = estado.ordem === v; sel.append(o) }
    const miolo = h('div', { class: 'miolo' })
    miolo.append(h('div', { class: 'cabeca' }, h('div', null, h('h2', null, foco.type === 'root' ? 'Ecossistema' : foco.name), h('div', { class: 'resumo' }, `${foco.total} recursos · ${foco.counts.live} no ar (${pct(foco)}%)`, foco.pend ? h('span', { class: 'pend' }, `⚠ ${foco.pend} pendências`) : null)), h('label', null, h('span', { class: 'sr' }, 'Ordenar'), sel)))
    const ord: Record<string, (a: No, b: No) => number> = {
      nome: (a, b) => a.name.localeCompare(b.name, 'pt-BR'), pend: (a, b) => b.pend - a.pend || a.name.localeCompare(b.name, 'pt-BR'), qtd: (a, b) => b.total - a.total, prog: (a, b) => pct(a) - pct(b),
      status: (a, b) => ORDEM_DAS_SITUACOES.indexOf(a.status ?? 'live') - ORDEM_DAS_SITUACOES.indexOf(b.status ?? 'live'),
    }
    filhos.sort(ord[estado.ordem] ?? ord.nome)
    const grid = h('div', { class: 'cards' })
    for (const f of filhos) {
      grid.append(h('button', { class: `card ${f.type}`, type: 'button', style: f.system ? ({ '--cor-sis': COR_DO_SISTEMA[f.system] } as Record<string, string>) : null, onclick: () => irPara(f.id), onmouseenter: (ev: Event) => mostrarTip(f, ev), onmouseleave: esconderTip, onfocus: (ev: Event) => mostrarTip(f, ev), onblur: esconderTip },
        h('div', { class: 't' }, f.type === 'item' && f.status ? h('span', { class: `dot ${f.status}`, style: { marginTop: '6px' }, title: ROTULO_DA_SITUACAO[f.status] }) : svgIcone(iconeDe(f)), h('span', { class: 'nome' }, f.name), h('span', { class: 'seta' }, '→')),
        f.type === 'item' && f.status
          ? h('div', { class: 'n' }, h('span', null, h('span', { class: `dot ${f.status}` }), ' ', ROTULO_DA_SITUACAO[f.status]), h('span', null, h('b', null, f.entregas.length), ' entregas'), f.pend ? h('span', { class: 'pend' }, `⚠ ${f.pend} pendências`) : null)
          : h('div', { class: 'n' }, h('span', null, h('b', null, f.total), ' recursos'), h('span', null, h('b', null, f.counts.live), ' no ar'), f.pend ? h('span', { class: 'pend' }, `⚠ ${f.pend} pendências`) : null),
        f.type === 'item' ? (f.description ? h('div', { class: 'desc' }, f.description) : null) : h('div', null, barra(f), h('div', { class: 'n', style: { marginTop: '4px' } }, `${pct(f)}%`))))
    }
    if (!grid.children.length) grid.append(h('div', { class: 'vazio' }, foco.children.length ? 'Nenhum item corresponde aos filtros selecionados.' : 'Nenhum item cadastrado nesta área.'))
    miolo.append(grid); lista.append(miolo)
  }

  // ---------- Mapa (foco) ----------
  const LARG = 256, ALT = 44, ALT_C = 62, ALT_S = 52
  const medidas = (n: No, central: boolean): Pos => ({ x: 0, y: 0, w: central ? Math.max(260, Math.min(360, 9 * n.name.length + 80)) : n.type === 'system' ? 250 : LARG, h: central ? ALT_C : n.type === 'system' ? ALT_S : ALT })
  function layoutFoco(foco: No, filhos: No[]) {
    const pos = new Map<string, Pos>()
    const c = medidas(foco, true); pos.set(foco.id, c)
    const n = filhos.length
    if (!n) return pos
    if (n <= 8) {
      const rx = Math.max(300, 150 + n * 34), ry = Math.max(150, 70 + n * 26)
      filhos.forEach((f, i) => { const a = -Math.PI / 2 + (2 * Math.PI * i) / n; const m = medidas(f, false); pos.set(f.id, { ...m, x: Math.cos(a) * rx, y: Math.sin(a) * ry }) })
    } else if (n <= 20) {
      const col = (arr: No[], lado: number) => { const passo = ALT + 14; const total = (arr.length - 1) * passo; arr.forEach((f, i) => { const m = medidas(f, false); pos.set(f.id, { ...m, x: lado * (c.w / 2 + 120 + m.w / 2), y: -total / 2 + i * passo }) }) }
      col(filhos.filter((_, i) => i % 2 === 0), -1); col(filhos.filter((_, i) => i % 2 === 1), 1)
    } else {
      const porColuna = Math.ceil(n / 4), passo = ALT + 12
      filhos.forEach((f, i) => { const col = Math.floor(i / porColuna), linha = i % porColuna; const lado = col < 2 ? -1 : 1; const dist = col === 0 || col === 3 ? 2 : 1; const m = medidas(f, false); const altCol = (Math.min(porColuna, n - col * porColuna) - 1) * passo; pos.set(f.id, { ...m, x: lado * (c.w / 2 + 90 + (dist - 1) * (m.w + 40) + m.w / 2), y: -altCol / 2 + linha * passo }) })
    }
    return pos
  }
  const curva = (a: Pos, b: Pos) => { const sx = a.x + Math.sign(b.x - a.x) * a.w / 2, ex = b.x - Math.sign(b.x - a.x) * b.w / 2; if (Math.abs(b.x - a.x) < 40) return `M${a.x},${a.y + Math.sign(b.y - a.y) * a.h / 2} L${b.x},${b.y - Math.sign(b.y - a.y) * b.h / 2}`; const mx = (sx + ex) / 2; return `M${sx},${a.y} C${mx},${a.y} ${mx},${b.y} ${ex},${b.y}` }
  function desenharNo(n: No, p: Pos, central: boolean, g: SVGElement) {
    const grp = sv('g', { class: `no ${n.type}${central ? ' centro' : ''}${n.type === 'root' ? ' raiz' : ''}`, tabindex: '0', role: 'button', 'aria-label': `${n.name}${n.type === 'item' && n.status ? ', ' + ROTULO_DA_SITUACAO[n.status] : ''}, ${n.total} recursos${n.pend ? ', ' + n.pend + ' pendências' : ''}`, transform: `translate(${p.x},${p.y})` })
    const caixa = sv('rect', { class: 'caixa', x: -p.w / 2, y: -p.h / 2, width: p.w, height: p.h, rx: central ? 12 : 9 })
    if (n.system && (n.type === 'system' || central)) (caixa as SVGElement).style.stroke = COR_DO_SISTEMA[n.system]
    grp.append(caixa)
    let tx = -p.w / 2 + 12
    if (n.type === 'item' && n.status) { grp.append(sv('circle', { class: 'ponto', cx: tx + 4, cy: central ? -8 : 0, r: 5, fill: COR_DA_SITUACAO[n.status] })); tx += 16 }
    else { grp.append(sv('path', { class: 'ico', d: SVG_ICONE[iconeDe(n)], transform: `translate(${tx},${(central ? -8 : 0) - 8}) scale(0.66)` })); tx += 22 }
    const maxChars = Math.floor((p.w - (tx + p.w / 2) - (n.type === 'item' ? 26 : 44)) / (central ? 8.4 : 6.6))
    const t = sv('text', { class: 'nome', x: tx, y: central ? -8 : n.type === 'item' ? 0 : -6 }); t.textContent = n.name.length > maxChars ? n.name.slice(0, Math.max(6, maxChars - 1)) + '…' : n.name; grp.append(t)
    if (central) { const s = sv('text', { class: 'sub', x: tx, y: 12 }); s.textContent = n.type === 'item' && n.status ? ROTULO_DA_SITUACAO[n.status] : `${n.total} recursos · ${n.counts.live} no ar · ${pct(n)}%${n.pend ? ' · ⚠ ' + n.pend : ''}`; grp.append(s) }
    else if (n.type !== 'item') {
      const s = sv('text', { class: 'sub', x: tx, y: 10 }); s.textContent = `${n.counts.live}/${n.total} no ar · ${pct(n)}%`; grp.append(s)
      const bw = Math.max(40, p.w - 24 - (tx + p.w / 2) + 12 - 30)
      grp.append(sv('rect', { class: 'barra-fundo', x: tx, y: p.h / 2 - 7, width: bw, height: 3, rx: 2 }))
      if (n.total) grp.append(sv('rect', { class: 'barra-valor', x: tx, y: p.h / 2 - 7, width: (bw * n.counts.live) / n.total, height: 3, rx: 2 }))
    }
    if (!central) {
      const seta = sv('text', { class: 'seta', x: p.w / 2 - 12, y: 0, 'text-anchor': 'end' }); seta.textContent = n.type === 'item' ? '›' : `${n.total} →`; grp.append(seta)
      if (n.pend) { const b = sv('text', { class: 'badge', x: p.w / 2 - 12, y: n.type === 'item' ? 13 : -13, 'text-anchor': 'end' }); b.textContent = `⚠ ${n.pend}`; grp.append(b) }
    }
    grp.addEventListener('click', (ev) => { ev.stopPropagation(); irPara(n.id) })
    grp.addEventListener('keydown', (ev) => { if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); irPara(n.id) } })
    grp.addEventListener('mouseenter', (ev) => mostrarTip(n, ev)); grp.addEventListener('mouseleave', esconderTip)
    grp.addEventListener('focus', (ev) => mostrarTip(n, ev)); grp.addEventListener('blur', esconderTip)
    g.append(grp)
    return grp
  }
  function renderMapa() {
    mundo.innerHTML = ''
    const foco = no(estado.focoId) ?? arvore.raiz
    const filhos = foco.children.filter(passa)
    const pos = layoutFoco(foco, filhos)
    posicoes = [...pos.values()]
    const ga = sv('g', { class: 'arestas' }), gf = sv('g', { class: 'filhos' })
    mundo.append(ga, gf)
    const pc = pos.get(foco.id)!
    filhos.forEach((f) => { const p = pos.get(f.id)!; const a = sv('path', { class: 'aresta' + (f.type === 'system' ? ' sis' : ''), d: curva(pc, p) }); if (f.type === 'system' && f.system) (a as SVGElement).style.stroke = COR_DO_SISTEMA[f.system]; else if (foco.system) (a as SVGElement).style.stroke = `color-mix(in srgb, ${COR_DO_SISTEMA[foco.system]} 45%, var(--mapa-line-3))`; ga.append(a) })
    desenharNo(foco, pc, true, gf)
    filhos.forEach((f, i) => { const g = desenharNo(f, pos.get(f.id)!, false, gf); (g as SVGElement).style.animationDelay = `${Math.min(i * 18, 260)}ms` })
    avisoVazio.style.display = 'none'
    if (!filhos.length) { avisoVazio.textContent = foco.children.length ? 'Nenhum item corresponde aos filtros selecionados.' : 'Nenhum item cadastrado nesta área.'; avisoVazio.style.display = 'block' }
    renderMinimap()
  }

  // ---------- Visão completa ----------
  function renderCompleta() {
    mundo.innerHTML = ''
    const ALTL = 30, COL = 240
    const alt = new Map<string, number>()
    const visivel = (n: No) => passa(n) && (n.type !== 'item' || vista.k >= 0.45)
    const medir = (n: No): number => { const kids = n.children.filter(visivel); const a = kids.length ? kids.reduce((s, f) => s + medir(f), 0) : ALTL + 6; alt.set(n.id, a); return a }
    const pos = new Map<string, Pos>()
    const posi = (n: No, x: number, yTopo: number, lado: number) => { const a = alt.get(n.id) ?? ALTL; pos.set(n.id, { x, y: yTopo + a / 2, w: n.type === 'item' ? 200 : 220, h: ALTL - 4, lado }); let y = yTopo; for (const f of n.children.filter(visivel)) { posi(f, x + lado * COL, y, lado); y += alt.get(f.id) ?? ALTL } }
    const sistemas = arvore.raiz.children.filter(passa)
    sistemas.forEach(medir)
    const dir = sistemas.filter((s) => s.system === 'palacio'), esq = sistemas.filter((s) => s.system !== 'palacio')
    const altDir = dir.reduce((s, x) => s + (alt.get(x.id) ?? 0), 0), altEsq = esq.reduce((s, x) => s + (alt.get(x.id) ?? 0), 0)
    pos.set('inicio', { x: 0, y: 0, w: 220, h: 40, lado: 0 })
    let y = -altDir / 2; for (const s of dir) { posi(s, COL, y, 1); y += alt.get(s.id) ?? 0 }
    y = -altEsq / 2; for (const s of esq) { posi(s, -COL, y, -1); y += alt.get(s.id) ?? 0 }
    posicoes = [...pos.values()]
    const ga = sv('g', {}), gn = sv('g', {}); mundo.append(ga, gn)
    const lod = vista.k < 0.3 ? 0 : vista.k < 0.6 ? 1 : 2
    const walk = (n: No) => {
      const p = pos.get(n.id); if (!p) return
      for (const f of n.children.filter(visivel)) { const q = pos.get(f.id); if (!q) continue; const a = sv('path', { class: 'aresta', d: curva(p, q) }); if (f.system) (a as SVGElement).style.stroke = `color-mix(in srgb, ${COR_DO_SISTEMA[f.system]} 40%, var(--mapa-line-3))`; ga.append(a); walk(f) }
      const g = sv('g', { class: `no ${n.type}${n.type === 'root' ? ' raiz' : ''}`, tabindex: '0', role: 'button', 'aria-label': n.name, transform: `translate(${p.x},${p.y})` })
      const caixa = sv('rect', { class: 'caixa', x: -p.w / 2, y: -p.h / 2, width: p.w, height: p.h, rx: 7 }); if (n.type === 'system' && n.system) (caixa as SVGElement).style.stroke = COR_DO_SISTEMA[n.system]; g.append(caixa)
      if (lod >= 1 || n.type !== 'item') {
        let tx = -p.w / 2 + 10
        if (n.type === 'item' && n.status) { g.append(sv('circle', { class: 'ponto', cx: tx + 4, cy: 0, r: 4, fill: COR_DA_SITUACAO[n.status] })); tx += 14 }
        if (lod === 2 || n.type !== 'item') { const t = sv('text', { class: 'nome', x: tx, y: 0 }); t.textContent = n.name.length > 26 ? n.name.slice(0, 25) + '…' : n.name; g.append(t) }
        if (n.type !== 'item') { const c = sv('text', { class: 'seta', x: p.w / 2 - 8, y: 0, 'text-anchor': 'end' }); c.textContent = String(n.total); g.append(c) }
      }
      g.addEventListener('click', (ev) => { ev.stopPropagation(); if (n.type === 'item') abrirDrawer(n); else { estado.completa = false; irPara(n.id) } })
      g.addEventListener('mouseenter', (ev) => mostrarTip(n, ev)); g.addEventListener('mouseleave', esconderTip)
      gn.append(g)
    }
    walk(arvore.raiz)
    renderMinimap()
  }

  // ---------- Pan, zoom, minimap ----------
  function aplicarVista(anim: boolean) { mundo.classList.toggle('sem-anim', !anim); mundo.setAttribute('transform', `translate(${vista.x},${vista.y}) scale(${vista.k})`); guardar('zoom', vista.k); renderMinimap() }
  function limites() { if (!posicoes.length) return { x0: -200, y0: -100, x1: 200, y1: 100 }; let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity; for (const p of posicoes) { x0 = Math.min(x0, p.x - p.w / 2); x1 = Math.max(x1, p.x + p.w / 2); y0 = Math.min(y0, p.y - p.h / 2); y1 = Math.max(y1, p.y + p.h / 2) } return { x0, y0, x1, y1 } }
  function centralizar(anim: boolean) {
    const r = palco.getBoundingClientRect(); const topo = 56
    const b = limites(); const lw = b.x1 - b.x0 + 120, lh = b.y1 - b.y0 + 120
    const k = estado.completa ? Math.max(0.2, Math.min(1, Math.min(r.width / lw, (r.height - topo) / lh))) : Math.max(0.45, Math.min(1.1, Math.min(r.width / lw, (r.height - topo) / lh)))
    vista = { k, x: r.width / 2 - k * (b.x0 + b.x1) / 2, y: topo + (r.height - topo) / 2 - k * (b.y0 + b.y1) / 2 }
    aplicarVista(anim)
    if (estado.completa) renderCompleta()
  }
  let arrasto: { x: number; y: number; vx: number; vy: number } | null = null, moveu = false
  ouvir(palco, 'pointerdown', (ev) => { const e = ev as PointerEvent; if ((e.target as Element).closest('.no')) return; arrasto = { x: e.clientX, y: e.clientY, vx: vista.x, vy: vista.y }; moveu = false; palco.classList.add('arrastando'); palco.setPointerCapture(e.pointerId) })
  ouvir(palco, 'pointermove', (ev) => { if (!arrasto) return; const e = ev as PointerEvent; vista.x = arrasto.vx + (e.clientX - arrasto.x); vista.y = arrasto.vy + (e.clientY - arrasto.y); moveu = true; aplicarVista(false) })
  const soltar = () => { arrasto = null; palco.classList.remove('arrastando') }
  ouvir(palco, 'pointerup', soltar); ouvir(palco, 'pointercancel', soltar)
  ouvir(palco, 'click', (ev) => { if (!(ev.target as Element).closest('.no') && !moveu) fecharDrawer() })
  function zoomEm(f: number, px?: number, py?: number) { const r = palco.getBoundingClientRect(); px = px ?? r.width / 2; py = py ?? r.height / 2; const k = Math.min(3, Math.max(0.15, vista.k * f)); vista.x = px - (px - vista.x) * (k / vista.k); vista.y = py - (py - vista.y) * (k / vista.k); const lodAntes = vista.k < 0.3 ? 0 : vista.k < 0.6 ? 1 : 2; vista.k = k; aplicarVista(false); if (estado.completa && (k < 0.3 ? 0 : k < 0.6 ? 1 : 2) !== lodAntes) renderCompleta() }
  ouvir(palco, 'wheel', (ev) => { const e = ev as WheelEvent; e.preventDefault(); const r = palco.getBoundingClientRect(); zoomEm(e.deltaY < 0 ? 1.12 : 1 / 1.12, e.clientX - r.left, e.clientY - r.top) }, { passive: false })
  let pinca: { d: number; k: number } | null = null
  ouvir(palco, 'touchstart', (ev) => { const e = ev as TouchEvent; if (e.touches.length === 2) pinca = { d: Math.hypot(e.touches[0].clientX - e.touches[1].clientX, e.touches[0].clientY - e.touches[1].clientY), k: vista.k } }, { passive: true })
  ouvir(palco, 'touchmove', (ev) => { const e = ev as TouchEvent; if (pinca && e.touches.length === 2) { const d = Math.hypot(e.touches[0].clientX - e.touches[1].clientX, e.touches[0].clientY - e.touches[1].clientY); vista.k = Math.min(3, Math.max(0.15, (pinca.k * d) / pinca.d)); aplicarVista(false) } }, { passive: true })
  ouvir(palco, 'touchend', () => { pinca = null })
  ouvir($('[data-papel="z-mais"]'), 'click', () => zoomEm(1.25)); ouvir($('[data-papel="z-menos"]'), 'click', () => zoomEm(1 / 1.25))
  ouvir($('[data-papel="z-centro"]'), 'click', () => centralizar(true)); ouvir($('[data-papel="z-inicio"]'), 'click', () => irPara('inicio'))
  let miniMapa: { X0: number; Y0: number; esc: number; ox: number; oy: number } | null = null
  function renderMinimap() {
    if (estado.modo !== 'mapa' || (estado.focoId === 'inicio' && !estado.completa) || window.innerWidth < 720) { mini.hidden = true; return }
    mini.hidden = false
    const b = limites(); const r = palco.getBoundingClientRect()
    const vx0 = -vista.x / vista.k, vy0 = -vista.y / vista.k, vx1 = (r.width - vista.x) / vista.k, vy1 = (r.height - vista.y) / vista.k
    const X0 = Math.min(b.x0, vx0), Y0 = Math.min(b.y0, vy0), X1 = Math.max(b.x1, vx1), Y1 = Math.max(b.y1, vy1)
    const esc = Math.min(170 / (X1 - X0), 110 / (Y1 - Y0)); const ox = (180 - (X1 - X0) * esc) / 2, oy = (120 - (Y1 - Y0) * esc) / 2
    miniSvg.innerHTML = ''
    for (const p of posicoes) miniSvg.append(sv('rect', { class: 'n', x: ox + (p.x - p.w / 2 - X0) * esc, y: oy + (p.y - p.h / 2 - Y0) * esc, width: Math.max(2, p.w * esc), height: Math.max(1.5, p.h * esc), rx: 1 }))
    miniSvg.append(sv('rect', { class: 'v', x: ox + (vx0 - X0) * esc, y: oy + (vy0 - Y0) * esc, width: (vx1 - vx0) * esc, height: (vy1 - vy0) * esc }))
    miniMapa = { X0, Y0, esc, ox, oy }
  }
  let miniArrasto = false
  const miniIr = (ev: PointerEvent) => { const m = miniMapa; if (!m) return; const rr = mini.getBoundingClientRect(); const mx = (ev.clientX - rr.left) * (180 / rr.width), my = (ev.clientY - rr.top) * (120 / rr.height); const wx = (mx - m.ox) / m.esc + m.X0, wy = (my - m.oy) / m.esc + m.Y0; const r = palco.getBoundingClientRect(); vista.x = r.width / 2 - wx * vista.k; vista.y = r.height / 2 - wy * vista.k; aplicarVista(false) }
  ouvir(mini, 'pointerdown', (ev) => { const e = ev as PointerEvent; mini.setPointerCapture(e.pointerId); miniIr(e); miniArrasto = true })
  ouvir(mini, 'pointermove', (ev) => { if (miniArrasto) miniIr(ev as PointerEvent) })
  ouvir(mini, 'pointerup', () => { miniArrasto = false }); ouvir(mini, 'pointercancel', () => { miniArrasto = false })

  // ---------- Tooltip ----------
  function mostrarTip(n: No, ev: Event) {
    tip.innerHTML = ''
    tip.append(h('b', null, n.name))
    if (n.type === 'item' && n.status) tip.append(h('div', { class: 's' }, h('span', { class: `dot ${n.status}` }), ROTULO_DA_SITUACAO[n.status]))
    else tip.append(h('div', { class: 's' }, `${n.total} recursos · ${n.counts.live} no ar (${pct(n)}%)`))
    if (n.pend) tip.append(h('div', { class: 's pend' }, `⚠ ${n.pend} pendências`))
    tip.hidden = false
    const alvo = ev.currentTarget as Element
    const r = alvo.getBoundingClientRect(), m = moldura.getBoundingClientRect()
    const x = Math.min(m.width - 280, Math.max(8, r.left - m.left)); const y = r.bottom - m.top + 8 > m.height - 90 ? r.top - m.top - tip.offsetHeight - 8 : r.bottom - m.top + 8
    tip.style.left = `${x}px`; tip.style.top = `${y}px`
  }
  const esconderTip = () => { tip.hidden = true }

  // ---------- Painel lateral ----------
  function relacoes(n: No): No[] {
    const t = norm(n.name + ' ' + n.description)
    const chaves = ['matricula', 'certificado', 'horario', 'conversoes', 'pixel', 'acervo', 'verific', 'ponto', 'escola', 'palacio', 'noticias', 'whatsapp']
    const out: No[] = []
    for (const s of arvore.raiz.children) { if (s.system === n.system) continue; for (const c of s.children) for (const it of c.children) { const tn = norm(it.name); if (chaves.some((k) => t.includes(k) && tn.includes(k))) out.push(it) } }
    return out.slice(0, 6)
  }
  function abrirDrawer(n: No) {
    estado.painelId = n.id
    drawer.innerHTML = ''
    const sis = sistemaDe(n); const cad = caminho(n)
    const cab = h('div', { class: 'cab' }, h('h2', null, n.name), h('button', { class: 'fechar', type: 'button', 'aria-label': 'Fechar', onclick: fecharDrawer }, '×'))
    const corpo = h('div', { class: 'corpo-painel' })
    const camEl = h('span', { class: 'cam' }); cad.slice(1).forEach((c, i) => { if (i) camEl.append(' › '); camEl.append(h('button', { type: 'button', onclick: () => irPara(c.id) }, c.type === 'system' && c.system ? NOME_DO_SISTEMA[c.system].curto : c.name)) })
    const lin = h('div', { class: 'lin' })
    if (n.type === 'item' && n.status) {
      if (opcoes.podeEditar) {
        const sel = h('select', { 'aria-label': 'Estado do item', onchange: async (ev: Event) => { const el = ev.target as HTMLSelectElement; el.disabled = true; const erro = await opcoes.aoMudarEstado(n.id, el.value as Estado); el.disabled = false; if (erro) avisar(erro) } }) as HTMLSelectElement
        for (const e of ESTADOS) { const o = h('option', { value: e }, ROTULO_DA_SITUACAO[SITUACAO_DO_ESTADO[e]]) as HTMLOptionElement; o.selected = e === n.estado; sel.append(o) }
        lin.append(h('b', null, 'Estado'), h('span', { class: 'status' }, h('span', { class: `dot ${n.status}` }), sel))
      } else lin.append(h('b', null, 'Estado'), h('span', { class: 'status' }, h('span', { class: `dot ${n.status}` }), ROTULO_DA_SITUACAO[n.status]))
    } else lin.append(h('b', null, 'Estado'), composicao(n))
    if (sis && n.system) lin.append(h('b', null, 'Sistema'), h('span', null, h('span', { class: 'sis', style: { background: COR_DO_SISTEMA[n.system] } }), sis.nome))
    if (cad.length > 2) lin.append(h('b', null, 'Área'), h('span', null, cad[2].name))
    lin.append(h('b', null, 'Caminho'), camEl)
    if (n.updatedAt) lin.append(h('b', null, 'Última entrega'), h('span', null, dataCurta(n.updatedAt)))
    corpo.append(lin)
    if (n.description) corpo.append(h('h3', null, 'Descrição'), h('p', null, n.description))
    if (n.statusDetail && n.status !== 'live') corpo.append(h('h3', null, 'O que falta para ligar'), h('p', { class: 'pend' }, n.statusDetail))
    if (n.type !== 'item') corpo.append(h('h3', null, 'Composição'), h('div', null, barra(n), h('p', { style: { marginTop: '6px' } }, `${n.counts.live} de ${n.total} no ar · ${pct(n)}%`)))
    const abertas = n.pendencias.filter((p) => p.situacao !== 'feito'), feitas = n.pendencias.filter((p) => p.situacao === 'feito')
    const cartaoPend = (p: PendenciaDoMapa) => {
      const pos = posNaFila(p.id)
      const caixa = opcoes.podeEditar ? h('input', { type: 'checkbox', 'aria-label': `Marcar como resolvida: ${p.titulo}`, onchange: async (ev: Event) => { const el = ev.target as HTMLInputElement; el.disabled = true; const erro = await opcoes.aoMarcarPendencia(p.id, el.checked ? 'feito' : 'pendente'); el.disabled = false; if (erro) { el.checked = !el.checked; avisar(erro) } } }) as HTMLInputElement : null
      if (caixa) caixa.checked = p.situacao === 'feito'
      return h('div', { class: `p${p.situacao === 'feito' ? ' feita' : ''}` }, caixa, h('div', { class: 'tx' }, h('div', { class: 'ti' }, p.titulo), h('div', { class: 'm' }, p.detalhe.length > 180 ? p.detalhe.slice(0, 179) + '…' : p.detalhe), p.o_que_falta && p.situacao === 'parcial' ? h('div', { class: 'm pend' }, p.o_que_falta) : null, h('div', { class: 'k' }, `${p.id} · ${ROTULO_DO_TIPO[p.tipo] ?? p.tipo}${p.prioridade ? ' · ' + p.prioridade : ''}${pos ? ' · #' + pos + ' na fila' : ''}${p.situacao === 'parcial' ? ' · parte feita' : ''}`)))
    }
    if (abertas.length) corpo.append(h('h3', null, `Pendências ligadas (${abertas.length})`), h('div', { class: 'pends' }, abertas.map(cartaoPend)))
    if (feitas.length) corpo.append(h('details', { class: 'feitas' }, h('summary', null, `Resolvidas (${feitas.length})`), h('div', { class: 'pends' }, feitas.map(cartaoPend))))
    const rel = relacoes(n); if (rel.length) corpo.append(h('h3', null, 'Integrações'), h('div', { class: 'pends' }, rel.map((r) => h('button', { class: 'p link', type: 'button', onclick: () => irPara(r.id) }, `→ ${r.system ? NOME_DO_SISTEMA[r.system].curto : ''} › ${caminho(r).slice(2).map((c) => c.name).join(' › ')}`))))
    if (n.entregas.length) corpo.append(h('h3', null, `Entregas (${n.entregas.length})`), h('div', { class: 'entregas' }, [...n.entregas].sort((a, b) => b.data.localeCompare(a.data)).map((e) => h('div', { class: 'e' }, h('span', { class: 'd' }, dataCurta(e.data)), h('div', null, h('div', null, e.titulo), e.detalhe ? h('div', { class: 'x' }, e.detalhe) : null)))))
    if (n.type === 'item' && !n.entregas.length) corpo.append(h('p', null, 'Esta área já existia antes do período levantado e não mudou nele.'))
    if (n.url) corpo.append(h('h3', null, 'Links'), h('div', { class: 'links' }, h('a', { class: 'btn', href: n.url, target: '_blank', rel: 'noopener' }, '↗ Abrir')))
    if (!opcoes.podeEditar) corpo.append(h('p', { class: 'aviso-rel' }, 'Para marcar pendências e mudar o estado, é preciso a permissão “Atualizar o mapa do ecossistema”.'))
    drawer.append(cab, corpo); drawer.classList.add('aberto')
  }
  function fecharDrawer() { drawer.classList.remove('aberto'); estado.painelId = null }
  function avisar(texto: string) { const el = h('div', { class: 'aviso', role: 'alert' }, texto); drawer.prepend(el); setTimeout(() => el.remove(), 4000) }

  // ---------- Busca / paleta ----------
  let indice: { n: No; texto: string }[] = []
  const reindexar = () => { indice = [...arvore.porId.values()].filter((n) => n.type !== 'root').map((n) => ({ n, texto: norm(n.name + ' ' + n.description + ' ' + caminho(n).map((c) => c.name).join(' ')) })) }
  reindexar()
  let selIdx = 0, resultados: No[] = []
  function abrirPaleta() { paleta.classList.add('aberta'); pInput.value = ''; buscar(''); setTimeout(() => pInput.focus(), 10) }
  function fecharPaleta() { paleta.classList.remove('aberta') }
  function buscar(q: string) {
    const t = norm(q.trim())
    resultados = !t ? indice.filter((x) => x.n.type !== 'item').slice(0, 12).map((x) => x.n) : indice.filter((x) => x.texto.includes(t)).sort((a, b) => (norm(a.n.name).includes(t) ? 0 : 1) - (norm(b.n.name).includes(t) ? 0 : 1) || a.n.name.localeCompare(b.n.name, 'pt-BR')).slice(0, 40).map((x) => x.n)
    selIdx = 0; renderRes()
  }
  function renderRes() {
    pRes.innerHTML = ''
    if (!resultados.length) { pRes.append(h('div', { class: 'vazio' }, 'Nenhum resultado encontrado.')); return }
    resultados.forEach((n, i) => {
      const cad = caminho(n).slice(1, -1).map((c) => (c.type === 'system' && c.system ? NOME_DO_SISTEMA[c.system].curto : c.name)).join(' › ')
      pRes.append(h('button', { class: 'r', type: 'button', role: 'option', 'aria-selected': String(i === selIdx), onclick: () => { fecharPaleta(); irPara(n.id) }, onmousemove: () => { selIdx = i; Array.from(pRes.children).forEach((c, j) => c.setAttribute('aria-selected', String(j === i))) } },
        h('span', { class: 'sis', style: { background: n.system ? COR_DO_SISTEMA[n.system] : 'var(--mapa-line-3)' } }),
        h('span', null, h('div', { class: 'cam' }, cad || 'Início'), h('div', { class: 'nome' }, n.type === 'item' && n.status ? h('span', null, h('span', { class: `dot ${n.status}`, style: { marginRight: '6px' } }), n.name) : n.name)),
        h('span', { class: 'tipo' }, n.type === 'system' ? 'sistema' : n.type === 'category' ? 'área' : 'módulo')))
    })
  }
  ouvir(pInput, 'input', () => buscar(pInput.value))
  ouvir(pInput, 'keydown', (ev) => { const e = ev as KeyboardEvent; if (e.key === 'ArrowDown') { e.preventDefault(); selIdx = Math.min(resultados.length - 1, selIdx + 1) } else if (e.key === 'ArrowUp') { e.preventDefault(); selIdx = Math.max(0, selIdx - 1) } else if (e.key === 'Enter') { e.preventDefault(); if (resultados[selIdx]) { fecharPaleta(); irPara(resultados[selIdx].id) } return } else return; Array.from(pRes.children).forEach((c, j) => { c.setAttribute('aria-selected', String(j === selIdx)); if (j === selIdx) (c as HTMLElement).scrollIntoView({ block: 'nearest' }) }) })
  ouvir(paleta, 'click', (ev) => { if (ev.target === paleta) fecharPaleta() })
  ouvir($('[data-papel="abrir-busca"]'), 'click', abrirPaleta)

  // ---------- Modo, menus, atalhos ----------
  function setModo(m: Modo) { estado.modo = m; guardar('modo', m); btnMapa.setAttribute('aria-pressed', String(m === 'mapa')); btnLista.setAttribute('aria-pressed', String(m === 'lista')); renderTudo(); if (m === 'mapa') centralizar(false) }
  ouvir(btnMapa, 'click', () => setModo('mapa')); ouvir(btnLista, 'click', () => setModo('lista'))
  ouvir($('[data-papel="ir-inicio"]'), 'click', () => { estado.completa = false; irPara('inicio') })
  ouvir(btnMais, 'click', (ev) => { ev.stopPropagation(); pop.hidden = !pop.hidden; btnMais.setAttribute('aria-expanded', String(!pop.hidden)) })
  ouvir(document, 'click', (ev) => { const alvo = ev.target as Element; if (!alvo.closest('[data-papel="menu-opcoes"]')) { pop.hidden = true; btnMais.setAttribute('aria-expanded', 'false') } if (!alvo.closest('[data-papel="legenda"]')) { popLegenda.hidden = true; btnLegenda.setAttribute('aria-expanded', 'false') } })
  ouvir($('[data-papel="op-completa"]'), 'click', () => { pop.hidden = true; estado.completa = true; estado.modo = 'mapa'; btnMapa.setAttribute('aria-pressed', 'true'); btnLista.setAttribute('aria-pressed', 'false'); renderTudo(); centralizar(false) })
  ouvir(btnLegenda, 'click', (ev) => { ev.stopPropagation(); popLegenda.hidden = !popLegenda.hidden; btnLegenda.setAttribute('aria-expanded', String(!popLegenda.hidden)) })
  ouvir(document, 'keydown', (ev) => {
    const e = ev as KeyboardEvent
    const ativo = document.activeElement as HTMLElement | null
    const emCampo = !!ativo && /INPUT|SELECT|TEXTAREA/.test(ativo.tagName) && ativo !== pInput
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); if (paleta.classList.contains('aberta')) fecharPaleta(); else abrirPaleta(); return }
    if (e.key === 'Escape') { if (paleta.classList.contains('aberta')) { fecharPaleta(); return } if (!pop.hidden) { pop.hidden = true; return } if (drawer.classList.contains('aberto')) { fecharDrawer(); return } if (estado.completa) { estado.completa = false; renderTudo(); centralizar(true); return } if (estado.focoId !== 'inicio') voltar(); return }
    if (emCampo || !moldura.contains(ativo) && ativo !== document.body) return
    if (e.key === 'Home') { e.preventDefault(); estado.completa = false; irPara('inicio') }
    else if (e.key === '+' || e.key === '=') zoomEm(1.25); else if (e.key === '-') zoomEm(1 / 1.25)
  })

  // ---------- Render geral ----------
  function renderTudo() {
    esconderTip(); renderFiltros(); renderTrilha()
    const naRaiz = estado.focoId === 'inicio' && !estado.completa
    geral.classList.toggle('ativa', naRaiz)
    palco.hidden = naRaiz || estado.modo !== 'mapa'
    lista.classList.toggle('ativa', !naRaiz && estado.modo === 'lista')
    controles.style.display = !naRaiz && estado.modo === 'mapa' ? '' : 'none'
    trilha.style.display = naRaiz ? 'none' : ''
    avisoVazio.style.display = 'none'
    if (naRaiz) { renderGeral(); mini.hidden = true } else if (estado.modo === 'lista') { renderLista(); mini.hidden = true } else if (estado.completa) renderCompleta(); else renderMapa()
  }
  const aoRedimensionar = () => { if (estado.modo === 'mapa' && !palco.hidden) centralizar(false) }
  ouvir(window, 'resize', aoRedimensionar)
  btnMapa.setAttribute('aria-pressed', String(estado.modo === 'mapa')); btnLista.setAttribute('aria-pressed', String(estado.modo === 'lista'))
  lerHash()
  if (estado.modo === 'mapa' && !palco.hidden) centralizar(false)

  return {
    atualizar(dados) {
      arvore = montarArvore(dados.itens, dados.pendencias)
      fila = filaDeProximos(dados.pendencias)
      reindexar()
      if (!no(estado.focoId)) estado.focoId = 'inicio'
      renderTudo()
      const aberto = estado.painelId ? no(estado.painelId) : null
      if (aberto) abrirDrawer(aberto); else fecharDrawer()
    },
    destruir() { for (const l of limpezas) l(); mundo.innerHTML = ''; geral.innerHTML = ''; lista.innerHTML = ''; drawer.innerHTML = '' },
  }
}
