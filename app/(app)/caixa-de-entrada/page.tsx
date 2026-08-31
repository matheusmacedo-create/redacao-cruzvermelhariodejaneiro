import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { PageHeader } from '@/components/app/page-header'
import { requireWorkspace } from '@/lib/session'
import { createClient } from '@/lib/supabase/server'
import { CaixaDeAtendimento, type ItemInterno } from '@/components/app/atendimento/caixa'

/**
 * A Caixa de Entrada: três pastas, e só elas.
 *
 * Mensagens, Comentários e E-mail e materiais — o que chega de fora, separado
 * pelo jeito de ler cada coisa. Rascunhos e aprovações moram nas telas deles;
 * daqui sobrou só o atalho com o número, para ninguém esquecer que existem.
 */
export default async function CaixaEntradaPage() {
  const context = await requireWorkspace()
  const supabase = await createClient()

  const [{ data: items }, { count: rascunhos }, { data: pendingVotes }] = await Promise.all([
    supabase.from('inbox_items').select('*').eq('workspace_id', context.workspace.id).neq('status', 'archived').order('received_at', { ascending: false }),
    supabase.from('content_pieces').select('id', { count: 'exact', head: true }).eq('workspace_id', context.workspace.id).eq('responsible_id', context.user.id).eq('status', 'draft'),
    supabase.from('approval_voters').select('approval_id').eq('user_id', context.user.id).eq('decision', 'pending'),
  ])

  const internos: ItemInterno[] = (items ?? []).map((item) => ({
    id: String(item.id),
    titulo: item.title || 'Sem título',
    resumo: item.summary || '',
    tipo: item.type || '',
    coordenacao: item.coordination || '',
    remetente: item.sender_name || '',
    quando: item.received_at || '',
    status: item.status || '',
  }))

  return (
    <div>
      <PageHeader
        title="Caixa de Entrada"
        description="O que o público escreveu nas redes e o que chegou por dentro, em pastas."
        actions={<Button variant="outline" size="lg" render={<Link href="/registrar" />}>Registrar atividade</Button>}
      />

      <CaixaDeAtendimento
        internos={internos}
        atalhos={{ rascunhos: rascunhos ?? 0, aprovacoes: (pendingVotes ?? []).length }}
      />
    </div>
  )
}
