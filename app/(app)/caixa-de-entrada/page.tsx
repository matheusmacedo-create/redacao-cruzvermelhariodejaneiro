import Link from 'next/link'
import { Archive, ArrowRight, CheckSquare, FileEdit } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { PageHeader } from '@/components/app/page-header'
import { requireWorkspace } from '@/lib/session'
import { createClient } from '@/lib/supabase/server'
import { archiveInboxItem, convertInboxToPauta } from '@/app/actions/editorial'
import { formatDate } from '@/lib/format'
import { PainelDeAtendimento } from '@/components/app/atendimento/painel'

const draftStatusLabel: Record<string, string> = { draft: 'Rascunho', archived: 'Arquivado' }

export default async function CaixaEntradaPage() {
  const context = await requireWorkspace()
  const supabase = await createClient()

  const [{ data: items }, { data: draftContents }, { data: pendingVotes }] = await Promise.all([
    supabase.from('inbox_items').select('*').eq('workspace_id', context.workspace.id).neq('status', 'archived').order('received_at', { ascending: false }),
    supabase.from('content_pieces').select('id,title,format,status,updated_at,pautas(title)').eq('workspace_id', context.workspace.id).eq('responsible_id', context.user.id).in('status', ['draft', 'archived']).order('updated_at', { ascending: false }),
    supabase.from('approval_voters').select('approval_id').eq('user_id', context.user.id).eq('decision', 'pending'),
  ])

  const approvalIds = (pendingVotes ?? []).map((vote) => vote.approval_id)
  const { data: pendingApprovals } = approvalIds.length
    ? await supabase.from('approvals').select('id,content_pieces(title,format,pautas(title))').in('id', approvalIds).eq('workspace_id', context.workspace.id).eq('status', 'pending')
    : { data: [] }

  const drafts = (draftContents ?? []).map((row: any) => ({
    id: row.id,
    title: row.title || 'Sem título',
    format: row.format || 'Conteúdo',
    status: row.status,
    pautaTitle: (Array.isArray(row.pautas) ? row.pautas[0] : row.pautas)?.title,
    updatedAt: row.updated_at,
  }))

  const waitingApproval = (pendingApprovals ?? []).map((row: any) => {
    const content = Array.isArray(row.content_pieces) ? row.content_pieces[0] : row.content_pieces
    const pauta = Array.isArray(content?.pautas) ? content.pautas[0] : content?.pautas
    return { id: row.id, title: content?.title || 'Conteúdo editorial', format: content?.format || 'Conteúdo', pautaTitle: pauta?.title }
  })

  return <div>
    <PageHeader
      title="Caixa de Entrada"
      description="O que o público escreveu nas redes, mais o que espera por você aqui dentro."
      actions={<Button variant="outline" size="lg" render={<Link href="/registrar" />}>Registrar atividade</Button>}
    />

    {/* Primeiro o que vem de fora: comentário sem resposta é a pendência com
        relógio correndo — no Instagram, literalmente 24h. Rascunho e aprovação
        esperam sem custo. */}
    <PainelDeAtendimento />

    <div className="mb-6 grid gap-4 md:grid-cols-2">
      <Card className="p-5">
        <div className="flex items-center gap-2 text-sm font-semibold"><FileEdit className="size-4 text-muted-foreground" />Meus rascunhos ({drafts.length})</div>
        <p className="mt-1 text-xs text-muted-foreground">Matérias e posts que você ainda não enviou para os outros membros.</p>
        {drafts.length ? (
          <ul className="mt-4 flex flex-col gap-2">
            {drafts.map((draft) => (
              <li key={draft.id}>
                <Link href={`/conteudos/${draft.id}`} className="flex items-center justify-between gap-3 rounded-lg border border-border p-3 text-sm transition-colors hover:bg-muted">
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium">{draft.title}</span>
                    <span className="block truncate text-xs text-muted-foreground">{draft.format}{draft.pautaTitle ? ` · ${draft.pautaTitle}` : ''} · {draftStatusLabel[draft.status] || draft.status}</span>
                  </span>
                  <ArrowRight className="size-4 shrink-0 text-muted-foreground" />
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-4 text-sm text-muted-foreground">Nenhum rascunho pendente. Tudo que você escreveu já foi enviado.</p>
        )}
      </Card>

      <Card className="p-5">
        <div className="flex items-center gap-2 text-sm font-semibold"><CheckSquare className="size-4 text-muted-foreground" />Aguardando sua aprovação ({waitingApproval.length})</div>
        <p className="mt-1 text-xs text-muted-foreground">Conteúdos que dependem da sua decisão para avançar.</p>
        {waitingApproval.length ? (
          <ul className="mt-4 flex flex-col gap-2">
            {waitingApproval.map((item) => (
              <li key={item.id}>
                <Link href={`/aprovacoes/${item.id}`} className="flex items-center justify-between gap-3 rounded-lg border border-border p-3 text-sm transition-colors hover:bg-muted">
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium">{item.title}</span>
                    <span className="block truncate text-xs text-muted-foreground">{item.format}{item.pautaTitle ? ` · ${item.pautaTitle}` : ''}</span>
                  </span>
                  <ArrowRight className="size-4 shrink-0 text-muted-foreground" />
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-4 text-sm text-muted-foreground">Nenhuma aprovação pendente no momento.</p>
        )}
      </Card>
    </div>

    <div className="flex flex-col gap-3">{(items ?? []).map(item => <Card key={item.id} className="p-4"><div className="flex flex-col gap-4 sm:flex-row sm:items-start"><div className="min-w-0 flex-1"><div className="flex flex-wrap gap-2"><span className="rounded bg-primary px-2 py-0.5 text-[10px] font-bold text-primary-foreground">{item.status === 'new' ? 'NOVO' : item.status.toUpperCase()}</span><span className="rounded-md border border-border px-2 py-0.5 text-xs text-muted-foreground">{item.type}</span>{item.coordination && <span className="rounded-md bg-primary/10 px-2 py-0.5 text-xs text-primary">{item.coordination}</span>}</div><h2 className="mt-2 font-semibold">{item.title}</h2><p className="mt-1 text-sm text-muted-foreground">{item.summary}</p><p className="mt-3 text-xs text-muted-foreground">Enviado por {item.sender_name || 'Não informado'} · {formatDate(item.received_at, { dateStyle: 'short', timeStyle: 'short' })}</p></div><div className="flex shrink-0 flex-wrap gap-2 sm:w-44 sm:flex-col"><form action={convertInboxToPauta}><input type="hidden" name="id" value={item.id}/><Button type="submit" size="sm" className="w-full">Transformar em pauta <ArrowRight className="size-3.5"/></Button></form><Button variant="outline" size="sm" render={<Link href={`/caixa-de-entrada/${item.id}`} />}>Abrir</Button><form action={archiveInboxItem}><input type="hidden" name="id" value={item.id}/><Button type="submit" variant="ghost" size="sm" className="w-full"><Archive className="size-4"/> Arquivar</Button></form></div></div></Card>)}
    {!items?.length && <Card className="p-10 text-center"><p className="font-medium">Caixa de entrada vazia.</p><p className="mt-1 text-sm text-muted-foreground">Este espaço ainda não recebeu materiais.</p></Card>}</div>
  </div>
}
