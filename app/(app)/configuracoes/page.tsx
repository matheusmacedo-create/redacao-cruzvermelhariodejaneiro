import { PageHeader } from '@/components/app/page-header'
import { UserManager } from '@/components/admin/user-manager'
import { DangerZone } from '@/components/admin/danger-zone'
import { AnalyticsDoSite } from '@/components/admin/analytics-do-site'
import { Integracoes } from '@/components/admin/integracoes'
import { CorreioDosSetores } from '@/components/admin/correio-setores'
import { requireWorkspace } from '@/lib/session'
import { createClient } from '@/lib/supabase/server'
import { obterCampos, SERVICOS, situacaoDasChaves } from '@/lib/integracoes/chaves'

export default async function ConfiguracoesPage({
  searchParams,
}: {
  searchParams: Promise<{ google?: string; motivo?: string }>
}) {
  const context = await requireWorkspace()
  const supabase = await createClient()
  const { data: members } = await supabase.from('workspace_members').select('user_id,role,coordination,profiles(full_name,username,job_title)').eq('workspace_id',context.workspace.id).order('created_at')
  const admin = context.role === 'admin'

  const workspaceId = context.workspace.id
  const [chaves, clienteGoogle, conexao, setores, membrosDeSetor, caixas] = admin
    ? await Promise.all([
      situacaoDasChaves(supabase, workspaceId),
      obterCampos(workspaceId, 'google_oauth'),
      supabase.from('google_conexao').select('email_conta,estado,sincronizada_em').eq('workspace_id', workspaceId).maybeSingle(),
      supabase.from('setores').select('id,nome').eq('workspace_id', workspaceId).order('nome'),
      supabase.from('setor_membros').select('setor_id,user_id').eq('workspace_id', workspaceId),
      supabase.from('caixas_de_email').select('id,email,nome_exibicao,assinatura_html,setor_id,ativa,no_gmail,principal').eq('workspace_id', workspaceId).order('email'),
    ])
    : [[], null, null, null, null, null] as const

  const { google, motivo } = await searchParams
  const aviso = google === 'ok'
    ? { tom: 'ok' as const, texto: motivo || 'Conta Google conectada.' }
    : google === 'erro' ? { tom: 'erro' as const, texto: motivo || 'Não foi possível conectar a conta Google.' }
      : google === 'restrito' ? { tom: 'erro' as const, texto: 'Só administradores conectam a conta Google.' } : null

  const pessoas = (members ?? []).map((m) => {
    const perfil = (Array.isArray(m.profiles) ? m.profiles[0] : m.profiles) as { full_name?: string; username?: string } | null
    return { id: m.user_id as string, nome: perfil?.full_name || perfil?.username || '—' }
  }).sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'))

  return <div><PageHeader title="Configurações" description={`Administração do espaço ${context.workspace.name}.`}/>{admin ? <UserManager members={members ?? []}/> : <div className="rounded-xl border border-border bg-card p-6"><h2 className="font-semibold">Preferências do espaço</h2><p className="mt-2 text-sm text-muted-foreground">A gestão de usuários é restrita aos administradores.</p></div>}
    {admin && <Integracoes chaves={chaves.map((c) => ({ ...c, painel: SERVICOS[c.servico].painel }))} />}
    {admin && (
      <CorreioDosSetores
        aviso={aviso}
        clienteConfigurado={Boolean(clienteGoogle)}
        conexao={conexao?.data ? { email: conexao.data.email_conta, estado: conexao.data.estado, sincronizadaEm: conexao.data.sincronizada_em } : null}
        setores={(setores?.data ?? []).map((s) => ({
          id: s.id, nome: s.nome,
          membros: (membrosDeSetor?.data ?? []).filter((m) => m.setor_id === s.id).map((m) => m.user_id as string),
        }))}
        pessoas={pessoas}
        caixas={(caixas?.data ?? []).map((c) => ({
          id: c.id, email: c.email, nome: c.nome_exibicao, assinatura: c.assinatura_html,
          setorId: c.setor_id, ativa: c.ativa, noGmail: c.no_gmail, principal: c.principal,
        }))}
      />
    )}
    {admin && <AnalyticsDoSite />}
    {admin && <DangerZone workspace={context.workspace} />}
  </div>
}
