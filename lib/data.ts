// Mock data for the CVRJ Redação internal system (Fase 1 — prototype)

export type PautaStatus =
  | 'ideia'
  | 'entrada'
  | 'coleta'
  | 'producao'
  | 'revisao'
  | 'aprovacao'
  | 'pronto'
  | 'arquivado'

export type ContentStatus =
  | 'rascunho'
  | 'producao'
  | 'revisao'
  | 'aprovacao'
  | 'pronto'
  | 'arquivado'

export type FileStatus = 'disponivel' | 'pendente' | 'autorizado' | 'nao-utilizar'

export type Priority = 'baixa' | 'normal' | 'alta' | 'critica'

export const PAUTA_STATUS_ORDER: PautaStatus[] = [
  'ideia',
  'coleta',
  'producao',
  'revisao',
  'aprovacao',
  'pronto',
]

export const PAUTA_STATUS_LABEL: Record<PautaStatus, string> = {
  ideia: 'Ideias',
  entrada: 'Entrada',
  coleta: 'Coleta',
  producao: 'Produção',
  revisao: 'Revisão',
  aprovacao: 'Aprovação',
  pronto: 'Pronto',
  arquivado: 'Arquivado',
}

export const CONTENT_STATUS_LABEL: Record<ContentStatus, string> = {
  rascunho: 'Rascunho',
  producao: 'Produção',
  revisao: 'Revisão',
  aprovacao: 'Aprovação',
  pronto: 'Pronto',
  arquivado: 'Arquivado',
}

export const PRIORITY_LABEL: Record<Priority, string> = {
  baixa: 'Baixa',
  normal: 'Normal',
  alta: 'Alta',
  critica: 'Crítica',
}

export type Person = {
  id: string
  name: string
  role: string
  coordenacao: string
  category: 'Equipe' | 'Voluntários' | 'Especialistas' | 'Entrevistados' | 'Parceiros'
  specialties: string[]
  email: string
  initials: string
  color: string
  stats?: { pautas: number; entrevistas: number; acoes: number }
}

export const people: Person[] = [
  {
    id: 'matheus',
    name: 'Matheus Andrade',
    role: 'Editor-chefe',
    coordenacao: 'Comunicação',
    category: 'Equipe',
    specialties: ['Edição', 'Estratégia de conteúdo'],
    email: 'matheus@cvrj.org.br',
    initials: 'MA',
    color: 'oklch(0.55 0.13 250)',
    stats: { pautas: 34, entrevistas: 8, acoes: 22 },
  },
  {
    id: 'ana',
    name: 'Ana Ribeiro',
    role: 'Redatora',
    coordenacao: 'Comunicação',
    category: 'Equipe',
    specialties: ['Redação', 'Entrevistas'],
    email: 'ana@cvrj.org.br',
    initials: 'AR',
    color: 'oklch(0.58 0.14 150)',
    stats: { pautas: 21, entrevistas: 14, acoes: 9 },
  },
  {
    id: 'carlos',
    name: 'Carlos Almeida',
    role: 'Coordenador de campo',
    coordenacao: 'GRD',
    category: 'Equipe',
    specialties: ['Desastres', 'Prevenção', 'Operações humanitárias'],
    email: 'carlos@cvrj.org.br',
    initials: 'CA',
    color: 'oklch(0.593 0.244 27.2)',
    stats: { pautas: 12, entrevistas: 3, acoes: 18 },
  },
  {
    id: 'juliana',
    name: 'Juliana Costa',
    role: 'Designer',
    coordenacao: 'Comunicação',
    category: 'Equipe',
    specialties: ['Design', 'Redes sociais'],
    email: 'juliana@cvrj.org.br',
    initials: 'JC',
    color: 'oklch(0.74 0.16 70)',
    stats: { pautas: 27, entrevistas: 0, acoes: 5 },
  },
  {
    id: 'diretoria',
    name: 'Regina Martins',
    role: 'Diretora institucional',
    coordenacao: 'Diretoria',
    category: 'Equipe',
    specialties: ['Aprovação', 'Institucional'],
    email: 'regina@cvrj.org.br',
    initials: 'RM',
    color: 'oklch(0.45 0.1 300)',
    stats: { pautas: 6, entrevistas: 2, acoes: 3 },
  },
  {
    id: 'pedro',
    name: 'Pedro Nogueira',
    role: 'Coordenador de voluntariado',
    coordenacao: 'Voluntariado',
    category: 'Equipe',
    specialties: ['Voluntariado', 'Formação'],
    email: 'pedro@cvrj.org.br',
    initials: 'PN',
    color: 'oklch(0.5 0.12 200)',
    stats: { pautas: 9, entrevistas: 5, acoes: 11 },
  },
  {
    id: 'fernanda',
    name: 'Fernanda Lima',
    role: 'Enfermeira socorrista',
    coordenacao: 'Saúde',
    category: 'Especialistas',
    specialties: ['Primeiros socorros', 'Saúde'],
    email: 'fernanda@cvrj.org.br',
    initials: 'FL',
    color: 'oklch(0.6 0.13 160)',
    stats: { pautas: 4, entrevistas: 6, acoes: 8 },
  },
  {
    id: 'roberto',
    name: 'Roberto Dias',
    role: 'Voluntário',
    coordenacao: 'Humanitário',
    category: 'Voluntários',
    specialties: ['Logística'],
    email: 'roberto@cvrj.org.br',
    initials: 'RD',
    color: 'oklch(0.52 0 0)',
    stats: { pautas: 2, entrevistas: 1, acoes: 14 },
  },
]

