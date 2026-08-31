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

/** Uma fala dentro de uma conversa de DM, para a tela desenhar o chat. */
export type Fala = {
  id: string
  texto: string
  /** ISO 8601, ou vazio quando a rede não informou. */
  quando: string
  /** true quando quem falou fomos nós — o balão muda de lado. */
  nossa: boolean
  autor: string
}

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
  /**
   * A conversa inteira, da mais antiga para a mais recente. Só em DM: é o que
   * deixa a tela abrir o chat como ele aparece na rede, em vez de mostrar uma
   * fala solta sem o antes e o depois.
   */
  conversa?: Fala[]
  /** Foto de perfil de quem escreveu, quando a rede devolve. */
  foto?: string
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
const FOTO = [
  'profile_pic_url', 'profile_picture_url', 'profile_pic', 'avatar_url',
  'picture.data.url', 'user.profile_pic_url', 'from.profile_pic_url',
  'from.picture.data.url', 'author.profileImageUrl',
  'snippet.authorProfileImageUrl', 'snippet.topLevelComment.snippet.authorProfileImageUrl',
]

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
      ...(primeiro(item, FOTO) ? { foto: primeiro(item, FOTO) } : {}),
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
    // A pessoa é procurada entre participantes E remetentes — o endpoint nem
    // sempre devolve participants, e foi assim que a fila inteira apareceu
    // assinada com o nome da própria filial. Quando nem a identidade se sabe,
    // a aposta honesta é quem ABRIU a conversa: o público escreve primeiro
    // para a instituição, não o contrário — e a tela avisa a incerteza.
    const participantes = (conversa.participants as { data?: unknown[] } | undefined)?.data ?? []
    const candidatos: Record<string, unknown>[] = [
      ...(Array.isArray(participantes) ? participantes : []),
      ...[...ordenadas].reverse().map((m) => (m.from ?? {}) as Record<string, unknown>),
    ].filter((p): p is Record<string, unknown> => Boolean(p) && typeof p === 'object')

    const primeiraFala = ordenadas[ordenadas.length - 1]
    const outro = sabemosQuemSomos
      ? candidatos.find((p) =>
          (primeiro(p, ['id']) || primeiro(p, ['username', 'name']))
          && !souEu(primeiro(p, ['id']), primeiro(p, ['username', 'name'])))
      : (primeiraFala?.from as Record<string, unknown> | undefined)
    const destinatarioId = outro ? primeiro(outro, ['id']) : (nossa ? '' : autorId)
    // A fila existe para mostrar quem espera. Se a última fala foi nossa, a
    // conversa está em dia — continua listada, mas sem urgência.
    const aguardando = !nossa

    // O chat da tela, na ordem em que a conversa aconteceu.
    const falas: Fala[] = [...ordenadas].reverse().map((m, i) => ({
      id: primeiro(m, ID) || `fala:${i}`,
      texto: primeiro(m, TEXTO) || '(mensagem sem texto — pode ser foto ou áudio)',
      quando: normalizarData(primeiro(m, QUANDO)),
      nossa: souEu(primeiro(m, ['from.id']), primeiro(m, ['from.username', 'from.name'])),
      autor: primeiro(m, ['from.username', 'from.name']) || 'Sem nome',
    }))

    return [{
      id: `dm:${canal}:${primeiro(conversa, ['id']) || destinatarioId}`,
      canal,
      origem: 'dm' as const,
      autor: outro ? (primeiro(outro, ['username', 'name']) || autor) : autor,
      autorId: destinatarioId,
      ...(fotoDe(outro, candidatos) ? { foto: fotoDe(outro, candidatos) } : {}),
      texto: primeiro(ultima, TEXTO) || '(mensagem sem texto — pode ser foto ou áudio)',
      quando: normalizarData(primeiro(ultima, QUANDO)),
      destinatarioId,
      respondivel: Boolean(destinatarioId) && dentroDaJanela,
      aguardandoResposta: aguardando,
      conversa: falas,
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
  if (opcoes.nossoUsuario) usuarios.add(opcoes.nossoUsuario.replace(/^@/, '').toLowerCase())

  // A dedução roda SEMPRE, mesmo com o perfil em mãos. O perfil pode devolver
  // um nome de exibição em vez do @ — e um "quem somos" que não casa com nada
  // é pior do que nenhum: cada conversa passa a apontar para o participante
  // errado com toda a confiança do mundo.
  //
  // Conta em quantas CONVERSAS cada conta aparece — como participante OU como
  // remetente (não quantas mensagens mandou: quem escreve muito numa conversa
  // só não é a instituição). Os remetentes entram porque o endpoint nem sempre
  // devolve participants, e sem eles a dedução ficava cega.
  const emQuantas = new Map<string, { conversas: number; usuario: string }>()
  for (const cru of conversas) {
    if (!cru || typeof cru !== 'object') continue
    const conversa = cru as { participants?: { data?: unknown[] }; messages?: { data?: unknown[] } }
    const gente = [
      ...(Array.isArray(conversa.participants?.data) ? conversa.participants.data : []),
      ...(Array.isArray(conversa.messages?.data) ? conversa.messages.data : [])
        .map((m) => (m && typeof m === 'object' ? (m as Record<string, unknown>).from : undefined)),
    ]
    const vistos = new Set<string>()
    for (const p of gente) {
      if (!p || typeof p !== 'object') continue
      const registroDe = p as Record<string, unknown>
      const usuario = primeiro(registroDe, ['username', 'name'])
      const chave = primeiro(registroDe, ['id']) || (usuario ? `usuario:${usuario.toLowerCase()}` : '')
      if (!chave || vistos.has(chave)) continue
      vistos.add(chave)
      const registro = emQuantas.get(chave) ?? { conversas: 0, usuario }
      registro.conversas++
      if (!registro.usuario && usuario) registro.usuario = usuario
      emQuantas.set(chave, registro)
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
    if (!primeiroLugar[0].startsWith('usuario:')) ids.add(primeiroLugar[0])
    if (primeiroLugar[1].usuario) usuarios.add(primeiroLugar[1].usuario.toLowerCase())
  }
  return { ids, usuarios }
}

/**
 * A foto da pessoa: a que vier nela mesma, ou a de qualquer outra aparição
 * dela na conversa (participante e remetente carregam campos diferentes).
 */
function fotoDe(
  pessoa: Record<string, unknown> | undefined,
  candidatos: Record<string, unknown>[],
): string {
  if (!pessoa) return ''
  const direta = primeiro(pessoa, FOTO)
  if (direta) return direta
  const id = primeiro(pessoa, ['id'])
  const usuario = primeiro(pessoa, ['username', 'name']).toLowerCase()
  for (const c of candidatos) {
    const mesmo = (id && primeiro(c, ['id']) === id)
      || (usuario && primeiro(c, ['username', 'name']).toLowerCase() === usuario)
    if (mesmo) {
      const foto = primeiro(c, FOTO)
      if (foto) return foto
    }
  }
  return ''
}
