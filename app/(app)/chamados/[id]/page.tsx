import { notFound } from 'next/navigation'
import { FileText, Lock, MapPin, Paperclip } from 'lucide-react'
import { PageHeader } from '@/components/app/page-header'
import { Card } from '@/components/ui/card'
import { Avatar } from '@/components/ui/avatar'
import { privateAvatarUrl } from '@/lib/avatar-url'
import { cn } from '@/lib/utils'
import { requireWorkspace } from '@/lib/session'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import {
  ENCERRADOS, IMPACTO, PAUSADOS, ROTULO_DA_PRIORIDADE, ROTULO_DO_STATUS, ROTULO_DO_STATUS_PARA_EQUIPE, URGENCIA,
  ehStatus, podeReabrir, proximosStatus, situacaoDoPrazo, slaDaFila, type Prioridade, type Status,
} from '@/lib/chamados/regras'
import { filasQueAtendo, papeisNoChamado } from '@/lib/chamados/servidor'
import { EtiquetaDePrazo, EtiquetaDePrioridade, EtiquetaDeStatus, dataHora } from '@/components/app/chamados/comum'
import { AcoesDeStatus, Avaliacao, CaixaDeMensagem, Triagem } from '@/components/app/chamados/formularios'

export const dynamic = 'force-dynamic'

type Perfil = { id: string; full_name: string; initials: string | null; color: string | null; avatar_path: string | null; job_title: string | null }
type Interacao = { id: string; autor_id: string | null; tipo: 'comentario' | 'nota_interna' | 'evento'; texto: string | null; dados: Record<string, unknown>; criado_em: string }
type Anexo = { id: string; interacao_id: string | null; nome: string; content_type: string; tamanho: number; interno: boolean }