export function getPerson(id: string) {
  return people.find((p) => p.id === id)
}

export const coordenacoes = [
  'Comunicação',
  'Humanitário',
  'GRD',
  'Saúde',
  'Voluntariado',
  'Primeiros Socorros',
  'Diretoria',
]

// Onde uma publicação pode sair. Serve tanto para o canal previsto no
// calendário quanto para o formato da peça que a Comunicação vai produzir.
export const canaisDePublicacao = [
  'Instagram',
  'Facebook',
  'LinkedIn',
  'Site / Notícia',
  'WhatsApp',
  'YouTube',
  'Impresso',
  'Outro',
] as const

export type CanalDePublicacao = (typeof canaisDePublicacao)[number]

export type Project = {
  id: string
  name: string
  emoji: string
  description: string
  counts: { pautas: number; prontas: number; producao: number; ideias: number }
  lastActivity: string
}

export const projects: Project[] = [
  {
    id: 'cvrj-conversa',
    name: 'CVRJ Conversa',
    emoji: '🎙',
    description:
      'Série de conversas sobre atuação humanitária, saúde, voluntariado e sociedade.',
    counts: { pautas: 12, prontas: 4, producao: 3, ideias: 5 },
    lastActivity: 'há 2 horas',
  },
  {
    id: 'em-campo',
    name: 'Em Campo',
    emoji: '🚑',
    description: 'Cobertura das ações humanitárias e operações de campo da CVRJ.',
    counts: { pautas: 18, prontas: 7, producao: 6, ideias: 5 },
    lastActivity: 'há 20 minutos',
  },
  {
    id: 'aprenda',
    name: 'Aprenda',
    emoji: '🧠',
    description: 'Conteúdos educativos sobre saúde, prevenção e primeiros socorros.',
    counts: { pautas: 9, prontas: 3, producao: 2, ideias: 4 },
    lastActivity: 'ontem',
  },
  {
    id: 'quem-faz',
    name: 'Quem Faz',
    emoji: '❤️',
    description: 'Histórias de voluntários, equipe e pessoas atendidas.',
    counts: { pautas: 7, prontas: 2, producao: 1, ideias: 4 },
    lastActivity: 'há 3 dias',
  },
  {
    id: 'memoria',
    name: 'Memória CVRJ',
    emoji: '🏛',
    description: 'Registro histórico e institucional da Cruz Vermelha no Rio de Janeiro.',
    counts: { pautas: 5, prontas: 5, producao: 0, ideias: 0 },
    lastActivity: 'há 1 semana',
  },
  {
    id: 'impacto',
    name: 'Impacto',
    emoji: '📊',
    description: 'Dados, resultados e relatórios de impacto das ações.',
    counts: { pautas: 6, prontas: 1, producao: 3, ideias: 2 },
    lastActivity: 'há 2 dias',
  },
  {
    id: 'imprensa',
    name: 'Imprensa',
    emoji: '📰',
    description: 'Releases, notas oficiais e relacionamento com veículos de comunicação.',
    counts: { pautas: 4, prontas: 2, producao: 1, ideias: 1 },
    lastActivity: 'há 5 horas',
  },
]

