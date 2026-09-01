import { parseMediaLine } from '@/lib/content-blocks'

/**
 * Os formatos de melhoria de texto da matéria.
 *
 * Cada formato é um ESCRITOR PROFISSIONAL da área, não um filtro de estilo: o
 * repórter de diário, o assessor de comunicação, o editor de serviço, o
 * cronista da comunidade. O contrato com todos é o mesmo — entregar a matéria
 * COMPLETA de uma página, com contexto, explicação e conexões com o resto do
 * site — porque retocar meia dúzia de palavras não é melhorar; é o que a
 * primeira versão desta funcionalidade fazia, e não bastou.
 *
 * Duas regras atravessam todos:
 *  - dado específico (número, data, nome, cargo, citação) só o do texto
 *    recebido; contexto geral e explicativo pode e deve entrar;
 *  - a resposta é SUGESTÃO: volta para a tela e só entra se alguém aceitar.
 */

export interface FormatoDeTexto {
  id: string
  rotulo: string
  /** Uma frase para o seletor da tela. */
  explica: string
  /** Quem escreve: a persona profissional que o modelo veste. */
  persona: string
  /** Como este profissional estrutura a página. */
  instrucao: string
}

export const FORMATOS_DE_TEXTO: FormatoDeTexto[] = [
  {
    id: 'jornalistico',
    rotulo: 'Jornalístico',
    explica: 'Repórter de diário: lide, contexto, desdobramento — a matéria completa.',
    persona:
      'Você é um repórter sênior de um grande jornal diário, calejado em cobertura institucional e humanitária. Quem lê a sua matéria não precisa de outra fonte: sai entendendo o fato, o contexto em que ele acontece e o que ele muda.',
    instrucao: [
      'Abra com o lide: o quê, quem, quando e onde, em até duas frases.',
      'Depois do lide, desenvolva: um parágrafo situando o leitor (que instituições são essas, qual o papel de cada uma) e um explicando por que o encontro, a ação ou o anúncio importa para a população.',
      'Pirâmide invertida: do essencial ao complementar. Parágrafos de duas a três frases.',
      'Use intertítulos ("## ") para organizar as seções da matéria — contexto, desdobramentos, serviço.',
      'Fala de pessoa citada no texto vira citação ("> "), com o nome de quem disse.',
      'Feche com o desdobramento esperado ou com o serviço ao leitor: onde acompanhar, como participar — ligando às páginas do site quando houver a página certa.',
      'Voz ativa, verbos fortes, sem adjetivo vazio.',
    ].join('\n'),
  },
  {
    id: 'institucional',
    rotulo: 'Institucional',
    explica: 'Assessor sênior: o comunicado completo, com a missão no centro.',
    persona:
      'Você é o assessor de comunicação sênior da Cruz Vermelha Brasileira — Rio de Janeiro, quem escreve os comunicados oficiais da Casa. Seu texto é sóbrio e completo: registra o ato, situa-o na missão humanitária e diz o que vem a seguir.',
    instrucao: [
      'Abra com o que a instituição fez ou firmou, e com quem.',
      'Desenvolva em seções: o significado do ato para a missão da filial; o papel de cada instituição envolvida; o que a parceria ou ação permite fazer pela população.',
      'Use intertítulos ("## ") para separar o registro, o contexto e os próximos passos.',
      'Nomeie as pessoas e os cargos exatamente como estão no texto recebido.',
      'Feche com o compromisso ou o convite: onde a pessoa leitora acompanha, doa ou participa — ligando às páginas do site quando fizer sentido.',
      'Sem superlativo, sem autoelogio e sem exclamação. A solidez está nos fatos e na clareza.',
    ].join('\n'),
  },
  {
    id: 'utilidade',
    rotulo: 'Utilidade pública',
    explica: 'Editor de serviço: informação que vira ação do leitor.',
    persona:
      'Você é o editor de serviço de uma grande redação — seu ofício é transformar informação em ação. A página que você entrega responde tudo o que o leitor afetado perguntaria: o que está acontecendo, se é com ele, o que fazer, onde buscar ajuda.',
    instrucao: [
      'Primeiro parágrafo: o que está acontecendo e quem precisa agir, em frases curtas.',
      'Depois, seções com intertítulo ("## "): quem é afetado; o que fazer; onde buscar ajuda ou saber mais.',
      'O que fazer vira lista ("- ") ou passos numerados ("1. "), uma ação por item, em modo imperativo.',
      'Data, hora, local, telefone e endereço ganham negrito ("**assim**").',
      'Na seção de onde buscar ajuda, ligue às páginas do site que servirem de verdade ao caso.',
      'Complete o serviço com orientação geral segura da área (o que costuma ser recomendado, o que evitar), sem inventar número nem prazo.',
      'Nada de floreio: cada frase existe para orientar.',
    ].join('\n'),
  },
  {
    id: 'proximo',
    rotulo: 'Próximo do leitor',
    explica: 'Cronista da comunidade: a história completa, contada de perto.',
    persona:
      'Você é um cronista que escreve para quem vive o Rio de Janeiro — o morador, a voluntária, quem um dia precisou de ajuda. Você conta a história inteira de um jeito que aproxima, sem jamais trocar exatidão por emoção.',
    instrucao: [
      'Pode abrir por uma cena, uma pergunta ou pelo significado do fato — antes dos detalhes.',
      'Conte a história completa: o que aconteceu, quem estava lá, o que isso muda na vida de quem é atendido pela instituição.',
      'Explique o que o leitor talvez não saiba (o que faz cada instituição, como esse trabalho chega às pessoas), com vocabulário simples e sem jargão.',
      'Frases fluidas; parágrafos curtos; intertítulos ("## ") se a história pedir capítulos.',
      'Feche aproximando: como o leitor participa dessa história — ligando às páginas do site de doação ou voluntariado quando couber.',
      'A proximidade é do tom, nunca dos fatos: dados continuam exatos e completos. No máximo um emoji, e só se couber.',
    ].join('\n'),
  },
]

