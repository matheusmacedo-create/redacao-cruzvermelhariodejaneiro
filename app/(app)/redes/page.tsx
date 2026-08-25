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
    .order('created_at', { ascending: false })
    .limit(30)

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

  return (
    <div>
      <PageHeader
        title="Redes Sociais"
        description="Escreva um post e envie para as contas oficiais da Cruz Vermelha. Para publicar uma matéria já escrita, use o painel dentro do próprio conteúdo."
      />
      <PublicadorRedes textoInicial="" publicacoes={publicacoes} podeConectar={context.role === 'admin'} />
    </div>
  )
}