export function getProject(id: string) {
  return projects.find((p) => p.id === id)
}

export type Pauta = {
  id: string
  title: string
  type: string
  project: string
  projectId: string
  coordenacao: string
  responsibleId: string
  deadline: string
  priority: Priority
  status: PautaStatus
  comments: number
  files: number
  needsAttention?: boolean
  summary: string
}

export const pautas: Pauta[] = [
  {
    id: 'acao-centro',
    title: 'Ação humanitária no Centro do Rio',
    type: 'Em Campo',
    project: 'Em Campo',
    projectId: 'em-campo',
    coordenacao: 'Humanitário',
    responsibleId: 'matheus',
    deadline: '19 AGO',
    priority: 'normal',
    status: 'coleta',
    comments: 6,
    files: 12,
    needsAttention: true,
    summary:
      'Ação de orientação e atendimento realizada no Centro do Rio com participação de voluntários.',
  },
  {
    id: 'engasgo',
    title: 'Primeiros socorros em casos de engasgo',
    type: 'Aprenda',
    project: 'Aprenda',
    projectId: 'aprenda',
    coordenacao: 'Primeiros Socorros',
    responsibleId: 'ana',
    deadline: '17 AGO',
    priority: 'alta',
    status: 'producao',
    comments: 3,
    files: 4,
    summary: 'Conteúdo educativo sobre a manobra de Heimlich e prevenção de engasgos.',
  },
  {
    id: 'voluntariado',
    title: 'Como funciona o voluntariado na CVRJ',
    type: 'CVRJ Conversa',
    project: 'CVRJ Conversa',
    projectId: 'cvrj-conversa',
    coordenacao: 'Voluntariado',
    responsibleId: 'pedro',
    deadline: '21 AGO',
    priority: 'normal',
    status: 'ideia',
    comments: 1,
    files: 0,
    summary: 'Episódio sobre o processo de entrada e atuação de voluntários.',
  },
  {
    id: 'doacao-sangue',
    title: 'Campanha de doação de sangue',
    type: 'Impacto',
    project: 'Impacto',
    projectId: 'impacto',
    coordenacao: 'Saúde',
    responsibleId: 'juliana',
    deadline: '24 AGO',
    priority: 'alta',
    status: 'revisao',
    comments: 8,
    files: 21,
    needsAttention: true,
    summary: 'Resultados da campanha de doação com dados de arrecadação.',
  },
  {
    id: 'historia-dona-maria',
    title: 'A história de Dona Maria, voluntária há 20 anos',
    type: 'Quem Faz',
    project: 'Quem Faz',
    projectId: 'quem-faz',
    coordenacao: 'Voluntariado',
    responsibleId: 'ana',
    deadline: '28 AGO',
    priority: 'baixa',
    status: 'aprovacao',
    comments: 4,
    files: 9,
    summary: 'Perfil emocional de uma voluntária veterana da instituição.',
  },
  {
    id: 'release-enchentes',
    title: 'Nota oficial — apoio às vítimas de enchentes',
    type: 'Imprensa',
    project: 'Imprensa',
    projectId: 'imprensa',
    coordenacao: 'GRD',
    responsibleId: 'matheus',
    deadline: '16 AGO',
    priority: 'critica',
    status: 'aprovacao',
    comments: 12,
    files: 3,
    needsAttention: true,
    summary: 'Release para imprensa sobre a mobilização da CVRJ em resposta às enchentes.',
  },
  {
    id: 'treinamento-rcp',
    title: 'Treinamento de RCP para empresas',
    type: 'Aprenda',
    project: 'Aprenda',
    projectId: 'aprenda',
    coordenacao: 'Primeiros Socorros',
    responsibleId: 'fernanda',
    deadline: '30 AGO',
    priority: 'normal',
    status: 'pronto',
    comments: 5,
    files: 15,
    summary: 'Registro do programa de capacitação corporativa em ressuscitação.',
  },
  {
    id: 'centenario',
    title: 'Centenário da CVRJ — retrospectiva',
    type: 'Memória',
    project: 'Memória CVRJ',
    projectId: 'memoria',
    coordenacao: 'Comunicação',
    responsibleId: 'matheus',
    deadline: '10 SET',
    priority: 'baixa',
    status: 'pronto',
    comments: 2,
    files: 40,
    summary: 'Linha do tempo histórica da filial do Rio de Janeiro.',
  },
]

