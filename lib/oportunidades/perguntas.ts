/**
 * Perguntas das oportunidades e as respostas dos voluntários. Puro: vale na
 * tela da equipe, na do voluntário e no servidor. Quem decide de verdade é o
 * banco (`salvar_perguntas_oportunidade` e `membro_responder_oportunidade`,
 * migração 20260929020000); aqui as mesmas regras dão a mensagem antes de
 * ir ao banco, e montam a estatística.
 *
 * Conferência: npx tsx scripts/conferir-perguntas.ts
 */

export const TIPOS_DE_PERGUNTA = {
  unica: { rotulo: 'Escolha única', dica: 'Uma alternativa.' },
  multipla: { rotulo: 'Várias escolhas', dica: 'Uma ou mais alternativas.' },
  sim_nao: { rotulo: 'Sim ou não', dica: 'Sim ou Não.' },
  texto: { rotulo: 'Resposta curta', dica: 'Texto livre, até 1.000 letras.' },
} as const
export type TipoDePergunta = keyof typeof TIPOS_DE_PERGUNTA
export const ehTipoDePergunta = (s: unknown): s is TipoDePergunta => typeof s === 'string' && Object.hasOwn(TIPOS_DE_PERGUNTA, s)

export const MAXIMO_DE_PERGUNTAS = 50
export const MAXIMO_DE_ALTERNATIVAS = 10
export const TENTATIVAS_DO_QUIZ = 3
export const NOTA_MINIMA_PADRAO = 70

export type Pergunta = {
  id?: string
  enunciado: string
  tipo: TipoDePergunta
  alternativas: string[]
  obrigatoria: boolean
  /** Quiz: índices certos. Fora do quiz, sempre nulo. */
  corretas: number[] | null
}

/** As opções que a pessoa vê: as alternativas ou Sim/Não. Texto não tem. */
export const opcoesDa = (p: Pick<Pergunta, 'tipo' | 'alternativas'>): string[] =>
  p.tipo === 'sim_nao' ? ['Sim', 'Não'] : p.tipo === 'texto' ? [] : p.alternativas

/**
 * Lê as perguntas que a tela da equipe mandou (JSON). Mesmas regras do
 * banco: enunciado de 3 a 500 letras; escolha com 2 a 10 alternativas; no
 * quiz, toda pergunta de escolha tem a resposta certa marcada (uma só na
 * escolha única e no sim/não). Enquete precisa de ao menos uma pergunta;
 * quiz, de ao menos uma que valha nota.
 */
export function lerPerguntas(bruto: unknown, tipoDaOportunidade: string): { perguntas: Pergunta[]; erros: string[] } {
  const erros: string[] = []
  let lista: unknown
  try { lista = typeof bruto === 'string' ? JSON.parse(bruto || '[]') : bruto } catch { return { perguntas: [], erros: ['Perguntas inválidas.'] } }
  if (!Array.isArray(lista)) return { perguntas: [], erros: ['Perguntas inválidas.'] }
  if (lista.length > MAXIMO_DE_PERGUNTAS) return { perguntas: [], erros: [`No máximo ${MAXIMO_DE_PERGUNTAS} perguntas.`] }
  const quiz = tipoDaOportunidade === 'quiz'
  const perguntas: Pergunta[] = []
  lista.forEach((item, i) => {
    const n = i + 1
    const q = (item ?? {}) as Record<string, unknown>
    const tipo = q.tipo
    const enunciado = String(q.enunciado ?? '').trim()
    if (!ehTipoDePergunta(tipo)) { erros.push(`Pergunta ${n}: escolha o tipo.`); return }
    if (enunciado.length < 3 || enunciado.length > 500) erros.push(`Pergunta ${n}: escreva o enunciado (de 3 a 500 letras).`)
    const alternativas = tipo === 'unica' || tipo === 'multipla'
      ? (Array.isArray(q.alternativas) ? q.alternativas : []).map((a) => String(a ?? '').trim()).filter(Boolean)
      : []
    if ((tipo === 'unica' || tipo === 'multipla') && (alternativas.length < 2 || alternativas.length > MAXIMO_DE_ALTERNATIVAS)) {
      erros.push(`Pergunta ${n}: de 2 a ${MAXIMO_DE_ALTERNATIVAS} alternativas.`)
    }
    if (alternativas.some((a) => a.length > 200)) erros.push(`Pergunta ${n}: alternativa com mais de 200 letras.`)
    let corretas: number[] | null = null
    if (quiz && tipo !== 'texto') {
      const limite = tipo === 'sim_nao' ? 2 : alternativas.length
      corretas = [...new Set((Array.isArray(q.corretas) ? q.corretas : []).map(Number).filter((c) => Number.isInteger(c) && c >= 0 && c < limite))].sort((a, b) => a - b)
      if (!corretas.length) erros.push(`Pergunta ${n}: marque a resposta certa.`)
      else if (tipo !== 'multipla' && corretas.length !== 1) erros.push(`Pergunta ${n}: só uma resposta certa.`)
    }
    perguntas.push({ enunciado, tipo, alternativas, obrigatoria: q.obrigatoria !== false, corretas })
  })
  if (!erros.length && tipoDaOportunidade === 'enquete' && !perguntas.length) erros.push('A enquete precisa de pelo menos uma pergunta.')
  if (!erros.length && quiz && !perguntas.some((p) => p.corretas)) erros.push('O quiz precisa de pelo menos uma pergunta com resposta certa.')
  return { perguntas, erros }
}

