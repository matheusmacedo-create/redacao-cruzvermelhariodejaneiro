/**
 * Autorização de uso de imagem pelo link: o que é puro — finalidades,
 * validação do formulário, a assinatura desenhada, a descrição do aparelho e
 * o documento que vira hash. Dá para conferir com tsx.
 */

export const USOS = {
  redes_sociais: { rotulo: 'Redes sociais da Cruz Vermelha', detalhe: 'Instagram, Facebook, LinkedIn, YouTube, TikTok e outras.' },
  site: { rotulo: 'Site e newsletter', detalhe: 'cruzvermelhariodejaneiro.org e os e-mails da filial.' },
  impressos: { rotulo: 'Materiais impressos', detalhe: 'Folhetos, cartazes, banners e publicações.' },
  imprensa: { rotulo: 'Imprensa', detalhe: 'Envio a jornais, TVs, rádios e sites de notícia.' },
  campanhas: { rotulo: 'Campanhas institucionais e de doação', detalhe: 'Peças para arrecadar doações e divulgar a instituição.' },
  relatorios: { rotulo: 'Relatórios e prestação de contas', detalhe: 'Para parceiros, financiadores e órgãos públicos.' },
} as const
export type Uso = keyof typeof USOS
export const ehUso = (v: unknown): v is Uso => typeof v === 'string' && Object.hasOwn(USOS, v)

export const VINCULOS = {
  atendido: 'Pessoa atendida',
  voluntario: 'Voluntário(a)',
  colaborador: 'Colaborador(a) da Cruz Vermelha',
  participante: 'Participante de curso ou evento',
  outro: 'Outro',
} as const
export type Vinculo = keyof typeof VINCULOS
export const ehVinculo = (v: unknown): v is Vinculo => typeof v === 'string' && Object.hasOwn(VINCULOS, v)

export const LIMITES = { nome: 200, contato: 200, responsavel: 200, parentesco: 60, tracos: 80, pontos: 6000, coordenada: 1000 }

// ---------------------------------------------------------------- assinatura desenhada

/**
 * A assinatura é guardada como traços (listas de pontos x,y de 0 a 1000),
 * não como imagem: pequena, fácil de desenhar de novo em SVG e sem nada
 * executável dentro.
 */
export type Tracos = [number, number][][]

export function lerTracos(bruto: unknown): { tracos?: Tracos; erro?: string } {
  if (!Array.isArray(bruto) || !bruto.length) return { erro: 'Assine no quadro antes de enviar.' }
  if (bruto.length > LIMITES.tracos) return { erro: 'Assinatura com traços demais. Limpe e assine de novo.' }
  let total = 0
  const tracos: Tracos = []
  for (const t of bruto) {
    if (!Array.isArray(t)) return { erro: 'Assinatura inválida.' }
    const traco: [number, number][] = []
    for (const p of t) {
      if (!Array.isArray(p) || p.length !== 2) return { erro: 'Assinatura inválida.' }
      const [x, y] = p.map(Number)
      if (!Number.isFinite(x) || !Number.isFinite(y) || x < 0 || y < 0 || x > LIMITES.coordenada || y > LIMITES.coordenada) return { erro: 'Assinatura inválida.' }
      traco.push([Math.round(x), Math.round(y)])
    }
    total += traco.length
    if (total > LIMITES.pontos) return { erro: 'Assinatura longa demais. Limpe e assine de novo.' }
    if (traco.length) tracos.push(traco)
  }
  // Um toque ou um risquinho não é assinatura.
  const comprimento = tracos.reduce((s, t) => s + t.slice(1).reduce((a, p, i) => a + Math.hypot(p[0] - t[i][0], p[1] - t[i][1]), 0), 0)
  if (total < 10 || comprimento < 250) return { erro: 'A assinatura ficou curta demais. Assine com o dedo ou o mouse, como no papel.' }
  return { tracos }
}

