import { requireWorkspace } from '@/lib/session'
import { createClient } from '@/lib/supabase/server'
import { RegistrarForm } from './registrar-form'
import type { Etiqueta } from '@/app/actions/quadro'

export default async function RegistrarPage({ searchParams }: { searchParams: Promise<{ projeto?: string }> }) {
  const { projeto } = await searchParams
  const context = await requireWorkspace()
  const supabase = await createClient()
  const [{ data: projects }, { data: membros }, { data: etiquetas }] = await Promise.all([
    supabase.from('projects').select('id,name,status').eq('workspace_id', context.workspace.id).order('name'),
    supabase.from('workspace_members').select('user_id,profiles(full_name,active)').eq('workspace_id', context.workspace.id),
    supabase.from('etiquetas').select('id,nome,cor').eq('workspace_id', context.workspace.id).order('nome'),
  ])

  const pessoas = (membros ?? []).flatMap((m) => {
    const p = (Array.isArray(m.profiles) ? m.profiles[0] : m.profiles) as { full_name?: string; active?: boolean } | null
    if (!p || p.active === false) return []
    return [{ id: m.user_id as string, nome: p.full_name || 'Colaborador' }]
  }).sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'))

  // Projetos em andamento primeiro; os concluídos continuam escolhíveis, marcados.
  const projetos = (projects ?? [])
    .map((p) => ({ id: p.id, name: p.status === 'completed' ? `${p.name} (concluído)` : p.name, concluido: p.status === 'completed' }))
    .sort((a, b) => Number(a.concluido) - Number(b.concluido) || a.name.localeCompare(b.name, 'pt-BR'))

  return (
    <RegistrarForm
      projectId={projeto}
      projects={projetos}
      pessoas={pessoas}
      etiquetas={(etiquetas ?? []) as Etiqueta[]}
      eu={context.user.id}
    />
  )
}
