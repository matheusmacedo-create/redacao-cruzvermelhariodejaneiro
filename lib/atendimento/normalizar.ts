/**
 * Traduz o que cada rede devolve para uma forma só.
 *
 * A documentação do conector avisa, com todas as letras, que "os campos exatos
 * do comentário variam por plataforma — cada rede devolve o formato dela". O
 * Facebook chama de `message` o que o Instagram chama de `text`; o YouTube
 * aninha tudo dentro de `snippet`; a data ora é `timestamp`, ora
 * `created_time`, ora `publishedAt`.
 *
 * A REGRA QUE GOVERNA ESTE ARQUIVO: comentário que não dá para entender
 * APARECE MESMO ASSIM, marcado. Descartar o que não encaixa no formato
 * esperado é como uma reclamação some sem ninguém saber que existiu — e numa
 * instituição que atende público, a mensagem que o código não entendeu tem
 * chance maior do que a média de ser a que mais importa.
 *
 * Por isso nada aqui lança exceção, e nada some.
 */

export type Origem = 'comentario' | 'dm'

export type Mensagem = {
  /** Identidade estável, para não duplicar entre atualizações da tela. */
  id: string
  canal: string
  origem: Origem
  autor: string
  autorId: string
  texto: string
  /** ISO 8601, ou vazio quando a rede não informou. */
  quando: string
  /** O post em que o comentário está. Ausente em DM. */
  postId?: string
  postTitulo?: string
  postUrl?: string
  /** Para responder um comentário é preciso o id dele. */
  comentarioId?: string
  /** Em DM, para quem responder. */
  destinatarioId?: string
  /** A tela só oferece o campo de resposta quando dá para responder. */
  respondivel: boolean
  /** Por que não dá — texto para a pessoa, não código de erro. */
  motivo?: string
  /** O código não reconheceu o formato; mostrado com aviso. */
  formatoDesconhecido?: boolean
  /**
   * A última palavra foi de quem escreveu, não nossa — ou seja, alguém espera
   * resposta. É o que separa uma fila de trabalho de um registro de conversas.
   */
  aguardandoResposta?: boolean
  /** Não deu para saber quem é quem na conversa; a tela avisa em vez de mentir. */
  identidadeIncerta?: boolean
}

/** Primeiro valor não vazio entre os caminhos dados. */
function primeiro(objeto: Record<string, unknown>, caminhos: string[]): string {
  for (const caminho of caminhos) {
    let valor: unknown = objeto
    for (const parte of caminho.split('.')) {
      if (valor && typeof valor === 'object') valor = (valor as Record<string, unknown>)[parte]
      else { valor = undefined; break }
    }
    if (typeof valor === 'string' && valor.trim()) return valor.trim()
    if (typeof valor === 'number') return String(valor)
  }
  return ''
}

/**
 * As grafias que cada rede usa para a mesma coisa.
 *
 * Lista aberta de propósito: quando uma rede nova aparecer com outro nome, o
 * conserto é acrescentar uma linha aqui, não reescrever o normalizador.
 */
const TEXTO = ['text', 'message', 'snippet.textDisplay', 'snippet.topLevelComment.snippet.textDisplay', 'comment', 'body']
const QUANDO = ['timestamp', 'created_time', 'createdAt', 'created_at', 'snippet.publishedAt', 'snippet.topLevelComment.snippet.publishedAt', 'publishedAt']
const AUTOR = ['user.username', 'from.name', 'from.username', 'author.name', 'actor.name', 'snippet.authorDisplayName', 'snippet.topLevelComment.snippet.authorDisplayName', 'username']
const AUTOR_ID = ['user.id', 'from.id', 'author.id', 'actor', 'snippet.authorChannelId.value', 'snippet.topLevelComment.snippet.authorChannelId.value']
const ID = ['id', 'comment_id', 'commentId', 'urn']

/**
 * Normaliza a lista de comentários de um post.
 *
 * `contexto` traz o que a resposta da rede não tem: de qual post e de qual
 * canal aqueles comentários vieram.
 */
export function normalizarComentarios(
  bruto: unknown,
  contexto: { canal: string; postId: string; postTitulo?: string; postUrl?: string },
): Mensagem[] {
  const lista = Array.isArray((bruto as { comments?: unknown })?.comments)
    ? ((bruto as { comments: unknown[] }).comments)
    : Array.isArray(bruto) ? bruto : []

  return lista.flatMap((cru, indice) => {
    if (!cru || typeof cru !== 'object') return []
    const item = cru as Record<string, unknown>

    const texto = primeiro(item, TEXTO)
    const id = primeiro(item, ID) || `${contexto.canal}:${contexto.postId}:${indice}`
    const autor = primeiro(item, AUTOR)
    const autorId = primeiro(item, AUTOR_ID)

    // Sem texto E sem autor, o que sobrou não é um comentário reconhecível.
    // Ainda assim entra na lista, marcado: some é pior do que confuso.
    const desconhecido = !texto && !autor

    return [{
      id: `comentario:${contexto.canal}:${id}`,
      canal: contexto.canal,
      origem: 'comentario' as const,
      autor: autor || 'Autor não informado',
      autorId,
      texto: texto || '(não consegui ler o texto deste comentário — abra na rede)',
      quando: normalizarData(primeiro(item, QUANDO)),
      postId: contexto.postId,
      postTitulo: contexto.postTitulo,
      postUrl: contexto.postUrl,
      comentarioId: primeiro(item, ID),
      // Sem o id do comentário não há como responder: o Instagram exige
      // comment_id, e nas outras é ele que amarra a resposta ao lugar certo.
      respondivel: Boolean(primeiro(item, ID)),
      motivo: primeiro(item, ID) ? undefined : 'A rede não devolveu o identificador do comentário, então a resposta não teria onde pousar.',
      ...(desconhecido ? { formatoDesconhecido: true } : {}),
    }]
  })
}

