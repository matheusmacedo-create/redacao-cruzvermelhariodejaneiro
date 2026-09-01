import { parseMediaLine } from '@/lib/content-blocks'

/**
 * Os formatos de melhoria de texto da matéria.
 *
 * Cada formato é um jeito de escrever, não um assunto: o mesmo fato pode sair
 * como notícia de jornal, comunicado da instituição, aviso de utilidade
 * pública ou relato próximo do leitor. A instrução vive AQUI, num módulo puro,
 * para a tela listar os formatos sem hardcodar nada e para o teste conferir o
 * pedido sem chamar modelo nenhum.
 *
 * Duas regras atravessam todos:
 *  - o modelo melhora a escrita, nunca os fatos — inventar dado é proibido;
 *  - a resposta é SUGESTÃO: volta para a tela e só entra se alguém aceitar.
 */

export interface FormatoDeTexto {
  id: string
  rotulo: string
  /** Uma frase para o seletor da tela. */
  explica: string
  instrucao: string
}

export const FORMATOS_DE_TEXTO: FormatoDeTexto[] = [
  {
    id: 'jornalistico',
    rotulo: 'Jornalístico',
    explica: 'Lide direto, pirâmide invertida, parágrafos curtos.',
    instrucao: [
      'Reescreva como notícia de jornal.',
      'O primeiro parágrafo é o lide: o quê, quem, quando e onde, em até duas frases.',
      'Pirâmide invertida: do mais importante ao complementar.',
      'Parágrafos de duas a três frases. Em matéria longa, use intertítulos ("## ") a cada três ou quatro parágrafos.',
      'Fala de pessoa citada no texto vira citação ("> "), com o nome de quem disse.',
      'Voz ativa, verbos fortes, sem adjetivo vazio.',
    ].join('\n'),
  },
  {
    id: 'institucional',
    rotulo: 'Institucional',
    explica: 'A voz da instituição: sóbria, humana, com o compromisso no centro.',
    instrucao: [
      'Reescreva na voz da instituição.',
      'Tom sóbrio e humano — é uma organização humanitária falando, não uma marca vendendo.',
      'Abra com o que a instituição fez ou firmou, e o porquê humanitário disso.',
      'Nomeie as pessoas e os cargos como estão no texto; parceria e cooperação ganham o centro.',
      'Feche com o compromisso ou o próximo passo, quando o texto os tiver.',
      'Sem superlativo, sem autoelogio e sem exclamação.',
    ].join('\n'),
  },
  {
    id: 'utilidade',
    rotulo: 'Utilidade pública',
    explica: 'Aviso ou serviço: o que fazer, em passos claros.',
    instrucao: [
      'Reescreva como aviso de utilidade pública.',
      'Primeiro parágrafo: o que está acontecendo e quem precisa agir, em frases curtas.',
      'O que fazer vira lista ("- ") ou passos numerados ("1. "), uma ação por item, em modo imperativo.',
      'Data, hora, local, telefone e endereço ganham negrito ("**assim**").',
      'Nada de floreio: cada frase existe para orientar.',
    ].join('\n'),
  },
  {
    id: 'proximo',
    rotulo: 'Próximo do leitor',
    explica: 'Caloroso e narrativo, sem perder a exatidão.',
    instrucao: [
      'Reescreva num tom caloroso e próximo, como quem conta a alguém da comunidade o que aconteceu.',
      'Pode abrir por uma cena ou pelo significado do fato, antes dos detalhes.',
      'Frases fluidas, vocabulário simples, nada de jargão.',
      'A proximidade é do tom, nunca dos fatos: os dados continuam exatos e completos.',
      'No máximo um emoji, e só se couber ao assunto.',
    ].join('\n'),
  },
]

export const formatoDeTexto = (id: string) => FORMATOS_DE_TEXTO.find((f) => f.id === id)

/** O corpo pode chegar grande, mas não sem fim: é o mesmo teto do editor. */
export const TETO_DO_CORPO = 20_000

