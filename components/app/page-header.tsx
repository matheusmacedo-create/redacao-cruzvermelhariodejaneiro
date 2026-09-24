import Link from 'next/link'
import { ChevronRight } from 'lucide-react'

export type Crumb = { label: string; href?: string }

export function PageHeader({
  title,
  description,
  breadcrumbs,
  actions,
}: {
  title: string
  description?: string
  breadcrumbs?: Crumb[]
  actions?: React.ReactNode
}) {
  return (
    <div className="mb-6 sm:mb-7">
      {breadcrumbs && breadcrumbs.length > 0 && (
        <nav aria-label="Caminho" className="mb-2 flex items-center gap-1 overflow-x-auto whitespace-nowrap pb-1 text-xs text-muted-foreground">
          {breadcrumbs.map((c, i) => (
            <span key={i} className="flex items-center gap-1">
              {i > 0 && <ChevronRight className="size-3" aria-hidden="true" />}
              {c.href ? (
                <Link href={c.href} className="hover:text-foreground">
                  {c.label}
                </Link>
              ) : (
                <span className="text-foreground">{c.label}</span>
              )}
            </span>
          ))}
        </nav>
      )}
      <div className="flex flex-col items-stretch justify-between gap-4 sm:flex-row sm:items-start">
        <div className="min-w-0">
          <h1 className="text-2xl font-bold leading-tight tracking-tight text-balance sm:text-[1.75rem]">{title}</h1>
          {description && (
            <p className="mt-1.5 max-w-3xl text-sm leading-relaxed text-muted-foreground text-pretty">{description}</p>
          )}
        </div>
        {actions && <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto sm:justify-end">{actions}</div>}
      </div>
    </div>
  )
}