/** O atributo `d` de um <path> SVG (só números e letras M/L: nada executável). */
export function caminhoDaAssinatura(tracos: Tracos): string {
  return tracos.map((t) => t.map((p, i) => `${i ? 'L' : 'M'}${p[0]} ${p[1]}`).join(' ')).join(' ')
}

// ---------------------------------------------------------------- aparelho

/** O que o navegador conta de si além do User-Agent (User-Agent Client Hints e tela). */
export type DicasDoAparelho = {
  modelo?: string
  plataforma?: string
  versaoDaPlataforma?: string
  movel?: boolean
  tela?: string
  idioma?: string
  fuso?: string
  toque?: boolean
}

const limpar = (v: unknown, max = 60) => (typeof v === 'string' ? v.replace(/[^\p{L}\p{N} ._()\-/+:,x]/gu, '').replace(/\s+/g, ' ').trim().slice(0, max) : '')

/** Lê as dicas vindas do navegador, descartando o que não for texto curto. */
export function lerDicas(bruto: unknown): DicasDoAparelho {
  const o = bruto && typeof bruto === 'object' ? bruto as Record<string, unknown> : {}
  return {
    modelo: limpar(o.modelo) || undefined,
    plataforma: limpar(o.plataforma, 30) || undefined,
    versaoDaPlataforma: limpar(o.versaoDaPlataforma, 20) || undefined,
    movel: typeof o.movel === 'boolean' ? o.movel : undefined,
    tela: /^\d{2,5}x\d{2,5}(@[\d.]{1,4})?$/.test(String(o.tela ?? '')) ? String(o.tela) : undefined,
    idioma: limpar(o.idioma, 20) || undefined,
    fuso: limpar(o.fuso, 40) || undefined,
    toque: typeof o.toque === 'boolean' ? o.toque : undefined,
  }
}

/**
 * "Samsung SM-A546E · Android 14 · Chrome 128 (celular)" a partir do
 * User-Agent e das dicas. O Chrome no Android esconde o modelo no
 * User-Agent ("K"); as dicas (userAgentData) é que trazem o modelo real.
 */