export const formatoDeTexto = (id: string) => FORMATOS_DE_TEXTO.find((f) => f.id === id)

/** O corpo pode chegar grande, mas não sem fim: é o mesmo teto do editor. */
export const TETO_DO_CORPO = 20_000

/** Uma página do site que o modelo pode ligar no texto. */
export interface PaginaDoSite {
  titulo: string
  url: string
}

/** Quantas páginas entram no pedido. Mais que isso é ruído, não repertório. */
const TETO_DE_PAGINAS = 18

/**
 * Monta o pedido de melhoria — o mesmo para qualquer provedor.
 *
 * A persona e as regras da casa vão no sistema; a estrutura do formato, as
 * páginas do site linkáveis e o texto vão no pedido. A marcação citada é
 * exatamente a que o editor da matéria produz, para a resposta cair de volta
 * no campo sem tradução.
 */
export function montarPedidoDeMelhoria(dados: {
  titulo?: string
  corpo: string
  formatoId: string
  /** Páginas reais do site — as únicas URLs que o modelo pode linkar. */
  paginas?: PaginaDoSite[]
}): { system: string; pedido: string; formato: FormatoDeTexto } | null {
  const formato = formatoDeTexto(dados.formatoId)
  if (!formato) return null

  const system = [
    formato.persona,
    '',
    'Você escreve para o site da Cruz Vermelha Brasileira — Rio de Janeiro, em português do Brasil.',
    '',
    'O ENTREGÁVEL É A MATÉRIA COMPLETA DE UMA PÁGINA, não uma revisão do rascunho. O texto recebido é a apuração: desenvolva-o em matéria inteira, com contexto, explicação e estrutura. Quando o assunto sustentar, a página fica entre 350 e 700 palavras — e sempre visivelmente mais desenvolvida que o rascunho. Nunca encha linguiça: cada parágrafo novo precisa informar.',
    '',
    'Sobre os fatos:',
    '- Dado específico — número, data, nome, cargo, citação — só o que está no texto recebido. Se faltar, escreva sem ele.',
    '- Contexto geral e explicativo PODE E DEVE entrar: o papel da Cruz Vermelha e do movimento humanitário, o que faz a outra instituição citada, por que o assunto importa para a população. Só conhecimento institucional seguro, sem estatística e sem fato datado que não esteja no texto.',
    '',
    'Marcação disponível (a única que o editor entende): "## " para intertítulo, "> " para citação, "- " para lista, "1. " para lista numerada, **negrito**, *itálico* e [texto](url) para link.',
    'Linhas que começam com "![" são fotos da matéria: copie cada uma EXATAMENTE como está, sozinha num parágrafo, na posição equivalente do novo texto. Não crie, não remova e não edite linhas de foto.',
    'Trechos entre chaves duplas como {{URL_DA_MATERIA}} são preenchidos pelo sistema: preserve-os literalmente.',
    'Preserve a linha de crédito da fonte ("Com informações de…") quando existir, e as hashtags que já existirem, juntas no fim. Não acrescente hashtags novas.',
    'Separe parágrafos com uma linha em branco.',
    '',
    'A RESPOSTA TEM TRÊS PARTES, NESTA ORDEM, E NADA FORA DELAS:',
    'TÍTULO: o título da página, pensado para busca e alcance orgânico — até 65 caracteres, o assunto principal nas primeiras palavras, específico e verdadeiro. Título de instituição humanitária informa; não faz caça-clique.',
    'LINHA FINA: uma frase de 120 a 160 caracteres — é o que o Google e as redes mostram sob o título. Complementa o título (não o repete) e diz por que a matéria importa para quem lê.',
    'Depois, uma linha contendo apenas ---, e então o corpo completo da matéria.',
    'Não repita o título nem a linha fina dentro do corpo.',
  ].join('\n')

  const paginas = (dados.paginas ?? []).slice(0, TETO_DE_PAGINAS)
  const blocoDeLinks = paginas.length
    ? [
        '',
        'Páginas reais do site, para ligar no texto com [texto](url). Use só as que se conectarem de verdade ao assunto — em geral duas ou três, nunca todas — e NUNCA use uma URL que não esteja nesta lista:',
        ...paginas.map((p) => `- ${p.titulo} — ${p.url}`),
      ]
    : []

  const pedido = [
    `Estrutura desta página (${formato.rotulo}):`,
    formato.instrucao,
    ...blocoDeLinks,
    '',
    dados.titulo?.trim()
      ? `Título atual da matéria (proponha na resposta a melhor versão dele para busca): ${dados.titulo.trim()}`
      : '',
    '',
    'Texto a desenvolver:',
    '---',
    dados.corpo,
  ].filter((linha, i, todas) => linha !== '' || todas[i - 1] !== '').join('\n')

  return { system, pedido, formato }
}