/** Quanto tempo o Instagram dá para responder depois da última mensagem da pessoa. */
export const JANELA_DE_RESPOSTA_HORAS = 24

/**
 * Normaliza as conversas de DM do Instagram.
 *
 * Devolve a ÚLTIMA mensagem de cada conversa, não todas: o painel é uma fila
 * de atendimento, e o que decide se alguém precisa agir é a mensagem mais
 * recente de quem escreveu.
 *
 * Aqui mora a regra que mais confunde na prática: o Instagram só aceita
 * resposta dentro de 24 horas depois de a pessoa escrever. Passou disso, a API
 * recusa. Uma tela que não calculasse isso deixaria alguém redigir uma
 * resposta que nunca sairia — e a pessoa do outro lado ficaria sem resposta
 * achando que foi ignorada.
 *
 * Para distinguir quem falou por último é preciso saber quem somos nós. O
 * perfil do conector expõe o NOME DE USUÁRIO do Instagram conectado, não o id
 * numérico — então aceitamos os dois e casamos por qualquer um. Sem isso, uma
 * conversa já respondida apareceria como pendente para sempre.
 */
export function normalizarConversas(
  bruto: unknown,
  opcoes: { canal?: string; nossoId?: string; nossoUsuario?: string; agora?: number } = {},
): Mensagem[] {
  const canal = opcoes.canal ?? 'instagram'
  const agora = opcoes.agora ?? Date.now()
  const conversas = Array.isArray((bruto as { conversations?: unknown })?.conversations)
    ? (bruto as { conversations: unknown[] }).conversations
    : Array.isArray(bruto) ? bruto : []

  // Quem somos nós, deduzido dos próprios dados quando não nos disseram.
  const nossos = quemSomosNesteLote(conversas, opcoes)
  const souEu = (id: string, usuario: string) =>
    (Boolean(id) && nossos.ids.has(id))
    || (Boolean(usuario) && nossos.usuarios.has(usuario.toLowerCase()))
  const sabemosQuemSomos = nossos.ids.size > 0 || nossos.usuarios.size > 0

  return conversas.flatMap((cru) => {
    if (!cru || typeof cru !== 'object') return []
    const conversa = cru as Record<string, unknown>

    const mensagens = (conversa.messages as { data?: unknown[] } | undefined)?.data ?? []
    if (!Array.isArray(mensagens) || !mensagens.length) return []

    // A mais recente primeiro: a ordem que vem da rede não é garantida.
    const ordenadas = [...mensagens]
      .filter((m): m is Record<string, unknown> => Boolean(m) && typeof m === 'object')
      .sort((a, b) => new Date(primeiro(b, QUANDO)).getTime() - new Date(primeiro(a, QUANDO)).getTime())

    const ultima = ordenadas[0]
    if (!ultima) return []

    const autorId = primeiro(ultima, ['from.id'])
    const autor = primeiro(ultima, ['from.username', 'from.name']) || 'Sem nome'
    const nossa = souEu(autorId, primeiro(ultima, ['from.username', 'from.name']))

    // A janela conta a partir da última mensagem DELA, não da nossa.
    const ultimaDelas = ordenadas.find((m) =>
      !souEu(primeiro(m, ['from.id']), primeiro(m, ['from.username', 'from.name'])))
    const quandoDelas = ultimaDelas ? new Date(normalizarData(primeiro(ultimaDelas, QUANDO))).getTime() : NaN
    const horas = Number.isNaN(quandoDelas) ? Infinity : (agora - quandoDelas) / 3_600_000
    const dentroDaJanela = horas <= JANELA_DE_RESPOSTA_HORAS

    // Quem responde é a outra ponta da conversa, não quem falou por último.
    const participantes = (conversa.participants as { data?: unknown[] } | undefined)?.data ?? []
    const outro = (Array.isArray(participantes) ? participantes : [])
      .filter((p): p is Record<string, unknown> => Boolean(p) && typeof p === 'object')
      .find((p) => !souEu(primeiro(p, ['id']), primeiro(p, ['username', 'name'])))
    const destinatarioId = outro ? primeiro(outro, ['id']) : (nossa ? '' : autorId)
    // A fila existe para mostrar quem espera. Se a última fala foi nossa, a
    // conversa está em dia — continua listada, mas sem urgência.
    const aguardando = !nossa

    return [{
      id: `dm:${canal}:${primeiro(conversa, ['id']) || destinatarioId}`,
      canal,
      origem: 'dm' as const,
      autor: outro ? (primeiro(outro, ['username', 'name']) || autor) : autor,
      autorId: destinatarioId,
      texto: primeiro(ultima, TEXTO) || '(mensagem sem texto — pode ser foto ou áudio)',
      quando: normalizarData(primeiro(ultima, QUANDO)),
      destinatarioId,
      respondivel: Boolean(destinatarioId) && dentroDaJanela,
      aguardandoResposta: aguardando,
      ...(sabemosQuemSomos ? {} : { identidadeIncerta: true }),
      motivo: !destinatarioId
        ? 'Não identifiquei para quem responder nesta conversa.'
        : !dentroDaJanela
          ? Number.isFinite(horas)
            ? `Passaram-se mais de ${JANELA_DE_RESPOSTA_HORAS}h desde a última mensagem desta pessoa. O Instagram não aceita resposta fora dessa janela — responda pelo aplicativo, se ainda for possível.`
            : 'Não consegui ler a data da última mensagem, então não dá para saber se a janela de 24h ainda está aberta.'
          : undefined,
    }]
  })
}

