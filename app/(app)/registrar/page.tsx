import { requireWorkspace } from '@/lib/session'
import { createClient } from '@/lib/supabase/server'
import { RegistrarForm } from './registrar-form'

export default async function RegistrarPage({ searchParams }: { searchParams: Promise<{ projeto?: string }> }) {
  const { projeto } = await searchParams
  let projectName: string | undefined

  if (projeto) {
    const context = await requireWorkspace()
    const supabase = await createClient()
    const { data: project } = await supabase.from('projects').select('name').eq('id', projeto).eq('workspace_id', context.workspace.id).maybeSingle()
    projectName = project?.name
  }

  return <RegistrarForm projectId={projeto} projectName={projectName} />
}
