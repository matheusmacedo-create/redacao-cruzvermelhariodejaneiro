import {
  Archive, AtSign, BadgeCheck, Bell, CircleHelp, Fingerprint, GraduationCap, Landmark, Megaphone, ShieldCheck, Wallet, Package, CalendarDays, ChartColumn, FileSignature, FolderKanban, HeartHandshake, History, House, IdCard, Images, Inbox,
  KeyRound, LifeBuoy, ListChecks, Mail, MessageCircleHeart, MessagesSquare, Newspaper, PiggyBank, PlugZap, Radar, ScrollText, Send, Settings, SquareCheckBig, Upload, UserRound, Contact,
  ReceiptText, ShoppingCart, type LucideIcon,
} from 'lucide-react'
import type { Permissao } from './permissoes'

/**
 * O mapa do sistema — a fonte única dos nomes das áreas.
 *
 * Sidebar, barra do topo, migalhas e a busca (⌘K) leem daqui. Os grupos seguem
 * os SETORES e o trabalho de cada um (docs/NAVEGACAO.md §5, reorganização de
 * 27/09/2026): o que é do dia de todo mundo no topo; o expediente que qualquer
 * setor usa; a comunicação em três etapas (Redação, Mídia, Público); a gestão
 * administrativo-financeira; as pessoas; a escola. Cada área aparece UMA vez,
 * com um nome e um ícone só dela. O que é parte de outra área (o Histórico dos
 * Resultados, os Canais oficiais da Transparência) não ocupa linha: vira aba
 * dentro dela (`dentroDe`), e a linha da área-mãe acende.
 *
 * Os ENDEREÇOS não mudaram (/redes, /impacto, /correio…): há links gravados em
 * notificações, e-mails já enviados e favoritos. Só o nome na tela mudou; o
 * nome antigo continua em `termos`, para a busca achar quem procura por ele.
 *
 * Módulo puro (sem banco, sem `server-only`): dá para conferir com um script
 * (scripts/conferir-navegacao.ts).
 */

export type Contador = 'aprovacoes' | 'chat'

export type Area = {
  href: string
  rotulo: string
  /** O que se faz lá, em uma linha. Aparece na busca. */
  resumo: string
  icone: LucideIcon
  /** Nomes antigos e sinônimos que a busca também aceita. */
  termos?: string[]
  /** Só aparece para quem pode; a página confere de novo no servidor. */
  permissao?: Permissao
  /** Número ao lado do nome, vindo do layout. */
  contador?: Contador
  /** Tem endereço, busca, migalhas e aba, mas não ocupa linha na sidebar (já tem atalho no topo ou mora dentro de outra área). */
  foraDoMenu?: boolean
  /**
   * É uma parte de outra área (o href da área-mãe): não ocupa linha na
   * sidebar, a linha da mãe acende quando ela está aberta, e as migalhas
   * mostram "mãe › esta". A tela mostra as abas da família (AbasDaArea).
   */
  dentroDe?: string
  /** Só para quem foi escolhido por pessoa, não por papel: `acessos_leitores` ou `envios_avaliadores`. */
  soPara?: Escolhido
}

/** Áreas liberadas pessoa a pessoa (tabelas próprias), e não pelo papel. */
export type Escolhido = 'leitorDeAcessos' | 'avaliadorDeEnvios'

export type Grupo = { id: string; rotulo: string | null; areas: Area[] }

