import { PageHeader } from '@/components/app/page-header'
import { UserManager } from '@/components/admin/user-manager'
import { DangerZone } from '@/components/admin/danger-zone'
import { AnalyticsDoSite } from '@/components/admin/analytics-do-site'
import { Integracoes } from '@/components/admin/integracoes'
import { requireWorkspace } from '@/lib/session'
import { createClient } from '@/lib/supabase/server'
import { SERVICOS, situacaoDasChaves } from '@/lib/integracoes/chaves'

export default async function ConfiguracoesPage() {
  const context = await requireWorkspace()
  const supabase = await createClient()
  const { data: members } = await supabase.from('workspace_members').select('user_id,role,coordination,profiles(full_name,username,job_title)').eq('workspace_id',context.workspace.id).order('created_at')
  const chaves = context.role === 'admin'
    ? (await situacaoDasChaves(supabase, context.workspace.id)).map((c) => ({ ...c, painel: SERVICOS[c.servico].painel }))
    : []
  return <div><PageHeader title="Configurações" description={`Administração do espaço ${context.workspace.name}.`}/>{context.role === 'admin' ? <UserManager members={members ?? []}/> : <div className="rounded-xl border border-border bg-card p-6"><h2 className="font-semibold">Preferências do espaço</h2><p className="mt-2 text-sm text-muted-foreground">A gestão de usuários é restrita aos administradores.</p></div>}
    {context.role === 'admin' && <Integracoes chaves={chaves} />}
    {context.role === 'admin' && <AnalyticsDoSite />}
    {context.role === 'admin' && <DangerZone workspace={context.workspace} />}
  </div>
}
