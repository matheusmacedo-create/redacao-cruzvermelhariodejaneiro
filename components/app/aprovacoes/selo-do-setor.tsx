import { perfilDoSetor } from '@/lib/aprovacoes/setores'
import { cn } from '@/lib/utils'

/** O selo colorido do setor da pauta: a mesma cor na fila, nos filtros e na revisão. */
export function SeloDoSetor({ setor, className }: { setor: string | null | undefined; className?: string }) {
  const p = perfilDoSetor(setor)
  return (
    <span className={cn('inline-flex items-center gap-1.5 rounded-md px-2 py-0.5 text-xs font-semibold text-white', className)} style={{ backgroundColor: p.cor }} title={p.foco}>
      {p.sigla !== p.nome && <span className="font-mono text-[10px] tracking-wide opacity-80">{p.sigla}</span>}{p.nome}
    </span>
  )
}