export const GRUPOS: Grupo[] = [
  {
    // Sem título: o que é do dia de cada pessoa, de qualquer setor.
    id: 'meu-dia',
    rotulo: null,
    areas: [
      { href: '/dashboard', rotulo: 'Início', resumo: 'O seu dia, a semana da operação e os indicadores', icone: House, termos: ['visão geral', 'dashboard', 'painel'] },
      { href: '/aprovacoes', rotulo: 'Aprovações', resumo: 'O que espera o seu voto e quem ainda falta decidir', icone: SquareCheckBig, termos: ['votar', 'revisão', 'aprovar'], contador: 'aprovacoes' },
      { href: '/chat', rotulo: 'Chat', resumo: 'Canais e mensagens diretas da equipe, ao vivo e guardados', icone: MessagesSquare, termos: ['conversas', 'mensagens', 'recados', 'slack', 'canal', 'direct', 'equipe'], contador: 'chat' },
      // A agenda junta as datas de todas as áreas (pautas, voluntariado, escola, doações…): é de todos, não de um setor.
      { href: '/calendario', rotulo: 'Calendário', resumo: 'A agenda do Palácio: prazos, eventos, publicações e plantões de todas as áreas', icone: CalendarDays, termos: ['calendário editorial', 'agenda', 'eventos', 'prazos'] },
      // O sino do topo leva aqui ("Ver todas"); uma linha na sidebar repetiria o sino.
      { href: '/notificacoes', rotulo: 'Notificações', resumo: 'Tudo o que aconteceu com você, lido e não lido', icone: Bell, termos: ['avisos', 'sino', 'alertas'], foraDoMenu: true },
    ],
  },
  {
    // O que qualquer setor usa para pedir e para falar em nome da filial.
    id: 'expediente',
    rotulo: 'Expediente',
    areas: [
      { href: '/chamados', rotulo: 'Chamados', resumo: 'Pedidos a qualquer setor da filial', icone: LifeBuoy, termos: ['suporte', 'ti', 'manutenção', 'pedido', 'helpdesk', 'setor', 'reembolso', 'arte', 'solicitação'] },
      // Aberto a todos: qualquer setor pede; a cotação e a aprovação ficam com o Financeiro (que também tem a aba Compras).
      { href: '/financeiro/compras', rotulo: 'Pedidos de compra', resumo: 'Peça o que o setor precisa e acompanhe a cotação e a aprovação', icone: ShoppingCart, termos: ['compras', 'comprar', 'cotação', 'orçamento de fornecedor', 'proposta', 'fornecedor', 'ordem de compra', 'requisição', 'mapa comparativo'] },
      { href: '/oficios', rotulo: 'Ofícios', resumo: 'Numerados por ano, assinados e registrados', icone: FileSignature, termos: ['documento oficial', 'carta'] },
      { href: '/correio', rotulo: 'E-mail do setor', resumo: 'Envie pelo endereço do setor, com a assinatura oficial', icone: AtSign, termos: ['correio', 'alias', 'assinatura', 'e-mail'] },
    ],
  },
  {
    // Comunicação (1/3): de onde a pauta nasce até o que ela rendeu.
    id: 'redacao',
    rotulo: 'Redação',
    areas: [
      // Antes de Pautas porque é de onde elas podem nascer. O Cérebro recomenda; não publica.
      { href: '/cerebro', rotulo: 'Radar de pautas', resumo: 'Sugestões do Cérebro a partir das contas oficiais do Rio', icone: Radar, termos: ['cérebro', 'cerebro', 'sugestões', 'ia'] },
      { href: '/pautas', rotulo: 'Pautas', resumo: 'O quadro editorial, da entrada ao pronto', icone: ListChecks, termos: ['quadro', 'kanban', 'matérias'] },
      { href: '/projetos', rotulo: 'Projetos', resumo: 'Campanhas, eventos e iniciativas com começo, meio e fim', icone: FolderKanban, termos: ['campanhas', 'eventos', 'iniciativas'] },
      { href: '/redes', rotulo: 'Publicações', resumo: 'Monte o pacote e publique nas redes, no site e na newsletter', icone: Send, termos: ['redes sociais', 'instagram', 'facebook', 'post', 'pacote'] },
      // "Impacto", numa organização humanitária, é o impacto do trabalho em campo — não o alcance de um post.
      { href: '/impacto', rotulo: 'Resultados', resumo: 'O que aconteceu depois da publicação', icone: ChartColumn, termos: ['impacto', 'métricas', 'relatórios', 'alcance', 'análise'] },
      // Era "Registro", a um clique de "Registrar". Agora é uma aba de Resultados: o que foi ao ar e o que rendeu.
      { href: '/registro', rotulo: 'Histórico', resumo: 'Tudo o que foi ao ar: quando, onde e o que falhou', icone: History, termos: ['registro', 'publicado', 'log', 'falhas'], dentroDe: '/impacto' },
    ],
  },
  {
    // Comunicação (2/3): o material de que as publicações são feitas.
    id: 'midia',
    rotulo: 'Mídia',
    areas: [
      { href: '/biblioteca', rotulo: 'Biblioteca de mídia', resumo: 'Fotos, vídeos e documentos, com direito de uso', icone: Images, termos: ['biblioteca', 'arquivos', 'fotos', 'vídeos', 'imagens'] },
      // O que a equipe manda pelo link vira material: mora ao lado da Biblioteca (antes ficava entre as conversas).
      { href: '/envios', rotulo: 'Envios da equipe', resumo: 'Ações que a equipe mandou pelo link: fotos, vídeos, áudios e relatos', icone: Upload, termos: ['envios', 'mandar ação', 'fotos da equipe', 'relatos', 'link de envio', 'álbum'], soPara: 'avaliadorDeEnvios' },
      { href: '/acervo', rotulo: 'Acervo', resumo: 'A memória da filial no R2, e o que vai para cruzvermelhariodejaneiro.org/acervo', icone: Archive, termos: ['acervo', 'memória', 'história', 'documentos', 'fotos antigas', 'arquivo', 'r2'], permissao: 'acervo.ver' },
    ],
  },
  {
    // Comunicação (3/3): quem fala com a filial e com quem a filial fala.
    id: 'publico',
    rotulo: 'Público',
    areas: [
      { href: '/direct', rotulo: 'Direct das redes', resumo: 'Mensagens e comentários do público nas redes sociais', icone: Inbox, termos: ['caixa de entrada', 'atendimento', 'comentários', 'dm', 'direct', 'instagram', 'mensagens do público'] },
      { href: '/newsletter', rotulo: 'Newsletter', resumo: 'Inscritos, crescimento da lista e edições enviadas', icone: Mail, termos: ['central de e-mail', 'e-mail marketing', 'inscritos'] },
      { href: '/imprensa', rotulo: 'Imprensa e contatos', resumo: 'Contatos verificados, campanhas e quem leu', icone: Newspaper, termos: ['imprensa', 'jornalistas', 'contatos', 'release', 'hunter'] },
    ],
  },
  {
    // O administrativo-financeiro: dinheiro, bens e a prestação de contas pública.
    id: 'gestao',
    rotulo: 'Gestão',
    areas: [
      { href: '/financeiro', rotulo: 'Financeiro', resumo: 'Despesas, receitas, contas a pagar e o caixa da filial', icone: Wallet, termos: ['contas a pagar', 'despesas', 'receitas', 'caixa', 'lançamentos', 'fluxo de caixa', 'conciliação', 'fechamento'] },
      { href: '/patrimonio', rotulo: 'Patrimônio', resumo: 'Bens com plaqueta e QR, estoque com lote e validade, doações, frota, manutenção e inventário', icone: Package, termos: ['inventário', 'bens', 'plaqueta', 'cautela', 'termo de responsabilidade', 'almoxarifado', 'estoque', 'materiais', 'validade', 'kits', 'doações', 'doador', 'recibo', 'campanha', 'distribuição', 'frota', 'veículos', 'ambulância', 'combustível', 'CNH'] },
      // O portal público de prestação de contas; Canais oficiais e Trilha pública são abas dele.
      // Lançamento oculto: as páginas públicas destas áreas saem com noindex e sem link no site até a abertura (docs/auditoria-publica.md §9).
      { href: '/transparencia', rotulo: 'Transparência', resumo: 'Estatuto, balanços, relatórios e parcerias publicados no portal', icone: Landmark, termos: ['portal da transparência', 'balanço', 'estatuto', 'mrosc', 'parcerias', 'prestação de contas'], permissao: 'transparencia.gerenciar' },
      { href: '/canais-oficiais', rotulo: 'Canais oficiais', resumo: 'A lista pública dos endereços e perfis que são mesmo da filial', icone: BadgeCheck, termos: ['canais', 'redes sociais', 'golpe', 'perfis oficiais', 'telefones'], permissao: 'transparencia.gerenciar', dentroDe: '/transparencia' },
      { href: '/trilha-publica', rotulo: 'Trilha pública', resumo: 'Registros verificáveis, lotes diários e carimbos no Bitcoin', icone: ShieldCheck, termos: ['auditoria', 'verificação', 'carimbo', 'blockchain', 'autenticidade', 'lotes'], permissao: 'trilha.ver', dentroDe: '/transparencia' },
    ],
  },
  {
    id: 'pessoas',
    rotulo: 'Pessoas',
    areas: [
      { href: '/pessoas', rotulo: 'Diretório', resumo: 'Quem é quem na filial: setor, cargo, contato e acesso', icone: Contact, termos: ['pessoas', 'colaboradores', 'equipe', 'setores', 'contatos internos'] },
      // Funcionários, coordenadores, administrativo e diretoria: contrato, documentos e remuneração.
      { href: '/equipe', rotulo: 'Recursos humanos', resumo: 'Ficha, contrato, documentos e remuneração da equipe contratada', icone: IdCard, termos: ['gestão da equipe', 'rh', 'funcionários', 'contrato', 'organograma'] },
      // "Voluntariado" é também o nome de uma coordenação; a área é o cadastro das pessoas e a Área do Voluntário.
      { href: '/voluntariado', rotulo: 'Voluntários', resumo: 'Cadastro de voluntários, juventude e instrutores, e a Área do Voluntário', icone: HeartHandshake, termos: ['voluntariado', 'juventude', 'inscrições', 'participantes', 'oportunidades', 'cursos', 'avisos', 'banners'] },
      // Era uma segunda linha "Voluntários" no grupo Comunicação: é o canal da Área do Voluntário, e mora dentro dela.
      { href: '/voluntariado/mensagens', rotulo: 'Mensagens dos voluntários', resumo: 'O canal direto com voluntários e membros da Área do Voluntário', icone: MessageCircleHeart, termos: ['mensagens dos voluntários', 'canal do membro', 'área do membro', 'conversa com voluntário'], dentroDe: '/voluntariado' },
    ],
  },
  {
    // A escola é uma empresa à parte dentro da filial (receita e gestão próprias):
    // a administração dela mora aqui; aluno e turma, no sistema da escola.
    id: 'escola',
    // "Escola de Educação e Saúde" quebrava em duas linhas no menu; o nome inteiro fica no resumo e na busca.
    rotulo: 'Escola',
    areas: [
      { href: '/escola', rotulo: 'Visão geral', resumo: 'A escola como empresa: vendas do mês, marketing, advertoriais e o que pede atenção', icone: GraduationCap, termos: ['escola', 'escola de educação e saúde', 'cursos', 'punção venosa', 'alunos', 'turmas'] },
      { href: '/escola/vendas', rotulo: 'Vendas', resumo: 'O que entra pelas contas da Únicopag da escola, por curso, forma de pagamento e origem', icone: ReceiptText, termos: ['matrículas', 'únicopag', 'unicopag', 'mensalidades', 'pix', 'cartão', 'transações', 'receita da escola'] },
      // Nome e ícone próprios: "Financeiro" sozinho repetia o da filial.
      { href: '/escola/financeiro', rotulo: 'Financeiro da escola', resumo: 'Os livros da escola: contas, lançamentos, conciliação e fechamento do mês, com o CNPJ dela', icone: PiggyBank, termos: ['financeiro da escola', 'contas a pagar da escola', 'fechamento da escola', 'contador da escola', 'cnpj da escola'] },
      { href: '/escola/marketing', rotulo: 'Marketing', resumo: 'Campanhas, anúncios e posts da escola, com o que custaram e o que trouxeram', icone: Megaphone, termos: ['marketing da escola', 'anúncios', 'campanhas', 'criativos', 'utm', 'meta ads', 'referências', 'swipe file'] },
      // Uma aba do Marketing (as abas da escola já mostram); não ocupa linha própria.
      { href: '/escola/marketing/advertoriais', rotulo: 'Advertoriais', resumo: 'Matérias-anúncio da escola publicadas como notícia, com visitas, cliques e matrículas', icone: ScrollText, termos: ['advertorial', 'advertoriais', 'matéria patrocinada', 'página de venda', 'landing'], dentroDe: '/escola/marketing' },
      { href: '/escola/configuracoes', rotulo: 'Contas e integrações', resumo: 'As contas da Únicopag e a conta de anúncios do Meta da escola', icone: PlugZap, termos: ['configurações da escola', 'chave únicopag', 'token meta', 'integrações da escola'] },
    ],
  },
]

