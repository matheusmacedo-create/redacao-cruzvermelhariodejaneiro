import { ESTADOS, type EstadoDoPedido as Estado } from '@/lib/compras/regras'
import { cn } from '@/lib/utils'

export const campo = 'w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-ring focus:ring-2 focus:ring-ring/30'

const TONS = {
  neutro: 'bg-muted text-muted-foreground',
  aviso: 'bg-warning/15 text-warning-foreground',
  ok: 'bg-success/15 text-success',
  erro: 'bg-destructive/10 text-destructive',
} as const

/** A situação do pedido, como selo. */
export function EstadoDoPedido({ estado, className }: { estado: Estado; className?: string }) {
  const e = ESTADOS[estado] ?? ESTADOS.aberto
  return <span className={cn('inline-flex shrink-0 items-center rounded-full px-2 py-0.5 text-xs font-medium', TONS[e.tom], className)} data-estado={estado}>{e.rotulo}</span>
}

export function Rotulo({ texto, children, ajuda, className }: { texto: string; children: React.ReactNode; ajuda?: string; className?: string }) {
  return (
    <label className={cn('flex flex-col gap-1 text-sm font-medium', className)}>
      {texto}{children}{ajuda && <span className="text-xs font-normal text-muted-foreground">{ajuda}</span>}
    </label>
  )
}
