/**
 * O Google Ads da filial, sem banco nem rede — conferido por `npx tsx scripts/conferir-google-ads.ts`. O servidor
 * fica em lib/google/ads.ts.
 *
 * A conta é a do Google Ad Grants (a verba doada pelo Google a organizações sem fins lucrativos): só rede de
 * pesquisa, anúncios de texto, lance de até US$ 2 por clique, pelo menos dois grupos por campanha e dois anúncios
 * por grupo, segmentação geográfica, nada de palavra-chave de uma palavra só, e uma taxa de cliques de 5% ao mês
 * para a conta não ser suspensa. Os planos abaixo (PLANOS_DO_GRANTS) são uma campanha por página de destino, cada
 * uma com o seu orçamento diário: hoje, os dois guias informativos de 22/10/2026 (primeiros socorros e Lei Lucas na
 * prática), que respondem à dúvida de quem busca e só no fim apresentam o curso e a doação. Nenhum anúncio leva à
 * página de matrícula: a política do programa aceita venda só quando ela não é o foco, e aquela é uma página de venda.
 *
 * O que mora aqui: os limites do anúncio responsivo (30 letras por título, 90 por descrição, 15 por caminho), a
 * conferência do plano contra esses limites e as regras do Grants (`problemasDoPlano`), e a montagem do pedido
 * único de criação (`operacoesDaCampanha` + `pedidoDeMutacao`): um `googleAds:mutate` com nomes temporários
 * (ids negativos) que o Google resolve na ordem, de modo que ou tudo entra ou nada entra — e, com `validateOnly`,
 * o mesmo pedido só é conferido, sem gravar. Tudo nasce PAUSADO: quem liga é uma pessoa, no painel.
 */

export const API_DO_ADS = 'https://googleads.googleapis.com/v26'
/** Sem openid o Google não devolve o e-mail; o escopo do Ads não traz nada da pessoa, então o pedimos junto. */
export const ESCOPOS_ADS = ['https://www.googleapis.com/auth/adwords', 'openid', 'https://www.googleapis.com/auth/userinfo.email']

export const TITULO_MAX = 30
export const DESCRICAO_MAX = 90
export const CAMINHO_MAX = 15
export const SITELINK_TEXTO_MAX = 25
export const SITELINK_DESCRICAO_MAX = 35
export const TITULOS_MIN = 3
export const DESCRICOES_MIN = 2
/** O Ad Grants exige pelo menos dois grupos por campanha e dois anúncios por grupo. */
export const GRUPOS_MIN = 2
export const ANUNCIOS_POR_GRUPO_MIN = 2
/** O teto de lance do Ad Grants com "Maximizar cliques": US$ 2 por clique. */
export const LANCE_MAXIMO_MICROS = 2_000_000
/** Começo de cada campanha: US$ 5 por dia por página (o programa libera até US$ 329 por dia na conta toda). */
export const ORCAMENTO_DIARIO_MICROS = 5_000_000

export const SITE = 'https://cruzvermelhariodejaneiro.org'

export type Anuncio = { titulos: string[]; descricoes: string[]; url: string; caminho1?: string; caminho2?: string }
export type Grupo = { nome: string; palavras: string[]; anuncios: Anuncio[] }
export type Sitelink = { texto: string; descricao1: string; descricao2: string; url: string }
export type Plano = {
  /** O identificador do plano no Palácio (o botão manda este id). */
  id: string
  /** O nome da campanha no Google Ads: é por ele que o Palácio reconhece a campanha já criada. */
  nome: string
  /** A página que a campanha promove: todo anúncio leva a ela. */
  destino: string
  /** O que vai no fim de toda URL final (o site lê as UTMs no GA4; {keyword} e {adgroupid} o Google preenche). */
  sufixoDaUrl: string
  orcamentoDiarioMicros: number
  lanceMaximoMicros: number
  /**
   * Onde o anúncio aparece: a constante do Google e o nome canônico que ela precisa ter. Fixa, não buscada por nome:
   * "Rio de Janeiro" como City no Brasil são DUAS constantes (1001655, a cidade, e 9198038, uma localidade dentro dela),
   * e a consulta por nome não diz qual vem primeiro. Antes de criar, a constante é conferida (existe, ativa, com este
   * nome canônico). Sem idioma: desde set/2026 a API recusa critério de idioma em campanha de pesquisa
   * (ContextError.OPERATION_NOT_PERMITTED_FOR_CONTEXT); o Google casa pela língua da busca e do anúncio.
   */
  local: { constante: string; canonico: string; rotulo: string }
  grupos: Grupo[]
  negativas: string[]
  sitelinks: Sitelink[]
}

const url = (caminho: string) => `${SITE}${caminho}`

const RIO: Plano['local'] = { constante: 'geoTargetConstants/1001655', canonico: 'Rio de Janeiro,State of Rio de Janeiro,Brazil', rotulo: 'cidade do Rio de Janeiro' }
const utms = (campanha: string) => `utm_source=google&utm_medium=cpc&utm_campaign=${campanha}&utm_term={keyword}&utm_content={adgroupid}`

