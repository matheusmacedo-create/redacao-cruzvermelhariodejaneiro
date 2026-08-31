/**
 * Vocabulário compartilhado das telas editoriais.
 *
 * Este arquivo nasceu na fase de protótipo carregando também os dados de
 * mentira que preenchiam as telas. Eles foram embora: tudo que aparece hoje
 * vem do banco. Sobraram os tipos que as telas trocam entre si e as duas
 * listas fixas que a instituição usa — coordenações e canais.
 *
 * Ficaram aqui, e não em cada tela, porque `registrar-form` é componente de
 * cliente: qualquer coisa exportada daqui entra no pacote que vai para o
 * navegador. Eram 900 linhas de pauta, pessoa e arquivo fictícios viajando
 * junto.
 */

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