/** O que vai ao banco: sem o id (as perguntas são regravadas inteiras). */
export const paraOBanco = (perguntas: Pergunta[]) =>
  perguntas.map((p) => ({ enunciado: p.enunciado, tipo: p.tipo, alternativas: p.alternativas, obrigatoria: p.obrigatoria, ...(p.corretas ? { corretas: p.corretas } : {}) }))

// ---------------------------------------------------------------- respostas

/** Resposta de uma pergunta, no formato gravado: texto (`t`) ou escolhas (`e`). */
export type Resposta = { p: string; t?: string; e?: number[] }

/**
 * Confere as respostas antes de enviar (a tela do voluntário). Devolve a
 * primeira pergunta obrigatória sem resposta, para a tela levar a pessoa até ela.
 */
export function faltando(perguntas: (Pick<Pergunta, 'enunciado' | 'tipo' | 'obrigatoria'> & { id: string })[], respostas: Resposta[]): { id: string; enunciado: string } | null {
  for (const p of perguntas) {
    if (!p.obrigatoria) continue
    const r = respostas.find((x) => x.p === p.id)
    const vazia = p.tipo === 'texto' ? !(r?.t ?? '').trim() : !(r?.e?.length)
    if (vazia) return { id: p.id, enunciado: p.enunciado }
  }
  return null
}

/** Lê as respostas gravadas (jsonb) com segurança: o que não tiver a forma certa sai. */
export function lerRespostas(bruto: unknown): Resposta[] {
  if (!Array.isArray(bruto)) return []
  return bruto.flatMap((x): Resposta[] => {
    const r = (x ?? {}) as Record<string, unknown>
    if (typeof r.p !== 'string') return []
    if (typeof r.t === 'string') return [{ p: r.p, t: r.t }]
    if (Array.isArray(r.e)) return [{ p: r.p, e: r.e.map(Number).filter((n) => Number.isInteger(n) && n >= 0) }]
    return []
  })
}

/** "Boca torta; Fala enrolada" — a resposta legível, para a lista da equipe e o CSV. */
export function respostaLegivel(p: Pick<Pergunta, 'tipo' | 'alternativas'>, r: Resposta | undefined): string {
  if (!r) return ''
  if (p.tipo === 'texto') return r.t ?? ''
  const opcoes = opcoesDa(p)
  return (r.e ?? []).map((i) => opcoes[i] ?? '?').join('; ')
}

export type Estatistica =
  | { id: string; enunciado: string; tipo: 'texto'; responderam: number; textos: string[] }
  | { id: string; enunciado: string; tipo: Exclude<TipoDePergunta, 'texto'>; responderam: number; opcoes: { rotulo: string; votos: number; pct: number; certa: boolean }[] }

/**
 * O resumo por pergunta: quantas pessoas responderam, votos e percentual de
 * cada opção (sobre quem respondeu aquela pergunta; na de várias escolhas a
 * soma passa de 100%) e os textos, do mais recente ao mais antigo.
 */
export function estatisticas(perguntas: (Pergunta & { id: string })[], respostas: Resposta[][]): Estatistica[] {
  return perguntas.map((p) => {
    const daPergunta = respostas.map((rs) => rs.find((r) => r.p === p.id)).filter((r): r is Resposta => Boolean(r))
    if (p.tipo === 'texto') {
      const textos = daPergunta.map((r) => (r.t ?? '').trim()).filter(Boolean)
      return { id: p.id, enunciado: p.enunciado, tipo: 'texto' as const, responderam: textos.length, textos }
    }
    const escolhas = daPergunta.filter((r) => r.e?.length)
    const opcoes = opcoesDa(p).map((rotulo, i) => {
      const votos = escolhas.filter((r) => r.e!.includes(i)).length
      return { rotulo, votos, pct: escolhas.length ? Math.round((100 * votos) / escolhas.length) : 0, certa: Boolean(p.corretas?.includes(i)) }
    })
    return { id: p.id, enunciado: p.enunciado, tipo: p.tipo, responderam: escolhas.length, opcoes }
  })
}

/** A frase do resultado do quiz, para o voluntário. */
export function resultadoDoQuiz(r: { nota: number | null; acertos: number | null; total: number | null; aprovado: boolean | null; tentativas: number; minima: number }): string {
  const acertos = r.total ? `${r.acertos} de ${r.total} ${r.total === 1 ? 'acerto' : 'acertos'}` : ''
  if (r.aprovado) return `Você foi aprovado, com nota ${r.nota}${acertos ? ` (${acertos})` : ''}.`
  const restam = TENTATIVAS_DO_QUIZ - r.tentativas
  const base = `Nota ${r.nota}${acertos ? ` (${acertos})` : ''}; a mínima é ${r.minima}.`
  return restam > 0 ? `${base} Você ainda tem ${restam} ${restam === 1 ? 'tentativa' : 'tentativas'}.` : `${base} As ${TENTATIVAS_DO_QUIZ} tentativas acabaram.`
}