/** A conta da pessoa e a administração do espaço: no menu da conta (e no pé da gaveta, no celular), não no meio do trabalho. */
export const ADMINISTRACAO: Grupo = {
  id: 'administracao',
  rotulo: 'Conta e administração',
  areas: [
    { href: '/acessos', rotulo: 'Acessos', resumo: 'Quem entrou, quando, de onde e com qual aparelho', icone: Fingerprint, termos: ['login', 'entradas', 'ip', 'aparelho', 'fingerprint', 'segurança'], soPara: 'leitorDeAcessos' },
    { href: '/usuarios', rotulo: 'Usuários e permissões', resumo: 'Logins, papéis, senhas e verificação em duas etapas', icone: KeyRound, termos: ['acessos', 'senha', 'papel', 'admin'], permissao: 'usuarios.gerenciar' },
    { href: '/configuracoes', rotulo: 'Configurações', resumo: 'Integrações, site e preferências do espaço', icone: Settings, termos: ['integrações', 'preferências'] },
    { href: '/perfil', rotulo: 'Meu perfil', resumo: 'Foto, dados, senha e segurança da sua conta', icone: UserRound, termos: ['perfil', 'conta', 'senha', 'foto'] },
    // A Central de ajuda (lib/ajuda). O botão "?" do topo abre a ajuda da tela; aqui fica tudo junto.
    { href: '/ajuda', rotulo: 'Ajuda', resumo: 'Tutoriais, passo a passo e perguntas frequentes de cada área', icone: CircleHelp, termos: ['faq', 'tutorial', 'como usar', 'dúvidas', 'manual', 'onboarding', 'suporte'] },
  ],
}