export function getPauta(id: string) {
  return pautas.find((p) => p.id === id)
}

export type InboxItem = {
  id: string
  status: 'novo' | 'analisado' | 'em-pauta'
  category: 'Atividades' | 'Ideias' | 'Arquivos' | 'Histórias' | 'Pedidos'
  title: string
  origin: string
  coordenacao: string
  authorId: string
  date: string
  photos: number
  videos: number
  preview: string
}

export const inbox: InboxItem[] = [
  {
    id: 'inb-1',
    status: 'novo',
    category: 'Atividades',
    title: 'Ação de Primeiros Socorros — Centro',
    origin: 'Formulário de atividade',
    coordenacao: 'Primeiros Socorros',
    authorId: 'carlos',
    date: 'Hoje, 14:32',
    photos: 12,
    videos: 2,
    preview:
      'Realizamos uma ação de orientação e atendimento no Centro. Atendemos cerca de 180 pessoas…',
  },
  {
    id: 'inb-2',
    status: 'novo',
    category: 'Histórias',
    title: 'Voluntária completa 20 anos de serviço',
    origin: 'Formulário de atividade',
    coordenacao: 'Voluntariado',
    authorId: 'pedro',
    date: 'Hoje, 11:05',
    photos: 5,
    videos: 0,
    preview:
      'Dona Maria começou como voluntária em 2005 e tem uma trajetória inspiradora que vale a pena…',
  },
  {
    id: 'inb-3',
    status: 'analisado',
    category: 'Arquivos',
    title: 'Fotos do treinamento de RCP',
    origin: 'Upload direto',
    coordenacao: 'Primeiros Socorros',
    authorId: 'fernanda',
    date: 'Ontem, 16:20',
    photos: 15,
    videos: 1,
    preview: 'Segue o material do treinamento realizado com a equipe de uma empresa parceira…',
  },
  {
    id: 'inb-4',
    status: 'novo',
    category: 'Ideias',
    title: 'Sugestão: série sobre saúde mental',
    origin: 'Formulário de atividade',
    coordenacao: 'Saúde',
    authorId: 'ana',
    date: 'Ontem, 09:40',
    photos: 0,
    videos: 0,
    preview: 'Que tal uma série de conteúdos sobre saúde mental e apoio psicossocial?',
  },
  {
    id: 'inb-5',
    status: 'em-pauta',
    category: 'Pedidos',
    title: 'Precisamos divulgar campanha de doação',
    origin: 'Formulário de atividade',
    coordenacao: 'Saúde',
    authorId: 'juliana',
    date: '2 dias atrás',
    photos: 3,
    videos: 0,
    preview: 'A campanha de doação de sangue começa semana que vem e precisa de divulgação urgente…',
  },
]

export type MediaFile = {
  id: string
  name: string
  kind: 'foto' | 'video' | 'audio' | 'documento'
  date: string
  authorId: string
  size: string
  status: FileStatus
  tags: string[]
  project?: string
  event?: string
  local?: string
  bg: string
}

