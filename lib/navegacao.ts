import {
  AtSign, Bell, Wallet, Package, CalendarDays, ChartColumn, FileSignature, FolderKanban, HeartHandshake, History, House, IdCard, Images, Inbox,
  KeyRound, LifeBuoy, ListChecks, Mail, MessagesSquare, Newspaper, Radar, Send, Settings, SquareCheckBig, UserRound, Contact,
  type LucideIcon,
} from 'lucide-react'
import type { Permissao } from './permissoes'

/**
 * O mapa do sistema — a fonte única dos nomes das áreas.
 *
 * Sidebar, barra do topo, migalhas e a busca (⌘K) leem daqui. Antes, cada tela
 * tinha o seu nome e a sidebar tinha outro ("Publicações" no menu, "Redes
 * Sociais" no título), e quatro áreas de mensagem se confundiam: Caixa de
 * entrada, Correio, Central de e-mail e Mensagens. Os nomes seguem a função
 * (o que a pessoa vai fazer lá), e os grupos seguem o trabalho — planejar e
 * produzir, falar com o público, medir, o expediente da casa e as pessoas —,
 * como nas ferramentas de comunicação comparadas em docs/NAVEGACAO.md.
 *
 * Os ENDEREÇOS não mudaram (/redes, /impacto, /correio…): há links gravados em
 * notificações, e-mails já enviados e favoritos. Só o nome na tela mudou; o
 * nome antigo continua em `termos`, para a busca achar quem procura por ele.
 *
 * Módulo puro (sem banco, sem `server-only`): dá para conferir com um script.
 */

export type Contador = 'aprovacoes'

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
  /** Tem endereço, busca, migalhas e aba, mas não ocupa linha na sidebar (já tem atalho no topo). */
  foraDoMenu?: boolean
}

export type Grupo = { id: string; rotulo: string | null; areas: Area[] }

