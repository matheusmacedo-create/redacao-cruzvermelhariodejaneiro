import { PageHeader } from '@/components/app/page-header'
import { requireWorkspace } from '@/lib/session'
import { createClient } from '@/lib/supabase/server'
import { PublicadorRedes, type PublicacaoRegistro } from '@/components/app/publicador-redes'

export const dynamic = 'force-dynamic'

/**
 * Tela própria para publicar nas redes.
 *
 * O painel também vive dentro do editor de conteúdo, onde o texto já vem
 * pronto da matéria. Mas quem quer só fazer um post — um aviso, uma foto de
 * ação, uma data comemorativa — não tem matéria nenhuma para abrir. Esta
 * página existe para esse caso, e é ela que aparece no menu.
 */
export default async function RedesPage() {
  const context = await requireWorkspace()
  const supabase = await createClient()

  const { data: rows } = await supabase
    .from('social_publications')
    .select('id,networks,body,status,error,results,scheduled_for,created_at,content_id,format')
    .eq('workspace_id', context.workspace.id)
    .neq('status', 'draft')
    .order('created_at', { ascending: false })
    .limit(30)

  // Rascunhos parados na fila de aprovação, com o estado da votação ao lado.
  const { data: draftRows } = await supabase
    .from('social_publications')
    .select('id,networks,body,format,created_at,content_id')
    .eq('workspace_id', context.workspace.id)
    .eq('status', 'draft')
    .order('created_at', { ascending: false })
    .limit(20)

  const contentIds = (draftRows ?? []).map((d: any) => d.content_id).filter(Boolean)
  const { data: approvalRows } = contentIds.length
    ? await supabase.from('approvals').select('id,content_id,status')
        .eq('workspace_id', context.workspace.id).in('content_id', contentIds)
    : { data: [] as any[] }
  const aprovacaoPorConteudo = new Map((approvalRows ?? []).map((a: any) => [a.content_id, a]))

  const { data: memberRows } = await supabase
    .from('workspace_members')
    .select('user_id,profiles(id,full_name,initials,color,active)')
    .eq('workspace_id', context.workspace.id)

  const pessoas = (memberRows ?? [])
    .map((m: any) => (Array.isArray(m.profiles) ? m.profiles[0] : m.profiles))
    .filter((p: any) => p && p.active !== false && p.id !== context.user.id)
    .map((p: any) => ({ id: p.id, nome: p.full_name, iniciais: p.initials || '?', cor: p.color }))

  const quando = new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' })
  const publicacoes: PublicacaoRegistro[] = (rows ?? []).map((pub: any) => ({
    id: pub.id,
    redes: pub.networks ?? [],
    corpo: pub.body,
    status: pub.status,
    erro: pub.error,
    formato: pub.format,
    resultados: Array.isArray(pub.results) ? pub.results : [],
    criadaEm: quando.format(new Date(pub.created_at)),
    agendadaPara: pub.scheduled_for ? quando.format(new Date(pub.scheduled_for)) : null,
  }))

  const rascunhos = (draftRows ?? []).map((d: any) => {
    const aprovacao = d.content_id ? aprovacaoPorConteudo.get(d.content_id) : null
    return {
      id: d.id,
      redes: d.networks ?? [],
      corpo: d.body,
      formato: d.format,
      criadaEm: quando.format(new Date(d.created_at)),
      aprovacao: aprovacao?.status ?? null,
      aprovacaoId: aprovacao?.id ?? null,
    }
  })

  return (
    <div>
      <PageHeader
        title="Redes Sociais"
        description="Escreva um post e envie para as contas oficiais da Cruz Vermelha. Para publicar uma matéria já escrita, use o painel dentro do próprio conteúdo."
      />
      <PublicadorRedes textoInicial="" publicacoes={publicacoes} podeConectar={context.role === 'admin'} workspaceId={context.workspace.id} pessoas={pessoas} rascunhos={rascunhos} />
    </div>
  )
}
