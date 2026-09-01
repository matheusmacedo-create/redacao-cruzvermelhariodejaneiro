import { marcaDoCanal } from '@/lib/marcas'

/**
 * O logo oficial do canal, no app. Mesmos glifos do site (lib/marcas) — as
 * duas telas nunca divergem. Marcas pretas (X, Threads, TikTok) saem em
 * currentColor para não sumirem no tema escuro.
 */
export function LogoDoCanal({ canal, tamanho = 14, className }: {
  canal: string
  tamanho?: number
  className?: string
}) {
  const marca = marcaDoCanal(canal)
  if (!marca) return null
  const cor = marca.cor === '#000000' ? 'currentColor' : marca.cor
  return (
    <svg
      width={tamanho}
      height={tamanho}
      viewBox={marca.viewBox}
      fill={cor}
      aria-hidden
      className={className}
      style={{ flex: 'none' }}
    >
      <path d={marca.path} />
    </svg>
  )
}