/**
 * Monta o pedido de melhoria — o mesmo para qualquer provedor.
 *
 * As regras da casa vão no sistema; o texto e o formato escolhido vão no
 * pedido. A marcação citada é exatamente a que o editor da matéria produz,
 * para a resposta cair de volta no campo sem tradução.
 */
export function montarPedidoDeMelhoria(dados: {
  titulo?: string
  corpo: string
  formatoId: string
}): { system: string; pedido: string; formato: FormatoDeTexto } | null {
  const formato = formatoDeTexto(dados.formatoId)
  if (!formato) return null

  const system = [
    'Você melhora textos da Cruz Vermelha Brasileira — Rio de Janeiro, uma organização humanitária.',
    'Escreva em português do Brasil.',
    'Não invente fato, número, data, nome, cargo nem citação que não esteja no texto recebido. Se faltar informação, escreva menos.',
    'Marcação disponível (a única que o editor entende): "## " para intertítulo, "> " para citação, "- " para lista, "1. " para lista numerada, **negrito**, *itálico* e [texto](url) para link.',
    'Linhas que começam com "![" são fotos da matéria: copie cada uma EXATAMENTE como está, sozinha num parágrafo, na posição equivalente do novo texto. Não crie, não remova e não edite linhas de foto.',
    'Trechos entre chaves duplas como {{URL_DA_MATERIA}} são preenchidos pelo sistema: preserve-os literalmente.',
    'Preserve as hashtags que já existirem, juntas no fim do texto. Não acrescente hashtags novas.',
    'Separe parágrafos com uma linha em branco.',
    'Responda apenas com o texto final da matéria, sem título, sem aspas em volta e sem comentários.',
  ].join('\n')

  const pedido = [
    `Formato pedido — ${formato.rotulo}:`,
    formato.instrucao,
    '',
    dados.titulo?.trim() ? `Título da matéria (contexto; não o repita no corpo): ${dados.titulo.trim()}` : '',
    '',
    'Texto a melhorar:',
    '---',
    dados.corpo,
  ].filter((linha, i, todas) => linha !== '' || todas[i - 1] !== '').join('\n')

  return { system, pedido, formato }
}

/**
 * Garante que nenhuma foto se perdeu na reescrita.
 *
 * O modelo recebe a ordem de copiar as linhas de foto, e mesmo assim pode
 * engolir uma — e foto sumida em texto longo é perda invisível na hora de
 * aceitar. As que faltarem voltam ao fim do texto, com aviso; foto que o
 * modelo inventou é descartada, porque mídia só entra pela Biblioteca.
 */
export function garantirFotos(
  original: string,
  proposta: string,
): { texto: string; aviso?: string } {
  const fotosDe = (texto: string) =>
    texto.split(/\n\n+/).map((p) => p.trim()).filter((p) => parseMediaLine(p))

  const originais = fotosDe(original)
  const urlsOriginais = new Set(originais.map((f) => parseMediaLine(f)!.url))

  // Foto que não veio da matéria não entra: o modelo não anexa mídia.
  const semInventadas = proposta
    .split(/\n\n+/)
    .filter((p) => {
      const midia = parseMediaLine(p.trim())
      return !midia || urlsOriginais.has(midia.url)
    })
    .join('\n\n')

  const urlsNaProposta = new Set(
    semInventadas.split(/\n\n+/).flatMap((p) => {
      const midia = parseMediaLine(p.trim())
      return midia ? [midia.url] : []
    }),
  )
  const perdidas = originais.filter((f) => !urlsNaProposta.has(parseMediaLine(f)!.url))

  if (!perdidas.length) return { texto: semInventadas }
  return {
    texto: `${semInventadas.trimEnd()}\n\n${perdidas.join('\n\n')}`,
    aviso: perdidas.length === 1
      ? 'A sugestão tinha perdido uma foto; ela foi recolocada no fim do texto.'
      : `A sugestão tinha perdido ${perdidas.length} fotos; elas foram recolocadas no fim do texto.`,
  }
}