export const files: MediaFile[] = [
  {
    id: 'f1',
    name: 'acao-centro-001.jpg',
    kind: 'foto',
    date: '15 AGO 2025',
    authorId: 'carlos',
    size: '4.2 MB',
    status: 'autorizado',
    tags: ['ação', 'centro', 'voluntários'],
    project: 'Em Campo',
    event: 'Ação humanitária no Centro',
    local: 'Centro, Rio de Janeiro',
    bg: 'oklch(0.85 0.05 27)',
  },
  {
    id: 'f2',
    name: 'acao-centro-002.jpg',
    kind: 'foto',
    date: '15 AGO 2025',
    authorId: 'carlos',
    size: '3.8 MB',
    status: 'autorizado',
    tags: ['ação', 'atendimento'],
    project: 'Em Campo',
    event: 'Ação humanitária no Centro',
    local: 'Centro, Rio de Janeiro',
    bg: 'oklch(0.82 0.06 60)',
  },
  {
    id: 'f3',
    name: 'depoimento-carlos.mp4',
    kind: 'video',
    date: '15 AGO 2025',
    authorId: 'carlos',
    size: '128 MB',
    status: 'pendente',
    tags: ['entrevista', 'depoimento'],
    project: 'Em Campo',
    event: 'Ação humanitária no Centro',
    local: 'Centro, Rio de Janeiro',
    bg: 'oklch(0.8 0.04 250)',
  },
  {
    id: 'f4',
    name: 'relatorio-acao.pdf',
    kind: 'documento',
    date: '16 AGO 2025',
    authorId: 'carlos',
    size: '820 KB',
    status: 'disponivel',
    tags: ['relatório'],
    project: 'Em Campo',
    event: 'Ação humanitária no Centro',
    bg: 'oklch(0.9 0 0)',
  },
  {
    id: 'f5',
    name: 'audio-relato.m4a',
    kind: 'audio',
    date: '16 AGO 2025',
    authorId: 'roberto',
    size: '12 MB',
    status: 'disponivel',
    tags: ['áudio', 'relato'],
    project: 'Em Campo',
    bg: 'oklch(0.85 0.05 150)',
  },
  {
    id: 'f6',
    name: 'rcp-treinamento-01.jpg',
    kind: 'foto',
    date: '12 AGO 2025',
    authorId: 'fernanda',
    size: '5.1 MB',
    status: 'autorizado',
    tags: ['RCP', 'treinamento', 'saúde'],
    project: 'Aprenda',
    event: 'Treinamento de RCP',
    local: 'Sede CVRJ',
    bg: 'oklch(0.83 0.06 160)',
  },
  {
    id: 'f7',
    name: 'doacao-sangue-banner.jpg',
    kind: 'foto',
    date: '10 AGO 2025',
    authorId: 'juliana',
    size: '2.9 MB',
    status: 'nao-utilizar',
    tags: ['campanha', 'doação'],
    project: 'Impacto',
    event: 'Campanha de doação',
    bg: 'oklch(0.82 0.08 27)',
  },
  {
    id: 'f8',
    name: 'dona-maria-perfil.jpg',
    kind: 'foto',
    date: '08 AGO 2025',
    authorId: 'ana',
    size: '3.4 MB',
    status: 'autorizado',
    tags: ['perfil', 'voluntária', 'história'],
    project: 'Quem Faz',
    event: 'Perfil Dona Maria',
    local: 'Zona Norte',
    bg: 'oklch(0.8 0.05 300)',
  },
]

export function getFile(id: string) {
  return files.find((f) => f.id === id)
}

export type ContentPiece = {
  id: string
  type: string
  status: ContentStatus
  pautaId: string
  pautaTitle: string
  responsibleId: string
  version: string
  lastEdit: string
  title?: string
  subtitle?: string
  body?: string
  /** Endereço da matéria no site institucional, quando já foi publicada. */
  slug?: string | null
  siteUrl?: string | null
  sitePublishedAt?: string | null
}

export const contents: ContentPiece[] = [
  {
    id: 'c1',
    type: 'Matéria para o site',
    status: 'producao',
    pautaId: 'acao-centro',
    pautaTitle: 'Ação humanitária no Centro do Rio',
    responsibleId: 'matheus',
    version: 'v3',
    lastEdit: 'há 20 minutos',
    title: 'Cruz Vermelha RJ leva atendimento ao Centro do Rio',
    subtitle: 'Ação atendeu cerca de 180 pessoas com apoio de 14 voluntários',
    body:
      'Na última quinta-feira, a Cruz Vermelha Brasileira — filial Rio de Janeiro realizou uma ação humanitária no Centro da cidade. A iniciativa contou com orientação em saúde, aferição de pressão e distribuição de kits de higiene.\n\nSegundo o coordenador Carlos Almeida, cerca de 180 pessoas foram atendidas ao longo do dia, com o envolvimento de 14 voluntários.',
  },
  {
    id: 'c2',
    type: 'Post Instagram',
    status: 'rascunho',
    pautaId: 'acao-centro',
    pautaTitle: 'Ação humanitária no Centro do Rio',
    responsibleId: 'juliana',
    version: 'v1',
    lastEdit: 'há 1 hora',
  },
  {
    id: 'c3',
    type: 'Release para imprensa',
    status: 'aprovacao',
    pautaId: 'release-enchentes',
    pautaTitle: 'Nota oficial — apoio às vítimas de enchentes',
    responsibleId: 'matheus',
    version: 'v2',
    lastEdit: 'há 3 horas',
    title: 'CVRJ mobiliza voluntários em resposta às enchentes',
  },
  {
    id: 'c4',
    type: 'Matéria institucional',
    status: 'aprovacao',
    pautaId: 'historia-dona-maria',
    pautaTitle: 'A história de Dona Maria, voluntária há 20 anos',
    responsibleId: 'ana',
    version: 'v2',
    lastEdit: 'ontem',
    title: 'Dona Maria: duas décadas dedicadas ao próximo',
  },
]

