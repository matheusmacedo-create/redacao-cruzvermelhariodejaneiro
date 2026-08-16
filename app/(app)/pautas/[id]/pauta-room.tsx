'use client'

import { useState } from 'react'
import Link from 'next/link'
import {
  MessageSquare,
  Info,
  Images,
  FileEdit,
  CheckSquare,
  History,
  UserPlus,
  ChevronDown,
  MoreHorizontal,
  Paperclip,
  Mic,
  AtSign,
  Send,
  CheckCircle2,
  Plus,
  ImageIcon,
  Video,
  Music,
  FileText,
  Check,
  Clock,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Avatar } from '@/components/ui/avatar'
import {
  StatusBadge,
  PriorityBadge,
  ContentStatusBadge,
  FileStatusBadge,
} from '@/components/ui/status-badge'
import {
  conversation,
  contents,
  files,
  getPerson,
  getProject,
  type Pauta,
} from '@/lib/data'
import { cn } from '@/lib/utils'

const tabs = [
  { id: 'conversa', label: 'Conversa', icon: MessageSquare },
  { id: 'informacoes', label: 'Informações', icon: Info },
  { id: 'arquivos', label: 'Arquivos', icon: Images },
  { id: 'conteudos', label: 'Conteúdos', icon: FileEdit },
  { id: 'aprovacoes', label: 'Aprovações', icon: CheckSquare },
  { id: 'historico', label: 'Histórico', icon: History },
] as const

const fileKindIcon = {
  foto: ImageIcon,
  video: Video,
  audio: Music,
  documento: FileText,
}

export function PautaRoom({ pauta }: { pauta: Pauta }) {
  const [tab, setTab] = useState<(typeof tabs)[number]['id']>('conversa')
  const responsible = getPerson(pauta.responsibleId)
  const project = getProject(pauta.projectId)
  const pautaFiles = files.filter((f) => f.project === pauta.project)
  const pautaContents = contents.filter((c) => c.pautaId === pauta.id)

  return (
    <div>
      {/* Header */}
      <div className="mb-5">
        <nav className="mb-2 flex items-center gap-1 text-xs text-muted-foreground">
          <Link href="/pautas" className="hover:text-foreground">
            Pautas
          </Link>
          <span>/</span>
          <span className="text-foreground">{pauta.title}</span>
        </nav>

        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-balance">{pauta.title}</h1>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <StatusBadge status={pauta.status} />
              <span className="flex items-center gap-1.5 rounded-md bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
                {project?.emoji} {pauta.project}
              </span>
              <PriorityBadge priority={pauta.priority} />
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="lg">
              Alterar status
              <ChevronDown className="size-4" />
            </Button>
            <Button variant="outline" size="lg">
              <UserPlus className="size-4" />
              Adicionar pessoas
            </Button>
            <Button variant="ghost" size="icon-lg" aria-label="Mais opções">
              <MoreHorizontal className="size-4" />
            </Button>
          </div>
        </div>

        <dl className="mt-4 grid grid-cols-2 gap-x-6 gap-y-3 rounded-xl border border-border bg-muted/30 p-4 sm:grid-cols-4 lg:grid-cols-6">
          <Meta label="Projeto" value={pauta.project} />
          <Meta label="Coordenação" value={pauta.coordenacao} />
          <Meta label="Prazo" value={pauta.deadline} />
          <Meta label="Prioridade" value={pauta.priority} capitalize />
          <div>
            <dt className="text-xs text-muted-foreground">Responsável</dt>
            <dd className="mt-1 flex items-center gap-1.5">
              <Avatar initials={responsible?.initials ?? '?'} color={responsible?.color} size="xs" />
              <span className="text-sm font-medium">{responsible?.name.split(' ')[0]}</span>
            </dd>
          </div>
          <Meta label="Arquivos" value={String(pauta.files)} />
        </dl>
      </div>

      {/* Tabs */}
      <div className="mb-5 flex gap-1 overflow-x-auto border-b border-border">
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            className={cn(
              'flex items-center gap-1.5 whitespace-nowrap border-b-2 px-3 py-2.5 text-sm font-medium transition-colors',
              tab === t.id
                ? 'border-primary text-foreground'
                : 'border-transparent text-muted-foreground hover:text-foreground',
            )}
          >
            <t.icon className="size-4" />
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'conversa' && <ConversaTab />}
      {tab === 'informacoes' && <InformacoesTab pauta={pauta} />}
      {tab === 'arquivos' && <ArquivosTab items={pautaFiles} />}
      {tab === 'conteudos' && <ConteudosTab items={pautaContents} />}
      {tab === 'aprovacoes' && <AprovacoesTab />}
      {tab === 'historico' && <HistoricoTab />}
    </div>
  )
}

