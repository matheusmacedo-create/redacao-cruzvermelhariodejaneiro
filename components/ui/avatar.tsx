'use client'

import { useEffect, useState } from 'react'
import { cn } from '@/lib/utils'

const sizes = {
  xs: 'size-6 text-[10px]',
  sm: 'size-8 text-xs',
  md: 'size-10 text-sm',
  lg: 'size-14 text-base',
  xl: 'size-20 text-xl',
}

export function privateAvatarUrl(path?: string | null) {
  return path ? `/api/private-blob?pathname=${encodeURIComponent(path)}` : null
}

export function Avatar({ initials, color, size = 'sm', className, src, alt = '' }: { initials: string; color?: string; size?: keyof typeof sizes; className?: string; src?: string | null; alt?: string }) {
  const [failed, setFailed] = useState(false)
  useEffect(() => setFailed(false), [src])
  return <span className={cn('inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full font-semibold text-white select-none', sizes[size], className)} style={{ backgroundColor: color ?? 'oklch(0.52 0 0)' }} aria-label={alt || undefined} aria-hidden={!alt}>
    {src && !failed ? <img src={src} alt={alt} className="size-full object-cover" onError={() => setFailed(true)} /> : initials}
  </span>
}

export function AvatarStack({ people, max = 3 }: { people: { initials: string; color?: string; avatarPath?: string | null }[]; max?: number }) {
  const shown = people.slice(0, max)
  const rest = people.length - shown.length
  return <div className="flex items-center -space-x-2">{shown.map((person, index) => <Avatar key={index} initials={person.initials} color={person.color} src={privateAvatarUrl(person.avatarPath)} size="sm" className="ring-2 ring-background" />)}{rest > 0 && <span className="inline-flex size-8 items-center justify-center rounded-full bg-muted text-[10px] font-semibold text-muted-foreground ring-2 ring-background">+{rest}</span>}</div>
}
