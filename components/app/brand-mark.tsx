import Image from 'next/image'
import { cn } from '@/lib/utils'

type BrandMarkProps = {
  className?: string
  imageClassName?: string
  inverted?: boolean
}

export function BrandMark({ className, imageClassName, inverted = false }: BrandMarkProps) {
  return (
    <div className={cn('flex min-w-0 flex-col items-center', className)}>
      <div className="overflow-hidden rounded-sm bg-white px-2 py-1.5">
        <Image
          src="/images/logo-cvrj.png"
          alt="Cruz Vermelha Brasileira — Rio de Janeiro"
          width={1844}
          height={752}
          priority
          className={cn('h-auto w-full object-contain', imageClassName)}
        />
      </div>
      <p
        className={cn(
          'mt-2 text-center text-[10px] font-bold uppercase leading-tight tracking-[0.16em]',
          inverted ? 'text-primary-foreground' : 'text-foreground',
        )}
      >
        Redação — Central de Comunicação
      </p>
    </div>
  )
}