const kb = (n: number) => n > 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(1).replace('.', ',')} MB` : `${Math.max(1, Math.round(n / 1024))} KB`

/** Uma linha legível para cada evento registrado pelo sistema. */
function textoDoEvento(d: Record<string, unknown>, nomes: Map<string, string>, paraEquipe: boolean): string {
  const st = (v: unknown) => (ehStatus(v) ? (paraEquipe ? ROTULO_DO_STATUS_PARA_EQUIPE : ROTULO_DO_STATUS)[v] : String(v))
  switch (d.acao) {
    case 'aberto': return 'abriu o chamado'
    case 'status': return d.automatico ? `status mudou para ${st(d.para).toLowerCase()} automaticamente` : d.reabertura ? 'reabriu o chamado' : `mudou o status para ${st(d.para).toLowerCase()}`
    case 'responsavel': return d.para ? `deixou o chamado com ${nomes.get(String(d.para)) ?? 'outra pessoa'}` : 'tirou o responsável'
    case 'prioridade': return `mudou o impacto para "${IMPACTO[d.impacto as 1 | 2 | 3]?.rotulo.toLowerCase()}" — prioridade ${ROTULO_DA_PRIORIDADE[d.para as Prioridade]?.toLowerCase()}`
    case 'transferido': return `transferiu de ${d.de} para ${d.para} (${d.codigo_anterior} → ${d.codigo_novo})`
    case 'avaliado': return `avaliou o atendimento: ${'★'.repeat(Number(d.nota))}${'☆'.repeat(5 - Number(d.nota))}`
    case 'anexo_recusado': return 'um anexo não pôde ser registrado'
    default: return 'atualizou o chamado'
  }
}

export default async function ChamadoPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ aberto?: string }> }) {
  const context = await requireWorkspace()
  const { id } = await params
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound()
  const supabase = await createClient()
  // Pelo cliente da pessoa: se o RLS não deixa ver, a página não existe para ela.
  const { data: c } = await supabase.from('chamados')
    .select('*, chamado_filas(id, nome, sla, atendimento_24h), chamado_categorias(nome)')
    .eq('id', id).eq('workspace_id', context.workspace.id).maybeSingle()
  if (!c) notFound()

  const admin = createAdminClient()
  const atendo = await filasQueAtendo(admin, context.workspace.id, context.user.id, context.role)
  const papeis = papeisNoChamado(c, context.user.id, atendo)
  const equipe = papeis.includes('equipe')
  const status = c.status as Status
  const fila = (Array.isArray(c.chamado_filas) ? c.chamado_filas[0] : c.chamado_filas) as { id: string; nome: string; sla: unknown; atendimento_24h: boolean }
  const categoria = (Array.isArray(c.chamado_categorias) ? c.chamado_categorias[0] : c.chamado_categorias) as { nome: string } | null

  const [{ data: interacoes }, { data: anexos }] = await Promise.all([
    supabase.from('chamado_interacoes').select('id, autor_id, tipo, texto, dados, criado_em').eq('chamado_id', c.id).order('criado_em'),
    supabase.from('chamado_anexos').select('id, interacao_id, nome, content_type, tamanho, interno').eq('chamado_id', c.id).order('criado_em'),
  ])

  // A equipe que pode assumir: membros da fila + admins. Os filtros de
  // transferência só para quem atende.
  let equipeDaFila: { id: string; nome: string }[] = []
  let filasParaTransferir: { id: string; nome: string; categorias: { id: string; nome: string }[] }[] = []
  if (equipe) {
    const [{ data: membros }, { data: admins }, { data: filas }, { data: cats }] = await Promise.all([
      admin.from('chamado_fila_membros').select('user_id').eq('fila_id', fila.id),
      admin.from('workspace_members').select('user_id').eq('workspace_id', context.workspace.id).eq('role', 'admin'),
      admin.from('chamado_filas').select('id, nome').eq('workspace_id', context.workspace.id).eq('ativa', true).order('ordem'),
      admin.from('chamado_categorias').select('id, fila_id, nome').eq('workspace_id', context.workspace.id).eq('ativa', true).order('ordem'),
    ])
    const ids = [...new Set([...(membros ?? []), ...(admins ?? [])].map((m) => m.user_id as string))]
    const { data: pessoas } = await admin.from('profiles').select('id, full_name, active').in('id', ids.length ? ids : ['00000000-0000-0000-0000-000000000000'])
    equipeDaFila = (pessoas ?? []).filter((p) => p.active).map((p) => ({ id: p.id, nome: p.full_name })).sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'))
    filasParaTransferir = (filas ?? []).map((f) => ({ id: f.id, nome: f.nome, categorias: (cats ?? []).filter((x) => x.fila_id === f.id).map((x) => ({ id: x.id, nome: x.nome })) }))
  }

  const idsDePessoas = [...new Set([c.solicitante_id, c.responsavel_id, ...(interacoes ?? []).map((i) => i.autor_id)].filter(Boolean) as string[])]
  const { data: perfis } = await admin.from('profiles').select('id, full_name, initials, color, avatar_path, job_title').in('id', idsDePessoas.length ? idsDePessoas : ['00000000-0000-0000-0000-000000000000'])
  const perfil = new Map((perfis ?? []).map((p) => [p.id, p as Perfil]))
  const nomes = new Map((perfis ?? []).map((p) => [p.id, p.full_name as string]))
  const solicitante = c.solicitante_id ? perfil.get(c.solicitante_id) : undefined
  const responsavel = c.responsavel_id ? perfil.get(c.responsavel_id) : undefined

  const anexosPorInteracao = new Map<string, Anexo[]>()
  for (const a of (anexos ?? []) as Anexo[]) anexosPorInteracao.set(a.interacao_id ?? 'abertura', [...(anexosPorInteracao.get(a.interacao_id ?? 'abertura') ?? []), a])

  const vinteQuatro = fila.atendimento_24h
  const pausado = PAUSADOS.includes(status)
  const inicio = new Date(c.criado_em)
  const prazoResposta = situacaoDoPrazo({ inicio, prazo: c.prazo_resposta ? new Date(c.prazo_resposta) : null, concluidoEm: c.respondido_em ? new Date(c.respondido_em) : null, pausado, vinteQuatroHoras: vinteQuatro })
  const prazoSolucao = ENCERRADOS.includes(status) && !c.resolvido_em ? null
    : situacaoDoPrazo({ inicio, prazo: c.prazo_solucao ? new Date(c.prazo_solucao) : null, concluidoEm: c.resolvido_em ? new Date(c.resolvido_em) : null, pausado, vinteQuatroHoras: vinteQuatro })
  const encerrado = ENCERRADOS.includes(status)
  const proximos = proximosStatus(status, papeis)
  const soSolicitante = papeis.length === 1 && papeis[0] === 'solicitante'
  const { aberto } = await searchParams
  const sla = slaDaFila(fila.sla)

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader title={c.titulo} description={`${c.codigo} · ${fila.nome}${categoria ? ` · ${categoria.nome}` : ''}`} breadcrumbs={[{ label: 'Chamados', href: '/chamados' }, { label: c.codigo }]} />
      {aberto && <p role="status" className="mb-4 rounded-lg bg-success/10 px-4 py-3 text-sm text-success">Chamado {c.codigo} aberto. A equipe de {fila.nome} foi avisada, e você recebe as respostas aqui e por e-mail.</p>}

      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        <div className="flex min-w-0 flex-col gap-4">
          {c.solicitante_id === context.user.id && status === 'resolvido' && !c.avaliacao && (
            <Avaliacao chamadoId={c.id} podeReabrir={podeReabrir(c.resolvido_em ? new Date(c.resolvido_em) : null)} />
          )}
          {status === 'resolvido' || status === 'fechado' ? c.solucao && (
            <Card className="border-success/40 p-5"><p className="text-xs font-semibold uppercase tracking-wide text-success">Solução</p><p className="mt-2 whitespace-pre-wrap text-sm">{c.solucao}</p></Card>
          ) : null}

          {/* O relato de abertura */}
          <Card className="p-5">
            <div className="flex items-center gap-3">
              <Avatar initials={solicitante?.initials ?? '?'} color={solicitante?.color ?? undefined} src={privateAvatarUrl(solicitante?.avatar_path)} alt={solicitante?.full_name ?? ''} size="md" />
              <div className="min-w-0"><p className="text-sm font-medium">{solicitante?.full_name ?? 'Conta removida'}</p><p className="text-xs text-muted-foreground">{c.setor_solicitante || 'Sem setor'} · {dataHora(c.criado_em)}</p></div>
            </div>
            <p className="mt-4 whitespace-pre-wrap text-sm leading-relaxed">{c.descricao}</p>
            {c.local && <p className="mt-3 flex items-center gap-1.5 text-sm text-muted-foreground"><MapPin className="size-4" />{c.local}</p>}
            <ListaDeAnexos anexos={anexosPorInteracao.get('abertura') ?? []} />
          </Card>

          {/* A conversa e o histórico */}
          <ol className="flex flex-col gap-3">
            {((interacoes ?? []) as Interacao[]).map((i) => {
              const autor = i.autor_id ? perfil.get(i.autor_id) : undefined
              if (i.tipo === 'evento') {
                if (i.dados.acao === 'aberto') return null
                return (
                  <li key={i.id} className="flex flex-col gap-1 px-2 text-xs text-muted-foreground">
                    <span><strong className="font-medium text-foreground">{autor?.full_name ?? 'Sistema'}</strong> {textoDoEvento(i.dados, nomes, equipe)} · {dataHora(i.criado_em)}</span>
                    {i.texto && <span className="whitespace-pre-wrap rounded-md bg-muted/50 px-3 py-2 text-sm text-foreground">{i.texto}</span>}
                  </li>
                )
              }
              const interna = i.tipo === 'nota_interna'
              const daEquipe = i.autor_id !== c.solicitante_id
              return (
                <li key={i.id}>
                  <Card className={cn('p-4', interna && 'border-warning/50 bg-warning/5', !interna && daEquipe && 'border-primary/20')}>
                    <div className="flex items-center gap-2">
                      <Avatar initials={autor?.initials ?? '?'} color={autor?.color ?? undefined} src={privateAvatarUrl(autor?.avatar_path)} alt={autor?.full_name ?? ''} size="sm" />
                      <p className="text-sm font-medium">{autor?.full_name ?? 'Conta removida'}</p>
                      {interna && <span className="inline-flex items-center gap-1 rounded bg-warning/20 px-1.5 py-0.5 text-[11px] font-medium text-warning-foreground"><Lock className="size-3" />Nota interna</span>}
                      {!interna && daEquipe && <span className="rounded bg-primary/10 px-1.5 py-0.5 text-[11px] font-medium text-primary">Equipe</span>}
                      <span className="ml-auto text-xs text-muted-foreground">{dataHora(i.criado_em)}</span>
                    </div>
                    {i.texto && <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed">{i.texto}</p>}
                    <ListaDeAnexos anexos={anexosPorInteracao.get(i.id) ?? []} />
                  </Card>
                </li>
              )
            })}
          </ol>

          <CaixaDeMensagem workspaceId={context.workspace.id} chamadoId={c.id} equipe={equipe} encerrado={encerrado} />
        </div>

        {/* Lateral: estado, prazos, triagem */}
        <aside className="flex flex-col gap-4">
          <Card data-ajuda="chamados.situacao" className="flex flex-col gap-4 p-5">
            <div className="flex flex-wrap items-center gap-2"><EtiquetaDeStatus status={status} paraEquipe={equipe} /><EtiquetaDePrioridade prioridade={c.prioridade as Prioridade} /></div>
            {!(soSolicitante && status === 'resolvido') && <AcoesDeStatus chamadoId={c.id} status={status} proximos={proximos} equipe={equipe} />}
            <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
              <dt className="text-muted-foreground">Responsável</dt><dd>{responsavel?.full_name ?? <span className="text-muted-foreground">Ainda ninguém</span>}</dd>
              <dt className="text-muted-foreground">Tipo</dt><dd>{c.tipo === 'incidente' ? 'Incidente (algo parou)' : 'Solicitação'}</dd>
              <dt className="text-muted-foreground">Urgência</dt><dd>{URGENCIA[c.urgencia as 1 | 2 | 3].rotulo}</dd>
              <dt className="text-muted-foreground">Impacto</dt><dd>{IMPACTO[c.impacto as 1 | 2 | 3].rotulo}</dd>
              {c.reaberturas > 0 && <><dt className="text-muted-foreground">Reaberto</dt><dd>{c.reaberturas}×</dd></>}
            </dl>
            <div className="flex flex-col gap-1.5 border-t border-border pt-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Prazos {vinteQuatro ? '(24h)' : '(horário de atendimento)'}</p>
              <EtiquetaDePrazo situacao={prazoResposta} prazo={c.prazo_resposta} rotulo="1ª resposta" vinteQuatroHoras={vinteQuatro} />
              <EtiquetaDePrazo situacao={prazoSolucao} prazo={c.prazo_solucao} rotulo="Solução" vinteQuatroHoras={vinteQuatro} />
              <p className="text-xs text-muted-foreground">Prioridade {ROTULO_DA_PRIORIDADE[c.prioridade as Prioridade].toLowerCase()}: responder em até {sla[c.prioridade as Prioridade].resposta}h e resolver em até {sla[c.prioridade as Prioridade].solucao}h{vinteQuatro ? '' : ' úteis'}. {pausado ? 'O relógio está pausado enquanto aguarda.' : ''}</p>
            </div>
          </Card>
          {equipe && (
            <Card data-ajuda="chamados.triagem" className="p-5">
              <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Triagem</p>
              <Triagem chamadoId={c.id} responsavelId={c.responsavel_id} equipe={equipeDaFila} impacto={c.impacto} urgencia={c.urgencia} filas={filasParaTransferir} filaAtual={fila.id} encerrado={encerrado} />
            </Card>
          )}
          {c.avaliacao && (
            <Card className="p-5 text-sm"><p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Avaliação</p><p className="mt-1 text-lg text-warning">{'★'.repeat(c.avaliacao)}<span className="text-muted-foreground/40">{'★'.repeat(5 - c.avaliacao)}</span></p>{c.avaliacao_comentario && <p className="mt-1 text-muted-foreground">“{c.avaliacao_comentario}”</p>}</Card>
          )}
        </aside>
      </div>
    </div>
  )
}

function ListaDeAnexos({ anexos }: { anexos: Anexo[] }) {
  if (!anexos.length) return null
  return (
    <ul className="mt-3 flex flex-wrap gap-2">
      {anexos.map((a) => (
        <li key={a.id}>
          <a href={`/api/chamados/anexos/${a.id}`} target="_blank" rel="noopener" className={cn('inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs hover:bg-muted', a.interno ? 'border-warning/50' : 'border-border')}>
            {a.content_type.startsWith('image/') ? <Paperclip className="size-3.5" /> : <FileText className="size-3.5" />}{a.nome}<span className="text-muted-foreground">{kb(a.tamanho)}</span>
          </a>
        </li>
      ))}
    </ul>
  )
}
