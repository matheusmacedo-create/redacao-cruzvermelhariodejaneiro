/**
 * O beta com a equipe (docs/AJUDA.md §10): o que cada colaborador acha de uma
 * tela, se uma resposta da ajuda ajudou, a dúvida que ficou, o problema e a
 * sugestão. Tipos, rótulos, a leitura do que chega da tela e as contas da
 * página de retornos. Módulo puro — conferido por scripts/conferir-retornos.ts.
 */

export const TIPOS_DE_RETORNO = ['tela', 'pergunta', 'duvida', 'problema', 'sugestao', 'elogio'] as const
export type TipoDeRetorno = (typeof TIPOS_DE_RETORNO)[number]
export const ESTADOS_DO_RETORNO = ['novo', 'em_analise', 'resolvido', 'arquivado'] as const
export type EstadoDoRetorno = (typeof ESTADOS_DO_RETORNO)[number]

export const ROTULO_DO_TIPO: Record<TipoDeRetorno, string> = {
  tela: 'Opinião sobre a tela',
  pergunta: 'Voto numa pergunta da ajuda',
  duvida: 'Dúvida',
  problema: 'Problema',
  sugestao: 'Sugestão',
  elogio: 'Elogio',
}
export const ROTULO_DO_ESTADO: Record<EstadoDoRetorno, string> = {
  novo: 'Novo', em_analise: 'Em análise', resolvido: 'Resolvido', arquivado: 'Arquivado',
}

/** As cinco notas, da pior para a melhor. O rosto é só enfeite: o rótulo é o que o leitor de tela lê. */
export const NOTAS = [
  { valor: 1, rosto: '😞', rotulo: 'Muito ruim' },
  { valor: 2, rosto: '🙁', rotulo: 'Ruim' },
  { valor: 3, rosto: '😐', rotulo: 'Mais ou menos' },
  { valor: 4, rosto: '🙂', rotulo: 'Boa' },
  { valor: 5, rosto: '😍', rotulo: 'Ótima' },
] as const

/** O que acompanha a opinião, para quem vai corrigir conseguir reproduzir. */
export type Contexto = {
  largura?: number; altura?: number; celular?: boolean; toque?: boolean
  navegador?: string; sistema?: string; idioma?: string; tema?: 'claro' | 'escuro'
}

/** Navegador e sistema a partir do user-agent, só o nome (sem versão completa nem identificador). */
export function aparelhoDoAgente(ua: string): { navegador: string; sistema: string } {
  const u = ua || ''
  const navegador = /Edg\//.test(u) ? 'Edge' : /OPR\/|Opera/.test(u) ? 'Opera' : /SamsungBrowser/.test(u) ? 'Samsung Internet'
    : /Firefox\//.test(u) ? 'Firefox' : /Chrome\//.test(u) ? 'Chrome' : /Safari\//.test(u) ? 'Safari' : 'Outro'
  const sistema = /Android/.test(u) ? 'Android' : /iPhone|iPad|iPod/.test(u) ? 'iOS' : /Windows/.test(u) ? 'Windows'
    : /Mac OS X|Macintosh/.test(u) ? 'macOS' : /Linux/.test(u) ? 'Linux' : 'Outro'
  return { navegador, sistema }
}

/** Limpa o contexto que veio do navegador: só os campos conhecidos, nos tipos e tamanhos certos. */
export function lerContexto(bruto: unknown): Contexto {
  if (!bruto || typeof bruto !== 'object') return {}
  const b = bruto as Record<string, unknown>
  const numero = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) && v > 0 && v < 20000 ? Math.round(v) : undefined)
  const texto = (v: unknown, max: number) => (typeof v === 'string' && v.trim() ? v.trim().slice(0, max) : undefined)
  const c: Contexto = {
    largura: numero(b.largura), altura: numero(b.altura),
    celular: typeof b.celular === 'boolean' ? b.celular : undefined,
    toque: typeof b.toque === 'boolean' ? b.toque : undefined,
    navegador: texto(b.navegador, 30), sistema: texto(b.sistema, 30), idioma: texto(b.idioma, 20),
    tema: b.tema === 'claro' || b.tema === 'escuro' ? b.tema : undefined,
  }
  return Object.fromEntries(Object.entries(c).filter(([, v]) => v !== undefined)) as Contexto
}

/** "Celular · 390×844 · Chrome no Android". */
export function contextoLegivel(c: Contexto): string {
  return [
    c.celular === undefined ? '' : c.celular ? 'Celular' : 'Computador',
    c.largura && c.altura ? `${c.largura}×${c.altura}` : '',
    c.navegador ? `${c.navegador}${c.sistema ? ` no ${c.sistema}` : ''}` : '',
  ].filter(Boolean).join(' · ')
}

export type RetornoNovo = {
  tipo: TipoDeRetorno; caminho: string; area: string | null; pergunta_id: string | null
  nota: number | null; util: boolean | null; texto: string | null; contexto: Contexto
}

