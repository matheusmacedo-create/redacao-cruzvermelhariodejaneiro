/**
 * O "Leia também" e a faixa "Mais notícias" por tema, não por data.
 *
 * Pela ordem cronológica, com 5 matérias por dia, um pilar saía desses blocos
 * em dois dias e nunca mais recebia link interno. Aqui as irmãs são as que
 * falam do mesmo assunto: as palavras do título e da linha fina, pesadas pela
 * raridade (Cruz Vermelha, Rio e curso aparecem em quase todas e quase não
 * contam), mais um bônus para a matéria que o próprio texto já cita. Sem tema
 * em comum, completa com as mais recentes, como antes.
 *
 * Módulo puro: conferido em scripts/conferir-relacionadas.ts.
 */
import type { NoticiaRelacionada } from '@/lib/site/artigo-html'

export type CandidataARelacionada = {
  titulo: string
  descricao?: string | null
  url: string
  publicadaEm: Date
}

export type MateriaAtual = {
  url: string
  titulo: string
  descricao?: string | null
  /** O corpo bruto: um link para a irmã conta como tema em comum. */
  corpo?: string | null
}

const PALAVRAS_VAZIAS = new Set([
  'que', 'com', 'como', 'para', 'por', 'dos', 'das', 'nos', 'nas', 'uma', 'uns', 'umas', 'mais', 'quem', 'qual', 'quais',
  'quando', 'onde', 'sobre', 'entre', 'sem', 'seu', 'sua', 'seus', 'suas', 'ele', 'ela', 'eles', 'elas', 'isso', 'este',
  'esta', 'esse', 'essa', 'pelo', 'pela', 'pelos', 'pelas', 'tem', 'ser', 'sao', 'foi', 'deve', 'pode', 'fazer', 'faz',
  'nao', 'sim', 'ate', 'apos', 'cada', 'todo', 'toda', 'todos', 'todas', 'aqui', 'casa', 'rua', 'saiba', 'veja', 'entenda',
  'funciona', 'funcionam', 'significa', 'existe', 'precisa', 'importante',
])

// Peso extra das palavras do título sobre as da linha fina, e o bônus de quem
// o texto já cita: maior que qualquer soma de palavras, porque é o autor
// dizendo que as duas andam juntas.
const PESO_DO_TITULO = 2
const BONUS_DO_LINK = 100

/**
 * Radicais do texto: sem acento, minúsculas, cortados em 6 letras
 * (alerta/alertas, socorros/socorrista). Os pares vizinhos também entram
 * ("bombei civil"), para "Defesa Civil" não passar por "Bombeiro Civil".
 */
export function radicais(texto: string | null | undefined): Set<string> {
  const limpo = (texto ?? '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
  const saida = new Set<string>()
  let anterior = ''
  for (const palavra of limpo.split(/[^a-z0-9]+/)) {
    if (palavra.length < 3 || PALAVRAS_VAZIAS.has(palavra)) continue
    const radical = palavra.slice(0, 6)
    saida.add(radical)
    if (anterior) saida.add(`${anterior} ${radical}`)
    anterior = radical
  }
  return saida
}

/** O último trecho do endereço: é ele que aparece num link do corpo, absoluto ou relativo. */
function slugDoEndereco(url: string): string {
  return url.replace(/[?#].*$/, '').replace(/\/+$/, '').split('/').pop() ?? ''
}

/**
 * As `quantas` irmãs da matéria: primeiro as do mesmo tema (mais parecida
 * antes; empate, a mais recente), depois as mais recentes.
 */
export function relacionadasPorTema(atual: MateriaAtual, noAr: CandidataARelacionada[], quantas = 8): NoticiaRelacionada[] {
  const outras = noAr.filter((n) => n.url !== atual.url)
  if (!outras.length) return []

  // Raridade de cada radical no conjunto todo (a matéria atual inclusa):
  // quanto menos matérias o usam, mais ele diz sobre o tema.
  const documentos = [atual, ...outras].map((n) => new Set([...radicais(n.titulo), ...radicais(n.descricao)]))
  const frequencia = new Map<string, number>()
  for (const doc of documentos) for (const r of doc) frequencia.set(r, (frequencia.get(r) ?? 0) + 1)
  const raridade = (r: string) => Math.log(documentos.length / (frequencia.get(r) ?? 1))

  const pesoDe = (titulo: Set<string>, descricao: Set<string>) => {
    const pesos = new Map<string, number>()
    for (const r of descricao) pesos.set(r, raridade(r))
    for (const r of titulo) pesos.set(r, raridade(r) * PESO_DO_TITULO)
    return pesos
  }
  const daAtual = pesoDe(radicais(atual.titulo), radicais(atual.descricao))
  const corpo = atual.corpo ?? ''

  const pontuadas = outras.map((n) => {
    const daOutra = pesoDe(radicais(n.titulo), radicais(n.descricao))
    let pontos = 0
    for (const [r, peso] of daAtual) {
      const outro = daOutra.get(r)
      if (outro !== undefined) pontos += Math.min(peso, outro)
    }
    const slug = slugDoEndereco(n.url)
    if (slug.length >= 3 && corpo.includes(`/${slug}`)) pontos += BONUS_DO_LINK
    return { n, pontos }
  })

  // Uma palavra rara em comum já é tema; o arredondamento evita que um
  // radical presente em todas (raridade zero) conte como afinidade.
  const doTema = pontuadas.filter((p) => p.pontos > 0.01)
    .sort((a, b) => b.pontos - a.pontos || b.n.publicadaEm.getTime() - a.n.publicadaEm.getTime())
  const escolhidas = doTema.slice(0, quantas).map((p) => p.n)
  if (escolhidas.length < quantas) {
    const ja = new Set(escolhidas.map((n) => n.url))
    const recentes = [...outras].sort((a, b) => b.publicadaEm.getTime() - a.publicadaEm.getTime())
    for (const n of recentes) {
      if (escolhidas.length >= quantas) break
      if (!ja.has(n.url)) escolhidas.push(n)
    }
  }
  return escolhidas.map((n) => ({ titulo: n.titulo, url: n.url, publicadaEm: n.publicadaEm }))
}