/**
 * Separa a resposta do modelo em título, linha fina e corpo.
 *
 * O contrato pede "TÍTULO:", "LINHA FINA:", uma linha de --- e o corpo — mas
 * contrato com modelo se lê com tolerância: sem acento, com negrito em volta,
 * sem o separador. O que não vier identificável vira corpo: uma resposta boa
 * jamais é perdida porque o modelo errou a moldura.
 */
export function separarProposta(bruto: string): {
  titulo: string
  linhaFina: string
  corpo: string
} {
  const linhas = bruto.split('\n')
  let titulo = ''
  let linhaFina = ''
  let inicioDoCorpo = 0

  for (let i = 0; i < Math.min(linhas.length, 8); i++) {
    const linha = linhas[i].trim().replace(/^\*\*|\*\*$/g, '')
    const mTitulo = /^t[íi]tulo\s*:\s*(.+)$/i.exec(linha)
    const mLinha = /^linha\s*fina\s*:\s*(.+)$/i.exec(linha)
    if (mTitulo && !titulo) {
      titulo = mTitulo[1].trim().replace(/^["“']|["”']$/g, '').slice(0, 120)
      inicioDoCorpo = i + 1
    } else if (mLinha && !linhaFina) {
      linhaFina = mLinha[1].trim().replace(/^["“']|["”']$/g, '').slice(0, 220)
      inicioDoCorpo = i + 1
    } else if (/^-{3,}$/.test(linha)) {
      inicioDoCorpo = i + 1
      break
    } else if (linha && (titulo || linhaFina)) {
      // Acabaram os cabeçalhos: daqui em diante é corpo.
      inicioDoCorpo = i
      break
    }
  }

  const corpo = linhas.slice(inicioDoCorpo).join('\n').replace(/^\s*-{3,}\s*\n/, '').trim()
  return { titulo, linhaFina, corpo: corpo || bruto.trim() }
}

/**
 * Garante que todo link da sugestão aponta para lugar que existe.
 *
 * O pedido proíbe URL fora da lista, mas proibir não é garantir: modelo
 * inventa endereço com a maior naturalidade, e link quebrado numa página
 * institucional custa credibilidade. Endereço permitido é o da lista de
 * páginas, o que já estava no texto original e o placeholder do sistema; o
 * resto vira texto puro, com aviso.
 */
export function conferirLinks(
  proposta: string,
  paginas: PaginaDoSite[],
  original: string,
): { texto: string; aviso?: string } {
  const permitidas = new Set(paginas.map((p) => p.url))
  for (const [, url] of original.matchAll(/\]\(([^)\s]+)\)/g)) permitidas.add(url)

  let removidos = 0
  const texto = proposta.replace(/\[([^\]]*)\]\(([^)\s]+)\)/g, (tudo, rotulo: string, url: string) => {
    if (permitidas.has(url) || url.startsWith('{{')) return tudo
    // Fora da lista mas dentro do site pode ser página real digitada de outro
    // jeito (barra final, http). Normaliza antes de condenar.
    const normalizada = url.replace(/^http:/, 'https:').replace(/\/$/, '')
    for (const ok of permitidas) {
      if (ok.replace(/\/$/, '') === normalizada) return `[${rotulo}](${ok})`
    }
    removidos++
    return rotulo
  })

  if (!removidos) return { texto }
  return {
    texto,
    aviso: removidos === 1
      ? 'A sugestão tinha um link para endereço que não existe; ele virou texto simples.'
      : `A sugestão tinha ${removidos} links para endereços que não existem; eles viraram texto simples.`,
  }
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
