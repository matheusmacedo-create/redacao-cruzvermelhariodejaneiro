import type { ContentStatus, PautaStatus, Priority } from '@/lib/data'

export const PAUTA_DB_STATUS: Record<string, PautaStatus> = {
  incoming: 'entrada',
  collection: 'coleta',
  production: 'producao',
  review: 'revisao',
  approval: 'aprovacao',
  approved: 'pronto',
  archived: 'arquivado',
}

export const CONTENT_DB_STATUS: Record<string, ContentStatus> = {
  draft: 'rascunho',
  production: 'producao',
  review: 'aprovacao',
  approved: 'pronto',
  archived: 'arquivado',
}

export const PRIORITY_DB: Record<string, Priority> = {
  low: 'baixa',
  medium: 'normal',
  high: 'alta',
  critical: 'critica',
}

export function pautaStatus(dbStatus: string | null | undefined): PautaStatus {
  return (dbStatus && PAUTA_DB_STATUS[dbStatus]) || 'entrada'
}

export function contentStatus(dbStatus: string | null | undefined): ContentStatus {
  return (dbStatus && CONTENT_DB_STATUS[dbStatus]) || 'producao'
}

export const ACTIVITY_ACTION_LABEL: Record<string, string> = {
  created: 'criou',
  status_changed: 'alterou o status de',
  participant_added: 'adicionou um participante em',
  participant_removed: 'removeu um participante de',
  message_sent: 'enviou uma mensagem em',
  archived: 'arquivou',
  approved: 'aprovou algo em',
  changes_requested: 'pediu ajustes em',
  deleted: 'excluiu',
}