/** Normaliza a data para ISO; devolve vazio se não der para entender. */
function normalizarData(bruto: string): string {
  if (!bruto) return ''
  const data = new Date(bruto)
  return Number.isNaN(data.getTime()) ? '' : data.toISOString()
}

/** Mais recentes primeiro; sem data vai para o fim, não some. */
export function maisRecentesPrimeiro(mensagens: Mensagem[]): Mensagem[] {
  return [...mensagens].sort((a, b) => {
    if (!a.quando && !b.quando) return 0
    if (!a.quando) return 1
    if (!b.quando) return -1
    return new Date(b.quando).getTime() - new Date(a.quando).getTime()
  })
}


/**
 * Descobre qual conta é a nossa dentro de um lote de conversas.
 *
 * O nome de usuário vem do perfil do conector quando essa chamada dá certo.
 * Quando não dá — e ela pode falhar em silêncio —, a dedução salva: NÓS
 * estamos em toda conversa, enquanto cada pessoa do público aparece em uma.
 * O participante que se repete é a instituição.
 *
 * Isto não é elegância: é a correção de um erro que chegou à produção. Sem
 * saber quem somos, o código pegava o primeiro participante da lista — que é
 * justamente a nossa própria conta — e passou a exibir as RESPOSTAS DA
 * INSTITUIÇÃO como se fossem mensagens do público, todas assinadas com o nome
 * do perfil. Uma fila de atendimento que mostra a si mesma não é só inútil:
 * esconde quem está esperando.
 */
function quemSomosNesteLote(
  conversas: unknown[],
  opcoes: { nossoId?: string; nossoUsuario?: string },
): { ids: Set<string>; usuarios: Set<string> } {
  const ids = new Set<string>()
  const usuarios = new Set<string>()
  if (opcoes.nossoId) ids.add(opcoes.nossoId)
  if (opcoes.nossoUsuario) usuarios.add(opcoes.nossoUsuario.toLowerCase())
  if (ids.size || usuarios.size) return { ids, usuarios }

  // Conta em quantas CONVERSAS cada participante aparece (não quantas
  // mensagens mandou: quem escreve muito numa conversa só não é a instituição).
  const emQuantas = new Map<string, { conversas: number; usuario: string }>()
  for (const cru of conversas) {
    if (!cru || typeof cru !== 'object') continue
    const participantes = (cru as { participants?: { data?: unknown[] } }).participants?.data
    if (!Array.isArray(participantes)) continue
    const vistos = new Set<string>()
    for (const p of participantes) {
      if (!p || typeof p !== 'object') continue
      const id = primeiro(p as Record<string, unknown>, ['id'])
      if (!id || vistos.has(id)) continue
      vistos.add(id)
      const registro = emQuantas.get(id) ?? { conversas: 0, usuario: primeiro(p as Record<string, unknown>, ['username', 'name']) }
      registro.conversas++
      emQuantas.set(id, registro)
    }
  }

  const ordenados = [...emQuantas.entries()].sort((a, b) => b[1].conversas - a[1].conversas)
  const primeiroLugar = ordenados[0]
  const segundoLugar = ordenados[1]

  // Só decide quando há folga: presente em pelo menos duas conversas e em mais
  // conversas que qualquer outro. Empate é incerteza, e incerteza vira aviso
  // na tela — não um palpite disfarçado de fato.
  if (primeiroLugar && primeiroLugar[1].conversas >= 2
      && (!segundoLugar || primeiroLugar[1].conversas > segundoLugar[1].conversas)) {
    ids.add(primeiroLugar[0])
    if (primeiroLugar[1].usuario) usuarios.add(primeiroLugar[1].usuario.toLowerCase())
  }
  return { ids, usuarios }
}
