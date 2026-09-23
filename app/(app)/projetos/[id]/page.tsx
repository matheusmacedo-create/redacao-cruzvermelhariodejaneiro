import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ArrowLeft, CalendarDays, CheckSquare, ClipboardList, FileEdit, Link2 } from 'lucide-react'
import { Card } from '@/components/ui/card'
import { StatusBadge, ContentStatusBadge } from '@/components/ui/status-badge'
import { requireWorkspace } from '@/lib/session'
import { createClient } from '@/lib/supabase/server'
import { pautaStatus, contentStatus } from '@/lib/status-maps'
import { formatDate } from '@/lib/format'
import { DeleteProjectButton } from './delete-project-button'
import { ehSituacao, situacaoDoProjeto } from '@/lib/projetos/cronograma'
import { ProjetoAsana, type AtualizacaoNaTela } from '@/components/app/projetos/projeto'
import { hojeEmSaoPaulo, type PessoaDoProjeto } from '@/components/app/projetos/comum'

export const dynamic = 'force-dynamic'

export default async function ProjectDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const context = await requireWorkspace()
  const supabase = await createClient()

  const { data: project } = await supabase
    .from('projects')
    .select('id,name,description,status,created_by,created_at,updated_at,inicio,fim,responsavel_id,situacao')
    .eq('id', id)
    .eq('workspace_id', context.workspace.id)
    .maybeSingle()
  if (!project) notFound()

  const [{ data: pautas }, { data: atualizacoes }, { data: marcos }, { data: membros }] = await Promise.all([
    supabase.from('pautas').select('id,title,status,priority,due_date,data_inicio')
      .eq('workspace_id', context.workspace.id).eq('project_id', id).order('updated_at', { ascending: false }),
    supabase.from('project_updates').select('id,situacao,texto,autor_id,created_at')
      .eq('workspace_id', context.workspace.id).eq('project_id', id).order('created_at', { ascending: false }).limit(100),
    supabase.from('project_marcos').select('id,titulo,data,feito')
      .eq('workspace_id', context.workspace.id).eq('project_id', id).order('data'),
    supabase.from('workspace_members').select('user_id,profiles(full_name,initials,color,avatar_path,active)').eq('workspace_id', context.workspace.id),
  ])

  const pessoas: PessoaDoProjeto[] = (membros ?? []).flatMap((m) => {
    const p = (Array.isArray(m.profiles) ? m.profiles[0] : m.profiles) as { full_name?: string; initials?: string; color?: string; avatar_path?: string | null; active?: boolean } | null
    if (!p) return []
    return [{ id: m.user_id as string, nome: p.full_name || 'Colaborador', iniciais: p.initials || '?', cor: p.color || null, avatar: p.avatar_path ?? null }]
  }).sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'))

  const pautaIds = (pautas ?? []).map((p) => p.id)

  const [{ data: contents }, { data: events }, { data: links }] = await Promise.all([
    pautaIds.length
      ? supabase.from('content_pieces').select('id,title,format,status,updated_at,pauta_id').eq('workspace_id', context.workspace.id).in('pauta_id', pautaIds).order('updated_at', { ascending: false })
      : Promise.resolve({ data: [] as any[] }),
    pautaIds.length
      ? supabase.from('calendar_events').select('id,title,event_date,event_time,type,pauta_id').eq('workspace_id', context.workspace.id).in('pauta_id', pautaIds).order('event_date', { ascending: false })
      : Promise.resolve({ data: [] as any[] }),
    pautaIds.length
      ? supabase.from('pauta_links').select('id,title,url,category,pauta_id').eq('workspace_id', context.workspace.id).in('pauta_id', pautaIds).order('created_at', { ascending: false })
      : Promise.resolve({ data: [] as any[] }),
  ])

  const pautaTitleById = new Map((pautas ?? []).map((p) => [p.id, p.title]))
  const pendingApprovals = (contents ?? []).filter((c) => c.status === 'review').length
  const canDelete = context.role === 'admin' || project.created_by === context.user.id
  const concluido = project.status === 'completed'
  const listaDeAtualizacoes: AtualizacaoNaTela[] = (atualizacoes ?? []).filter((a) => ehSituacao(a.situacao)).map((a) => ({
    id: a.id, situacao: a.situacao, texto: a.texto, autorId: a.autor_id, quando: a.created_at,
    podeApagar: context.role === 'admin' || a.autor_id === context.user.id,
  }))

  return (
    <div>
      <nav className="mb-4 flex items-center gap-1 text-xs text-muted-foreground">
        <Link href="/projetos" className="flex items-center gap-1 hover:text-foreground"><ArrowLeft className="size-3.5" />Projetos</Link>
        <span>/</span>
        <span className="text-foreground">{project.name}</span>
      </nav>

      <ProjetoAsana
        projeto={{
          id: project.id, nome: project.name, descricao: project.description ?? '', inicio: project.inicio, fim: project.fim,
          responsavelId: project.responsavel_id ?? project.created_by, concluido,
          situacao: situacaoDoProjeto({ situacao: project.situacao, concluido }),
        }}
        pautas={(pautas ?? []).map((p) => ({ id: p.id, titulo: p.title, status: p.status, inicio: p.data_inicio, fim: p.due_date }))}
        atualizacoes={listaDeAtualizacoes}
        marcos={marcos ?? []}
        pessoas={pessoas}
        hoje={hojeEmSaoPaulo()}
        acoesExtras={canDelete ? <DeleteProjectButton projectId={project.id} projectName={project.name} /> : null}
        visaoGeralExtra={<>

      <h2 className="mb-3 mt-6 text-sm font-semibold uppercase text-muted-foreground">Ferramentas vinculadas a este projeto</h2>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <ToolStat icon={ClipboardList} value={pautas?.length ?? 0} label="Pautas" />
        <ToolStat icon={FileEdit} value={contents?.length ?? 0} label="Matérias" />
        <ToolStat icon={CheckSquare} value={pendingApprovals} label="Aguardando aprovação" />
        <ToolStat icon={CalendarDays} value={events?.length ?? 0} label="Agendamentos" />
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <Section title={`Pautas (${pautas?.length ?? 0})`}>
          {pautas?.map((pauta) => (
            <Link key={pauta.id} href={`/pautas/${pauta.id}`} className="flex min-w-0 items-center justify-between gap-3 px-5 py-4 hover:bg-muted/50">
              <p className="min-w-0 flex-1 truncate font-medium">{pauta.title}</p>
              <StatusBadge status={pautaStatus(pauta.status)} />
            </Link>
          ))}
          {!pautas?.length && <EmptyRow>Nenhuma pauta vinculada a este projeto ainda.</EmptyRow>}
        </Section>

        <Section title={`Matérias (${contents?.length ?? 0})`}>
          {contents?.map((content: any) => (
            <Link key={content.id} href={`/conteudos/${content.id}`} className="flex min-w-0 items-center justify-between gap-3 px-5 py-4 hover:bg-muted/50">
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium">{content.title || 'Sem título'}</p>
                <p className="truncate text-xs text-muted-foreground">{pautaTitleById.get(content.pauta_id) || 'Sem pauta'}</p>
              </div>
              <ContentStatusBadge status={contentStatus(content.status)} />
            </Link>
          ))}
          {!contents?.length && <EmptyRow>Nenhuma matéria criada neste projeto ainda.</EmptyRow>}
        </Section>

        <Section title={`Agendamentos (${events?.length ?? 0})`}>
          {events?.map((event: any) => (
            <Link key={event.id} href="/calendario" className="flex min-w-0 items-center justify-between gap-3 px-5 py-4 hover:bg-muted/50">
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium">{event.title}</p>
                <p className="truncate text-xs text-muted-foreground">{pautaTitleById.get(event.pauta_id) || 'Sem pauta'}</p>
              </div>
              <span className="shrink-0 text-sm text-muted-foreground">{event.event_date ? formatDate(`${event.event_date}T12:00:00`) : 'sem data'}</span>
            </Link>
          ))}
          {!events?.length && <EmptyRow>Nenhum agendamento vinculado a este projeto ainda.</EmptyRow>}
        </Section>

        <Section title={`Links e arquivos (${links?.length ?? 0})`}>
          {links?.map((link: any) => (
            <a key={link.id} href={link.url} target="_blank" rel="noreferrer" className="flex items-center gap-3 px-5 py-4 hover:bg-muted/50">
              <Link2 className="size-4 shrink-0 text-muted-foreground" />
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium">{link.title}</p>
                <p className="truncate text-xs text-muted-foreground">{pautaTitleById.get(link.pauta_id) || 'Sem pauta'}</p>
              </div>
            </a>
          ))}
          {!links?.length && <EmptyRow>Nenhum link de arquivo anexado nas pautas deste projeto.</EmptyRow>}
        </Section>
      </div>
        </>}
      />
    </div>
  )
}

function ToolStat({ icon: Icon, value, label }: { icon: typeof ClipboardList; value: number; label: string }) {
  return (
    <Card className="p-4">
      <Icon className="size-4 text-muted-foreground" />
      <p className="mt-2 text-2xl font-bold tabular-nums">{value}</p>
      <p className="text-xs text-muted-foreground">{label}</p>
    </Card>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="min-w-0">
      <h2 className="mb-3 text-sm font-semibold uppercase text-muted-foreground">{title}</h2>
      <Card className="divide-y divide-border">{children}</Card>
    </section>
  )
}

function EmptyRow({ children }: { children: React.ReactNode }) {
  return <p className="p-8 text-center text-sm text-muted-foreground">{children}</p>
}
