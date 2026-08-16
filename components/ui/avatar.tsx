import { cn } from '@/lib/utils'

const sizes = {
  xs: 'size-6 text-[10px]',
  sm: 'size-8 text-xs',
  md: 'size-10 text-sm',
  lg: 'size-14 text-base',
  xl: 'size-20 text-xl',
}

export function Avatar({
  initials,
  color,
  size = 'sm',
  className,
}: {
  initials: string
  color?: string
  size?: keyof typeof sizes
  className?: string
}) {
  return (
    <span
      className={cn(
        'inline-flex shrink-0 items-center justify-center rounded-full font-semibold text-white select-none',
        sizes[size],
        className,
      )}
      style={{ backgroundColor: color ?? 'oklch(0.52 0 0)' }}
      aria-hidden="true"
    >
      {initials}
    </span>
  )
}

export function AvatarStack({
  people,
  max = 3,
}: {
  people: { initials: string; color?: string }[]
  max?: number
}) {
  const shown = people.slice(0, max)
  const rest = people.length - shown.length
  return (
    <div className="flex items-center -space-x-2">
      {shown.map((p, i) => (
        <span
          key={i}
          className="inline-flex size-7 items-center justify-center rounded-full text-[10px] font-semibold text-white ring-2 ring-background"
          style={{ backgroundColor: p.color ?? 'oklch(0.52 0 0)' }}
        >
          {p.initials}
        </span>
      ))}
      {rest > 0 && (
        <span className="inline-flex size-7 items-center justify-center rounded-full bg-muted text-[10px] font-semibold text-muted-foreground ring-2 ring-background">
          +{rest}
        </span>
      )}
    </div>
  )
}
