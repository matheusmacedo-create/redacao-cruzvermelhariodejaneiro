/**
 * A impressão digital do navegador, colhida na tela de login da equipe
 * (docs/registro-de-acessos.md §3, níveis 2 e 3 — decisão do Matheus de
 * 25/09/2026). Tudo roda no navegador e só os HASHES saem daqui: nenhuma
 * imagem do canvas, nenhuma lista de fontes, nenhum áudio.
 *
 * Nunca atrapalha a entrada: cada peça tem o próprio try/catch e o conjunto
 * tem prazo. O que não deu para colher sai nulo.
 *
 * Voluntários NÃO passam por aqui (decisão do Matheus): a Área do Voluntário
 * registra só o que a requisição já traz.
 */

async function sha256(texto: string): Promise<string> {
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(texto))
  return [...new Uint8Array(bytes)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

function canvas(): string | null {
  const c = document.createElement('canvas')
  c.width = 280; c.height = 60
  const ctx = c.getContext('2d')
  if (!ctx) return null
  ctx.textBaseline = 'alphabetic'
  ctx.fillStyle = '#e32219'
  ctx.fillRect(100, 1, 62, 20)
  ctx.fillStyle = '#069'
  ctx.font = '15px "Arial"'
  ctx.fillText('Cruz Vermelha RJ ✚ ação 😃', 2, 15)
  ctx.fillStyle = 'rgba(102, 204, 0, 0.7)'
  ctx.font = 'bold 16px serif'
  ctx.fillText('Palácio Virtual ÇÃÕ ẞ 🩺', 4, 45)
  ctx.globalCompositeOperation = 'multiply'
  ctx.fillStyle = 'rgb(255,0,255)'
  ctx.beginPath(); ctx.arc(50, 50, 30, 0, Math.PI * 2, true); ctx.closePath(); ctx.fill()
  return c.toDataURL()
}

function webgl(): { texto: string; gpu: string | null } | null {
  const c = document.createElement('canvas')
  const gl = (c.getContext('webgl') ?? c.getContext('experimental-webgl')) as WebGLRenderingContext | null
  if (!gl) return null
  const info = gl.getExtension('WEBGL_debug_renderer_info')
  const fornecedor = info ? String(gl.getParameter(info.UNMASKED_VENDOR_WEBGL)) : String(gl.getParameter(gl.VENDOR))
  const placa = info ? String(gl.getParameter(info.UNMASKED_RENDERER_WEBGL)) : String(gl.getParameter(gl.RENDERER))
  const parametros = [
    gl.MAX_TEXTURE_SIZE, gl.MAX_RENDERBUFFER_SIZE, gl.MAX_VIEWPORT_DIMS, gl.MAX_VERTEX_ATTRIBS,
    gl.MAX_VERTEX_UNIFORM_VECTORS, gl.MAX_FRAGMENT_UNIFORM_VECTORS, gl.MAX_VARYING_VECTORS,
    gl.ALIASED_LINE_WIDTH_RANGE, gl.ALIASED_POINT_SIZE_RANGE, gl.SHADING_LANGUAGE_VERSION, gl.VERSION,
  ].map((p) => { try { return String(gl.getParameter(p)) } catch { return '' } })
  const extensoes = (gl.getSupportedExtensions() ?? []).join(',')
  return { texto: [fornecedor, placa, ...parametros, extensoes].join('|'), gpu: `${fornecedor} — ${placa}`.slice(0, 160) }
}

async function audio(): Promise<string | null> {
  const Ctx = window.OfflineAudioContext ?? (window as unknown as { webkitOfflineAudioContext?: typeof OfflineAudioContext }).webkitOfflineAudioContext
  if (!Ctx) return null
  const ctx = new Ctx(1, 5000, 44100)
  const osc = ctx.createOscillator()
  osc.type = 'triangle'
  osc.frequency.value = 10000
  const comp = ctx.createDynamicsCompressor()
  comp.threshold.value = -50; comp.knee.value = 40; comp.ratio.value = 12; comp.attack.value = 0; comp.release.value = 0.25
  osc.connect(comp); comp.connect(ctx.destination)
  osc.start(0)
  const buffer = await ctx.startRendering()
  const dados = buffer.getChannelData(0)
  let soma = 0
  for (let i = 4500; i < 5000; i++) soma += Math.abs(dados[i])
  return soma.toString()
}

const FONTES = [
  'Arial', 'Arial Black', 'Calibri', 'Cambria', 'Candara', 'Comic Sans MS', 'Consolas', 'Constantia', 'Corbel',
  'Courier New', 'Georgia', 'Helvetica', 'Helvetica Neue', 'Impact', 'Lucida Console', 'Lucida Grande',
  'Palatino Linotype', 'Segoe UI', 'Segoe UI Emoji', 'Tahoma', 'Times New Roman', 'Trebuchet MS', 'Verdana',
  'Menlo', 'Monaco', 'SF Pro Text', 'Avenir', 'Futura', 'Gill Sans', 'Optima', 'Roboto', 'Noto Sans', 'Ubuntu',
  'DejaVu Sans', 'Liberation Sans', 'Cantarell', 'Open Sans', 'Montserrat', 'Lato', 'Source Sans Pro',
  'Microsoft YaHei', 'MS Gothic', 'Bahnschrift', 'Franklin Gothic Medium', 'Garamond', 'Book Antiqua',
]

/** Fontes instaladas: a largura de um texto muda quando a fonte existe. */
function fontes(): string[] {
  const ctx = document.createElement('canvas').getContext('2d')
  if (!ctx) return []
  const amostra = 'mmmmmmmmmmlli1WQ@#ÇãõÿŷẞЖ'
  const bases = ['monospace', 'sans-serif', 'serif']
  const largura = (fonte: string) => { ctx.font = `72px ${fonte}`; return ctx.measureText(amostra).width }
  const padrao = bases.map(largura)
  return FONTES.filter((f) => bases.some((b, i) => largura(`"${f}", ${b}`) !== padrao[i]))
}

/** O motor de JavaScript arredonda diferente em algumas funções. */
function matematica(): string {
  return [Math.acos(0.123124234234234242), Math.acosh(1e308), Math.asinh(1), Math.atanh(0.5), Math.expm1(1),
    Math.sinh(1), Math.cosh(1), Math.tanh(1), Math.log1p(10), Math.cbrt(100), Math.sin(-1e300)].join(',')
}

const tentar = <T,>(f: () => T): T | null => { try { return f() } catch { return null } }

export type Impressao = Record<string, unknown>

async function colher(): Promise<Impressao> {
  const nav = navigator as Navigator & { deviceMemory?: number; userAgentData?: { platform?: string } }
  const fuso = tentar(() => Intl.DateTimeFormat().resolvedOptions().timeZone)
  const idiomas = [...(navigator.languages ?? [navigator.language])].filter(Boolean)
  const tela = `${screen.width}x${screen.height}x${screen.colorDepth}`
  const estaveis = {
    fuso, idiomas, tela, densidade: window.devicePixelRatio, cores: screen.colorDepth,
    nucleos: navigator.hardwareConcurrency ?? null, memoria: nav.deviceMemory ?? null,
    toque: navigator.maxTouchPoints ?? 0, plataforma: nav.userAgentData?.platform ?? navigator.platform ?? null,
  }

  const c = tentar(canvas)
  const g = tentar(webgl)
  const f = tentar(fontes) ?? []
  const m = tentar(matematica)
  let a: string | null = null
  try { a = await Promise.race([audio(), new Promise<null>((r) => setTimeout(() => r(null), 600))]) } catch { a = null }

  const componentes: Record<string, string> = {}
  const pecas: [string, string | null][] = [['canvas', c], ['webgl', g?.texto ?? null], ['audio', a], ['fontes', f.length ? f.join(',') : null], ['matematica', m]]
  for (const [nome, valor] of pecas) if (valor) componentes[nome] = await sha256(valor)

  const assinatura = await sha256(JSON.stringify(estaveis))
  const impressao = await sha256(JSON.stringify({ assinatura, ...componentes, ua: navigator.userAgent }))
  return { ...estaveis, gpu: g?.gpu ?? null, fontes: f.length, componentes, assinatura, impressao }
}

/** Colhe a impressão com prazo: passou de 1,5 s, a entrada segue sem ela. */
export async function impressaoDoNavegador(): Promise<Impressao | null> {
  try {
    return await Promise.race([colher(), new Promise<null>((r) => setTimeout(() => r(null), 1500))])
  } catch {
    return null
  }
}
