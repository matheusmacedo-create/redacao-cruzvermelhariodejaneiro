import type { Robo } from './tipos'

/**
 * O robô que faz a tarefa na tela durante a gravação (docs/AJUDA.md §14): leva um cursor desenhado até cada botão,
 * mostra o clique, contorna o que a voz está explicando e digita como uma pessoa. O Playwright não grava o cursor
 * do sistema; o desenhado (e o círculo do clique) vem do SCRIPT_DA_TELA, posto em cada página antes do app.
 *
 * O que roda dentro da página vai como expressão em texto (window.__v…) ou como função anônima de uma linha: o tsx
 * embrulha funções com nome em `__name`, que a página não conhece.
 */

/** O pedaço do Playwright que o robô usa (o pacote vem de fora do projeto: ver gravar.ts). */
export type Caixa = { x: number; y: number; width: number; height: number }
export interface LocalizadorPw {
  first(): LocalizadorPw
  waitFor(o: { state: 'visible' | 'attached'; timeout?: number }): Promise<void>
  boundingBox(): Promise<Caixa | null>
  evaluate<R>(funcao: (el: Element) => R): Promise<R>
  selectOption(o: { label: string }): Promise<string[]>
  fill(valor: string): Promise<void>
}
export interface PaginaPw {
  goto(url: string, o?: { waitUntil?: 'load' | 'domcontentloaded' | 'networkidle' }): Promise<unknown>
  waitForLoadState(estado: 'load' | 'domcontentloaded' | 'networkidle', o?: { timeout?: number }): Promise<void>
  waitForTimeout(ms: number): Promise<void>
  waitForURL(teste: (url: URL) => boolean, o?: { timeout?: number; waitUntil?: 'commit' | 'load' }): Promise<void>
  locator(seletor: string): LocalizadorPw
  evaluate(expressao: string): Promise<unknown>
  url(): string
  mouse: { move(x: number, y: number): Promise<void>; down(): Promise<void>; up(): Promise<void> }
  keyboard: { type(texto: string, o?: { delay?: number }): Promise<void> }
}

