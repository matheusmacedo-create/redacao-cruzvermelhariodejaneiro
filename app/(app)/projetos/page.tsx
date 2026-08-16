import Link from 'next/link'
import { Plus, ArrowRight } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { PageHeader } from '@/components/app/page-header'
import { projects } from '@/lib/data'
import { requireWorkspace } from '@/lib/session'

export default async function ProjetosPage() {
  const context = await requireWorkspace()
  const visibleProjects = context.workspace.kind === 'demo' ? projects : []
  return (
    <div>
      <PageHeader
        title="Projetos"
        description="Linhas editoriais e séries de conteúdo da Comunicação CVRJ."
        actions={
          <Button size="lg">
            <Plus className="size-4" />
            Novo projeto
          </Button>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {!visibleProjects.length && <Card className="p-10 text-center sm:col-span-2 lg:col-span-3"><p className="font-medium">Nenhum projeto neste espaço.</p><p className="mt-1 text-sm text-muted-foreground">Crie um projeto para organizar as pautas de Produção.</p></Card>}
        {visibleProjects.map((p) => (
          <Card key={p.id} className="flex flex-col p-5">
            <div className="flex items-start gap-3">
              <span
                className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-muted text-2xl"
                aria-hidden="true"
              >
                {p.emoji}
              </span>
              <div className="min-w-0">
                <h3 className="font-semibold">{p.name}</h3>
                <p className="text-xs text-muted-foreground">Atualizado {p.lastActivity}</p>
              </div>
            </div>

            <p className="mt-3 text-sm leading-relaxed text-muted-foreground text-pretty">
              {p.description}
            </p>

            <div className="mt-4 grid grid-cols-4 gap-2 border-t border-border pt-4 text-center">
              <Stat value={p.counts.pautas} label="Pautas" />
              <Stat value={p.counts.producao} label="Produção" tone="text-info" />
              <Stat value={p.counts.ideias} label="Ideias" />
              <Stat value={p.counts.prontas} label="Prontas" tone="text-success" />
            </div>

            <Link
              href="/pautas"
              className="mt-4 inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline"
            >
              Ver pautas
              <ArrowRight className="size-3.5" />
            </Link>
          </Card>
        ))}
      </div>
    </div>
  )
}

function Stat({ value, label, tone }: { value: number; label: string; tone?: string }) {
  return (
    <div>
      <p className={`text-xl font-bold tabular-nums ${tone ?? 'text-foreground'}`}>{value}</p>
      <p className="text-[11px] text-muted-foreground">{label}</p>
    </div>
  )
}