export const TODOS_OS_GRUPOS: Grupo[] = [...GRUPOS, ADMINISTRACAO]

/** Esconde o que a pessoa não pode abrir; grupo vazio some junto. */
export function gruposVisiveis(pode: (p: Permissao) => boolean, grupos: Grupo[] = TODOS_OS_GRUPOS, escolhidos: Partial<Record<Escolhido, boolean>> = {}): Grupo[] {
  return grupos
    .map((g) => ({ ...g, areas: g.areas.filter((a) => (!a.permissao || pode(a.permissao)) && (!a.soPara || escolhidos[a.soPara])) }))
    .filter((g) => g.areas.length > 0)
}

/**
 * A equipe da escola vê só a Escola (o Financeiro dela quando um admin
 * libera os livros da Escola), as notificações, o próprio perfil e a ajuda. O
 * servidor barra o resto de qualquer jeito (lib/session.ts); aqui é para o
 * menu e a busca não oferecerem porta fechada.
 */
export function gruposDaEquipeDaEscola(comFinanceiro: boolean, grupos: Grupo[] = TODOS_OS_GRUPOS): Grupo[] {
  const escola = grupos.find((g) => g.id === 'escola')
  const notificacoes = grupos.flatMap((g) => g.areas).filter((a) => a.href === '/notificacoes' || a.href === '/chat')
  const perfil = ADMINISTRACAO.areas.filter((a) => a.href === '/perfil' || a.href === '/ajuda')
  return [
    ...(escola ? [{ ...escola, areas: escola.areas.filter((a) => comFinanceiro || a.href !== '/escola/financeiro') }] : []),
    { id: 'meu-dia', rotulo: null, areas: notificacoes },
    { ...ADMINISTRACAO, areas: perfil },
  ].filter((g) => g.areas.length > 0)
}

