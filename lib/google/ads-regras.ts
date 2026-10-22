/**
 * O Google Ads da filial, sem banco nem rede — conferido por `npx tsx scripts/conferir-google-ads.ts`. O servidor
 * fica em lib/google/ads.ts.
 *
 * A conta é a do Google Ad Grants (a verba doada pelo Google a organizações sem fins lucrativos): só rede de
 * pesquisa, anúncios de texto, lance de até US$ 2 por clique, pelo menos dois grupos por campanha e dois anúncios
 * por grupo, segmentação geográfica, nada de palavra-chave de uma palavra só, e uma taxa de cliques de 5% ao mês
 * para a conta não ser suspensa. O plano abaixo (PLANO_DO_GRANTS) é a campanha institucional que leva quem busca
 * ao site da filial: a marca, o voluntariado, a doação, a Campanha do Agasalho, os princípios e a história. Os
 * cursos pagos da Escola ficam de fora de propósito: a política do programa aceita venda só quando não é o foco,
 * e a página de matrícula é uma página de venda.
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
/** O programa libera até US$ 329 por dia; começa com menos, até a conta mostrar a taxa de cliques. */
export const ORCAMENTO_DIARIO_MICROS = 100_000_000

export const SITE = 'https://cruzvermelhariodejaneiro.org'

