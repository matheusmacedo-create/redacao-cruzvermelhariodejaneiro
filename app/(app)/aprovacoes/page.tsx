import Link from 'next/link'
import { AlarmClock, ArrowRight, Check, Clock, FolderKanban, Inbox, Users, X } from 'lucide-react'
import { Card } from '@/components/ui/card'
import { Avatar } from '@/components/ui/avatar'
import { privateAvatarUrl } from '@/lib/avatar-url'
import { PageHeader } from '@/components/app/page-header'
import { SeloDoSetor } from '@/components/app/aprovacoes/selo-do-setor'
import { requireWorkspace } from '@/lib/session'
import { createClient } from '@/lib/supabase/server'
import { cn } from '@/lib/utils'
import { tituloDaArea } from '@/lib/navegacao'
import { perfilDoSetor, chaveDoSetor } from '@/lib/aprovacoes/setores'
import {
  ABAS, SITUACOES, contagens, ehAba, ehSituacao, esperaMeuVoto, haQuanto, meuVoto, naAba, naSituacao, ordenar, prazoDaRodada, rotuloDoPrazo,
  type Aba, type ItemDaFila, type Situacao,
} from '@/lib/aprovacoes/fila'

export const metadata = { title: tituloDaArea('/aprovacoes') }
export const dynamic = 'force-dynamic'

const statusMeta = {
  pending: { label: 'Em aberto', icon: Clock, className: 'bg-warning/15 text-warning-foreground' },
  approved: { label: 'Aprovada', icon: Check, className: 'bg-success/15 text-success' },
  changes_requested: { label: 'Ajustes pedidos', icon: X, className: 'bg-destructive/10 text-destructive' },
} as const

const decisionMeta = {
  pending: { icon: Clock, className: 'bg-warning/15 text-warning-foreground' },
  approved: { icon: Check, className: 'bg-success/15 text-success' },
  changes_requested: { icon: X, className: 'bg-destructive/10 text-destructive' },
} as const

/** O relógio da página (fora do componente: o render continua puro). */
const agoraEmMs = () => Date.now()

type Filtros = { aba: Aba; situacao: Situacao; setor: string | null }
function endereco(f: Filtros, muda: Partial<Filtros>) {
  const n = { ...f, ...muda }
  const q = new URLSearchParams()
  if (n.aba !== 'minhas') q.set('aba', n.aba)
  if (n.situacao !== 'pending') q.set('situacao', n.situacao)
  if (n.setor) q.set('setor', n.setor)
  const s = q.toString()
  return s ? `/aprovacoes?${s}` : '/aprovacoes'
}

/**
 * Aprovações por setor. Abre no que depende de quem está olhando ("Esperando
 * meu voto"), marca cada rodada com o setor da pauta, o prazo do setor e o
 * atraso. O que cada setor confere está em lib/aprovacoes/setores.ts e
 * aparece na hora de votar (/aprovacoes/[id]).
 */
