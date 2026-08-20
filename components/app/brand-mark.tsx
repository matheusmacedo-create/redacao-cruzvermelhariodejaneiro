import Image from 'next/image'
import { cn } from '@/lib/utils'

type BrandMarkProps = {
  className?: string
  imageClassName?: string
  inverted?: boolean
  compact?: boolean
}

export function BrandMark({
  className,
  imageClassName,
  inverted = false,
  compact = false,
}: BrandMarkProps) {
  return (
    <div className={cn('flex min-w-0 flex-col items-start', className)}>
      <div
        className={cn(
          'w-full',
          inverted && 'bg-white px-3 py-2.5 sm:px-4 sm:py-3',
        )}
      >
        <Image
          src="/images/logo-cvrj.png"
          alt="Cruz Vermelha Brasileira - Rio de Janeiro"
          width={1844}
          height={752}
          priority
          sizes={compact ? '180px' : '(max-width: 768px) 240px, 288px'}
          className={cn(
            'h-auto w-full object-contain object-left',
            compact ? 'max-w-[180px]' : 'max-w-72',
            imageClassName,
          )}
        />
      </div>
      <div
        className={cn(
          'mt-2 flex w-full items-center gap-2',
          compact && 'mt-1.5',
        )}
        aria-label="Identificação do sistema"
      >
        <span
          aria-hidden="true"
          className={cn(
            'h-px w-5 shrink-0',
            inverted ? 'bg-white/70' : 'bg-primary',
          )}
        />
        <p
          className={cn(
            'text-[10px] font-semibold leading-tight tracking-[0.08em]',
            inverted ? 'text-white' : 'text-muted-foreground',
          )}
        >
          Redação - Central de Comunicação
        </p>
      </div>
    </div>
  )
}