export type Anuncio = { titulos: string[]; descricoes: string[]; url: string; caminho1?: string; caminho2?: string }
export type Grupo = { nome: string; palavras: string[]; anuncios: Anuncio[] }
export type Sitelink = { texto: string; descricao1: string; descricao2: string; url: string }
export type Plano = {
  nome: string
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

export const PLANO_DO_GRANTS: Plano = {
  nome: 'Grants — Institucional (Rio de Janeiro)',
  sufixoDaUrl: 'utm_source=google&utm_medium=cpc&utm_campaign=grants-institucional&utm_term={keyword}&utm_content={adgroupid}',
  orcamentoDiarioMicros: ORCAMENTO_DIARIO_MICROS,
  lanceMaximoMicros: LANCE_MAXIMO_MICROS,
  local: { constante: 'geoTargetConstants/1001655', canonico: 'Rio de Janeiro,State of Rio de Janeiro,Brazil', rotulo: 'cidade do Rio de Janeiro' },
  grupos: [
    {
      nome: 'Marca',
      palavras: [
        'cruz vermelha rio de janeiro', 'cruz vermelha rj', 'cruz vermelha brasileira rio de janeiro', 'cruz vermelha brasileira rj',
        'cruz vermelha do rio', 'palácio da cruz vermelha', 'cruz vermelha centro rio',
      ],
      anuncios: [
        {
          url: url('/'), caminho1: 'rio-de-janeiro',
          titulos: ['Cruz Vermelha Rio de Janeiro', 'Filial do Rio desde 1908', 'Palácio da Cruz Vermelha', 'Site oficial da filial RJ', 'No Centro do Rio de Janeiro', 'Quem somos e o que fazemos'],
          descricoes: [
            'Formação de voluntários, campanhas de apoio e educação preventiva no Rio de Janeiro.',
            'Associação sem fins lucrativos, parte do Movimento Internacional da Cruz Vermelha.',
            'Sede na Praça da Cruz Vermelha, 10, Centro. Veja como ajudar e como falar com a gente.',
          ],
        },
        {
          url: url('/quem-somos/'), caminho1: 'quem-somos',
          titulos: ['Cruz Vermelha Brasileira RJ', 'Conheça a filial do Rio', 'Missão, sede e diretoria', 'Como a filial se financia', 'Utilidade pública no Rio'],
          descricoes: [
            'O que a filial faz no Rio, onde fica a sede, os reconhecimentos e quem dirige.',
            'Prevenir e aliviar o sofrimento humano, com imparcialidade. Saiba como participar.',
          ],
        },
      ],
    },
    {
      nome: 'Voluntariado',
      palavras: [
        'voluntário cruz vermelha', 'voluntariado cruz vermelha', 'ser voluntário cruz vermelha', 'como ser voluntário no rio de janeiro',
        'voluntariado rio de janeiro', 'trabalho voluntário rio de janeiro', 'ong para ser voluntário rio', 'voluntariado centro rio',
      ],
      anuncios: [
        {
          url: url('/voluntariado/'), caminho1: 'voluntariado',
          titulos: ['Seja voluntário no Rio', 'Voluntariado Cruz Vermelha', 'Cadastro de voluntários', 'Formação gratuita interna', 'Quatro turmas por ano', 'Como entrar e o que esperar'],
          descricoes: [
            'Cadastre-se, faça a entrevista e a formação inicial. Quatro turmas por ano, no Centro.',
            'Voluntariado pela Lei 9.608/1998, com termo de adesão. Formação só para quem é aceito.',
            'Primeiros socorros, campanhas e apoio comunitário. Entre para a Cruz Vermelha RJ.',
          ],
        },
        {
          url: url('/voluntariado/cadastro/'), caminho1: 'voluntariado', caminho2: 'cadastro',
          titulos: ['Quero ser voluntário', 'Cruz Vermelha Rio de Janeiro', 'Cadastro online em minutos', 'Entrevista e formação', 'Tire dúvidas no WhatsApp'],
          descricoes: [
            'Preencha o cadastro e a equipe do voluntariado entra em contato para a entrevista.',
            'Dúvidas antes de se cadastrar? Fale com a equipe no WhatsApp exclusivo do voluntariado.',
          ],
        },
      ],
    },
    {
      nome: 'Doação',
      palavras: [
        'doar para cruz vermelha', 'doação cruz vermelha', 'cruz vermelha doação pix', 'como ajudar a cruz vermelha',
        'doar pix ong rio de janeiro', 'doação para ong rio de janeiro', 'doar para instituição no rio', 'doação online rio de janeiro',
      ],
      anuncios: [
        {
          url: url('/doe/'), caminho1: 'doe',
          titulos: ['Doe para a Cruz Vermelha RJ', 'Doação por PIX ou cartão', 'A partir de R$ 5', 'Comprovante por e-mail', 'Ajude a filial do Rio', 'Recibo com o CNPJ da filial'],
          descricoes: [
            'Doe por PIX ou cartão, a partir de R$ 5. O comprovante chega no e-mail com o CNPJ.',
            'A doação mantém o Palácio da Cruz Vermelha e as atividades da filial no Rio.',
            'Associação sem fins lucrativos, utilidade pública municipal e estadual.',
          ],
        },
        {
          url: url('/doe/'), caminho1: 'doe', caminho2: 'pix',
          titulos: ['Doação por PIX em 1 minuto', 'Cruz Vermelha Rio de Janeiro', 'Qualquer valor ajuda', 'Transparência nos documentos', 'Doe com segurança'],
          descricoes: [
            'Escolha o valor, pague pelo PIX e receba o comprovante no e-mail. Sem cadastro longo.',
            'Veja no portal da transparência os documentos da filial e para onde vai a doação.',
          ],
        },
      ],
    },
    {
      nome: 'Campanha do Agasalho',
      palavras: [
        'campanha do agasalho rio de janeiro', 'campanha do agasalho rj', 'doar roupas rio de janeiro', 'onde doar roupas no rio',
        'doação de cobertores rio de janeiro', 'doar agasalho rio', 'onde doar roupas de frio rj', 'doação de roupas centro rio',
      ],
      anuncios: [
        {
          url: url('/campanha-agasalho.html'), caminho1: 'agasalho',
          titulos: ['Campanha do Agasalho RJ', 'Doe roupas de frio no Rio', 'Cobertores e calçados', 'Entrega na sede, no Centro', 'Segunda a sexta, 10h às 17h', 'Cruz Vermelha Rio de Janeiro'],
          descricoes: [
            'Entregue roupas de frio, cobertores e calçados na sede: Praça da Cruz Vermelha, 10.',
            'De segunda a sexta, das 10h às 17h. A Cruz Vermelha RJ encaminha a quem precisa.',
            'Roupas limpas e em bom estado. Veja o que doar e como chegar à sede, no Centro.',
          ],
        },
        {
          url: url('/campanha-agasalho.html'), caminho1: 'agasalho', caminho2: 'onde-doar',
          titulos: ['Onde doar roupas no Rio', 'Cruz Vermelha, no Centro', 'Agasalhos e cobertores', 'Entrega de segunda a sexta', 'Doação de roupas de frio'],
          descricoes: [
            'Leve agasalhos, cobertores e calçados à Praça da Cruz Vermelha, 10, de segunda a sexta.',
            'A filial recebe e distribui a quem precisa. Horário: das 10h às 17h.',
          ],
        },
      ],
    },
    {
      nome: 'Princípios e emblema',
      palavras: [
        'princípios da cruz vermelha', 'sete princípios fundamentais cruz vermelha', 'princípios fundamentais do movimento', 'emblema da cruz vermelha',
        'símbolo da cruz vermelha', 'quem pode usar a cruz vermelha', 'cruz vermelha significado', 'o que é a cruz vermelha',
      ],
      anuncios: [
        {
          url: url('/principios-fundamentais/'), caminho1: 'principios',
          titulos: ['Os 7 princípios fundamentais', 'Cruz Vermelha Rio de Janeiro', 'Humanidade e imparcialidade', 'Texto oficial do Estatuto', 'Neutralidade e independência', 'O que guia a Cruz Vermelha'],
          descricoes: [
            'Humanidade, imparcialidade, neutralidade, independência, voluntariado e unidade.',
            'O texto oficial dos princípios, do Estatuto da Cruz Vermelha Brasileira, explicado.',
            'Entenda o que cada princípio significa no dia a dia da filial do Rio de Janeiro.',
          ],
        },
        {
          url: url('/emblema/'), caminho1: 'emblema',
          titulos: ['O emblema da Cruz Vermelha', 'Quem pode usar o símbolo', 'Cruz, crescente e cristal', 'Uso protetor e indicativo', 'Avise sobre uso indevido'],
          descricoes: [
            'De onde vem a cruz vermelha, o que significa e quem pode usar no Brasil.',
            'Os emblemas do Movimento no mundo, com imagens históricas, e como avisar a filial.',
          ],
        },
      ],
    },
    {
      nome: 'História e direito humanitário',
      palavras: [
        'história da cruz vermelha', 'história da cruz vermelha no brasil', 'cruz vermelha brasileira 1908', 'fundação da cruz vermelha brasileira',
        'convenções de genebra cruz vermelha', 'direito internacional humanitário', 'o que é direito internacional humanitário', 'movimento internacional da cruz vermelha',
      ],
      anuncios: [
        {
          url: url('/historia/'), caminho1: 'historia',
          titulos: ['História da Cruz Vermelha', 'No Brasil desde 1908', 'Fundada no Rio de Janeiro', 'O Palácio e a Escola', 'Linha do tempo com fontes', 'Cruz Vermelha Rio de Janeiro'],
          descricoes: [
            'Da fundação da Cruz Vermelha Brasileira, em 1908, no Rio, ao Palácio da Cruz Vermelha.',
            'Linha do tempo com fontes: a Escola de Enfermagem, as guerras, as campanhas no Rio.',
            'Conheça a história da filial do Rio de Janeiro e do Movimento Internacional.',
          ],
        },
        {
          url: url('/direito-internacional-humanitario/'), caminho1: 'dih',
          titulos: ['Direito Humanitário (DIH)', 'As Convenções de Genebra', 'Protocolos e decretos', 'Explicado pela Cruz Vermelha', 'O que o DIH protege'],
          descricoes: [
            'As Convenções de Genebra, os Protocolos e os decretos que os promulgaram no Brasil.',
            'O papel da Cruz Vermelha no direito internacional humanitário, em linguagem simples.',
          ],
        },
      ],
    },
  ],
  // Fora desta campanha: os cursos pagos (outra campanha, se um dia houver), emprego e concursos, serviços de saúde (a
  // filial não coleta sangue nem atende; na Praça da Cruz Vermelha ficam o INCA e hospitais) e as Cruzes Vermelhas de
  // outros lugares. Negativa não casa variante: com acento e sem acento são duas, e o plural também — por isso os pares.
  // "vaga" não entra: "vagas de voluntariado" é a busca que o grupo Voluntariado quer.
  negativas: [
    'curso', 'cursos', 'primeiros socorros', 'bombeiro civil', 'cuidador de idosos', 'punção venosa', 'puncao venosa', 'enfermagem',
    'matrícula', 'matricula',
    'emprego', 'empregos', 'concurso', 'concursos', 'salário', 'salario', 'estágio', 'estagio', 'estágios', 'estagios',
    'hospital', 'hospitais', 'samu', 'ambulância', 'ambulancia', 'consulta', 'consultas', 'atendimento médico', 'atendimento medico',
    'sangue', 'medula', 'inca', 'câncer', 'cancer',
    'portuguesa', 'espanhola', 'argentina', 'americana', 'são paulo', 'sao paulo', 'curitiba', 'belo horizonte', 'salvador', 'brasília', 'brasilia',
  ],
  sitelinks: [
    { texto: 'Doe', descricao1: 'Doação pelo site da filial', descricao2: 'Mantém o Palácio e as ações', url: url('/doe/') },
    { texto: 'Seja voluntário', descricao1: 'Veja as etapas para entrar', descricao2: 'Turmas ao longo do ano', url: url('/voluntariado/') },
    { texto: 'Quem somos', descricao1: 'O que a filial faz hoje', descricao2: 'Reconhecimentos e diretoria', url: url('/quem-somos/') },
    { texto: 'Campanha do Agasalho', descricao1: 'O que doar e onde entregar', descricao2: 'Horário e endereço da sede', url: url('/campanha-agasalho.html') },
  ],
}

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
  if (plano.sitelinks.length && plano.sitelinks.length < 2) p.push('Com sitelinks, o Google pede pelo menos 2.')
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
        // Maximizar cliques com teto de lance: o que o Ad Grants aceita sem conversão configurada.
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
