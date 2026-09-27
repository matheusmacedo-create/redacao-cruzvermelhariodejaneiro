import { CorreioDosSetores } from '@/components/admin/correio-setores'
import { exigirAdministracao } from '@/lib/configuracoes/servidor'
import { createClient } from '@/lib/supabase/server'
import { obterCampos } from '@/lib/integracoes/chaves'
import { urlDeRetorno } from '@/lib/google/gmail'

export const metadata = { title: 'E-mail dos setores — Configurações' }

export default async function EmailDosSetoresPage({
  searchParams,
}: {
  searchParams: Promise<{ google?: string; motivo?: string }>
}) {
  const context = await exigirAdministracao()
  const supabase = await createClient()
  const workspaceId = context.workspace.id
  const [{ data: members }, clienteGoogle, conexao, setores, membrosDeSetor, caixas] = await Promise.all([
    supabase.from('workspace_members').select('user_id,profiles(full_name,username)').eq('workspace_id', workspaceId),
    obterCampos(workspaceId, 'google_oauth'),
    supabase.from('google_conexao').select('email_conta,estado,sincronizada_em').eq('workspace_id', workspaceId).maybeSingle(),
    supabase.from('setores').select('id,nome').eq('workspace_id', workspaceId).order('nome'),
    supabase.from('setor_membros').select('setor_id,user_id').eq('workspace_id', workspaceId),
    supabase.from('caixas_de_email').select('id,email,nome_exibicao,nome_remetente,assinatura_html,setor_id,ativa,no_gmail,principal').eq('workspace_id', workspaceId).order('email'),
  ])

  const { google, motivo } = await searchParams
  const aviso = google === 'ok'
    ? { tom: 'ok' as const, texto: motivo || 'Conta Google conectada.' }
    : google === 'erro' ? { tom: 'erro' as const, texto: motivo || 'Não foi possível conectar a conta Google.' }
      : google === 'restrito' ? { tom: 'erro' as const, texto: 'Só administradores conectam a conta Google.' } : null

  const pessoas = (members ?? []).map((m) => {
    const perfil = (Array.isArray(m.profiles) ? m.profiles[0] : m.profiles) as { full_name?: string; username?: string } | null
    return { id: m.user_id as string, nome: perfil?.full_name || perfil?.username || '—' }
  }).sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'))

  return (
    <CorreioDosSetores
      aviso={aviso}
      clienteConfigurado={Boolean(clienteGoogle)}
      retorno={urlDeRetorno()}
      conexao={conexao.data ? { email: conexao.data.email_conta, estado: conexao.data.estado, sincronizadaEm: conexao.data.sincronizada_em } : null}
      setores={(setores.data ?? []).map((s) => ({
        id: s.id, nome: s.nome,
        membros: (membrosDeSetor.data ?? []).filter((m) => m.setor_id === s.id).map((m) => m.user_id as string),
      }))}
      pessoas={pessoas}
      caixas={(caixas.data ?? []).map((c) => ({
        id: c.id, email: c.email, nome: c.nome_exibicao, nomeRemetente: c.nome_remetente ?? '', assinatura: c.assinatura_html,
        setorId: c.setor_id, ativa: c.ativa, noGmail: c.no_gmail, principal: c.principal,
      }))}
    />
  )
}