function Meta({
  label,
  value,
  capitalize,
}: {
  label: string
  value: string
  capitalize?: boolean
}) {
  return (
    <div>
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className={cn('mt-1 text-sm font-medium', capitalize && 'capitalize')}>{value}</dd>
    </div>
  )
}

/* ---------------- Conversa ---------------- */
function ConversaTab() {
  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_280px]">
      <Card className="flex h-[560px] flex-col">
        <div className="flex-1 space-y-5 overflow-y-auto p-5">
          {conversation.map((m) => {
            const person = getPerson(m.authorId)
            const isComm = m.role === 'Comunicação'
            return (
              <div key={m.id} className="flex gap-3">
                <Avatar initials={person?.initials ?? '?'} color={person?.color} size="sm" />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold">{person?.name}</span>
                    <span
                      className={cn(
                        'rounded px-1.5 py-0.5 text-[10px] font-medium',
                        isComm ? 'bg-primary/10 text-primary' : 'bg-muted text-muted-foreground',
                      )}
                    >
                      {m.role}
                    </span>
                    <span className="text-xs text-muted-foreground">{m.time}</span>
                    {m.question && (
                      <span
                        className={cn(
                          'ml-auto flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[10px] font-medium',
                          m.resolved
                            ? 'bg-success/14 text-success'
                            : 'bg-warning/20 text-warning-foreground',
                        )}
                      >
                        {m.resolved ? <CheckCircle2 className="size-3" /> : <Clock className="size-3" />}
                        {m.resolved ? 'Resolvida' : 'Pergunta'}
                      </span>
                    )}
                  </div>
                  <div className="mt-1 rounded-lg rounded-tl-sm bg-muted/60 px-3 py-2 text-sm leading-relaxed">
                    {m.text}
                  </div>
                  {m.attachments ? (
                    <div className="mt-2 flex flex-wrap gap-2">
                      {Array.from({ length: Math.min(m.attachments, 4) }).map((_, i) => (
                        <div
                          key={i}
                          className="size-16 rounded-md border border-border"
                          style={{ backgroundColor: `oklch(0.85 0.05 ${27 + i * 30})` }}
                        />
                      ))}
                      {m.attachments > 4 && (
                        <div className="flex size-16 items-center justify-center rounded-md bg-muted text-xs font-medium text-muted-foreground">
                          +{m.attachments - 4}
                        </div>
                      )}
                    </div>
                  ) : null}
                </div>
              </div>
            )
          })}
        </div>

        <div className="border-t border-border p-3">
          <div className="rounded-lg border border-border focus-within:border-ring focus-within:ring-2 focus-within:ring-ring/30">
            <textarea
              rows={2}
              placeholder="Escreva uma mensagem…"
              className="w-full resize-none rounded-lg bg-transparent px-3 py-2 text-sm outline-none"
            />
            <div className="flex items-center justify-between px-2 pb-2">
              <div className="flex items-center gap-0.5 text-muted-foreground">
                <button className="inline-flex size-8 items-center justify-center rounded-md hover:bg-muted" aria-label="Anexar">
                  <Paperclip className="size-4" />
                </button>
                <button className="inline-flex size-8 items-center justify-center rounded-md hover:bg-muted" aria-label="Áudio">
                  <Mic className="size-4" />
                </button>
                <button className="inline-flex size-8 items-center justify-center rounded-md hover:bg-muted" aria-label="Mencionar">
                  <AtSign className="size-4" />
                </button>
              </div>
              <Button size="sm">
                <Send className="size-3.5" />
                Enviar
              </Button>
            </div>
          </div>
        </div>
      </Card>

      <div className="space-y-4">
        <Card className="p-4">
          <h3 className="mb-3 text-sm font-semibold">Participantes</h3>
          <ul className="space-y-2.5">
            {['matheus', 'carlos', 'ana'].map((id) => {
              const p = getPerson(id)
              return (
                <li key={id} className="flex items-center gap-2">
                  <Avatar initials={p?.initials ?? '?'} color={p?.color} size="xs" />
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{p?.name}</p>
                    <p className="truncate text-xs text-muted-foreground">{p?.coordenacao}</p>
                  </div>
                </li>
              )
            })}
          </ul>
          <Button variant="ghost" size="sm" className="mt-2 w-full">
            <UserPlus className="size-3.5" />
            Adicionar
          </Button>
        </Card>
        <Card className="p-4">
          <h3 className="mb-2 text-sm font-semibold">Perguntas em aberto</h3>
          <p className="rounded-lg bg-warning/15 px-3 py-2 text-sm text-warning-foreground">
            História marcante para a matéria — aguardando Carlos.
          </p>
        </Card>
      </div>
    </div>
  )
}

