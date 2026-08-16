import { Plus, SlidersHorizontal } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { PageHeader } from '@/components/app/page-header'
import { PautasView } from './pautas-view'

const filterChips = ['Responsável', 'Coordenação', 'Projeto', 'Status', 'Prioridade', 'Período']

export default function PautasPage() {
  return (
    <div>
      <PageHeader
        title="Pautas"
        description="Acompanhe todas as pautas em produção pela Redação CVRJ."
        actions={
          <Button size="lg">
            <Plus className="size-4" />
            Nova pauta
          </Button>
        }
      />

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <span className="flex items-center gap-1.5 text-sm text-muted-foreground">
          <SlidersHorizontal className="size-4" />
          Filtros:
        </span>
        {filterChips.map((f) => (
          <button
            key={f}
            type="button"
            className="rounded-lg border border-border bg-background px-2.5 py-1 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            {f}
          </button>
        ))}
      </div>

      <PautasView />
    </div>
  )
}
