'use client'

import { useState } from 'react'
import Link from 'next/link'
import { Image as ImageIcon, Video, ArrowRight, Archive } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Avatar } from '@/components/ui/avatar'
import { PageHeader } from '@/components/app/page-header'
import { inbox, getPerson } from '@/lib/data'
import { cn } from '@/lib/utils'

const filters = [
  'Todos',
  'Não analisados',
  'Atividades',
  'Ideias',
  'Arquivos',
  'Histórias',
  'Pedidos',
] as const

const statusMeta: Record<string, { label: string; className: string }> = {
  novo: { label: 'NOVO', className: 'bg-primary text-primary-foreground' },
  analisado: { label: 'ANALISADO', className: 'bg-info/12 text-info' },
  'em-pauta': { label: 'EM PAUTA', className: 'bg-success/14 text-success' },
}

export default function CaixaEntradaPage() {
  const [active, setActive] = useState<(typeof filters)[number]>('Todos')

  const list = inbox.filter((item) => {
    if (active === 'Todos') return true
    if (active === 'Não analisados') return item.status === 'novo'
    return item.category === active
  })

  return (
    <div>
      <PageHeader
        title="Caixa de Entrada"
        description="Materiais, relatos e sugestões enviados para a Comunicação."
        actions={
          <Button variant="outline" size="lg" render={<Link href="/registrar" />}>
            Registrar atividade
          </Button>
        }
      />

      <div className="mb-5 flex flex-wrap gap-1.5">
        {filters.map((f) => (
          <button
            key={f}
            type="button"
            onClick={() => setActive(f)}
            className={cn(
              'rounded-lg px-3 py-1.5 text-sm font-medium transition-colors',
              active === f
                ? 'bg-foreground text-background'
                : 'bg-muted text-muted-foreground hover:bg-secondary hover:text-foreground',
            )}
          >
            {f}
          </button>
        ))}
      </div>

      <div className="flex flex-col gap-3">
        {list.map((item) => {
          const person = getPerson(item.authorId)
          const st = statusMeta[item.status]
          return (
            <Card key={item.id} className="p-4 transition-shadow hover:shadow-sm">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start">
                <div className="min-w-0 flex-1">
                  <div className="mb-1.5 flex flex-wrap items-center gap-2">
                    <span
                      className={cn(
                        'rounded px-1.5 py-0.5 text-[10px] font-bold tracking-wide',
                        st.className,
                      )}
                    >
                      {st.label}
                    </span>
                    <span className="rounded-md border border-border px-2 py-0.5 text-xs text-muted-foreground">
                      {item.category}
                    </span>
                    <span className="rounded-md bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
                      {item.coordenacao}
                    </span>
                  </div>

                  <h3 className="text-base font-semibold">{item.title}</h3>

                  <p className="mt-1 line-clamp-1 text-sm text-muted-foreground">{item.preview}</p>

                  <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
                    <span className="flex items-center gap-1.5">
                      <Avatar
                        initials={person?.initials ?? '?'}
                        color={person?.color}
                        size="xs"
                      />
                      Enviado por {person?.name}
                    </span>
                    <span>{item.date}</span>
                    {(item.photos > 0 || item.videos > 0) && (
                      <span className="flex items-center gap-3">
                        {item.photos > 0 && (
                          <span className="flex items-center gap-1">
                            <ImageIcon className="size-3.5" />
                            {item.photos} fotos
                          </span>
                        )}
                        {item.videos > 0 && (
                          <span className="flex items-center gap-1">
                            <Video className="size-3.5" />
                            {item.videos} vídeos
                          </span>
                        )}
                      </span>
                    )}
                  </div>
                </div>

                <div className="flex shrink-0 items-center gap-2 sm:flex-col sm:items-stretch">
                  <Button size="sm" render={<Link href="/pautas" />}>
                    Transformar em pauta
                    <ArrowRight className="size-3.5" />
                  </Button>
                  <div className="flex gap-2">
                    <Button variant="outline" size="sm" className="flex-1">
                      Abrir
                    </Button>
                    <Button variant="ghost" size="icon-sm" aria-label="Arquivar">
                      <Archive className="size-4" />
                    </Button>
                  </div>
                </div>
              </div>
            </Card>
          )
        })}

        {list.length === 0 && (
          <Card className="flex flex-col items-center justify-center gap-2 py-16 text-center">
            <p className="text-sm font-medium">Nenhum registro nesta categoria.</p>
            <p className="text-sm text-muted-foreground">
              Assim que novos materiais forem enviados, eles aparecerão aqui.
            </p>
          </Card>
        )}
      </div>
    </div>
  )
}