/** O cursor, o clique, o destaque e os cartões, dentro da página. Fica acima de tudo e não recebe clique. */
export const SCRIPT_DA_TELA = String.raw`
(() => {
  if (window.__v) return;
  const estado = { x: -100, y: -100, visivel: true };
  let raiz = null, cursor = null, destaque = null, cartao = null;
  const estilo = document.createElement('style');
  // A dica "Primeira vez em…? Fazer o tour" não entra no vídeo: ela é da primeira visita de quem assiste.
  estilo.textContent = '[aria-label="Dica de primeira visita"]{display:none!important}';
  function montar() {
    if (raiz && raiz.isConnected) return true;
    if (!document.body) return false;
    if (!estilo.isConnected) document.head.appendChild(estilo);
    raiz = document.createElement('div');
    raiz.setAttribute('aria-hidden', 'true');
    raiz.style.cssText = 'position:fixed;inset:0;pointer-events:none;z-index:2147483647;font-family:' + getComputedStyle(document.body).fontFamily;
    destaque = document.createElement('div');
    destaque.style.cssText = 'position:fixed;left:0;top:0;width:0;height:0;border:3px solid #c8102e;border-radius:12px;box-shadow:0 0 0 6px rgba(200,16,46,.16);opacity:0;transition:opacity .25s,left .35s,top .35s,width .35s,height .35s';
    cursor = document.createElement('div');
    cursor.style.cssText = 'position:fixed;left:0;top:0;width:30px;height:30px;will-change:transform;filter:drop-shadow(0 1px 2px rgba(0,0,0,.45))';
    cursor.innerHTML = '<svg viewBox="0 0 30 30" width="30" height="30"><path d="M5 3 L5 24 L10.6 18.8 L14.4 27.2 L18.2 25.6 L14.6 17.6 L22.4 17.6 Z" fill="#141414" stroke="#fff" stroke-width="1.7" stroke-linejoin="round"/></svg>';
    raiz.append(destaque, cursor);
    document.body.appendChild(raiz);
    mover(estado.x, estado.y);
    return true;
  }
  function mover(x, y) {
    estado.x = x; estado.y = y;
    if (cursor) { cursor.style.transform = 'translate(' + (x - 5) + 'px,' + (y - 3) + 'px)'; cursor.style.opacity = estado.visivel ? '1' : '0'; }
  }
  function clique(x, y) {
    if (!montar()) return;
    const c = document.createElement('div');
    c.style.cssText = 'position:fixed;left:' + (x - 24) + 'px;top:' + (y - 24) + 'px;width:48px;height:48px;border-radius:50%;background:rgba(200,16,46,.32);border:2px solid rgba(200,16,46,.7);transform:scale(.25);opacity:1;transition:transform .5s ease-out,opacity .5s ease-out';
    raiz.insertBefore(c, cursor);
    requestAnimationFrame(() => requestAnimationFrame(() => { c.style.transform = 'scale(1)'; c.style.opacity = '0'; }));
    setTimeout(() => c.remove(), 700);
  }
  window.addEventListener('mousemove', (e) => { montar(); mover(e.clientX, e.clientY); }, true);
  window.addEventListener('mousedown', (e) => clique(e.clientX, e.clientY), true);
  window.__v = {
    cursor(x, y) { montar(); mover(x, y); },
    cursorVisivel(sim) { estado.visivel = !!sim; montar(); mover(estado.x, estado.y); },
    destacar(x, y, w, h) {
      if (!montar()) return;
      const f = 6;
      Object.assign(destaque.style, { left: (x - f) + 'px', top: (y - f) + 'px', width: (w + 2 * f) + 'px', height: (h + 2 * f) + 'px', opacity: '1' });
    },
    apagar() { if (destaque) destaque.style.opacity = '0'; },
    cartao(rotulo, titulo, subtitulo) {
      if (!montar()) return;
      if (cartao) cartao.remove();
      cartao = document.createElement('div');
      cartao.style.cssText = 'position:fixed;inset:0;background:#fbfaf9;display:flex;align-items:center;justify-content:center;opacity:1;transition:opacity .35s';
      const caixa = document.createElement('div');
      caixa.style.cssText = 'width:min(1000px,84vw)';
      const topo = document.createElement('div');
      topo.style.cssText = 'display:flex;align-items:center;gap:14px;color:#9e0b23;font-weight:700;letter-spacing:.12em;text-transform:uppercase;font-size:15px';
      const logo = document.createElement('img');
      logo.src = '/images/palacio-virtual.png'; logo.width = 46; logo.height = 46; logo.style.borderRadius = '50%';
      const nome = document.createElement('span'); nome.textContent = rotulo;
      topo.append(logo, nome);
      const barra = document.createElement('div');
      barra.style.cssText = 'height:5px;width:76px;background:#c8102e;border-radius:3px;margin:28px 0 24px';
      const t = document.createElement('div');
      t.style.cssText = 'font-size:58px;line-height:1.05;font-weight:700;color:#1d1b1b;letter-spacing:-.015em;text-wrap:balance';
      t.textContent = titulo;
      const s = document.createElement('div');
      s.style.cssText = 'margin-top:20px;font-size:23px;line-height:1.4;color:#5d5655;max-width:46ch';
      s.textContent = subtitulo || '';
      caixa.append(topo, barra, t, s);
      cartao.appendChild(caixa);
      raiz.insertBefore(cartao, destaque);
    },
    tirarCartao() { if (!cartao) return; const c = cartao; cartao = null; c.style.opacity = '0'; setTimeout(() => c.remove(), 400); },
  };
  document.addEventListener('DOMContentLoaded', montar);
  window.addEventListener('load', montar);
})();
`

const esperar = (ms: number) => new Promise((ok) => setTimeout(ok, ms))
/** Na tela de 1280×720: abaixo do topo fixo do Palácio e acima da borda de baixo do conteúdo. */
const AREA_UTIL = { topo: 80, base: 690 }
/** Devagar no começo e no fim, como a mão de uma pessoa. */
const suave = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2)

export class RoboDoPalacio implements Robo {
  private x = 1040
  private y = 560

  constructor(private readonly pagina: PaginaPw, private readonly base: string) {}

  /** Uma expressão dentro da página; se a página estiver trocando, não faz nada. */
  private js(expressao: string) {
    return this.pagina.evaluate(expressao).catch(() => undefined)
  }

  async assentar(ms = 900) {
    await this.pagina.waitForLoadState('networkidle', { timeout: 7000 }).catch(() => undefined)
    await this.pagina.waitForTimeout(ms)
    await this.js(`window.__v && window.__v.cursor(${this.x}, ${this.y})`)
  }