/** Confere o que chegou da tela. Devolve o retorno pronto para gravar ou o erro para mostrar. */
export function lerRetorno(bruto: Record<string, unknown>): { retorno?: RetornoNovo; erro?: string } {
  const tipo = bruto.tipo as TipoDeRetorno
  if (!TIPOS_DE_RETORNO.includes(tipo)) return { erro: 'Tipo de retorno inválido.' }
  const caminho = typeof bruto.caminho === 'string' ? bruto.caminho.split(/[?#]/)[0].slice(0, 300) : ''
  if (!caminho.startsWith('/')) return { erro: 'Tela inválida.' }
  const area = typeof bruto.area === 'string' && bruto.area.trim() ? bruto.area.trim().slice(0, 120) : null
  const pergunta_id = typeof bruto.pergunta_id === 'string' && /^[a-z0-9-]{1,120}$/.test(bruto.pergunta_id) ? bruto.pergunta_id : null
  const nota = typeof bruto.nota === 'number' && Number.isInteger(bruto.nota) && bruto.nota >= 1 && bruto.nota <= 5 ? bruto.nota : null
  const util = typeof bruto.util === 'boolean' ? bruto.util : null
  const texto = typeof bruto.texto === 'string' && bruto.texto.trim() ? bruto.texto.trim().slice(0, 4000) : null
  if (tipo === 'tela' && nota === null) return { erro: 'Escolha uma nota de 1 a 5.' }
  if (tipo === 'pergunta' && (util === null || !pergunta_id)) return { erro: 'Voto inválido.' }
  if ((tipo === 'duvida' || tipo === 'problema' || tipo === 'sugestao') && (!texto || texto.length < 3)) {
    return { erro: tipo === 'duvida' ? 'Escreva a sua dúvida.' : tipo === 'problema' ? 'Conte o que aconteceu.' : 'Escreva a sua sugestão.' }
  }
  return { retorno: { tipo, caminho, area, pergunta_id: tipo === 'pergunta' ? pergunta_id : null, nota: tipo === 'tela' ? nota : null, util: tipo === 'pergunta' ? util : null, texto, contexto: lerContexto(bruto.contexto) } }
}

/**
 * Quem precisa saber na hora (sino dos administradores): problema, dúvida,
 * sugestão, uma tela avaliada com nota 1 ou 2, ou uma resposta que não ajudou
 * e veio com o que faltou. Nota boa e voto "sim" só entram na página de retornos.
 */
export function avisaNaHora(r: Pick<RetornoNovo, 'tipo' | 'nota' | 'util' | 'texto'>): boolean {
  if (r.tipo === 'problema' || r.tipo === 'duvida' || r.tipo === 'sugestao') return true
  if (r.tipo === 'tela') return (r.nota ?? 5) <= 2
  if (r.tipo === 'pergunta') return r.util === false && Boolean(r.texto)
  return false
}

// ---------------------------------------------------------------- as contas da página de retornos

export type RetornoLido = { tipo: TipoDeRetorno; caminho: string; nota: number | null; estado: EstadoDoRetorno; created_at: string }

/** Por tela: quantas opiniões, a média, quantas negativas (1–2) e os retornos abertos. Pior média primeiro. */
export function resumoPorTela(retornos: RetornoLido[]): { caminho: string; opinioes: number; media: number | null; negativas: number; abertos: number }[] {
  const por = new Map<string, { soma: number; opinioes: number; negativas: number; abertos: number }>()
  for (const r of retornos) {
    if (r.tipo === 'pergunta') continue
    const c = por.get(r.caminho) ?? { soma: 0, opinioes: 0, negativas: 0, abertos: 0 }
    if (r.tipo === 'tela' && r.nota) { c.soma += r.nota; c.opinioes++; if (r.nota <= 2) c.negativas++ }
    if (r.estado === 'novo' || r.estado === 'em_analise') c.abertos++
    por.set(r.caminho, c)
  }
  return [...por.entries()]
    .map(([caminho, c]) => ({ caminho, opinioes: c.opinioes, media: c.opinioes ? Math.round((c.soma / c.opinioes) * 10) / 10 : null, negativas: c.negativas, abertos: c.abertos }))
    .sort((a, b) => (a.media ?? 6) - (b.media ?? 6) || b.abertos - a.abertos || a.caminho.localeCompare(b.caminho))
}

export type VotoDaPergunta = { area: string | null; pergunta_id: string; sim: number; nao: number }

/**
 * As "mais úteis" da Central: primeiro as que a equipe marcou como úteis
 * (pelo saldo de votos, com pelo menos um "sim"); depois completa com a lista
 * escolhida à mão (as dúvidas que mais aparecem no beta), sem repetir.
 */
export function maisUteis(votos: VotoDaPergunta[], escolhidas: { area: string; id: string }[], limite = 8): { area: string; id: string; sim: number }[] {
  const chave = (area: string | null, id: string) => `${area ?? ''}#${id}`
  const saida: { area: string; id: string; sim: number }[] = []
  const vistos = new Set<string>()
  for (const v of [...votos].filter((x) => x.sim > 0 && x.area).sort((a, b) => (b.sim - b.nao) - (a.sim - a.nao) || b.sim - a.sim)) {
    if (saida.length >= limite) break
    vistos.add(chave(v.area, v.pergunta_id))
    saida.push({ area: v.area!, id: v.pergunta_id, sim: v.sim })
  }
  for (const e of escolhidas) {
    if (saida.length >= limite) break
    if (vistos.has(chave(e.area, e.id))) continue
    vistos.add(chave(e.area, e.id))
    saida.push({ ...e, sim: 0 })
  }
  return saida
}

/** As que mais receberam "não ajudou": a lista de textos da ajuda a reescrever. */
export function menosUteis(votos: VotoDaPergunta[], limite = 10): VotoDaPergunta[] {
  return votos.filter((v) => v.nao > 0).sort((a, b) => (b.nao - b.sim) - (a.nao - a.sim) || b.nao - a.nao).slice(0, limite)
}
