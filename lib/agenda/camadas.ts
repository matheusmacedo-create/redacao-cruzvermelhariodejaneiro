/**
 * As camadas da Agenda do Palácio Virtual (docs/calendario-inteligente.md §3.1):
 * cada área do sistema com data vira uma camada que a pessoa liga e desliga,
 * como os calendários do Google. Módulo puro.
 */

export const CAMADAS = {
  publicacoes: { nome: 'Publicações', descricao: 'Posts, matérias e newsletters agendados', cor: 'bg-red-500', chip: 'border-red-500 bg-red-50 text-red-950 dark:bg-red-950/40 dark:text-red-100', ics: true },
  pautas: { nome: 'Pautas e projetos', descricao: 'Prazos de pautas, atividades e marcos de projeto', cor: 'bg-blue-500', chip: 'border-blue-500 bg-blue-50 text-blue-950 dark:bg-blue-950/40 dark:text-blue-100', ics: true },
  voluntariado: { nome: 'Voluntariado', descricao: 'Oportunidades: ações, plantões, eventos e formações', cor: 'bg-emerald-500', chip: 'border-emerald-500 bg-emerald-50 text-emerald-950 dark:bg-emerald-950/40 dark:text-emerald-100', ics: true },
  escola: { nome: 'Escola', descricao: 'Campanhas de marketing da escola', cor: 'bg-violet-500', chip: 'border-violet-500 bg-violet-50 text-violet-950 dark:bg-violet-950/40 dark:text-violet-100', ics: true },
  doacoes: { nome: 'Doações', descricao: 'Campanhas de arrecadação', cor: 'bg-pink-500', chip: 'border-pink-500 bg-pink-50 text-pink-950 dark:bg-pink-950/40 dark:text-pink-100', ics: true },
  financeiro: { nome: 'Financeiro', descricao: 'Contas a pagar e a receber que vencem', cor: 'bg-amber-500', chip: 'border-amber-500 bg-amber-50 text-amber-950 dark:bg-amber-950/40 dark:text-amber-100', ics: false },
  frota: { nome: 'Frota', descricao: 'Documentos de veículos que vencem', cor: 'bg-slate-500', chip: 'border-slate-500 bg-slate-50 text-slate-950 dark:bg-slate-900/60 dark:text-slate-100', ics: false },
  chamados: { nome: 'Chamados', descricao: 'Prazos de solução dos chamados abertos', cor: 'bg-orange-500', chip: 'border-orange-500 bg-orange-50 text-orange-950 dark:bg-orange-950/40 dark:text-orange-100', ics: false },
  institucional: { nome: 'Parcerias', descricao: 'Fim de vigência e prestação de contas das parcerias', cor: 'bg-cyan-600', chip: 'border-cyan-600 bg-cyan-50 text-cyan-950 dark:bg-cyan-950/40 dark:text-cyan-100', ics: true },
  aniversarios: { nome: 'Aniversários', descricao: 'Aniversários da equipe', cor: 'bg-fuchsia-500', chip: 'border-fuchsia-500 bg-fuchsia-50 text-fuchsia-950 dark:bg-fuchsia-950/40 dark:text-fuchsia-100', ics: false },
  datas: { nome: 'Datas comemorativas', descricao: 'Cruz Vermelha, ONU e calendário da saúde', cor: 'bg-rose-400', chip: 'border-rose-400 bg-rose-50 text-rose-950 dark:bg-rose-950/40 dark:text-rose-100', ics: true },
  feriados: { nome: 'Feriados', descricao: 'Nacionais e do Rio de Janeiro', cor: 'bg-gray-400', chip: 'border-gray-400 bg-gray-100 text-gray-900 dark:bg-gray-800 dark:text-gray-100', ics: true },
} as const

export type Camada = keyof typeof CAMADAS
export const TODAS_AS_CAMADAS = Object.keys(CAMADAS) as Camada[]
export const ehCamada = (v: unknown): v is Camada => typeof v === 'string' && v in CAMADAS

/**
 * O que entra no link de assinatura (ICS). Quem assina lê sem sessão, então
 * só vão as camadas que todo membro do espaço já vê — nada de financeiro,
 * chamados, frota ou aniversários, que dependem de permissão.
 */
export const CAMADAS_DO_ICS = TODAS_AS_CAMADAS.filter((c) => CAMADAS[c].ics)
/** A equipe da escola só enxerga a Escola (e o que é público de todo mundo). */
export const CAMADAS_DA_EQUIPE_DA_ESCOLA: Camada[] = ['escola', 'datas', 'feriados']

export type EstadoDoItem = 'rascunho' | 'em_aprovacao' | 'aprovado' | 'agendado' | 'publicado' | 'falhou' | 'vencido' | null

export type ItemDaAgenda = {
  id: string
  camada: Camada
  titulo: string
  /** AAAA-MM-DD (em Brasília). */
  dia: string
  /** Último dia, para o que dura mais de um dia (campanhas, meses temáticos). */
  ate?: string | null
  /** HH:MM em Brasília, quando tem hora. */
  hora?: string | null
  href?: string | null
  detalhe?: string | null
  estado?: EstadoDoItem
  canal?: string | null
  /** Data comemorativa: id, dias de antecedência para produzir e se já tem pauta ligada neste ano. */
  dataComemorativaId?: string | null
  antecedencia?: number | null
  temPauta?: boolean
}

export const ROTULO_DO_ESTADO: Record<Exclude<EstadoDoItem, null>, string> = {
  rascunho: 'Rascunho', em_aprovacao: 'Em aprovação', aprovado: 'Aprovado', agendado: 'Agendado',
  publicado: 'Publicado', falhou: 'Falhou', vencido: 'Vencido',
}

/** Lê a lista de camadas ocultas vinda do banco ou do formulário, descartando o que não existe. */
export function lerCamadas(bruto: unknown): Camada[] {
  if (!Array.isArray(bruto)) return []
  return [...new Set(bruto.filter(ehCamada))]
}