/** A linha da sidebar que acende para esta área: a própria, ou a área-mãe quando ela é uma aba de outra. */
export function hrefNoMenu(area: Pick<Area, 'href' | 'dentroDe'>): string {
  return area.dentroDe ?? area.href
}

/**
 * A família de uma área, para as abas no alto da tela: a mãe primeiro e as
 * partes dela na ordem do mapa. Área sem partes devolve lista vazia (sem abas).
 * `pode` esconde a aba que a pessoa não abre.
 */
export function familiaDaArea(href: string, pode: (p: Permissao) => boolean = () => true, grupos: Grupo[] = TODOS_OS_GRUPOS): Area[] {
  const todas = grupos.flatMap((g) => g.areas)
  const mae = todas.find((a) => a.href === href)
  const raiz = mae?.dentroDe ?? href
  const familia = todas.filter((a) => a.href === raiz || a.dentroDe === raiz).filter((a) => !a.permissao || pode(a.permissao))
  return familia.length > 1 ? familia : []
}

/** `/pautas/123` é Pautas; `/pautas-antigas` não. O prefixo mais longo vence. */
export function ehDaArea(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(`${href}/`)
}

/** Páginas que não estão no menu, mas moram dentro de uma área. */
const MORADAS: Record<string, string> = {
  '/registrar': '/pautas',
  '/conteudos': '/pautas',
  '/participantes': '/voluntariado',
  // As conversas de cada aprovação continuam em /mensagens/<id>.
  '/mensagens': '/aprovacoes',
}

