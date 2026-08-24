import { PageHeader } from '@/components/app/page-header'
import { UserManager } from '@/components/admin/user-manager'
import { DangerZone } from '@/components/admin/danger-zone'
import { ChannelsPanel } from '@/components/social/channels-panel'
import { requireWorkspace } from '@/lib/session'
import { createClient } from '@/lib/supabase/server'
import type { SocialChannel } from '@/lib/meta/types'

export default async function ConfiguracoesPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const context = await requireWorkspace()
  const supabase = await createClient()
  const params = await searchParams
  const { data: members } = await supabase.from('workspace_members').select('user_id,role,coordination,profiles(full_name,username,job_title)').eq('workspace_id',context.workspace.id).order('created_at')

  // A coluna do token é revogada no banco — nunca chega até aqui.
  const { data: canais } = await supabase
    .from('social_channels')
    .select('id,workspace_id,platform,external_id,account_name,username,avatar_url,facebook_page_id,token_expires_at,status,last_checked_at,last_error')
    .eq('workspace_id', context.workspace.id)
    .order('platform')
    .returns<SocialChannel[]>()

  const primeiro = (valor: string | string[] | undefined) => (Array.isArray(valor) ? valor[0] : valor)
  const conectado = primeiro(params.conectado)
  const erro = primeiro(params.erro)
  const aviso = conectado ? { tipo: 'ok' as const, mensagem: conectado } : erro ? { tipo: 'erro' as const, mensagem: erro } : null

  return <div><PageHeader title="Configurações" description={`Administração do espaço ${context.workspace.name}.`}/>{context.role === 'admin' ? <UserManager members={members ?? []}/> : <div className="rounded-xl border border-border bg-card p-6"><h2 className="font-semibold">Preferências do espaço</h2><p className="mt-2 text-sm text-muted-foreground">A gestão de usuários é restrita aos administradores.</p></div>}
    <ChannelsPanel canais={canais ?? []} isAdmin={context.role === 'admin'} aviso={aviso} />
    {context.role === 'admin' && <DangerZone workspace={context.workspace} />}
  </div>
}