export const GRUPOS: Grupo[] = [
  {
    // Sem título: o que é do dia de cada pessoa, antes de qualquer área.
    id: 'meu-dia',
    rotulo: null,
    areas: [
      { href: '/dashboard', rotulo: 'Início', resumo: 'O seu dia, a semana da operação e os indicadores', icone: House, termos: ['visão geral', 'dashboard', 'painel'] },
      { href: '/aprovacoes', rotulo: 'Aprovações', resumo: 'O que espera o seu voto e quem ainda falta decidir', icone: SquareCheckBig, termos: ['votar', 'revisão', 'aprovar'], contador: 'aprovacoes' },
      { href: '/mensagens', rotulo: 'Conversas', resumo: 'Recados entre a equipe e conversas de cada matéria', icone: MessagesSquare, termos: ['mensagens', 'chat', 'recados'] },
      // O sino do topo leva aqui ("Ver todas"); uma linha na sidebar repetiria o sino.
      { href: '/notificacoes', rotulo: 'Notificações', resumo: 'Tudo o que aconteceu com você, lido e não lido', icone: Bell, termos: ['avisos', 'sino', 'alertas'], foraDoMenu: true },
    ],
  },
  {
    // De onde a pauta nasce até quando ela vai ao ar.
    id: 'planejamento',
    rotulo: 'Planejamento',
    areas: [
      // Antes de Pautas porque é de onde elas podem nascer. O Cérebro recomenda; não publica.
      { href: '/cerebro', rotulo: 'Radar de pautas', resumo: 'Sugestões do Cérebro a partir das contas oficiais do Rio', icone: Radar, termos: ['cérebro', 'cerebro', 'sugestões', 'ia'] },
      { href: '/pautas', rotulo: 'Pautas', resumo: 'O quadro editorial, da entrada ao pronto', icone: ListChecks, termos: ['quadro', 'kanban', 'matérias'] },
      { href: '/calendario', rotulo: 'Calendário', resumo: 'Prazos, atividades e publicações programadas', icone: CalendarDays, termos: ['calendário editorial', 'agenda'] },
      { href: '/projetos', rotulo: 'Projetos', resumo: 'Campanhas, eventos e iniciativas com começo, meio e fim', icone: FolderKanban, termos: ['campanhas', 'eventos', 'iniciativas'] },
    ],
  },
  {
    // O que sai: o pacote e o material de que ele é feito.
    id: 'producao',
    rotulo: 'Produção',
    areas: [
      { href: '/redes', rotulo: 'Publicações', resumo: 'Monte o pacote e publique nas redes, no site e na newsletter', icone: Send, termos: ['redes sociais', 'instagram', 'facebook', 'post', 'pacote'] },
      { href: '/biblioteca', rotulo: 'Biblioteca de mídia', resumo: 'Fotos, vídeos e documentos, com direito de uso', icone: Images, termos: ['biblioteca', 'arquivos', 'fotos', 'vídeos', 'imagens'] },
    ],
  },
  {
    // Quem fala com a Casa e com quem a Casa fala.
    id: 'relacionamento',
    rotulo: 'Relacionamento',
    areas: [
      { href: '/caixa-de-entrada', rotulo: 'Caixa de entrada', resumo: 'Mensagens e comentários do público nas redes', icone: Inbox, termos: ['atendimento', 'comentários', 'dm', 'direct'] },
      { href: '/newsletter', rotulo: 'Newsletter', resumo: 'Inscritos, crescimento da lista e edições enviadas', icone: Mail, termos: ['central de e-mail', 'e-mail marketing', 'inscritos'] },
      { href: '/imprensa', rotulo: 'Imprensa e contatos', resumo: 'Contatos verificados, campanhas e quem leu', icone: Newspaper, termos: ['imprensa', 'jornalistas', 'contatos', 'release', 'hunter'] },
    ],
  },
  {
    id: 'analise',
    rotulo: 'Análise',
    areas: [
      // "Impacto", numa organização humanitária, é o impacto do trabalho em campo — não o alcance de um post.
      { href: '/impacto', rotulo: 'Resultados', resumo: 'O que aconteceu depois da publicação', icone: ChartColumn, termos: ['impacto', 'métricas', 'relatórios', 'alcance'] },
      // Era "Registro", a um clique de "Registrar": duas coisas diferentes com o mesmo nome.
      { href: '/registro', rotulo: 'Histórico', resumo: 'Tudo o que foi ao ar: quando, onde e o que falhou', icone: History, termos: ['registro', 'publicado', 'log'] },
    ],
  },
  {
    // O expediente da filial: documento oficial, e-mail de setor e pedidos entre setores.
    id: 'institucional',
    rotulo: 'Institucional',
    areas: [
      { href: '/oficios', rotulo: 'Ofícios', resumo: 'Numerados por ano, assinados e registrados', icone: FileSignature, termos: ['documento oficial', 'carta'] },
      { href: '/correio', rotulo: 'E-mail do setor', resumo: 'Envie pelo endereço do setor, com a assinatura oficial', icone: AtSign, termos: ['correio', 'alias', 'assinatura'] },
      { href: '/chamados', rotulo: 'Chamados', resumo: 'Pedidos para TI, Manutenção e outras equipes', icone: LifeBuoy, termos: ['suporte', 'ti', 'manutenção', 'pedido', 'helpdesk'] },
      { href: '/patrimonio', rotulo: 'Patrimônio', resumo: 'Bens com plaqueta e QR, estoque de materiais com lote e validade, manutenção e inventário', icone: Package, termos: ['inventário', 'bens', 'plaqueta', 'cautela', 'termo de responsabilidade', 'almoxarifado', 'estoque', 'materiais', 'validade', 'kits'] },
      { href: '/financeiro', rotulo: 'Financeiro', resumo: 'Despesas, receitas, contas a pagar e o caixa da filial', icone: Wallet, termos: ['contas a pagar', 'despesas', 'receitas', 'caixa', 'lançamentos', 'fluxo de caixa'] },
    ],
  },
  {
    id: 'pessoas',
    rotulo: 'Pessoas',
    areas: [
      { href: '/pessoas', rotulo: 'Diretório', resumo: 'Quem tem acesso, de que coordenação e com qual papel', icone: Contact, termos: ['pessoas', 'colaboradores', 'equipe'] },
      // Funcionários, coordenadores, administrativo e diretoria: contrato, documentos e remuneração.
      { href: '/equipe', rotulo: 'Recursos humanos', resumo: 'Ficha, contrato, documentos e remuneração da equipe contratada', icone: IdCard, termos: ['gestão da equipe', 'rh', 'funcionários', 'contrato', 'organograma'] },
      // "Voluntariado" é também o nome de uma coordenação; a área é o cadastro das pessoas.
      { href: '/voluntariado', rotulo: 'Voluntários', resumo: 'Cadastro de voluntários, juventude e instrutores', icone: HeartHandshake, termos: ['voluntariado', 'juventude', 'inscrições', 'participantes'] },
    ],
  },
]

/** Fica no pé da sidebar e no menu da pessoa, não no meio do trabalho. */
export const ADMINISTRACAO: Grupo = {
  id: 'administracao',
  rotulo: 'Administração',
  areas: [
    { href: '/usuarios', rotulo: 'Usuários e permissões', resumo: 'Logins, papéis, senhas e verificação em duas etapas', icone: KeyRound, termos: ['acessos', 'senha', 'papel', 'admin'], permissao: 'usuarios.gerenciar' },
    { href: '/configuracoes', rotulo: 'Configurações', resumo: 'Integrações, site e preferências do espaço', icone: Settings, termos: ['integrações', 'preferências'] },
    { href: '/perfil', rotulo: 'Meu perfil', resumo: 'Foto, dados, senha e segurança da sua conta', icone: UserRound, termos: ['perfil', 'conta', 'senha', 'foto'] },
  ],
}

export const TODOS_OS_GRUPOS: Grupo[] = [...GRUPOS, ADMINISTRACAO]

/** Esconde o que a pessoa não pode abrir; grupo vazio some junto. */
export function gruposVisiveis(pode: (p: Permissao) => boolean, grupos: Grupo[] = TODOS_OS_GRUPOS): Grupo[] {
  return grupos
    .map((g) => ({ ...g, areas: g.areas.filter((a) => !a.permissao || pode(a.permissao)) }))
    .filter((g) => g.areas.length > 0)
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
  return TODOS_OS_GRUPOS.flatMap((g) => g.areas).find((a) => a.href === href)?.rotulo ?? 'Redação'
}