/* ---------------- Informações ---------------- */
function InfoBlock({
  title,
  rows,
}: {
  title: string
  rows: { label: string; value: string }[]
}) {
  return (
    <Card className="p-5">
      <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
        {title}
      </h3>
      <dl className="grid gap-x-6 gap-y-3 sm:grid-cols-2">
        {rows.map((r) => (
          <div key={r.label}>
            <dt className="text-xs text-muted-foreground">{r.label}</dt>
            <dd className="mt-0.5 text-sm font-medium">{r.value}</dd>
          </div>
        ))}
      </dl>
    </Card>
  )
}

function InformacoesTab({ pauta }: { pauta: Pauta }) {
  const responsible = getPerson(pauta.responsibleId)
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <InfoBlock
        title="Sobre a pauta"
        rows={[
          { label: 'Tipo', value: pauta.type },
          { label: 'Projeto', value: pauta.project },
          { label: 'Coordenação', value: pauta.coordenacao },
          { label: 'Responsável', value: responsible?.name ?? '—' },
          { label: 'Prioridade', value: pauta.priority },
          { label: 'Status', value: pauta.status },
        ]}
      />
      <InfoBlock
        title="Ação"
        rows={[
          { label: 'Data', value: '14 AGO 2025' },
          { label: 'Local', value: 'Centro, Rio de Janeiro' },
          { label: 'Pessoas alcançadas', value: '180' },
          { label: 'Voluntários envolvidos', value: '14' },
          { label: 'Instituições parceiras', value: 'Prefeitura, SUS' },
        ]}
      />
      <Card className="p-5 lg:col-span-2">
        <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          Contexto
        </h3>
        <div className="grid gap-4 sm:grid-cols-2">
          <ContextItem label="Objetivo" value="Levar orientação e atendimento em saúde à população em situação de vulnerabilidade no Centro do Rio." />
          <ContextItem label="Resultado" value="180 pessoas atendidas, com aferição de pressão, orientação e distribuição de kits de higiene." />
          <ContextItem label="Descrição" value={pauta.summary} />
          <ContextItem label="Histórias relevantes" value="Um voluntário reencontrou uma pessoa que havia atendido em uma ação anterior." />
        </div>
      </Card>
      <Card className="p-5 lg:col-span-2">
        <h3 className="mb-2 flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          Observações internas
          <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] normal-case text-muted-foreground">
            Privado — Comunicação
          </span>
        </h3>
        <textarea
          rows={3}
          defaultValue="Confirmar número final de atendidos com o Carlos antes de publicar. Verificar autorização de uso das fotos com crianças."
          className="w-full rounded-lg border border-border bg-muted/30 px-3 py-2 text-sm outline-none focus:border-ring focus:ring-2 focus:ring-ring/30"
        />
      </Card>
    </div>
  )
}

function ContextItem({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-0.5 text-sm leading-relaxed">{value}</p>
    </div>
  )
}

/* ---------------- Arquivos ---------------- */
function ArquivosTab({ items }: { items: typeof files }) {
  const cats = ['Todos', 'Fotos', 'Vídeos', 'Áudios', 'Documentos']
  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-1.5">
          {cats.map((c, i) => (
            <button
              key={c}
              className={cn(
                'rounded-lg px-3 py-1.5 text-sm font-medium transition-colors',
                i === 0
                  ? 'bg-foreground text-background'
                  : 'bg-muted text-muted-foreground hover:text-foreground',
              )}
            >
              {c}
            </button>
          ))}
        </div>
        <Button variant="outline" size="sm">
          <Plus className="size-3.5" />
          Adicionar arquivos
        </Button>
      </div>
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
        {items.map((f) => {
          const Icon = fileKindIcon[f.kind]
          const person = getPerson(f.authorId)
          return (
            <Link key={f.id} href={`/biblioteca/${f.id}`}>
              <Card className="overflow-hidden transition-shadow hover:shadow-md">
                <div
                  className="flex aspect-[4/3] items-center justify-center"
                  style={{ backgroundColor: f.bg }}
                >
                  <Icon className="size-8 text-white/70" />
                </div>
                <div className="p-3">
                  <p className="truncate text-sm font-medium">{f.name}</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {person?.name.split(' ')[0]} · {f.size}
                  </p>
                  <div className="mt-2">
                    <FileStatusBadge status={f.status} />
                  </div>
                </div>
              </Card>
            </Link>
          )
        })}
      </div>
    </div>
  )
}