const GUIA_PRIMEIROS_SOCORROS = url('/noticias/primeiros-socorros-o-que-fazer-nas-emergencias-mais-comuns/')
const GUIA_LEI_LUCAS = url('/noticias/lei-lucas-na-pratica-checklist-para-escolas-e-creches/')

// Os textos dos anúncios só dizem o que a página entrega: os guias ajudam a reconhecer a emergência e a pedir ajuda, e
// as manobras se aprendem com prática (é o que a página e a política editorial do site dizem). A doação hoje é só
// por PIX (a /doe/ desligou o cartão): o sitelink não promete cartão.
const SITELINK_DOACAO: Sitelink = { texto: 'Apoie a Cruz Vermelha', descricao1: 'Doe por PIX em 1 minuto', descricao2: 'Ajude a filial do Rio', url: url('/doe/') }
const SITELINK_BEBE: Sitelink = { texto: 'Bebê engasgou?', descricao1: 'Sinais e quando chamar ajuda', descricao2: 'Engasgo leve ou grave', url: url('/noticias/o-que-fazer-quando-o-bebe-engasga/') }
// Material de estudo e emprego: quem busca isso não quer o guia.
const NEGATIVAS_DE_ESTUDO = ['pdf', 'apostila', 'apostilas', 'slide', 'slides', 'concurso', 'concursos', 'emprego', 'empregos', 'questões', 'questoes']

