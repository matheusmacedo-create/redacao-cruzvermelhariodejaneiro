import Link from 'next/link'
import { ArrowRight, Plus } from 'lucide-react'
import { createProject } from '@/app/actions/editorial'
import { PageHeader } from '@/components/app/page-header'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { requireWorkspace } from '@/lib/session'
import { createClient } from '@/lib/supabase/server'

export default async function ProjetosPage() {
  const context = await requireWorkspace()
  const supabase = await createClient()
  const { data: projects } = await supabase
    .from('projects')
    .select('id,name,description,status,color,updated_at,pautas(id,status)')
    .eq('workspace_id', context.workspace.id)
    .order('updated_at', { ascending: false })

  return (
    <div>
      <PageHeader title="Projetos" description="Linhas editoriais e séries de conteúdo da Comunicação Cruz Vermelha Brasileira Rio de Janeiro." />
      <Card className="mb-6 p-5">
        <form action={createProject} className="grid gap-4 md:grid-cols-[1fr_2fr_auto] md:items-end">
          <label className="text-sm font-medium">Nome<input name="name" required minLength={3} className="mt-1 h-10 w-full rounded-lg border border-border bg-background px-3" /></label>
          <label className="text-sm font-medium">Descrição<input name="description" className="mt-1 h-10 w-full rounded-lg border border-border bg-background px-3" /></label>
          <Button type="submit" size="lg"><Plus className="size-4" />Novo projeto</Button>
        </form>
      </Card>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {!projects?.length && <Card className="p-10 text-center sm:col-span-2 lg:col-span-3"><p className="font-medium">Nenhum projeto neste espaço.</p><p className="mt-1 text-sm text-muted-foreground">Crie um projeto para organizar suas pautas.</p></Card>}
        {projects?.map((project) => {
          const pautas = project.pautas ?? []
          return <Card key={project.id} className="flex flex-col p-5">
            <div className="flex items-start gap-3"><span className="mt-1 size-3 shrink-0 rounded-full bg-primary" /><div><h3 className="font-semibold">{project.name}</h3><p className="text-xs text-muted-foreground">{project.status === 'active' ? 'Ativo' : project.status}</p></div></div>
            <p className="mt-3 flex-1 text-sm leading-relaxed text-muted-foreground">{project.description || 'Sem descrição.'}</p>
            <div className="mt-4 grid grid-cols-3 gap-2 border-t border-border pt-4 text-center">
              <Stat value={pautas.length} label="Pautas" /><Stat value={pautas.filter((p) => p.status === 'production').length} label="Produção" /><Stat value={pautas.filter((p) => p.status === 'approved').length} label="Prontas" />
            </div>
            <div className="mt-4 flex items-center gap-4 text-sm font-medium">
              <Link href={`/projetos/${project.id}`} className="inline-flex items-center gap-1 text-primary hover:underline">Abrir projeto<ArrowRight className="size-3.5" /></Link>
              <Link href={`/pautas?projeto=${project.id}`} className="text-muted-foreground hover:text-foreground hover:underline">Ver pautas</Link>
            </div>
          </Card>
        })}
      </div>
    </div>
  )
}

function Stat({ value, label }: { value: number; label: string }) {
  return <div><p className="text-xl font-bold tabular-nums">{value}</p><p className="text-[11px] text-muted-foreground">{label}</p></div>
}
