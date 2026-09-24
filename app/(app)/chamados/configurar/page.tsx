import { ShieldAlert } from 'lucide-react'
import { PageHeader } from '@/components/app/page-header'
import { Card } from '@/components/ui/card'
import { ConfigurarChamados, type FilaNaConfiguracao } from '@/components/app/chamados/configurar'
import { requireWorkspace } from '@/lib/session'
import { createAdminClient } from '@/lib/supabase/admin'
import { pode } from '@/lib/permissoes'
import { ABERTOS, slaDaFila } from '@/lib/chamados/regras'

export const dynamic = 'force-dynamic'

export default async function ConfigurarChamadosPage() {
  const context = await requireWorkspace()
  const migalhas = [{ label: 'Chamados', href: '/chamados' }, { label: 'Configurar' }]
  if (!pode(context.role, 'chamados.configurar')) {
    return <div><PageHeader title="Configurar chamados" breadcrumbs={migalhas} /><Card className="flex items-start gap-3 p-6"><ShieldAlert className="mt-0.5 size-5 text-muted-foreground" /><p className="text-sm">Só administradores configuram filas, equipes e prazos de atendimento.</p></Card></div>
  }
  const admin = createAdminClient()
  const ws = context.workspace.id
  const [{ data: filas }, { data: membros }, { data: categorias }, { data: abertos }, { data: vinculos }] = await Promise.all([
    admin.from('chamado_filas').select('id, nome, prefixo, descricao, ativa, atendimento_24h, sla').eq('workspace_id', ws).order('ordem').order('nome'),
    admin.from('chamado_fila_membros').select('fila_id, user_id').eq('workspace_id', ws),
    admin.from('chamado_categorias').select('id, fila_id, nome, descricao, tipo, pede_local, ativa').eq('workspace_id', ws).order('ordem').order('nome'),
    admin.from('chamados').select('fila_id').eq('workspace_id', ws).in('status', [...ABERTOS]),
    admin.from('workspace_members').select('user_id, role, profiles(full_name, active)').eq('workspace_id', ws),
  ])
  const lista: FilaNaConfiguracao[] = (filas ?? []).map((f) => ({
    id: f.id, nome: f.nome, prefixo: f.prefixo, descricao: f.descricao, ativa: f.ativa, atendimento24h: f.atendimento_24h, sla: slaDaFila(f.sla),
    membros: (membros ?? []).filter((m) => m.fila_id === f.id).map((m) => m.user_id as string),
    categorias: (categorias ?? []).filter((c) => c.fila_id === f.id).map((c) => ({ id: c.id, nome: c.nome, descricao: c.descricao, tipo: c.tipo, pedeLocal: c.pede_local, ativa: c.ativa })),
    abertos: (abertos ?? []).filter((c) => c.fila_id === f.id).length,
  }))
  const pessoas = (vinculos ?? []).flatMap((v) => {
    const p = (Array.isArray(v.profiles) ? v.profiles[0] : v.profiles) as { full_name: string; active: boolean } | null
    return p?.active ? [{ id: v.user_id as string, nome: p.full_name, papel: v.role as string }] : []
  }).sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'))

  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader title="Configurar chamados" description="Filas de atendimento, quem atende cada uma, o catálogo de assuntos e os prazos (SLA) por prioridade." breadcrumbs={migalhas} />
      <ConfigurarChamados filas={lista} pessoas={pessoas} />
    </div>
  )
}
