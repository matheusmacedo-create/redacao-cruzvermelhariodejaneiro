import { cn } from '@/lib/utils'
import type {
  PautaStatus,
  ContentStatus,
  FileStatus,
  Priority,
} from '@/lib/data'

type Tone = 'neutral' | 'info' | 'warning' | 'success' | 'danger' | 'primary'

const toneClass: Record<Tone, string> = {
  neutral: 'bg-secondary text-secondary-foreground',
  info: 'bg-info/12 text-info',
  warning: 'bg-warning/20 text-warning-foreground',
  success: 'bg-success/14 text-success',
  danger: 'bg-destructive/12 text-destructive',
  primary: 'bg-primary/10 text-primary',
}

const dotClass: Record<Tone, string> = {
  neutral: 'bg-muted-foreground',
  info: 'bg-info',
  warning: 'bg-warning',
  success: 'bg-success',
  danger: 'bg-destructive',
  primary: 'bg-primary',
}

const pautaTone: Record<PautaStatus, { label: string; tone: Tone }> = {
  ideia: { label: 'Ideia', tone: 'neutral' },
  entrada: { label: 'Entrada', tone: 'neutral' },
  coleta: { label: 'Em coleta', tone: 'info' },
  producao: { label: 'Em produção', tone: 'info' },
  revisao: { label: 'Em revisão', tone: 'warning' },
  aprovacao: { label: 'Em aprovação', tone: 'warning' },
  pronto: { label: 'Pronto', tone: 'success' },
  arquivado: { label: 'Arquivado', tone: 'neutral' },
}

const contentTone: Record<ContentStatus, { label: string; tone: Tone }> = {
  rascunho: { label: 'Rascunho', tone: 'neutral' },
  producao: { label: 'Produção', tone: 'info' },
  revisao: { label: 'Revisão', tone: 'warning' },
  aprovacao: { label: 'Aprovação', tone: 'warning' },
  pronto: { label: 'Pronto', tone: 'success' },
  arquivado: { label: 'Arquivado', tone: 'neutral' },
}

const fileTone: Record<FileStatus, { label: string; tone: Tone }> = {
  disponivel: { label: 'Disponível', tone: 'neutral' },
  pendente: { label: 'Autorização pendente', tone: 'warning' },
  autorizado: { label: 'Autorizado', tone: 'success' },
  'nao-utilizar': { label: 'Não utilizar', tone: 'danger' },
}

const priorityTone: Record<Priority, { label: string; tone: Tone }> = {
  baixa: { label: 'Baixa', tone: 'neutral' },
  normal: { label: 'Normal', tone: 'info' },
  alta: { label: 'Alta', tone: 'warning' },
  critica: { label: 'Crítica', tone: 'danger' },
}

function Pill({ label, tone, dot }: { label: string; tone: Tone; dot?: boolean }) {
  return (
    <span
      className={cn(
        'inline-flex shrink-0 items-center gap-1.5 rounded-md px-2 py-0.5 text-xs font-medium whitespace-nowrap',
        toneClass[tone],
      )}
    >
      {dot && <span className={cn('size-1.5 rounded-full', dotClass[tone])} />}
      {label}
    </span>
  )
}

export function StatusBadge({ status, dot = true }: { status: PautaStatus; dot?: boolean }) {
  const s = pautaTone[status]
  return <Pill label={s.label} tone={s.tone} dot={dot} />
}

export function ContentStatusBadge({ status }: { status: ContentStatus }) {
  const s = contentTone[status]
  return <Pill label={s.label} tone={s.tone} dot />
}

export function FileStatusBadge({ status }: { status: FileStatus }) {
  const s = fileTone[status]
  return <Pill label={s.label} tone={s.tone} dot />
}

export function PriorityBadge({ priority }: { priority: Priority }) {
  const s = priorityTone[priority]
  return <Pill label={s.label} tone={s.tone} dot />
}
