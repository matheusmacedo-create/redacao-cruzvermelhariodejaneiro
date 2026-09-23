import type { SituacaoNaTela } from '@/lib/projetos/cronograma'

export const campo = 'rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-ring focus:ring-2 focus:ring-ring/30'

export const ROTULO_DA_SITUACAO: Record<SituacaoNaTela, string> = {
  no_prazo: 'No prazo',
  em_risco: 'Em risco',
  atrasado: 'Atrasado',
  concluido: 'Concluído',
  sem_atualizacao: 'Sem atualização',
}

const CLASSE: Record<SituacaoNaTela, string> = {
  no_prazo: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400',
  em_risco: 'bg-amber-500/15 text-amber-800 dark:text-amber-300',
  atrasado: 'bg-red-500/12 text-red-700 dark:text-red-400',
  concluido: 'bg-secondary text-secondary-foreground',
  sem_atualizacao: 'bg-muted text-muted-foreground',
}

/** A situação sempre com o nome escrito; a cor só reforça. */
export function PillDaSituacao({ situacao }: { situacao: SituacaoNaTela }) {
  return (
    <span className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-semibold ${CLASSE[situacao]}`}>
      <span className="size-1.5 rounded-full bg-current" aria-hidden="true" />{ROTULO_DA_SITUACAO[situacao]}
    </span>
  )
}

export function BarraDeProgresso({ pct, rotulo }: { pct: number; rotulo?: string }) {
  return (
    <span className="flex min-w-32 items-center gap-2">
      <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label={rotulo ?? 'Progresso'}>
        <span className="block h-full rounded-full bg-primary" style={{ width: `${pct}%` }} />
      </span>
      <span className="text-xs tabular-nums text-muted-foreground">{pct}%</span>
    </span>
  )
}

export const dataCurta = (iso: string | null, hoje: string) => {
  if (!iso) return '—'
  return new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit', month: 'short', timeZone: 'UTC', ...(iso.slice(0, 4) !== hoje.slice(0, 4) ? { year: 'numeric' as const } : {}),
  }).format(new Date(`${iso.slice(0, 10)}T12:00:00Z`)).replace('.', '')
}

export const hojeEmSaoPaulo = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date())

export type PessoaDoProjeto = { id: string; nome: string; iniciais: string; cor: string | null; avatar: string | null }
