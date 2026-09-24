import { AlertTriangle, CheckCircle2, Clock, PauseCircle } from 'lucide-react'
import { cn } from '@/lib/utils'
import {
  ROTULO_DA_PRIORIDADE, ROTULO_DO_STATUS, ROTULO_DO_STATUS_PARA_EQUIPE, duracao, minutosUteisEntre,
  type Prioridade, type SituacaoDoPrazo, type Status,
} from '@/lib/chamados/regras'

/** Etiquetas dos chamados — as cores seguem o status-badge do app. */

const TOM_DO_STATUS: Record<Status, string> = {
  novo: 'bg-info/12 text-info',
  em_atendimento: 'bg-primary/10 text-primary',
  aguardando_solicitante: 'bg-warning/20 text-warning-foreground',
  aguardando_terceiro: 'bg-warning/20 text-warning-foreground',
  resolvido: 'bg-success/14 text-success',
  fechado: 'bg-secondary text-secondary-foreground',
  cancelado: 'bg-secondary text-muted-foreground line-through',
}

export function EtiquetaDeStatus({ status, paraEquipe }: { status: Status; paraEquipe?: boolean }) {
  return <span className={cn('inline-flex shrink-0 items-center rounded-md px-2 py-0.5 text-xs font-medium', TOM_DO_STATUS[status])}>{(paraEquipe ? ROTULO_DO_STATUS_PARA_EQUIPE : ROTULO_DO_STATUS)[status]}</span>
}

const TOM_DA_PRIORIDADE: Record<Prioridade, string> = {
  baixa: 'text-muted-foreground',
  media: 'text-info',
  alta: 'text-warning-foreground',
  critica: 'text-destructive font-semibold',
}
const BARRAS: Record<Prioridade, number> = { baixa: 1, media: 2, alta: 3, critica: 4 }

export function EtiquetaDePrioridade({ prioridade }: { prioridade: Prioridade }) {
  return (
    <span className={cn('inline-flex shrink-0 items-center gap-1.5 text-xs', TOM_DA_PRIORIDADE[prioridade])} title={`Prioridade ${ROTULO_DA_PRIORIDADE[prioridade].toLowerCase()}`}>
      <span className="flex items-end gap-px" aria-hidden>{[1, 2, 3, 4].map((n) => <span key={n} className={cn('w-1 rounded-sm', n <= BARRAS[prioridade] ? 'bg-current' : 'bg-current/20')} style={{ height: 3 + n * 2 }} />)}</span>
      {ROTULO_DA_PRIORIDADE[prioridade]}
    </span>
  )
}

const PRAZO: Record<SituacaoDoPrazo, { tom: string; icone: typeof Clock; rotulo: string }> = {
  cumprido: { tom: 'text-success', icone: CheckCircle2, rotulo: 'No prazo' },
  estourado: { tom: 'text-destructive', icone: AlertTriangle, rotulo: 'Atrasado' },
  em_risco: { tom: 'text-warning-foreground', icone: Clock, rotulo: 'Vence logo' },
  no_prazo: { tom: 'text-muted-foreground', icone: Clock, rotulo: 'No prazo' },
  pausado: { tom: 'text-muted-foreground', icone: PauseCircle, rotulo: 'Pausado' },
}

const quando = new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo' })

export function EtiquetaDePrazo({ situacao, prazo, rotulo, vinteQuatroHoras }: { situacao: SituacaoDoPrazo | null; prazo: string | null; rotulo?: string; vinteQuatroHoras?: boolean }) {
  if (!situacao || !prazo) return null
  const s = PRAZO[situacao]
  const Icone = s.icone
  const data = new Date(prazo)
  const falta = situacao === 'no_prazo' || situacao === 'em_risco' ? ` · faltam ${duracao(minutosUteisEntre(new Date(), data, vinteQuatroHoras))}` : ''
  return (
    <span className={cn('inline-flex items-center gap-1 text-xs', s.tom)} title={`${rotulo ?? 'Prazo'}: ${quando.format(data)}`}>
      <Icone className="size-3.5 shrink-0" />{rotulo ? `${rotulo}: ` : ''}{s.rotulo}{situacao === 'cumprido' ? '' : falta}
    </span>
  )
}

export const dataHora = (iso: string) => quando.format(new Date(iso))
export const campo = 'w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-ring focus:ring-2 focus:ring-ring/30'
