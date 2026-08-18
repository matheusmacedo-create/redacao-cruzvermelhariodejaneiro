import type { SVGProps } from 'react'
import type { SocialPlatform } from '@/lib/meta/types'

/**
 * Glifos do Instagram e do Facebook.
 *
 * O lucide-react v1 removeu os ícones de marca, então desenhamos os dois aqui
 * no mesmo traço dos demais ícones da interface (24x24, stroke currentColor).
 */

const base: SVGProps<SVGSVGElement> = {
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 2,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
}

export function InstagramIcon({ className, ...props }: SVGProps<SVGSVGElement>) {
  return (
    <svg {...base} className={className} aria-hidden {...props}>
      <rect width="20" height="20" x="2" y="2" rx="5" />
      <circle cx="12" cy="12" r="4" />
      <circle cx="17.5" cy="6.5" r="0.75" fill="currentColor" stroke="none" />
    </svg>
  )
}

export function FacebookIcon({ className, ...props }: SVGProps<SVGSVGElement>) {
  return (
    <svg {...base} className={className} aria-hidden {...props}>
      <path d="M18 2h-3a5 5 0 0 0-5 5v3H7v4h3v8h4v-8h3l1-4h-4V7a1 1 0 0 1 1-1h3z" />
    </svg>
  )
}

export function PlatformIcon({
  platform,
  className,
}: {
  platform: SocialPlatform
  className?: string
}) {
  const Icone = platform === 'instagram' ? InstagramIcon : FacebookIcon
  return <Icone className={className} />
}
