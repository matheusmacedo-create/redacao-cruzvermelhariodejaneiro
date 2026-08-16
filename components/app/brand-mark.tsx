import { cn } from '@/lib/utils'

// Red Cross emblem — a red cross on white, per the CVB identity manual.
export function CrossMark({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        'relative inline-flex items-center justify-center rounded-md bg-background',
        className,
      )}
      aria-hidden="true"
    >
      <span className="relative block size-[62%]">
        <span className="absolute left-1/2 top-0 h-full w-[34%] -translate-x-1/2 rounded-[1px] bg-primary" />
        <span className="absolute top-1/2 left-0 h-[34%] w-full -translate-y-1/2 rounded-[1px] bg-primary" />
      </span>
    </span>
  )
}
