import { textoParaRede } from '@/lib/publicacao/texto-plano'

/**
 * Monta pedidos de imagem a partir da matéria que já está escrita.
 *
 * Campo em branco é a pior tela possível: quem escreve a matéria sabe o
 * assunto, não sabe descrever imagem. Aqui o assunto sai do próprio texto e
 * entra em modelos de pedido que já carregam a paleta da casa, o
 * enquadramento do canal e — principalmente — o que NÃO pedir.
 *
 * ## Por que nenhum modelo pede o emblema
 *
 * A cruz vermelha sobre fundo branco é símbolo protegido pelas Convenções de
 * Genebra: seu uso é regulado, e uma versão torta, colorida errado ou fundida
 * com outra forma — que é o que um gerador de imagem produz — é pior do que
 * imagem nenhuma no canal oficial de uma Sociedade Nacional. Todos os modelos
 * daqui pedem a PALETA e a geometria, e proíbem o emblema explicitamente.
 *
 * ## Por que nenhum modelo pede pessoas
 *
 * Rosto sintético numa publicação humanitária vira, para quem vê, registro de
 * atendimento. É o limite que a instituição não pode cruzar sem perder o que
 * a sustenta: a credibilidade do que ela mostra.
 */

/** Vermelho institucional do site — o mesmo que a página da matéria usa. */
const VERMELHO = '#CC0000'

const REGRAS_FIXAS = [
  'sem nenhum texto, letra ou número na imagem',
  'sem pessoas, rostos ou corpos',
  'sem o emblema da cruz vermelha, sem cruzes e sem qualquer símbolo humanitário',
  'sem marca d’água e sem assinatura',
].join('; ')

export type Estilo = {
  id: string
  rotulo: string
  resumo: string
  /** O corpo do pedido. Recebe o assunto já extraído da matéria. */
  montar: (assunto: string) => string
}

export const ESTILOS: Estilo[] = [
  {
    id: 'ilustracao',
    rotulo: 'Ilustração editorial',
    resumo: 'Vetor chapado, formas geométricas, cara de jornal',
    montar: (assunto) =>
      `Ilustração editorial vetorial sobre ${assunto}. Formas geométricas chapadas, poucos elementos, muito espaço vazio. `
      + `Paleta restrita: vermelho ${VERMELHO}, branco e cinza-chumbo. Traço limpo, sem gradiente pesado, sem 3D.`,
  },
  {
    id: 'grafismo',
    rotulo: 'Grafismo institucional',
    resumo: 'Composição abstrata na paleta da casa',
    montar: (assunto) =>
      `Composição gráfica abstrata que evoca ${assunto}. Faixas, blocos e ritmo geométrico, equilíbrio assimétrico, `
      + `área generosa de respiro. Vermelho ${VERMELHO} sobre branco, com um cinza de apoio. Aspecto sóbrio e institucional.`,
  },
  {
    id: 'fundo',
    rotulo: 'Fundo para texto',
    resumo: 'Textura discreta, com espaço livre para escrever por cima',
    montar: (assunto) =>
      `Fundo abstrato discreto inspirado em ${assunto}, com uma área central ampla e uniforme reservada para receber `
      + `texto depois. Textura sutil, contraste baixo, vermelho ${VERMELHO} e branco. Nada no centro da imagem.`,
  },
  {
    id: 'objeto',
    rotulo: 'Objeto em close',
    resumo: 'Fotografia de detalhe, luz natural, sem ninguém na cena',
    montar: (assunto) =>
      `Fotografia de estúdio, close em objetos que representam ${assunto}, dispostos sobre superfície neutra. `
      + `Luz natural difusa, profundidade de campo curta, cores sóbrias. Cena vazia de pessoas.`,
  },
  {
    id: 'mapa',
    rotulo: 'Cena urbana ampla',
    resumo: 'Cidade em plano aberto, sem ninguém identificável',
    montar: (assunto) =>
      `Vista urbana ampla do Rio de Janeiro relacionada a ${assunto}, em plano aberto e distante. `
      + `Luz de fim de tarde, tratamento fotográfico realista e sóbrio. Nenhuma pessoa identificável, nenhum rosto.`,
  },
]