export const PLANOS_DO_GRANTS: Plano[] = [
  {
    id: 'guia-primeiros-socorros',
    nome: 'Grants — Guia de primeiros socorros (RJ)',
    destino: GUIA_PRIMEIROS_SOCORROS,
    sufixoDaUrl: utms('grants-guia-primeiros-socorros'),
    orcamentoDiarioMicros: ORCAMENTO_DIARIO_MICROS,
    lanceMaximoMicros: LANCE_MAXIMO_MICROS,
    local: RIO,
    grupos: [
      {
        nome: 'Convulsão',
        palavras: ['o que fazer em caso de convulsão', 'convulsão o que fazer', 'como ajudar alguém tendo convulsão', 'primeiros socorros convulsão', 'crise convulsiva o que fazer'],
        anuncios: [
          {
            url: GUIA_PRIMEIROS_SOCORROS, caminho1: 'socorros', caminho2: 'convulsao',
            titulos: ['Convulsão: o que fazer', 'O que fazer numa convulsão', 'Primeiros socorros convulsão', 'Como ajudar numa convulsão', 'Não coloque nada na boca', 'Não segure a pessoa', 'Quando ligar para o 192', 'Proteja a cabeça da pessoa', 'Orientações oficiais', 'Guia da Cruz Vermelha RJ'],
            descricoes: [
              'O que as orientações oficiais dizem sobre a convulsão e quando chamar o SAMU (192).',
              'Afaste objetos, proteja a cabeça e não segure a pessoa. Saiba quando ligar para o 192.',
              'Guia de primeiros socorros da Cruz Vermelha Brasileira Rio de Janeiro, sem custo.',
              'Primeira crise, crise longa ou pessoa machucada: ligue 192. Veja os outros casos.',
            ],
          },
          {
            url: GUIA_PRIMEIROS_SOCORROS, caminho1: 'socorros', caminho2: 'convulsao',
            titulos: ['Alguém teve uma convulsão?', 'O que fazer e o que evitar', 'Crise convulsiva: o que fazer', 'Anote a hora da crise', 'Febre pode causar convulsão', 'Quando chamar o SAMU 192', 'Primeiros socorros no RJ', 'Cruz Vermelha Brasileira RJ'],
            descricoes: [
              'Leia o guia completo com as emergências mais comuns em casa, na escola e na rua.',
              'Saiba reconhecer a crise e pedir ajuda. As manobras se aprendem com prática.',
              'Orientações da Federação Internacional da Cruz Vermelha, explicadas em português.',
            ],
          },
        ],
      },
      {
        nome: 'Queimadura',
        palavras: ['o que fazer em caso de queimadura', 'primeiros socorros queimadura', 'queimadura o que passar', 'queimadura com bolha o que fazer'],
        anuncios: [
          {
            url: GUIA_PRIMEIROS_SOCORROS, caminho1: 'socorros', caminho2: 'queimadura',
            titulos: ['Queimadura: o que fazer', 'Primeiros socorros queimadura', 'Água corrente, não manteiga', 'Não estoure as bolhas', 'Queimadura com bolha', 'Quando ligar para o 192', 'Orientações oficiais', 'Guia da Cruz Vermelha RJ'],
            descricoes: [
              'Resfrie com água corrente e não use receitas caseiras. Veja quando chamar o SAMU (192).',
              'Guia de primeiros socorros da Cruz Vermelha Brasileira RJ com orientações oficiais.',
              'Bolhas não devem ser estouradas. Saiba como proteger a queimadura até o atendimento.',
            ],
          },
          {
            url: GUIA_PRIMEIROS_SOCORROS, caminho1: 'socorros', caminho2: 'queimadura',
            titulos: ['Se queimou? Veja o que fazer', 'O que não passar na pele', 'Nada de receita caseira', 'Queimadura no rosto é grave', 'Primeiros socorros em casa', 'Cruz Vermelha Brasileira RJ'],
            descricoes: [
              'Manteiga, pasta de dente e pó de café não devem ir na pele queimada. Leia o guia.',
              'Queimadura grande, no rosto ou por choque é emergência: ligue 192. Leia o guia completo.',
            ],
          },
        ],
      },
      {
        nome: 'Emergências comuns',
        palavras: ['primeiros socorros o que fazer', 'o que fazer em caso de engasgo', 'sangramento forte o que fazer', 'para quem ligar numa emergência'],
        anuncios: [
          {
            url: GUIA_PRIMEIROS_SOCORROS, caminho1: 'socorros',
            titulos: ['Primeiros socorros: o guia', 'Engasgo e sangramento forte', 'Sangramento forte: o que fazer', 'Engasgo grave é emergência', 'Quando ligar para o 192', 'SAMU 192 e Bombeiros 193', 'Guia da Cruz Vermelha RJ'],
            descricoes: [
              'As emergências mais comuns e o que as orientações oficiais dizem para cada uma.',
              'Saiba reconhecer a emergência e pedir ajuda. As manobras se aprendem com prática.',
              'Sangramento grave: pressão direta no local e ligação para o 192. Veja o guia.',
            ],
          },
          {
            url: GUIA_PRIMEIROS_SOCORROS, caminho1: 'socorros', caminho2: 'guia',
            titulos: ['O que fazer numa emergência', 'Segurança e pedido de ajuda', 'Para quem ligar: 192 ou 193', 'Orientações oficiais', 'Cruz Vermelha Brasileira RJ'],
            descricoes: [
              'Segurança, 192, parada cardíaca, engasgo, sangramento, queimadura e convulsão num guia.',
              'Leia o guia e veja onde aprender primeiros socorros com prática no Centro do Rio.',
            ],
          },
        ],
      },
    ],
    negativas: [
      ...NEGATIVAS_DE_ESTUDO, 'online', 'ead',
      // Animais.
      'cachorro', 'cachorros', 'cachorra', 'cachorrinho', 'cadela', 'filhote', 'cão', 'cao', 'cães', 'caes', 'gato', 'gatos', 'gata', 'gatinho', 'pet', 'pets', 'animal', 'animais', 'veterinário', 'veterinario',
      // Queimadura de sol, de bicho e pedido de remédio (a página não indica produto).
      'sol', 'solar', 'água viva', 'agua viva', 'taturana', 'pomada', 'pomadas', 'remédio', 'remedio', 'remédios', 'remedios', 'medicamento', 'medicamentos',
      // Sangramentos que não são de ferimento.
      'menstruação', 'menstruacao', 'menstrual', 'menstruada', 'nariz', 'nasal', 'gengiva', 'útero', 'utero', 'vaginal', 'fezes', 'urina',
      // Temas que a página não trata, e a Lei Lucas, que tem campanha própria.
      'fratura', 'cobra', 'intoxicação', 'intoxicacao', 'envenenamento', 'lei lucas',
    ],
    sitelinks: [
      { texto: 'Lei Lucas na prática', descricao1: 'Checklist para escolas e creches', descricao2: 'O que a Lei 13.722 pede', url: GUIA_LEI_LUCAS },
      SITELINK_BEBE,
      { texto: 'Alguém desmaiou?', descricao1: 'Os sinais e a hora de pedir ajuda', descricao2: 'Guia específico de desmaio', url: url('/noticias/o-que-fazer-quando-alguem-desmaia/') },
      { texto: 'Sinais de AVC', descricao1: 'Como reconhecer a tempo', descricao2: 'E quando chamar o socorro', url: url('/noticias/sinais-de-avc-como-reconhecer-e-quando-ligar-192/') },
      { texto: 'Sinais de infarto', descricao1: 'O que não ignorar', descricao2: 'Ligue 192 ao primeiro sinal', url: url('/noticias/sinais-de-infarto-o-que-nao-ignorar/') },
      SITELINK_DOACAO,
    ],
  },
  {
    id: 'guia-lei-lucas',
    nome: 'Grants — Guia Lei Lucas na prática (RJ)',
    destino: GUIA_LEI_LUCAS,
    sufixoDaUrl: utms('grants-guia-lei-lucas'),
    orcamentoDiarioMicros: ORCAMENTO_DIARIO_MICROS,
    lanceMaximoMicros: LANCE_MAXIMO_MICROS,
    local: RIO,
    grupos: [
      {
        nome: 'Lei Lucas: o que é',
        palavras: ['lei lucas o que é', 'o que diz a lei lucas', 'o que a lei lucas exige', 'lei lucas primeiros socorros', 'lei 13.722 de 2018', 'lei 13722', 'lei lucas 2018'],
        anuncios: [
          {
            url: GUIA_LEI_LUCAS, caminho1: 'lei-lucas',
            titulos: ['Lei Lucas: o que é', 'O que diz a Lei Lucas', 'O que a Lei Lucas exige', 'Lei 13.722/2018 explicada', 'Lei Lucas primeiros socorros', 'O que a lei pede, item a item', 'Checklist para escolas', 'Guia da Cruz Vermelha RJ'],
            descricoes: [
              'O que a Lei Lucas exige de escolas e creches, artigo por artigo, e as penalidades.',
              'Guia prático da Cruz Vermelha Brasileira Rio de Janeiro para diretores e equipes.',
              'Curso anual, kit, certificado à vista e rede de urgência, com o artigo de cada item.',
            ],
          },
          {
            url: GUIA_LEI_LUCAS, caminho1: 'lei-lucas', caminho2: 'na-pratica',
            titulos: ['Lei Lucas na prática', 'Primeiros socorros na escola', 'Curso anual e certificado', 'Plano de emergência', 'A história por trás da lei', 'Cruz Vermelha Brasileira RJ'],
            descricoes: [
              'Curso todo ano, kit, certificado à vista e rede de urgência: veja o que a lei pede.',
              'Leia o checklist e organize quem faz o quê numa emergência com crianças na escola.',
            ],
          },
        ],
      },
      {
        nome: 'Lei Lucas: escolas e creches',
        palavras: ['lei lucas escolas', 'lei lucas creche', 'como cumprir a lei lucas', 'lei lucas obrigatoriedade', 'lei lucas certificado', 'lei lucas multa'],
        anuncios: [
          {
            url: GUIA_LEI_LUCAS, caminho1: 'lei-lucas', caminho2: 'escolas',
            titulos: ['Sua escola cumpre a Lei Lucas?', 'Como cumprir a Lei Lucas', 'Lei Lucas: creche e escola', 'Lei Lucas: obrigatoriedade', 'Lei Lucas: multa e penalidades', 'Checklist da Lei 13.722', 'Escolas e creches no RJ', 'Guia da Cruz Vermelha RJ'],
            descricoes: [
              'Confira item por item o que a Lei Lucas pede e o que acontece se a escola não cumprir.',
              'Guia gratuito para diretores, coordenadores e mantenedores de escolas e creches.',
              'Notificação, multa em dobro e cassação do alvará: as penalidades da Lei Lucas.',
            ],
          },
          {
            url: GUIA_LEI_LUCAS, caminho1: 'lei-lucas', caminho2: 'checklist',
            titulos: ['Lei Lucas para creches', 'Lei Lucas: certificado', 'O que a lei exige da escola', 'Certificado em local visível', 'Parte da equipe, todo ano', 'Cruz Vermelha Brasileira RJ'],
            descricoes: [
              'Quem treinar, quem ministra, kit e certificado: o checklist completo da Lei Lucas.',
              'Veja também como capacitar professores e funcionários no Centro do Rio de Janeiro.',
            ],
          },
        ],
      },
    ],
    negativas: [...NEGATIVAS_DE_ESTUDO, 'vaga', 'vagas', 'ppt', 'powerpoint', 'tcc', 'monografia', 'trabalho escolar', 'trabalho de escola', 'mapa mental', 'grátis', 'gratis', 'gratuito', 'gratuita'],
    sitelinks: [
      { texto: 'Primeiros socorros', descricao1: 'As emergências mais comuns', descricao2: 'E quando ligar para o 192', url: GUIA_PRIMEIROS_SOCORROS },
      SITELINK_BEBE,
      { texto: 'A origem da Lei Lucas', descricao1: 'Quem foi Lucas e por que a lei', descricao2: 'O que muda para as escolas', url: url('/noticias/curso-de-primeiros-socorros-lei-lucas-o-que-a-lei-exige-das-escolas/') },
      { texto: 'Quem pode dar o curso', descricao1: 'Rede pública e rede particular', descricao2: 'O que diz o art. 2º', url: url('/noticias/quem-pode-ministrar-o-curso-de-primeiros-socorros-da-lei-lucas/') },
      { texto: 'Seja voluntário no Rio', descricao1: 'Cadastro, entrevista e formação', descricao2: 'Faça parte da filial', url: url('/voluntariado/') },
      SITELINK_DOACAO,
    ],
  },
]