export default async function AprovacoesPage({ searchParams }: { searchParams: Promise<{ aba?: string; situacao?: string; status?: string; setor?: string }> }) {
  const sp = await searchParams
  const context = await requireWorkspace()
  const supabase = await createClient()
  const eu = context.user.id
  const ws = context.workspace.id

  // Em aberto vêm todas (a fila e os números dependem delas); aprovadas e com
  // ajustes só crescem, então delas vêm as mais recentes. Consultas que não
  // dependem uma da outra saem juntas: 4 idas ao banco.
  const LIMITE = 200
  const [{ data: abertas }, { data: encerradas }, { data: vinculo }] = await Promise.all([
    supabase.from('approvals').select('id,status,created_at,requested_by,content_id').eq('workspace_id', ws).eq('status', 'pending').order('created_at', { ascending: false }),
    supabase.from('approvals').select('id,status,created_at,requested_by,content_id').eq('workspace_id', ws).neq('status', 'pending').order('created_at', { ascending: false }).limit(LIMITE),
    supabase.from('workspace_members').select('coordination').eq('workspace_id', ws).eq('user_id', eu).maybeSingle(),
  ])
  const approvals = [...(abertas ?? []), ...(encerradas ?? [])]
  const cortouEncerradas = (encerradas?.length ?? 0) >= LIMITE
  const meuSetor = (vinculo?.coordination as string | null) ?? null

  const contentIds = [...new Set(approvals.map((a) => a.content_id).filter(Boolean))]
  const approvalIds = approvals.map((a) => a.id)
  const [{ data: contents }, { data: voterRows }] = await Promise.all([
    contentIds.length ? supabase.from('content_pieces').select('id,title,format,pauta_id').in('id', contentIds) : Promise.resolve({ data: [] as any[] }),
    approvalIds.length ? supabase.from('approval_voters').select('approval_id,user_id,decision,decided_at').in('approval_id', approvalIds) : Promise.resolve({ data: [] as any[] }),
  ])
  const contentById = new Map((contents ?? []).map((c) => [c.id, c]))
  const votersByApproval = new Map<string, any[]>()
  for (const v of voterRows ?? []) votersByApproval.set(v.approval_id, [...(votersByApproval.get(v.approval_id) ?? []), v])

  const pautaIds = [...new Set((contents ?? []).map((c) => c.pauta_id).filter(Boolean))]
  const profileIds = new Set<string>()
  for (const a of approvals) if (a.requested_by) profileIds.add(a.requested_by)
  for (const v of voterRows ?? []) profileIds.add(v.user_id)
  const [{ data: pautas }, { data: profiles }] = await Promise.all([
    pautaIds.length ? supabase.from('pautas').select('id,title,project_id,coordination').in('id', pautaIds) : Promise.resolve({ data: [] as any[] }),
    profileIds.size ? supabase.from('profiles').select('id,full_name,initials,color,avatar_path').in('id', [...profileIds]) : Promise.resolve({ data: [] as any[] }),
  ])
  const pautaById = new Map((pautas ?? []).map((p) => [p.id, p]))
  const profileById = new Map((profiles ?? []).map((p) => [p.id, p]))

  const projectIds = [...new Set((pautas ?? []).map((p) => p.project_id).filter(Boolean))]
  const { data: projects } = projectIds.length ? await supabase.from('projects').select('id,name').in('id', projectIds) : { data: [] as any[] }
  const projectById = new Map((projects ?? []).map((p) => [p.id, p]))

  const agora = agoraEmMs()
  const itens: (ItemDaFila & { contentId: string })[] = approvals.map((a) => {
    const content = contentById.get(a.content_id)
    const pauta = content ? pautaById.get(content.pauta_id) : undefined
    return {
      id: a.id, status: a.status, criadaEm: a.created_at, pedidaPor: a.requested_by, contentId: a.content_id,
      setor: (pauta?.coordination as string | null) ?? null,
      votos: (votersByApproval.get(a.id) ?? []).map((v) => ({ userId: v.user_id, decisao: v.decision })),
    }
  })

  // `?status=` era o filtro antigo (links em notificações e favoritos): continua valendo.
  const situacaoPedida = sp.situacao ?? sp.status
  const filtros: Filtros = {
    aba: ehAba(sp.aba) ? sp.aba : sp.status ? 'todas' : 'minhas',
    situacao: ehSituacao(situacaoPedida) ? situacaoPedida : 'pending',
    setor: sp.setor?.trim() || null,
  }
  const numeros = contagens(itens, eu, meuSetor, agora)
  const setoresNaFila = [...new Map(itens.filter((i) => i.setor).map((i) => [chaveDoSetor(i.setor), i.setor as string])).values()]
    .sort((a, b) => perfilDoSetor(a).nome.localeCompare(perfilDoSetor(b).nome, 'pt-BR'))
  const visiveis = ordenar(
    itens.filter((i) => naAba(i, filtros.aba, eu, meuSetor) && naSituacao(i, filtros.situacao) && (!filtros.setor || chaveDoSetor(i.setor) === chaveDoSetor(filtros.setor))),
    agora,
  )

  const indicadores = [
    { rotulo: 'Esperando seu voto', valor: numeros.minhas, icone: Inbox, href: endereco(filtros, { aba: 'minhas', situacao: 'pending', setor: null }), destaque: numeros.minhas > 0 },
    { rotulo: 'Atrasadas', valor: numeros.atrasadas, icone: AlarmClock, href: endereco(filtros, { aba: 'todas', situacao: 'pending', setor: null }), alerta: numeros.atrasadas > 0 },
    { rotulo: meuSetor ? `Em aberto em ${perfilDoSetor(meuSetor).nome}` : 'Do seu setor', valor: numeros.setor, icone: Users, href: endereco(filtros, { aba: 'setor', situacao: 'pending', setor: null }) },
    { rotulo: 'Em aberto no total', valor: numeros.abertas, icone: Clock, href: endereco(filtros, { aba: 'todas', situacao: 'pending', setor: null }) },
  ]

  return (
    <div>
      <PageHeader title="Aprovações" description="O que espera o seu voto primeiro. Cada rodada traz o setor da pauta, o prazo dele e o que o setor confere antes de aprovar." />

      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        {indicadores.map((k) => (
          <Link key={k.rotulo} href={k.href} className={cn('group rounded-xl border bg-card p-4 shadow-xs transition-colors hover:border-foreground/20', k.alerta ? 'border-destructive/40' : k.destaque ? 'border-primary/40' : 'border-border')}>
            <span className="flex items-center justify-between gap-2 text-xs font-medium text-muted-foreground">
              <span className="truncate">{k.rotulo}</span>
              <k.icone className={cn('size-4 shrink-0', k.alerta ? 'text-destructive' : k.destaque ? 'text-primary' : '')} aria-hidden="true" />
            </span>
            <span className={cn('mt-1 block text-2xl font-bold tabular-nums', k.alerta && 'text-destructive')}>{k.valor}</span>
          </Link>
        ))}
      </div>

      {/* Abas: de quem é a fila. */}
      <nav className="-mx-1 flex gap-1 overflow-x-auto border-b border-border px-1" aria-label="Filas de aprovação">
        {ABAS.map((a) => {
          const ativa = filtros.aba === a.id
          const n = a.id === 'minhas' ? numeros.minhas : null
          const rotulo = a.id === 'setor' && meuSetor ? `Do meu setor · ${perfilDoSetor(meuSetor).sigla}` : a.rotulo
          if (a.id === 'setor' && !meuSetor) return null
          return (
            <Link key={a.id} href={endereco(filtros, { aba: a.id })} aria-current={ativa ? 'page' : undefined}
              className={cn('-mb-px flex shrink-0 items-center gap-1.5 border-b-2 px-3 py-2.5 text-sm transition-colors', ativa ? 'border-primary font-medium text-foreground' : 'border-transparent text-muted-foreground hover:border-border hover:text-foreground')}>
              {rotulo}
              {n ? <span className="rounded-full bg-primary px-1.5 text-[11px] font-semibold text-primary-foreground">{n}</span> : null}
            </Link>
          )
        })}
      </nav>

      {/* Filtros: situação e setor da pauta. */}
      <div className="mt-4 flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-1.5" aria-label="Situação">
          {SITUACOES.map((s) => (
            <Link key={s.id} href={endereco(filtros, { situacao: s.id })} aria-current={filtros.situacao === s.id ? 'true' : undefined}
              className={cn('rounded-full border px-3 py-1 text-xs font-medium', filtros.situacao === s.id ? 'border-foreground bg-foreground text-background' : 'border-border text-muted-foreground hover:text-foreground')}>
              {s.rotulo}
            </Link>
          ))}
        </div>
        {setoresNaFila.length > 1 && (
          <div className="flex flex-wrap items-center gap-1.5" aria-label="Setor da pauta">
            <span className="mr-1 text-xs text-muted-foreground">Setor:</span>
            <Link href={endereco(filtros, { setor: null })} className={cn('rounded-full border px-3 py-1 text-xs font-medium', !filtros.setor ? 'border-foreground bg-foreground text-background' : 'border-border text-muted-foreground hover:text-foreground')}>Todos</Link>
            {setoresNaFila.map((s) => {
              const p = perfilDoSetor(s)
              const ativo = chaveDoSetor(filtros.setor) === chaveDoSetor(s)
              return (
                <Link key={s} href={endereco(filtros, { setor: ativo ? null : s })} aria-current={ativo ? 'true' : undefined}
                  className={cn('inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium', ativo ? 'text-white' : 'border-border text-muted-foreground hover:text-foreground')}
                  style={ativo ? { backgroundColor: p.cor, borderColor: p.cor } : undefined}>
                  <span className="size-2 rounded-full" style={{ backgroundColor: ativo ? '#fff' : p.cor }} aria-hidden="true" />{p.nome}
                </Link>
              )
            })}
          </div>
        )}
      </div>

      <div className="mt-5 flex flex-col gap-3">
        {visiveis.map((item) => {
          const content = contentById.get(item.contentId)
          const pauta = content ? pautaById.get(content.pauta_id) : undefined
          const project = pauta?.project_id ? projectById.get(pauta.project_id) : undefined
          const voters = votersByApproval.get(item.id) ?? []
          const approvedCount = voters.filter((v) => v.decision === 'approved').length
          const pendingVoters = voters.filter((v) => v.decision === 'pending')
          const meta = statusMeta[item.status as keyof typeof statusMeta] ?? statusMeta.pending
          const requester = item.pedidaPor ? profileById.get(item.pedidaPor) : undefined
          const prazo = prazoDaRodada(item, agora)
          const rotuloPrazo = rotuloDoPrazo(prazo)
          const minha = esperaMeuVoto(item, eu)
          const meu = meuVoto(item, eu)

          return (
            <Card key={item.id} className={cn('relative overflow-hidden p-5 pl-6', minha && 'ring-1 ring-primary/30')}>
              <span className="absolute inset-y-0 left-0 w-1.5" style={{ backgroundColor: perfilDoSetor(item.setor).cor }} aria-hidden="true" />
              <div className="flex flex-wrap items-center gap-2">
                <SeloDoSetor setor={item.setor} />
                <span className="rounded-md border border-border px-2 py-0.5 text-xs text-muted-foreground">{content?.format || 'Conteúdo editorial'}</span>
                <span className={cn('inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium', meta.className)}><meta.icon className="size-3" />{meta.label}</span>
                {rotuloPrazo && (
                  <span className={cn('inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium', prazo.atrasada ? 'bg-destructive text-destructive-foreground' : 'bg-muted text-muted-foreground')} title={`Prazo do setor: ${prazo.prazoHoras} h`}>
                    <AlarmClock className="size-3" />{rotuloPrazo}
                  </span>
                )}
                <span className="text-xs text-muted-foreground sm:ml-auto">Pedida por {item.pedidaPor === eu ? 'você' : requester?.full_name?.split(' ')[0] || 'alguém'} · {haQuanto(prazo.horas)}</span>
              </div>

              <Link href={`/aprovacoes/${item.id}`} className="mt-2 block">
                <h3 className="text-base font-semibold hover:underline">{content?.title || 'Conteúdo sem título'}</h3>
              </Link>

              <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                <span>Pauta: {pauta?.title ? <Link href={`/pautas/${pauta.id}`} className="hover:text-foreground hover:underline">{pauta.title}</Link> : 'sem pauta vinculada'}</span>
                {project && <span className="inline-flex items-center gap-1"><FolderKanban className="size-3.5" /><Link href={`/projetos/${project.id}`} className="hover:text-foreground hover:underline">{project.name}</Link></span>}
              </div>

              <div className="mt-4 flex flex-col gap-3 border-t border-border pt-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-3">
                    <div className="h-1.5 w-24 shrink-0 overflow-hidden rounded-full bg-muted"><div className="h-full bg-success" style={{ width: `${voters.length ? (approvedCount / voters.length) * 100 : 0}%` }} /></div>
                    <span className="text-xs font-medium text-muted-foreground">{voters.length ? `${approvedCount} de ${voters.length} aprovaram` : 'Ninguém convidado para votar'}</span>
                  </div>
                  <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1.5">
                    {voters.map((voter) => {
                      const profile = profileById.get(voter.user_id)
                      const vMeta = decisionMeta[voter.decision as keyof typeof decisionMeta] ?? decisionMeta.pending
                      return (
                        <span key={voter.user_id} className="flex items-center gap-1.5" title={voter.decision === 'pending' ? 'Ainda não votou' : voter.decision === 'approved' ? 'Aprovou' : 'Pediu ajustes'}>
                          <span className="relative shrink-0">
                            <Avatar initials={profile?.initials || '?'} color={profile?.color} src={privateAvatarUrl(profile?.avatar_path)} size="xs" />
                            <span className={cn('absolute -bottom-0.5 -right-0.5 flex size-3.5 items-center justify-center rounded-full ring-2 ring-card', vMeta.className)}><vMeta.icon className="size-2.5" /></span>
                          </span>
                          <span className={cn('text-xs', voter.user_id === eu ? 'font-semibold' : 'font-medium')}>{voter.user_id === eu ? 'Você' : profile?.full_name?.split(' ')[0] || 'Colaborador'}</span>
                        </span>
                      )
                    })}
                  </div>
                  {item.status === 'pending' && pendingVoters.length > 0 && !minha && (
                    <p className="mt-1.5 text-xs text-muted-foreground">Falta: {pendingVoters.map((v) => profileById.get(v.user_id)?.full_name?.split(' ')[0] || 'alguém').join(', ')}</p>
                  )}
                </div>
                <Link href={`/aprovacoes/${item.id}`} className={cn('inline-flex h-9 shrink-0 items-center justify-center gap-1.5 rounded-lg px-4 text-sm font-medium', minha ? 'bg-primary text-primary-foreground' : 'border border-border hover:bg-muted')}>
                  {minha ? 'Revisar agora' : meu === 'approved' ? 'Você aprovou · ver' : meu === 'changes_requested' ? 'Você pediu ajustes · ver' : 'Ver rodada'}
                  <ArrowRight className="size-4" />
                </Link>
              </div>
            </Card>
          )
        })}
        {cortouEncerradas && filtros.situacao !== 'pending' && <p className="text-center text-xs text-muted-foreground">Das encerradas, mostrando as {LIMITE} mais recentes.</p>}
        {!visiveis.length && (
          <Card className="p-10 text-center">
            <p className="font-medium">{filtros.aba === 'minhas' && filtros.situacao === 'pending' ? 'Nada esperando o seu voto. 🎉' : 'Nenhuma aprovação neste filtro.'}</p>
            <p className="mt-1 text-sm text-muted-foreground">
              {filtros.aba === 'minhas' ? <>Quando alguém convidar você para aprovar, aparece aqui. <Link href={endereco(filtros, { aba: 'todas' })} className="text-primary hover:underline">Ver todas as rodadas</Link>.</> : 'Mude a aba, a situação ou o setor acima.'}
            </p>
          </Card>
        )}
      </div>
    </div>
  )
}