export function getContent(id: string) {
  return contents.find((c) => c.id === id)
}

export type ApprovalStep = {
  label: string
  status: 'aprovado' | 'pendente' | 'reprovado'
}

export type ApprovalItem = {
  id: string
  title: string
  type: string
  pauta: string
  responsibleId: string
  requesterId: string
  date: string
  contentId: string
  steps: ApprovalStep[]
}

export const approvals: ApprovalItem[] = [
  {
    id: 'ap1',
    title: 'Ação Humanitária — Centro',
    type: 'Matéria institucional',
    pauta: 'Ação humanitária no Centro do Rio',
    responsibleId: 'matheus',
    requesterId: 'ana',
    date: 'Hoje, 09:12',
    contentId: 'c4',
    steps: [
      { label: 'Comunicação', status: 'aprovado' },
      { label: 'Humanitário', status: 'aprovado' },
      { label: 'Diretoria', status: 'pendente' },
    ],
  },
  {
    id: 'ap2',
    title: 'Nota oficial — enchentes',
    type: 'Release para imprensa',
    pauta: 'Nota oficial — apoio às vítimas de enchentes',
    responsibleId: 'matheus',
    requesterId: 'matheus',
    date: 'Hoje, 08:40',
    contentId: 'c3',
    steps: [
      { label: 'Comunicação', status: 'aprovado' },
      { label: 'GRD', status: 'pendente' },
      { label: 'Diretoria', status: 'pendente' },
    ],
  },
  {
    id: 'ap3',
    title: 'Campanha de doação de sangue',
    type: 'Post Instagram',
    pauta: 'Campanha de doação de sangue',
    responsibleId: 'juliana',
    requesterId: 'juliana',
    date: 'Ontem, 17:30',
    contentId: 'c2',
    steps: [
      { label: 'Comunicação', status: 'pendente' },
      { label: 'Saúde', status: 'aprovado' },
    ],
  },
]

export function getApproval(id: string) {
  return approvals.find((a) => a.id === id)
}

export type Message = {
  id: string
  authorId: string
  role: string
  time: string
  text: string
  attachments?: number
  question?: boolean
  resolved?: boolean
}

export const conversation: Message[] = [
  {
    id: 'm1',
    authorId: 'carlos',
    role: 'Humanitário',
    time: '14:20',
    text: 'Ontem atendemos aproximadamente 180 pessoas na ação do Centro.',
    attachments: 8,
  },
  {
    id: 'm2',
    authorId: 'matheus',
    role: 'Comunicação',
    time: '14:32',
    text: 'Ótimo, Carlos! Quantos voluntários participaram?',
    question: true,
    resolved: true,
  },
  {
    id: 'm3',
    authorId: 'carlos',
    role: 'Humanitário',
    time: '14:35',
    text: '14 voluntários. A maioria da coordenação de saúde.',
  },
  {
    id: 'm4',
    authorId: 'matheus',
    role: 'Comunicação',
    time: '14:40',
    text: 'Perfeito. Você teria alguma história marcante do atendimento para destacarmos na matéria?',
    question: true,
  },
]

export type Notification = {
  id: string
  text: string
  time: string
  unread: boolean
}

export const notifications: Notification[] = [
  { id: 'n1', text: 'Você foi mencionado na pauta “Ação no Centro”.', time: 'há 5 min', unread: true },
  { id: 'n2', text: 'A matéria “Enchentes” aguarda sua aprovação.', time: 'há 1 hora', unread: true },
  { id: 'n3', text: 'Carlos respondeu sua pergunta.', time: 'há 1 hora', unread: true },
  { id: 'n4', text: '12 novos arquivos foram enviados.', time: 'há 2 horas', unread: false },
  { id: 'n5', text: 'A pauta “Engasgo” está próxima do prazo.', time: 'há 3 horas', unread: false },
]

export type Activity = {
  id: string
  authorId: string
  text: string
  time: string
}

