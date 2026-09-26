import { PageHeader } from '@/components/app/page-header'
import { requireWorkspace } from '@/lib/session'
import { pode } from '@/lib/permissoes'
import { createClient } from '@/lib/supabase/server'
import { Correio, type CaixaDoSetor, type EnvioNaTela } from '@/components/app/correio/correio'
import { tituloDaArea } from '@/lib/navegacao'
import { sincronizarSeAntigo } from '@/lib/correio/sincronizar'

export const metadata = { title: tituloDaArea('/correio') }

export const dynamic = 'force-dynamic'

/**
 * E-mail do setor (/correio): escrever e enviar pelo endereço do próprio setor, com
 * a assinatura fixa dele, e ver o que o setor já enviou.
 *
 * A tela só oferece as caixas do setor de quem está logado (todas, para
 * admin) — mas a trava de verdade está na ação de envio, no servidor.
 */
export default async function CorreioPage() {
  const context = await requireWorkspace()
  const supabase = await createClient()
  const workspaceId = context.workspace.id
  const admin = pode(context.role, 'correio.todas_as_caixas')
  // Nome e assinatura de cada endereço vêm do Gmail; se a última leitura tem mais de 1 hora, lê de novo antes de mostrar.
  await sincronizarSeAntigo(workspaceId)

  const [{ data: meus }, { data: setores }, { data: caixas }, { data: envios }, { data: conexao }] = await Promise.all([
    supabase.from('setor_membros').select('setor_id').eq('workspace_id', workspaceId).eq('user_id', context.user.id),
    supabase.from('setores').select('id,nome').eq('workspace_id', workspaceId),
    supabase.from('caixas_de_email').select('id,email,nome_exibicao,assinatura_html,setor_id')
      .eq('workspace_id', workspaceId).eq('ativa', true).eq('no_gmail', true).not('setor_id', 'is', null).order('email'),
    supabase.from('emails_enviados').select('id,de,para,cc,assunto,corpo,estado,erro,created_at,setor_id,autor_id,profiles:autor_id(full_name,username)')
      .eq('workspace_id', workspaceId).order('created_at', { ascending: false }).limit(200),
    supabase.from('google_conexao').select('estado').eq('workspace_id', workspaceId).maybeSingle(),
  ])

  const meusSetores = new Set((meus ?? []).map((m) => m.setor_id as string))
  const nomeDoSetor = new Map((setores ?? []).map((s) => [s.id as string, s.nome as string]))

  const disponiveis: CaixaDoSetor[] = (caixas ?? [])
    .filter((c) => admin || meusSetores.has(c.setor_id as string))
    .map((c) => ({
      id: c.id, email: c.email, nome: c.nome_exibicao, assinatura: c.assinatura_html,
      setor: nomeDoSetor.get(c.setor_id as string) ?? '',
    }))

  const historico: EnvioNaTela[] = (envios ?? []).map((e) => {
    const perfil = (Array.isArray(e.profiles) ? e.profiles[0] : e.profiles) as { full_name?: string; username?: string } | null
    return {
      id: e.id, de: e.de, para: e.para ?? [], cc: e.cc ?? [], assunto: e.assunto, corpo: e.corpo,
      estado: e.estado, erro: e.erro, quando: e.created_at,
      setor: nomeDoSetor.get(e.setor_id as string) ?? '—',
      autor: perfil?.full_name || perfil?.username || '—',
    }
  })

  return (
    <div>
      <PageHeader
        title="E-mail do setor"
        description="Envie pelo endereço do seu setor, com a assinatura oficial dele. Tudo o que sai fica registrado para o setor."
      />
      <Correio
        caixas={disponiveis}
        historico={historico}
        situacao={!conexao ? 'desconectado' : conexao.estado === 'expirada' ? 'expirada' : 'ok'}
        ehAdmin={admin}
      />
    </div>
  )
}