export function areaDoCaminho(pathname: string, grupos: Grupo[] = TODOS_OS_GRUPOS): { grupo: Grupo; area: Area } | null {
  const morada = Object.keys(MORADAS).find((prefixo) => ehDaArea(pathname, prefixo))
  const caminho = morada ? MORADAS[morada] : pathname
  let achado: { grupo: Grupo; area: Area } | null = null
  for (const grupo of grupos) {
    for (const area of grupo.areas) {
      if (ehDaArea(caminho, area.href) && (!achado || area.href.length > achado.area.href.length)) achado = { grupo, area }
    }
  }
  return achado
}

/** Sem acento e sem caixa: "cerebro" acha "Cérebro", "IMPACTO" acha Resultados. */
export function normalizar(texto: string): string {
  return texto.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim()
}

/**
 * Busca por palavras: todas precisam aparecer no nome, no resumo ou nos
 * termos. O nome começando pela busca vem primeiro; depois, o nome contendo;
 * por último, quem só casou pelo resumo ou por um nome antigo.
 */
export function buscarAreas<T extends Pick<Area, 'rotulo' | 'resumo' | 'termos'>>(busca: string, areas: T[]): T[] {
  const palavras = normalizar(busca).split(/\s+/).filter(Boolean)
  if (!palavras.length) return areas
  const pontuadas: { area: T; pontos: number; ordem: number }[] = []
  areas.forEach((area, ordem) => {
    const nome = normalizar(area.rotulo)
    const tudo = [nome, normalizar(area.resumo), ...(area.termos ?? []).map(normalizar)].join(' ')
    if (!palavras.every((p) => tudo.includes(p))) return
    const inteira = palavras.join(' ')
    const pontos = nome.startsWith(inteira) ? 0 : nome.includes(inteira) ? 1 : (area.termos ?? []).some((t) => normalizar(t).startsWith(inteira)) ? 2 : 3
    pontuadas.push({ area, pontos, ordem })
  })
  return pontuadas.sort((a, b) => a.pontos - b.pontos || a.ordem - b.ordem).map((p) => p.area)
}

/** O título da aba do navegador: o mesmo nome do menu, de uma fonte só. */
export function tituloDaArea(href: string): string {
  return TODOS_OS_GRUPOS.flatMap((g) => g.areas).find((a) => a.href === href)?.rotulo ?? 'Palácio Virtual'
}
