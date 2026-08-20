import { requireWorkspace } from '@/lib/session'
import { createClient } from '@/lib/supabase/server'
import { RegistrarForm } from './registrar-form'

export default async function RegistrarPage({ searchParams }: { searchParams: Promise<{ projeto?: string }> }) {
  const { projeto } = await searchParams
  const context = await requireWorkspace()
  const supabase = await createClient()
  const { data: projects } = await supabase.from('projects').select('id,name').eq('workspace_id', context.workspace.id).order('name')

  return <RegistrarForm projectId={projeto} projects={projects ?? []} />
}