// Palavras que aparecem em qualquer texto e não dizem nada sobre o assunto.
const VAZIAS = new Set([
  'para', 'como', 'pelo', 'pela', 'pelos', 'pelas', 'este', 'esta', 'esse', 'essa', 'isso',
  'aquele', 'aquela', 'mais', 'menos', 'muito', 'muita', 'todos', 'todas', 'todo', 'toda',
  'seus', 'suas', 'sua', 'seu', 'nosso', 'nossa', 'nossos', 'nossas', 'que', 'com', 'sem',
  'dos', 'das', 'nos', 'nas', 'por', 'uma', 'uns', 'umas', 'ser', 'ter', 'foi', 'sao',
  'sera', 'esta', 'estao', 'deve', 'devem', 'pode', 'podem', 'quando', 'onde', 'porque',
  'tambem', 'ainda', 'apenas', 'sobre', 'entre', 'depois', 'antes', 'durante', 'atraves',
  'partir', 'forma', 'meio', 'caso', 'vez', 'ano', 'anos', 'dia', 'dias', 'parte',
])

const semAcento = (t: string) => t.normalize('NFD').replace(/[̀-ͯ]/g, '')

/**
 * O assunto da imagem, tirado da matéria.
 *
 * Prefere o título — é onde a redação já resumiu o que importa. Sem título,
 * cai na primeira frase do texto. Os termos frequentes vão junto para o
 * pedido não ficar preso a uma frase só.
 */
export function assuntoDaMateria(mestre: { titulo?: string; corpo?: string }): {
  assunto: string
  termos: string[]
  daOndeVeio: 'titulo' | 'texto' | 'nenhum'
} {
  const limpo = textoParaRede(mestre.corpo ?? '').texto
  const titulo = (mestre.titulo ?? '').trim()
  const primeiraFrase = (limpo.split(/(?<=[.!?])\s|\n/).find((f) => f.trim().length > 15) ?? '').trim()

  const base = titulo || primeiraFrase
  const daOndeVeio = titulo ? 'titulo' : primeiraFrase ? 'texto' : 'nenhum'

  const contagem = new Map<string, number>()
  for (const bruto of `${titulo} ${limpo}`.toLowerCase().split(/[^\p{L}\p{N}]+/u)) {
    const palavra = semAcento(bruto)
    if (palavra.length < 4 || VAZIAS.has(palavra)) continue
    contagem.set(bruto, (contagem.get(bruto) ?? 0) + 1)
  }

  // Repetição é o que separa assunto de tempero. "Desfile" aparece três vezes;
  // "antecipada", uma — e mandar a segunda para o gerador só desvia a imagem.
  const porFrequencia = [...contagem.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
  const recorrentes = porFrequencia.filter(([, n]) => n >= 2).slice(0, 6).map(([p]) => p)
  // Texto curto não repete nada: aí o título é a melhor pista que existe.
  const doTitulo = titulo.toLowerCase().split(/[^\p{L}\p{N}]+/u)
    .filter((p) => p.length >= 4 && !VAZIAS.has(semAcento(p)))
  const termos = [...new Set([...recorrentes, ...doTitulo])].slice(0, 6)

  return { assunto: base.slice(0, 180), termos, daOndeVeio }
}

/** O pedido completo: estilo + assunto + as regras que não se negociam. */
export function montarPrompt(estilo: Estilo, assunto: string, termos: string[] = []): string {
  const contexto = termos.length ? ` Contexto da publicação: ${termos.join(', ')}.` : ''
  return `${estilo.montar(assunto)}${contexto} Restrições obrigatórias: ${REGRAS_FIXAS}.`
}

/** Um pedido pronto por estilo, todos já falando da matéria escrita. */
export function sugestoesDePrompt(mestre: { titulo?: string; corpo?: string }): {
  estilo: Estilo
  prompt: string
}[] {
  const { assunto, termos } = assuntoDaMateria(mestre)
  if (!assunto) return []
  return ESTILOS.map((estilo) => ({ estilo, prompt: montarPrompt(estilo, assunto, termos) }))
}

export { REGRAS_FIXAS, VERMELHO }