export const recentActivity: Activity[] = [
  { id: 'a1', authorId: 'carlos', text: 'adicionou 12 fotos', time: 'há 20 minutos' },
  { id: 'a2', authorId: 'ana', text: 'respondeu uma pergunta', time: 'há 1 hora' },
  { id: 'a3', authorId: 'diretoria', text: 'aprovou “Ação no Centro”', time: 'há 2 horas' },
  { id: 'a4', authorId: 'juliana', text: 'criou um post para Instagram', time: 'há 3 horas' },
]

export type CalendarItem = {
  day: number
  month: string
  project: string
  projectId: string
  title: string
  pautaId: string
}

export const calendarItems: CalendarItem[] = [
  { day: 16, month: 'AGO', project: 'Imprensa', projectId: 'imprensa', title: 'Nota oficial — enchentes', pautaId: 'release-enchentes' },
  { day: 17, month: 'AGO', project: 'Aprenda', projectId: 'aprenda', title: 'Primeiros socorros em engasgo', pautaId: 'engasgo' },
  { day: 19, month: 'AGO', project: 'Em Campo', projectId: 'em-campo', title: 'Ação no Centro', pautaId: 'acao-centro' },
  { day: 21, month: 'AGO', project: 'CVRJ Conversa', projectId: 'cvrj-conversa', title: 'Voluntariado', pautaId: 'voluntariado' },
  { day: 24, month: 'AGO', project: 'Impacto', projectId: 'impacto', title: 'Campanha de doação', pautaId: 'doacao-sangue' },
  { day: 28, month: 'AGO', project: 'Quem Faz', projectId: 'quem-faz', title: 'História de Dona Maria', pautaId: 'historia-dona-maria' },
  { day: 30, month: 'AGO', project: 'Aprenda', projectId: 'aprenda', title: 'Treinamento de RCP', pautaId: 'treinamento-rcp' },
]

export type User = {
  id: string
  name: string
  email: string
  coordenacao: string
  profile: 'Administrador' | 'Comunicação' | 'Coordenador' | 'Colaborador' | 'Aprovador' | 'Visualizador'
  status: 'ativo' | 'inativo' | 'convidado'
}

export const users: User[] = [
  { id: 'u1', name: 'Matheus Andrade', email: 'matheus@cvrj.org.br', coordenacao: 'Comunicação', profile: 'Administrador', status: 'ativo' },
  { id: 'u2', name: 'Ana Ribeiro', email: 'ana@cvrj.org.br', coordenacao: 'Comunicação', profile: 'Comunicação', status: 'ativo' },
  { id: 'u3', name: 'Carlos Almeida', email: 'carlos@cvrj.org.br', coordenacao: 'GRD', profile: 'Coordenador', status: 'ativo' },
  { id: 'u4', name: 'Juliana Costa', email: 'juliana@cvrj.org.br', coordenacao: 'Comunicação', profile: 'Comunicação', status: 'ativo' },
  { id: 'u5', name: 'Regina Martins', email: 'regina@cvrj.org.br', coordenacao: 'Diretoria', profile: 'Aprovador', status: 'ativo' },
  { id: 'u6', name: 'Pedro Nogueira', email: 'pedro@cvrj.org.br', coordenacao: 'Voluntariado', profile: 'Colaborador', status: 'ativo' },
  { id: 'u7', name: 'Fernanda Lima', email: 'fernanda@cvrj.org.br', coordenacao: 'Saúde', profile: 'Colaborador', status: 'convidado' },
  { id: 'u8', name: 'Roberto Dias', email: 'roberto@cvrj.org.br', coordenacao: 'Humanitário', profile: 'Visualizador', status: 'inativo' },
]

export const dashboardStats = [
  { value: 14, label: 'Pautas abertas', tone: 'neutral' as const },
  { value: 5, label: 'Em produção', tone: 'info' as const },
  { value: 3, label: 'Aguardando aprovação', tone: 'warning' as const },
  { value: 8, label: 'Prontas', tone: 'success' as const },
  { value: 2, label: 'Precisam de atenção', tone: 'danger' as const },
]

export const editorialFlow = [
  { label: 'Entrada', count: 5 },
  { label: 'Coleta', count: 4 },
  { label: 'Produção', count: 5 },
  { label: 'Revisão', count: 3 },
  { label: 'Aprovação', count: 3 },
  { label: 'Pronto', count: 8 },
]