  async ir(rota: string) {
    await this.pagina.goto(this.base + rota, { waitUntil: 'domcontentloaded' })
    await this.assentar()
  }

  async cartao(rotulo: string, titulo: string, subtitulo: string) {
    await this.js(`window.__v.cursorVisivel(false); window.__v.cartao(${JSON.stringify(rotulo)}, ${JSON.stringify(titulo)}, ${JSON.stringify(subtitulo)})`)
  }

  async tirarCartao() {
    await this.js('window.__v.tirarCartao(); window.__v.cursorVisivel(true)')
    await esperar(450)
  }

  private async moverPara(x: number, y: number) {
    const de = { x: this.x, y: this.y }
    const distancia = Math.hypot(x - de.x, y - de.y)
    const duracao = Math.min(1100, Math.max(380, distancia * 1.15))
    const passos = Math.max(10, Math.round(duracao / 18))
    for (let i = 1; i <= passos; i++) {
      const t = suave(i / passos)
      await this.pagina.mouse.move(de.x + (x - de.x) * t, de.y + (y - de.y) * t)
      await esperar(12)
    }
    this.x = x
    this.y = y
  }

  /**
   * A caixa do alvo na tela. Se ele está fora da área útil (abaixo do topo fixo, acima da borda de baixo), a tela rola
   * devagar até ele ficar no meio, como uma pessoa faria.
   */
  private async caixa(alvo: string): Promise<Caixa> {
    const l = this.pagina.locator(alvo).first()
    await l.waitFor({ state: 'visible', timeout: 15_000 })
    let c = await l.boundingBox()
    if (!c) throw new Error(`O alvo "${alvo}" não está na tela.`)
    const foraDaVista = c.y < AREA_UTIL.topo || c.y + Math.min(c.height, 140) > AREA_UTIL.base
    if (foraDaVista) {
      await l.evaluate((el) => el.scrollIntoView({ behavior: 'smooth', block: 'center' }))
      await esperar(850)
      c = await l.boundingBox()
      if (!c) throw new Error(`O alvo "${alvo}" não está na tela.`)
    }
    return c
  }

  async apontar(alvo: string) {
    const c = await this.caixa(alvo)
    await this.moverPara(c.x + Math.min(c.width / 2, 120), c.y + Math.min(c.height / 2, 22))
  }

  async clicar(alvo: string, opcoes: { navega?: boolean; depois?: number } = {}) {
    await this.apontar(alvo)
    await esperar(180)
    const antes = this.pagina.url()
    await this.pagina.mouse.down()
    await esperar(80)
    await this.pagina.mouse.up()
    if (opcoes.navega) {
      await this.pagina.waitForURL((u) => u.toString() !== antes, { timeout: 20_000, waitUntil: 'commit' })
      await this.assentar()
    } else {
      await esperar(opcoes.depois ?? 450)
    }
  }

  async digitar(alvo: string, texto: string) {
    await this.clicar(alvo, { depois: 250 })
    await this.pagina.keyboard.type(texto, { delay: 42 })
    await esperar(250)
  }

  async escolher(alvo: string, opcao: string) {
    await this.clicar(alvo, { depois: 150 })
    // A lista nativa abre fora da página (não aparece no vídeo): a escolha vai direto, e o campo pisca.
    await this.pagina.locator(alvo).first().selectOption({ label: opcao })
    await this.piscar(alvo)
  }

  async data(alvo: string, valor: string) {
    await this.apontar(alvo)
    await esperar(150)
    await this.pagina.locator(alvo).first().fill(valor)
    await this.piscar(alvo)
  }

  private async piscar(alvo: string) {
    await this.destacar(alvo)
    await esperar(650)
    await this.apagar()
  }

  async rolar(alvo: string) {
    await this.pagina.locator(alvo).first().evaluate((el) => el.scrollIntoView({ behavior: 'smooth', block: 'center' }))
    await esperar(900)
  }

  async destacar(alvo: string) {
    const c = await this.caixa(alvo)
    await this.js(`window.__v.destacar(${c.x}, ${c.y}, ${c.width}, ${c.height})`)
  }

  async apagar() {
    await this.js('window.__v.apagar()')
  }

  async esperar(ms: number) {
    await esperar(ms)
  }
}