export function descreverAparelho(ua: string, d: DicasDoAparelho = {}): string {
  const u = String(ua ?? '')
  let sistema = ''
  let modelo = d.modelo && d.modelo !== 'K' ? d.modelo : ''
  const ios = /\b(iPhone|iPad|iPod)\b.*?OS (\d+)[_.](\d+)/.exec(u)
  // O primeiro parêntese do User-Agent ("Linux; Android 14; SM-A546E Build/…") tem o sistema e o modelo.
  const plataforma = /^[^(]*\(((?:[^()]|\([^()]*\))*)\)/.exec(u)?.[1] ?? ''
  const partes = plataforma.split(';').map((p) => p.trim())
  const iAndroid = partes.findIndex((p) => /^Android \d/.test(p))
  const android = iAndroid >= 0 ? /^Android (\d+(?:\.\d+)?)/.exec(partes[iAndroid]) : null
  if (ios) { sistema = `iOS ${ios[2]}.${ios[3]}`; modelo ||= ios[1] }
  else if (android) {
    sistema = `Android ${d.versaoDaPlataforma?.split('.')[0] || android[1]}`
    const doUa = (partes[iAndroid + 1] ?? '').replace(/\s*Build\/.*$/, '').trim()
    if (!modelo && doUa && doUa !== 'K' && !/^(wv|Mobile)$/i.test(doUa)) modelo = doUa
  }
  else if (/Windows NT/.test(u)) sistema = 'Windows'
  else if (/Mac OS X|Macintosh/.test(u)) sistema = 'macOS'
  else if (/CrOS/.test(u)) sistema = 'ChromeOS'
  else if (/Linux/.test(u)) sistema = 'Linux'
  else if (d.plataforma) sistema = d.plataforma

  const versao = (re: RegExp) => re.exec(u)?.[1]?.split('.')[0]
  let navegador = ''
  if (/Instagram/.test(u)) navegador = 'navegador do Instagram'
  else if (/FBAN|FBAV|FB_IAB/.test(u)) navegador = 'navegador do Facebook'
  else if (/WhatsApp/i.test(u)) navegador = 'navegador do WhatsApp'
  else if (/SamsungBrowser\//.test(u)) navegador = `Samsung Internet ${versao(/SamsungBrowser\/([\d.]+)/)}`
  else if (/Edg[AiA]?\//.test(u)) navegador = `Edge ${versao(/Edg[AiA]?\/([\d.]+)/)}`
  else if (/OPR\//.test(u)) navegador = `Opera ${versao(/OPR\/([\d.]+)/)}`
  else if (/CriOS\//.test(u)) navegador = `Chrome ${versao(/CriOS\/([\d.]+)/)}`
  else if (/FxiOS\//.test(u)) navegador = `Firefox ${versao(/FxiOS\/([\d.]+)/)}`
  else if (/Firefox\//.test(u)) navegador = `Firefox ${versao(/Firefox\/([\d.]+)/)}`
  else if (/Chrome\//.test(u)) navegador = `Chrome ${versao(/Chrome\/([\d.]+)/)}${/; wv\)/.test(u) ? ' (dentro de um app)' : ''}`
  else if (/Safari\//.test(u)) navegador = `Safari ${versao(/Version\/([\d.]+)/) ?? ''}`.trim()

  const tipo = (d.movel ?? /Mobile|iPhone|Android.*Mobile/.test(u)) ? 'celular' : /iPad|Tablet|Android(?!.*Mobile)/.test(u) ? 'tablet' : 'computador'
  const descricao = [modelo, sistema, navegador].filter(Boolean)
  return descricao.length ? `${descricao.join(' · ')} (${tipo})` : 'Aparelho não identificado'
}

// ---------------------------------------------------------------- formulário

export type Preenchimento = {
  nome: string
  vinculo: Vinculo
  contato: string | null
  menor: boolean
  responsavelNome: string | null
  responsavelParentesco: string | null
  usos: Uso[]
}

const texto = (v: unknown, max: number) => String(v ?? '').replace(/\s+/g, ' ').trim().slice(0, max)

/** Confere o que a pessoa preencheu. `erros` vazio = pode gravar. */
export function lerPreenchimento(o: Record<string, unknown>): { dados?: Preenchimento; erros: string[] } {
  const erros: string[] = []
  const nome = texto(o.nome, LIMITES.nome)
  if (nome.length < 5 || !nome.includes(' ')) erros.push('Escreva o nome completo de quem aparece nas fotos.')
  const vinculo = ehVinculo(o.vinculo) ? o.vinculo : null
  if (!vinculo) erros.push('Diga qual é a sua relação com a Cruz Vermelha.')
  const contato = texto(o.contato, LIMITES.contato) || null
  if (contato && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(contato) && !/^\+?[\d\s()-]{10,20}$/.test(contato)) erros.push('Contato: um e-mail ou um telefone com DDD.')
  const menor = o.menor === true || o.menor === 'sim'
  const responsavelNome = menor ? texto(o.responsavelNome, LIMITES.responsavel) || null : null
  const responsavelParentesco = menor ? texto(o.responsavelParentesco, LIMITES.parentesco) || null : null
  if (menor && (!responsavelNome || responsavelNome.length < 5 || !responsavelNome.includes(' '))) erros.push('Menor de 18 anos: escreva o nome completo do pai, da mãe ou do responsável, que é quem assina.')
  if (menor && !responsavelParentesco) erros.push('Diga o parentesco do responsável (mãe, pai, avó, tutor…).')
  const usos = [...new Set((Array.isArray(o.usos) ? o.usos : []).filter(ehUso))]
  if (!usos.length) erros.push('Marque pelo menos um uso que você autoriza.')
  if (o.aceite !== true && o.aceite !== 'sim') erros.push('Confirme que leu e concorda com o termo.')
  return erros.length || !vinculo ? { erros } : { dados: { nome, vinculo, contato, menor, responsavelNome, responsavelParentesco, usos }, erros }
}

// ---------------------------------------------------------------- documento assinado

/** JSON com as chaves em ordem: o mesmo conteúdo sempre dá o mesmo texto (e o mesmo hash). */
export function documentoCanonico(valor: unknown): string {
  const ordenar = (v: unknown): unknown => Array.isArray(v) ? v.map(ordenar)
    : v && typeof v === 'object' ? Object.fromEntries(Object.keys(v as object).sort().map((k) => [k, ordenar((v as Record<string, unknown>)[k])]))
    : v
  return JSON.stringify(ordenar(valor))
}

const ALFABETO = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'

/** "IMG-7K3Q-9X2M" a partir de bytes aleatórios (sem 0/O/1/I, para ler em voz alta). */
export function codigoDoComprovante(bytes: Uint8Array): string {
  const c = Array.from(bytes.slice(0, 8), (b) => ALFABETO[b % ALFABETO.length]).join('')
  return `IMG-${c.slice(0, 4)}-${c.slice(4, 8)}`
}

export const ehCodigo = (v: string) => /^IMG-[A-HJ-NP-Z2-9]{4}-[A-HJ-NP-Z2-9]{4}$/.test(v)

export type Situacao = 'valida' | 'revogada'
export const ROTULO_DA_SITUACAO: Record<Situacao, string> = { valida: 'Válida', revogada: 'Revogada' }

/** O link está aberto para assinar? */
export function linkAberto(c: { expira_em: string | null; encerrada_em: string | null }, agora = new Date()): { aberto: boolean; motivo?: string } {
  if (c.encerrada_em) return { aberto: false, motivo: 'Este link foi encerrado pela equipe da Cruz Vermelha.' }
  if (c.expira_em && new Date(c.expira_em) <= agora) return { aberto: false, motivo: 'Este link expirou. Peça um novo à equipe da Cruz Vermelha.' }
  return { aberto: true }
}

// ---------------------------------------------------------------- coleta (o link)

export const VALIDADES = { '0': 'Sem prazo (até encerrar)', '7': '7 dias', '30': '30 dias', '90': '90 dias' } as const
export type Validade = keyof typeof VALIDADES
export const MAX_FOTOS_POR_COLETA = 60

export type NovaColeta = { titulo: string; descricao: string; validadeDias: number; arquivos: string[] }

/** Confere o formulário de "Pedir autorização". */
export function lerNovaColeta(o: { titulo?: unknown; descricao?: unknown; validade?: unknown; arquivos?: unknown }): { dados?: NovaColeta; erros: string[] } {
  const erros: string[] = []
  const titulo = texto(o.titulo, 120)
  if (titulo.length < 3) erros.push('Dê um título à ação (ex.: "Mutirão de saúde em Campo Grande — 12/09").')
  const descricao = String(o.descricao ?? '').trim().slice(0, 500)
  const v = String(o.validade ?? '0')
  const validadeDias = Object.hasOwn(VALIDADES, v) ? Number(v) : 0
  const bruto = Array.isArray(o.arquivos) ? o.arquivos : String(o.arquivos ?? '').split(',')
  const arquivos = [...new Set(bruto.map((x) => String(x).trim().toLowerCase()).filter((x) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(x)))]
  if (!arquivos.length) erros.push('Escolha pelo menos uma foto.')
  if (arquivos.length > MAX_FOTOS_POR_COLETA) erros.push(`No máximo ${MAX_FOTOS_POR_COLETA} fotos por link. Divida em mais de um.`)
  return erros.length ? { erros } : { dados: { titulo, descricao, validadeDias, arquivos }, erros }
}

/** Quando o link expira (null = sem prazo). */
export const expiraEm = (dias: number, agora = new Date()) => dias > 0 ? new Date(agora.getTime() + dias * 86_400_000).toISOString() : null