/* ---------------- Conteúdos ---------------- */
function ConteudosTab({ items }: { items: typeof contents }) {
  const suggestions = ['Matéria para o site', 'Instagram', 'LinkedIn', 'Reel', 'Release para imprensa']
  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <h3 className="text-sm font-medium text-muted-foreground">
          Conteúdos que nascem desta pauta
        </h3>
        <Button size="sm">
          <Plus className="size-3.5" />
          Criar conteúdo
        </Button>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        {suggestions.map((s) => {
          const existing = items.find((c) => c.type.includes(s.split(' ')[0]))
          return (
            <Card key={s} className="flex items-center justify-between p-4">
              <div>
                <p className="text-sm font-medium">{s}</p>
                {existing ? (
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {existing.version} · {existing.lastEdit}
                  </p>
                ) : (
                  <p className="mt-0.5 text-xs text-muted-foreground">Não iniciado</p>
                )}
              </div>
              {existing ? (
                <div className="flex items-center gap-2">
                  <ContentStatusBadge status={existing.status} />
                  <Button variant="outline" size="sm" render={<Link href={`/conteudos/${existing.id}`} />}>
                    Abrir
                  </Button>
                </div>
              ) : (
                <Button variant="ghost" size="sm">
                  <Plus className="size-3.5" />
                  Iniciar
                </Button>
              )}
            </Card>
          )
        })}
      </div>
    </div>
  )
}

/* ---------------- Aprovações ---------------- */
function AprovacoesTab() {
  const steps = [
    { label: 'Comunicação', person: 'matheus', status: 'aprovado' as const, time: 'Hoje, 09:12' },
    { label: 'Coordenação Humanitário', person: 'carlos', status: 'aprovado' as const, time: 'Hoje, 10:04' },
    { label: 'Diretoria', person: 'diretoria', status: 'pendente' as const, time: 'Aguardando' },
  ]
  return (
    <Card className="p-6">
      <h3 className="mb-5 text-sm font-semibold">Fluxo de aprovação</h3>
      <ol className="relative ml-3 space-y-6 border-l border-border">
        {steps.map((s) => {
          const p = getPerson(s.person)
          const done = s.status === 'aprovado'
          return (
            <li key={s.label} className="relative pl-6">
              <span
                className={cn(
                  'absolute -left-[9px] top-0.5 flex size-4 items-center justify-center rounded-full',
                  done ? 'bg-success text-white' : 'bg-warning text-white',
                )}
              >
                {done ? <Check className="size-2.5" /> : <Clock className="size-2.5" />}
              </span>
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium">{s.label}</p>
                  <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <Avatar initials={p?.initials ?? '?'} color={p?.color} size="xs" />
                    {p?.name}
                  </p>
                </div>
                <div className="text-right">
                  <span
                    className={cn(
                      'text-xs font-medium',
                      done ? 'text-success' : 'text-warning-foreground',
                    )}
                  >
                    {done ? 'Aprovado' : 'Pendente'}
                  </span>
                  <p className="text-xs text-muted-foreground">{s.time}</p>
                </div>
              </div>
            </li>
          )
        })}
      </ol>
    </Card>
  )
}

/* ---------------- Histórico ---------------- */
function HistoricoTab() {
  const events = [
    { who: 'matheus', text: 'criou a pauta', time: '14 AGO, 08:00' },
    { who: 'carlos', text: 'enviou 12 fotos e 2 vídeos', time: '14 AGO, 14:20' },
    { who: 'matheus', text: 'alterou o status para “Em coleta”', time: '14 AGO, 14:35' },
    { who: 'ana', text: 'iniciou a matéria para o site', time: '15 AGO, 09:10' },
    { who: 'diretoria', text: 'foi adicionada como aprovadora', time: '15 AGO, 11:00' },
  ]
  return (
    <Card className="p-6">
      <ol className="space-y-4">
        {events.map((e, i) => {
          const p = getPerson(e.who)
          return (
            <li key={i} className="flex gap-3">
              <Avatar initials={p?.initials ?? '?'} color={p?.color} size="xs" />
              <div>
                <p className="text-sm">
                  <span className="font-medium">{p?.name.split(' ')[0]}</span>{' '}
                  <span className="text-muted-foreground">{e.text}</span>
                </p>
                <p className="text-xs text-muted-foreground">{e.time}</p>
              </div>
            </li>
          )
        })}
      </ol>
    </Card>
  )
}
