import { PageHeader } from '@/components/app/page-header'
import { Card } from '@/components/ui/card'
import { NovoChamado, type FilaParaAbrir } from '@/components/app/chamados/formularios'
import { requireWorkspace } from '@/lib/session'
import { createClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

export default async function NovoChamadoPage({ searchParams }: { searchParams: Promise<{ fila?: string }> }) {
  const context = await requireWorkspace()
  const supabase = await createClient()
  const [{ data: filas }, { data: categorias }] = await Promise.all([
    supabase.from('chamado_filas').select('id, slug, nome, descricao, icone').eq('workspace_id', context.workspace.id).eq('ativa', true).order('ordem'),
    supabase.from('chamado_categorias').select('id, fila_id, nome, descricao, pede_local, tipo').eq('workspace_id', context.workspace.id).eq('ativa', true).order('ordem').order('nome'),
  ])
  const lista: FilaParaAbrir[] = (filas ?? []).map((f) => ({
    id: f.id, nome: f.nome, descricao: f.descricao, icone: f.icone,
    categorias: (categorias ?? []).filter((c) => c.fila_id === f.id).map((c) => ({ id: c.id, nome: c.nome, descricao: c.descricao, pedeLocal: c.pede_local, tipo: c.tipo })),
  })).filter((f) => f.categorias.length)
  const { fila } = await searchParams
  const inicial = (filas ?? []).find((f) => f.slug === fila || f.id === fila)?.id

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader title="Abrir chamado" description="Peça ajuda a outra equipe da filial. Você acompanha tudo por aqui e recebe os avisos por e-mail." breadcrumbs={[{ label: 'Chamados', href: '/chamados' }, { label: 'Novo' }]} />
      <Card className="p-5 sm:p-6"><NovoChamado workspaceId={context.workspace.id} filas={lista} filaInicial={inicial} /></Card>
    </div>
  )
}
