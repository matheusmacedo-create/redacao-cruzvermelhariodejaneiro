import { caminhoDaAssinatura, type Tracos } from '@/lib/imagem/regras'
import { cn } from '@/lib/utils'

/** A assinatura gravada, redesenhada em SVG a partir dos traços (0 a 1000 nos dois eixos). */
export function AssinaturaDesenhada({ tracos, className, rotulo = 'Assinatura' }: { tracos: Tracos; className?: string; rotulo?: string }) {
  return (
    <svg viewBox="0 0 1000 1000" preserveAspectRatio="none" role="img" aria-label={rotulo} className={cn('aspect-[3/1] w-full rounded-lg border border-border bg-white', className)}>
      <path d={caminhoDaAssinatura(tracos)} fill="none" stroke="#111" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
    </svg>
  )
}
