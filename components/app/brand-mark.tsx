import Image from 'next/image'
import { cn } from '@/lib/utils'
import { SeloDoPalacio } from './selo-do-palacio'

type BrandMarkProps = {
  className?: string
  imageClassName?: string
  inverted?: boolean
  compact?: boolean
  /** O nome do sistema sob a logo. A Área do Voluntário usa o seu. */
  rotulo?: string
  /** O selo do Palácio Virtual acima da logo da filial: nas telas de entrada do sistema. */
  selo?: boolean
}

export function BrandMark({
  className,
  imageClassName,
  inverted = false,
  compact = false,
  rotulo = 'Palácio Virtual - Central de Comunicação',
  selo = false,
}: BrandMarkProps) {
  return (
    <div className={cn('flex min-w-0 flex-col items-start', className)}>
      <div
        className={cn(
          'w-full',
          // Com o selo: o palácio do sistema ao lado da logo oficial da filial, separados por um fio.
          selo && 'flex items-center gap-4',
          inverted && 'bg-white px-3 py-2.5 sm:px-4 sm:py-3',
        )}
      >
        {selo && (
          <>
            <SeloDoPalacio tamanho={compact ? 56 : 72} priority />
            <span aria-hidden="true" className="h-14 w-px shrink-0 bg-border" />
          </>
        )}
        <Image
          src="/images/logo-cvrj.png"
          alt="Cruz Vermelha Brasileira - Rio de Janeiro"
          width={1844}
          height={752}
          priority
          sizes={compact ? '180px' : '(max-width: 768px) 240px, 288px'}
          className={cn(
            'h-auto w-full object-contain object-left',
            compact ? 'max-w-[180px]' : selo ? 'min-w-0 max-w-[184px]' : 'max-w-72',
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
          {rotulo}
        </p>
      </div>
    </div>
  )
}
