import { PageHeader } from '@/components/app/page-header'
import { UserManager } from '@/components/admin/user-manager'
import { requireWorkspace } from '@/lib/session'
import { createClient } from '@/lib/supabase/server'

export default async function ConfiguracoesPage() {
  const context = await requireWorkspace()
  const supabase = await createClient()
  const { data: members } = await supabase.from('workspace_members').select('user_id,role,coordination,profiles(full_name,username,job_title)').eq('workspace_id',context.workspace.id).order('created_at')
  return <div><PageHeader title="Configurações" description={`Administração do espaço ${context.workspace.name}.`}/>{context.role === 'admin' ? <UserManager members={members ?? []}/> : <div className="rounded-xl border border-border bg-card p-6"><h2 className="font-semibold">Preferências do espaço</h2><p className="mt-2 text-sm text-muted-foreground">A gestão de usuários é restrita aos administradores.</p></div>}</div>
}