/** O plano pelo id do botão; null se não existir. */
export const planoPorId = (id: string): Plano | null => PLANOS_DO_GRANTS.find((p) => p.id === id) ?? null

// ---------------------------------------------------------------- a conferência do plano

const letras = (s: string) => [...s].length
/** Um telefone no texto: 8 dígitos ou mais, com ou sem DDD, parênteses, espaço ou hífen. */
const TELEFONE = /(?:\(?\d{2}\)?[\s-]?)?\d{4,5}[\s-]?\d{4}/

/** Tudo o que impede o plano de entrar no Google Ads (limites do anúncio responsivo e regras do Ad Grants). Vazio = pode ir. */
export function problemasDoPlano(plano: Plano): string[] {
  const p: string[] = []
  if (!plano.nome.trim()) p.push('A campanha precisa de nome.')
  if (plano.lanceMaximoMicros > LANCE_MAXIMO_MICROS) p.push(`O lance máximo passa de US$ ${LANCE_MAXIMO_MICROS / 1e6} (o teto do Ad Grants).`)
  if (plano.orcamentoDiarioMicros <= 0) p.push('O orçamento diário precisa ser maior que zero.')
  if (plano.grupos.length < GRUPOS_MIN) p.push(`O Ad Grants exige pelo menos ${GRUPOS_MIN} grupos de anúncios.`)
  const vistas = new Set<string>()
  for (const g of plano.grupos) {
    const onde = `Grupo "${g.nome}"`
    if (!g.nome.trim()) p.push('Há um grupo sem nome.')
    if (g.anuncios.length < ANUNCIOS_POR_GRUPO_MIN) p.push(`${onde}: o Ad Grants exige pelo menos ${ANUNCIOS_POR_GRUPO_MIN} anúncios por grupo.`)
    if (!g.palavras.length) p.push(`${onde}: sem palavras-chave.`)
    for (const palavra of g.palavras) {
      const chave = palavra.trim().toLowerCase()
      if (chave.split(/\s+/).length < 2) p.push(`${onde}: "${palavra}" tem uma palavra só (o Ad Grants não aceita).`)
      if (vistas.has(chave)) p.push(`${onde}: "${palavra}" repetida em mais de um grupo.`)
      vistas.add(chave)
      if (plano.negativas.some((n) => chave.includes(n.toLowerCase()))) p.push(`${onde}: "${palavra}" contém uma palavra negativa da campanha.`)
    }
    g.anuncios.forEach((a, i) => {
      const anuncio = `${onde}, anúncio ${i + 1}`
      if (!/^https:\/\//.test(a.url)) p.push(`${anuncio}: a URL precisa começar com https://.`)
      if (a.titulos.length < TITULOS_MIN) p.push(`${anuncio}: menos de ${TITULOS_MIN} títulos.`)
      if (a.descricoes.length < DESCRICOES_MIN) p.push(`${anuncio}: menos de ${DESCRICOES_MIN} descrições.`)
      if (a.titulos.length > 15) p.push(`${anuncio}: mais de 15 títulos (o máximo do anúncio responsivo).`)
      if (a.descricoes.length > 4) p.push(`${anuncio}: mais de 4 descrições (o máximo do anúncio responsivo).`)
      if (new Set(a.descricoes.map((d) => d.toLowerCase())).size !== a.descricoes.length) p.push(`${anuncio}: descrição repetida.`)
      if (new Set(a.titulos.map((t) => t.toLowerCase())).size !== a.titulos.length) p.push(`${anuncio}: título repetido.`)
      for (const t of a.titulos) if (letras(t) > TITULO_MAX) p.push(`${anuncio}: título com ${letras(t)} letras (máximo ${TITULO_MAX}): "${t}".`)
      for (const d of a.descricoes) if (letras(d) > DESCRICAO_MAX) p.push(`${anuncio}: descrição com ${letras(d)} letras (máximo ${DESCRICAO_MAX}): "${d}".`)
      for (const c of [a.caminho1, a.caminho2]) {
        if (c && letras(c) > CAMINHO_MAX) p.push(`${anuncio}: caminho com ${letras(c)} letras (máximo ${CAMINHO_MAX}): "${c}".`)
        if (c && /[^a-z0-9-]/.test(c)) p.push(`${anuncio}: o caminho "${c}" só pode ter letras minúsculas sem acento, números e hífen.`)
      }
      if (a.caminho2 && !a.caminho1) p.push(`${anuncio}: caminho 2 sem o caminho 1.`)
      for (const t of [...a.titulos, ...a.descricoes]) if (TELEFONE.test(t)) p.push(`${anuncio}: telefone no texto (a política do Google Ads proíbe; use extensão de chamada): "${t}".`)
    })
  }
  for (const n of plano.negativas) if (!n.trim()) p.push('Há uma palavra negativa vazia.')
  if (new Set(plano.negativas.map((n) => n.toLowerCase())).size !== plano.negativas.length) p.push('Palavra negativa repetida.')
  const textosDosAnuncios = new Set(plano.grupos.flatMap((g) => g.anuncios.flatMap((a) => [...a.titulos, ...a.descricoes])).map((t) => t.trim().toLowerCase()))
  for (const s of plano.sitelinks) {
    if (letras(s.texto) > SITELINK_TEXTO_MAX) p.push(`Sitelink "${s.texto}": texto com mais de ${SITELINK_TEXTO_MAX} letras.`)
    for (const d of [s.descricao1, s.descricao2]) if (letras(d) > SITELINK_DESCRICAO_MAX) p.push(`Sitelink "${s.texto}": descrição com mais de ${SITELINK_DESCRICAO_MAX} letras: "${d}".`)
    if (!/^https:\/\//.test(s.url)) p.push(`Sitelink "${s.texto}": a URL precisa começar com https://.`)
    for (const d of [s.descricao1, s.descricao2]) if (textosDosAnuncios.has(d.trim().toLowerCase())) p.push(`Sitelink "${s.texto}": a descrição "${d}" repete o texto de um anúncio (política de Repetição).`)
  }
  if (plano.sitelinks.length < 2) p.push('O Ad Grants pede pelo menos 2 sitelinks por campanha.')
  for (const g of plano.grupos) for (const a of g.anuncios) if (a.url !== plano.destino) p.push(`Grupo "${g.nome}": anúncio levando a ${a.url}, fora da página da campanha (${plano.destino}).`)
  return p
}

// ---------------------------------------------------------------- o pedido ao Google

/** O id da conta como a API quer: só os 10 dígitos. null se não for um id. */
export function idDaConta(valor: string | null | undefined): string | null {
  const digitos = String(valor ?? '').replace(/\D/g, '')
  return /^\d{10}$/.test(digitos) ? digitos : null
}

/** O id com traços, como aparece no painel: 630-477-5709. */
export const idDaContaNoPainel = (id: string) => id.replace(/^(\d{3})(\d{3})(\d{4})$/, '$1-$2-$3')

/** A conferência da constante do local antes de criar: ela existe, está ativa e tem o nome canônico esperado. */
export function consultaDoLocal(local: Plano['local']): string {
  return `SELECT geo_target_constant.resource_name, geo_target_constant.canonical_name, geo_target_constant.status FROM geo_target_constant WHERE geo_target_constant.resource_name = '${local.constante.replace(/'/g, '')}'`
}

/** A linha devolvida bate com o local do plano? null = sim; senão, o que está errado. */
export function problemaDoLocal(local: Plano['local'], linha: { resourceName?: unknown; canonicalName?: unknown; status?: unknown } | null | undefined): string | null {
  if (!linha || String(linha.resourceName ?? '') !== local.constante) return `O Google não achou a constante ${local.constante} (${local.rotulo}).`
  if (String(linha.status ?? '') !== 'ENABLED') return `A constante ${local.constante} (${local.rotulo}) não está ativa no Google (${String(linha.status ?? 'sem status')}).`
  if (String(linha.canonicalName ?? '') !== local.canonico) return `A constante ${local.constante} agora é "${String(linha.canonicalName ?? '')}", não "${local.canonico}": confira o local do plano.`
  return null
}
/** A própria conta: moeda, fuso e se é de administrador (o Grants é conta de anunciante, em dólar). */
export const CONSULTA_DA_CONTA = 'SELECT customer.id, customer.descriptive_name, customer.currency_code, customer.time_zone, customer.manager, customer.test_account FROM customer'
/** As campanhas que já existem, para não criar a mesma duas vezes. */
export const CONSULTA_DAS_CAMPANHAS = "SELECT campaign.id, campaign.name, campaign.status, campaign.resource_name FROM campaign WHERE campaign.status != 'REMOVED'"

export type AlvosResolvidos = { local: string }
type Operacao = Record<string, unknown>

/**
 * As operações do pedido único, agrupadas por tipo e com quem define o nome temporário antes de quem o referencia:
 * orçamento → campanha → critérios da campanha (cidade e negativas) → assets dos sitelinks → ligação deles à campanha →
 * grupos → palavras → anúncios. O Google lê as operações em sequência e junta numa chamada de back-end as contíguas do
 * mesmo tipo; intercalar abre uma por troca e pode estourar o tempo (boas práticas do mutate). Os ids temporários são
 * negativos e únicos no pedido. Tudo PAUSADO.
 */
export function operacoesDaCampanha(p: { customerId: string; plano: Plano; alvos: AlvosResolvidos }): Operacao[] {
  const { customerId: c, plano, alvos } = p
  let proximo = -1
  const temp = (tipo: string) => `customers/${c}/${tipo}/${proximo--}`
  const orcamentos: Operacao[] = [], campanhas: Operacao[] = [], criterios: Operacao[] = [], assets: Operacao[] = [], assetsDaCampanha: Operacao[] = []
  const grupos: Operacao[] = [], palavras: Operacao[] = [], anuncios: Operacao[] = []

  const orcamento = temp('campaignBudgets')
  orcamentos.push({ campaignBudgetOperation: { create: { resourceName: orcamento, name: `Orçamento — ${plano.nome}`, amountMicros: String(plano.orcamentoDiarioMicros), deliveryMethod: 'STANDARD', explicitlyShared: false } } })

  const campanha = temp('campaigns')
  campanhas.push({
    campaignOperation: {
      create: {
        resourceName: campanha, name: plano.nome, status: 'PAUSED', advertisingChannelType: 'SEARCH', campaignBudget: orcamento,
        // Maximizar cliques com teto de lance só para começar: o Ad Grants o tolera sem dados de conversão, mas a política
        // pede lance inteligente por conversão. Com conversões registradas na conta, trocar no painel para Maximizar conversões.
        targetSpend: { cpcBidCeilingMicros: String(plano.lanceMaximoMicros) },
        // Só a pesquisa do Google: sem parceiros de pesquisa nem Display (regra do programa).
        networkSettings: { targetGoogleSearch: true, targetSearchNetwork: false, targetContentNetwork: false, targetPartnerSearchNetwork: false },
        // Quem ESTÁ na cidade, não quem só se interessa por ela.
        geoTargetTypeSetting: { positiveGeoTargetType: 'PRESENCE', negativeGeoTargetType: 'PRESENCE' },
        containsEuPoliticalAdvertising: 'DOES_NOT_CONTAIN_EU_POLITICAL_ADVERTISING',
        finalUrlSuffix: plano.sufixoDaUrl,
      },
    },
  })

  criterios.push({ campaignCriterionOperation: { create: { campaign: campanha, location: { geoTargetConstant: alvos.local } } } })
  for (const texto of plano.negativas) criterios.push({ campaignCriterionOperation: { create: { campaign: campanha, negative: true, keyword: { text: texto, matchType: 'PHRASE' } } } })

  for (const s of plano.sitelinks) {
    const asset = temp('assets')
    assets.push({ assetOperation: { create: { resourceName: asset, finalUrls: [s.url], sitelinkAsset: { linkText: s.texto, description1: s.descricao1, description2: s.descricao2 } } } })
    assetsDaCampanha.push({ campaignAssetOperation: { create: { campaign: campanha, asset, fieldType: 'SITELINK' } } })
  }

  for (const g of plano.grupos) {
    const grupo = temp('adGroups')
    grupos.push({ adGroupOperation: { create: { resourceName: grupo, campaign: campanha, name: g.nome, status: 'PAUSED', type: 'SEARCH_STANDARD' } } })
    for (const palavra of g.palavras) {
      palavras.push({ adGroupCriterionOperation: { create: { adGroup: grupo, status: 'ENABLED', keyword: { text: palavra, matchType: 'PHRASE' } } } })
    }
    for (const a of g.anuncios) {
      anuncios.push({
        adGroupAdOperation: {
          create: {
            adGroup: grupo, status: 'PAUSED',
            ad: {
              finalUrls: [a.url],
              responsiveSearchAd: {
                headlines: a.titulos.map((text) => ({ text })),
                descriptions: a.descricoes.map((text) => ({ text })),
                ...(a.caminho1 ? { path1: a.caminho1 } : {}),
                ...(a.caminho2 ? { path2: a.caminho2 } : {}),
              },
            },
          },
        },
      })
    }
  }
  return [...orcamentos, ...campanhas, ...criterios, ...assets, ...assetsDaCampanha, ...grupos, ...palavras, ...anuncios]
}

/** O pedido HTTP do `googleAds:mutate`. `validar`: só confere, não grava (validateOnly). */
export function pedidoDeMutacao(customerId: string, operacoes: Operacao[], validar: boolean): { url: string; corpo: Record<string, unknown> } {
  return {
    url: `${API_DO_ADS}/customers/${customerId}/googleAds:mutate`,
    corpo: { mutateOperations: operacoes, partialFailure: false, validateOnly: validar, responseContentType: 'RESOURCE_NAME_ONLY' },
  }
}

export const pedidoDeConsulta = (customerId: string, query: string): { url: string; corpo: Record<string, unknown> } =>
  ({ url: `${API_DO_ADS}/customers/${customerId}/googleAds:search`, corpo: { query } })

/** A lista das contas que a autorização alcança (o GET /customers:listAccessibleCustomers): "customers/6304775709" → "6304775709". */
export function lerContasAcessiveis(resposta: unknown): string[] {
  const nomes = (resposta as { resourceNames?: unknown })?.resourceNames
  if (!Array.isArray(nomes)) return []
  return nomes.map((n) => idDaConta(String(n).replace(/^customers\//, ''))).filter((n): n is string => Boolean(n))
}

/** A conta que a conexão vai usar: a escolhida (se a autorização a alcança), senão a única acessível, senão nenhuma. */
export function contaEscolhida(p: { acessiveis: string[]; preferida: string | null }): string | null {
  if (p.preferida && p.acessiveis.includes(p.preferida)) return p.preferida
  return p.acessiveis.length === 1 ? p.acessiveis[0] : null
}

/** A campanha resolvida do pedido real: o primeiro resultado de campanha. */
export function lerCampanhaCriada(resposta: unknown): string | null {
  const resultados = (resposta as { mutateOperationResponses?: unknown })?.mutateOperationResponses
  if (!Array.isArray(resultados)) return null
  for (const r of resultados) {
    const nome = (r as { campaignResult?: { resourceName?: unknown } })?.campaignResult?.resourceName
    if (typeof nome === 'string' && nome) return nome
  }
  return null
}

/** O id numérico de "customers/…/campaigns/123". */
export const idDaCampanha = (resourceName: string): string | null => /\/campaigns\/(\d+)$/.exec(resourceName)?.[1] ?? null

/** O link da campanha no painel do Google Ads. */
export const linkDaCampanha = (customerId: string, campanhaId: string) => `https://ads.google.com/aw/overview?campaignId=${campanhaId}&__c=${customerId}`

// ---------------------------------------------------------------- as falhas

export type MotivoDaFalhaDoAds = 'reconectar' | 'acesso' | 'conta' | 'pedido' | 'servico' | 'outro'

/**
 * O que a API devolveu, em uma frase. A API do Google Ads responde com `error.details[].errors[]`, cada um com o
 * código (ex.: `authorizationError: 'CLOUD_PROJECT_NOT_APPROVED_FOR_PRODUCTION'`, o projeto do Google Cloud só com acesso de
 * teste) e a mensagem; sem detalhes, vale `error.message`.
 */
export function motivoDaFalhaDoAds(status: number, corpo: unknown): { motivo: MotivoDaFalhaDoAds; texto: string } {
  const erro = (corpo as { error?: { message?: unknown; status?: unknown; details?: unknown } })?.error ?? {}
  const detalhes = Array.isArray(erro.details) ? erro.details : []
  const erros: { codigo: string; mensagem: string }[] = []
  for (const d of detalhes) {
    const lista = (d as { errors?: unknown })?.errors
    if (!Array.isArray(lista)) continue
    for (const e of lista) {
      const codigoObj = (e as { errorCode?: Record<string, unknown> })?.errorCode ?? {}
      const [tipo, valor] = Object.entries(codigoObj)[0] ?? ['', '']
      erros.push({ codigo: tipo ? `${tipo}: ${String(valor)}` : '', mensagem: String((e as { message?: unknown })?.message ?? '') })
    }
  }
  const primeiro = erros[0]
  const mensagem = String(erro.message ?? '').trim()
  const codigos = erros.map((e) => e.codigo).join(' ')
  if (status === 401 || /UNAUTHENTICATED/i.test(String(erro.status ?? ''))) return { motivo: 'reconectar', texto: 'A autorização do Google Ads expirou ou foi revogada. Reconecte em Configurações → E-mail dos setores.' }
  if (/DEVELOPER_TOKEN|ACCESS_LEVEL|PROJECT_NOT|NOT_APPROVED/i.test(codigos)) return { motivo: 'acesso', texto: `O projeto do Google Cloud ainda não tem acesso à API do Google Ads para contas reais (peça o nível Explorer na página "Google Ads API → Visão geral" do console). O Google disse: ${primeiro?.mensagem || mensagem || codigos}` }
  if (/USER_PERMISSION_DENIED|CUSTOMER_NOT_FOUND|CUSTOMER_NOT_ENABLED|NOT_ADS_USER/i.test(codigos) || status === 403) return { motivo: 'conta', texto: `A conta conectada não alcança a conta de anúncios escolhida. ${primeiro?.mensagem || mensagem || codigos}`.trim() }
  if (status === 400 && (primeiro || mensagem)) {
    const lista = erros.slice(0, 5).map((e) => `${e.mensagem}${e.codigo ? ` (${e.codigo})` : ''}`).join(' · ')
    return { motivo: 'pedido', texto: `O Google recusou o pedido: ${lista || mensagem}${erros.length > 5 ? ` · e mais ${erros.length - 5}` : ''}` }
  }
  if (status === 0 || status === 429 || status >= 500) return { motivo: 'servico', texto: `O Google Ads não respondeu (${status || 'sem resposta'}). Tente de novo em alguns minutos.` }
  return { motivo: 'outro', texto: `O Google Ads recusou (${status}): ${primeiro?.mensagem || mensagem || 'sem detalhes'}` }
}

/** Um resumo do plano para a tela: quantos grupos, palavras, anúncios. */
export function resumoDoPlano(plano: Plano): { grupos: number; palavras: number; anuncios: number; negativas: number; sitelinks: number } {
  return {
    grupos: plano.grupos.length,
    palavras: plano.grupos.reduce((n, g) => n + g.palavras.length, 0),
    anuncios: plano.grupos.reduce((n, g) => n + g.anuncios.length, 0),
    negativas: plano.negativas.length,
    sitelinks: plano.sitelinks.length,
  }
}
