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
  Send,
  CheckCircle2,
  Plus,
  ImageIcon,
  Video,
  Music,
  FileText,
  Check,
  Clock,
  X,
  Archive,
  Copy,
  Pencil,
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
import { type Pauta } from '@/lib/data'
import { cn } from '@/lib/utils'
import { addDriveLink, addPautaParticipant, createPautaApproval, createPautaContent, removeDriveLink, sendPautaMessage, updatePautaStatus } from '@/app/actions/editorial'

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

type PautaPerson = {
  id: string
  name: string
  initials: string
  color: string
  coordination: string
}

type PautaMessage = {
  id: string
  text: string
  time: string
  author: Omit<PautaPerson, 'id'>
}

type DriveLink = { id: string; name: string; fileType: string; url: string; createdAt: string }
type ContentItem = { id: string; title: string; format: string; status: string; version: number; updatedAt: string }
type HistoryItem = { id: string; action: string; time: string; actor: string; initials: string; color: string }

export function PautaRoom({ pauta, details = {}, participants, availablePeople, messages, responsible, driveLinks = [], contentItems = [], history = [] }: {
  pauta: Pauta
  details?: Record<string, string>
  participants?: PautaPerson[]
  availablePeople?: PautaPerson[]
  messages?: PautaMessage[]
  responsible?: PautaPerson
  driveLinks?: DriveLink[]
  contentItems?: ContentItem[]
  history?: HistoryItem[]
}) {
  const [tab, setTab] = useState<(typeof tabs)[number]['id']>('conversa')
  const [participantsOpen, setParticipantsOpen] = useState(false)
  const [optionsOpen, setOptionsOpen] = useState(false)
  const [linkCopied, setLinkCopied] = useState(false)


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
                {pauta.project}
              </span>
              <PriorityBadge priority={pauta.priority} />
            </div>
          </div>
          <div className="flex items-center gap-2">
            <form action={updatePautaStatus}>
              <input type="hidden" name="id" value={pauta.id} />
              <input type="hidden" name="title" value={pauta.title} />
              <input type="hidden" name="description" value={pauta.summary} />
              <input type="hidden" name="priority" value={pauta.priority} />
              <input type="hidden" name="coordination" value={pauta.coordenacao} />
              <input type="hidden" name="project" value={pauta.project} />
              <label className="relative block">
                <span className="sr-only">Alterar status</span>
                <select
                  name="status"
                  defaultValue=""
                  onChange={(event) => event.currentTarget.form?.requestSubmit()}
                  className="h-10 appearance-none rounded-lg border border-border bg-background py-2 pl-3 pr-9 text-sm font-medium outline-none hover:bg-muted focus:border-ring focus:ring-2 focus:ring-ring/30"
                  aria-label="Alterar status"
                >
                  <option value="" disabled>Alterar status</option>
                  <option value="incoming">Entrada</option>
                  <option value="collection">Coleta</option>
                  <option value="production">Produção</option>
                  <option value="review">Revisão</option>
                  <option value="approved">Pronto</option>
                  <option value="archived">Arquivado</option>
                </select>
                <ChevronDown className="pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2" />
              </label>
            </form>
            <Button variant="outline" size="lg" type="button" onClick={() => setParticipantsOpen(true)}>
              <UserPlus className="size-4" />
              Adicionar pessoas
            </Button>
            <div className="relative">
              <Button
                variant="ghost"
                size="icon-lg"
                type="button"
                aria-label="Mais opções"
                aria-haspopup="menu"
                aria-expanded={optionsOpen}
                onClick={() => setOptionsOpen((open) => !open)}
              >
                <MoreHorizontal className="size-4" />
              </Button>
              {optionsOpen && (
                <div className="absolute right-0 top-11 z-40 w-52 rounded-lg border border-border bg-background p-1 shadow-lg" role="menu">
                  <button
                    type="button"
                    role="menuitem"
                    className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-sm hover:bg-muted"
                    onClick={() => {
                      setTab('informacoes')
                      setOptionsOpen(false)
                    }}
                  >
                    <Pencil className="size-4 text-muted-foreground" />
                    Ver informações
                  </button>
                  <button
                    type="button"
                    role="menuitem"
                    className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-sm hover:bg-muted"
                    onClick={async () => {
                      await navigator.clipboard.writeText(window.location.href)
                      setLinkCopied(true)
                      setOptionsOpen(false)
                      window.setTimeout(() => setLinkCopied(false), 2000)
                    }}
                  >
                    <Copy className="size-4 text-muted-foreground" />
                    {linkCopied ? 'Link copiado' : 'Copiar link'}
                  </button>
                  <form action={updatePautaStatus}>
                    <input type="hidden" name="id" value={pauta.id} />
                    <input type="hidden" name="title" value={pauta.title} />
                    <input type="hidden" name="description" value={pauta.summary} />
                    <input type="hidden" name="priority" value={pauta.priority} />
                    <input type="hidden" name="coordination" value={pauta.coordenacao} />
                    <input type="hidden" name="project" value={pauta.project} />
                    <input type="hidden" name="status" value="archived" />
                    <button type="submit" role="menuitem" className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-sm text-destructive hover:bg-destructive/10">
                      <Archive className="size-4" />
                      Arquivar pauta
                    </button>
                  </form>
                </div>
              )}
            </div>
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

      {tab === 'conversa' && (
        <ConversaTab
          pautaId={pauta.id}
          messages={messages}
          participants={participants}
          onAddParticipant={() => setParticipantsOpen(true)}
        />
      )}
      {tab === 'informacoes' && <InformacoesTab pauta={pauta} details={details} />}
      {tab === 'arquivos' && <ArquivosTab pautaId={pauta.id} items={driveLinks} />}
      {tab === 'conteudos' && <ConteudosTab pautaId={pauta.id} items={contentItems} />}
      {tab === 'aprovacoes' && <AprovacoesTab pautaId={pauta.id} items={contentItems} />}
      {tab === 'historico' && <HistoricoTab items={history} />}

      {participantsOpen && (
        <ParticipantDialog
          pautaId={pauta.id}
          people={availablePeople ?? []}
          participantIds={new Set((participants ?? []).map((person) => person.id))}
          onClose={() => setParticipantsOpen(false)}
        />
      )}
    </div>
  )
}

function ParticipantDialog({
  pautaId,
  people,
  participantIds,
  onClose,
}: {
  pautaId: string
  people: PautaPerson[]
  participantIds: Set<string>
  onClose: () => void
}) {
  const available = people.filter((person) => !participantIds.has(person.id))

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-foreground/40 p-4" role="dialog" aria-modal="true" aria-labelledby="participants-title">
      <Card className="w-full max-w-md p-5 shadow-xl">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h2 id="participants-title" className="text-lg font-semibold">Adicionar participantes</h2>
            <p className="mt-1 text-sm text-muted-foreground">Selecione uma pessoa do espaço editorial.</p>
          </div>
          <Button type="button" variant="ghost" size="icon-sm" onClick={onClose} aria-label="Fechar">
            <X className="size-4" />
          </Button>
        </div>
        <div className="mt-4 max-h-80 overflow-y-auto">
          {available.length ? (
            <ul className="flex flex-col gap-2">
              {available.map((person) => (
                <li key={person.id}>
                  <form action={addPautaParticipant}>
                    <input type="hidden" name="pautaId" value={pautaId} />
                    <input type="hidden" name="userId" value={person.id} />
                    <button type="submit" className="flex w-full items-center gap-3 rounded-lg border border-border p-3 text-left transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                      <Avatar initials={person.initials} color={person.color} size="sm" />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium">{person.name}</span>
                        <span className="block truncate text-xs text-muted-foreground">{person.coordination}</span>
                      </span>
                      <Plus className="size-4 text-muted-foreground" />
                    </button>
                  </form>
                </li>
              ))}
            </ul>
          ) : (
            <p className="rounded-lg bg-muted p-4 text-center text-sm text-muted-foreground">
              Todas as pessoas deste espaço já participam da pauta.
            </p>
          )}
        </div>
      </Card>
      <button type="button" className="fixed inset-0 -z-10 cursor-default" onClick={onClose} aria-label="Fechar janela" />
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
function ConversaTab({
  pautaId,
  messages,
  participants,
  onAddParticipant,
}: {
  pautaId: string
  messages?: PautaMessage[]
  participants?: PautaPerson[]
  onAddParticipant: () => void
}) {
  const visibleMessages: PautaMessage[] = messages ?? []
  const visibleParticipants = participants ?? []

  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_280px]">
      <Card className="flex h-[560px] flex-col">
        <div className="flex-1 space-y-5 overflow-y-auto p-5">
          {visibleMessages.length ? visibleMessages.map((message) => (
            <div key={message.id} className="flex gap-3">
              <Avatar initials={message.author.initials} color={message.author.color} size="sm" />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-semibold">{message.author.name}</span>
                  <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
                    {message.author.coordination}
                  </span>
                  <span className="text-xs text-muted-foreground">{message.time}</span>
                </div>
                <div className="mt-1 rounded-lg rounded-tl-sm bg-muted/60 px-3 py-2 text-sm leading-relaxed">
                  {message.text}
                </div>
              </div>
            </div>
          )) : (
            <p className="flex h-full items-center justify-center text-center text-sm text-muted-foreground">
              Nenhuma mensagem ainda. Inicie a conversa desta pauta.
            </p>
          )}
        </div>

        <form action={sendPautaMessage} className="border-t border-border p-3">
          <input type="hidden" name="pautaId" value={pautaId} />
          <div className="rounded-lg border border-border focus-within:border-ring focus-within:ring-2 focus-within:ring-ring/30">
            <textarea
              name="body"
              rows={2}
              required
              maxLength={5000}
              placeholder="Escreva uma mensagem…"
              className="w-full resize-none rounded-lg bg-transparent px-3 py-2 text-sm outline-none"
            />
            <div className="flex items-center justify-end px-2 pb-2">
              <Button size="sm" type="submit">
                <Send className="size-3.5" />
                Enviar
              </Button>
            </div>
          </div>
        </form>
      </Card>

      <div className="space-y-4">
        <Card className="p-4">
          <h3 className="mb-3 text-sm font-semibold">Participantes</h3>
          <ul className="space-y-2.5" aria-live="polite">
            {visibleParticipants.map((person) => (
              <li key={person.id} className="flex items-center gap-2">
                <Avatar initials={person.initials} color={person.color} size="xs" />
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{person.name}</p>
                  <p className="truncate text-xs text-muted-foreground">{person.coordination}</p>
                </div>
              </li>
            ))}
          </ul>
          <Button variant="ghost" size="sm" className="mt-2 w-full" type="button" onClick={onAddParticipant}>
            <UserPlus className="size-3.5" />
            Adicionar
          </Button>
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

function InformacoesTab({ pauta, details }: { pauta: Pauta; details: Record<string, string> }) {
  const labels: Record<string, string> = { local:'Local', participantsCount:'Pessoas participantes', volunteersCount:'Voluntários', story:'História relevante', contact:'Contato para entrevista', objective:'Objetivo', result:'Resultado', audience:'Público', schedule:'Horário', organizer:'Organização', ideaGoal:'Objetivo da ideia', materialType:'Tipo de material', request:'Solicitação', notes:'Observações' }
  const detailRows = Object.entries(details).filter(([, value]) => value).map(([key, value]) => ({ label: labels[key] || key, value }))
  return <div className="grid gap-4 lg:grid-cols-2"><InfoBlock title="Sobre a pauta" rows={[{ label: 'Tipo', value: pauta.type }, { label: 'Coordenação', value: pauta.coordenacao || 'Não informada' }, { label: 'Prazo', value: pauta.deadline }, { label: 'Prioridade', value: pauta.priority }, { label: 'Status', value: pauta.status }]} /><Card className="p-5"><h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted-foreground">Descrição</h3><p className="text-sm leading-relaxed text-pretty">{pauta.summary || 'Nenhuma descrição informada.'}</p></Card>{detailRows.length > 0 && <div className="lg:col-span-2"><InfoBlock title="Dados informados no formulário" rows={detailRows} /></div>}</div>
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
function ArquivosTab({ pautaId, items }: { pautaId: string; items: DriveLink[] }) {
  const [open, setOpen] = useState(false)
  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">Links de arquivos armazenados no Google Drive.</p>
        <Button variant="outline" size="sm" type="button" onClick={() => setOpen((value) => !value)}><Plus className="size-3.5" />Adicionar link</Button>
      </div>
      {open && <Card className="p-4"><form action={async (formData) => { await addDriveLink(formData); setOpen(false) }} className="grid gap-3 md:grid-cols-[1fr_1fr_auto]">
        <input type="hidden" name="pautaId" value={pautaId} />
        <label className="text-sm font-medium">Nome<input name="name" placeholder="Ex.: Fotos da atividade" className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2" /></label>
        <label className="text-sm font-medium">Link do Drive<input required name="url" type="url" placeholder="https://drive.google.com/..." className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2" /></label>
        <Button type="submit" className="self-end">Salvar link</Button>
      </form></Card>}
      {items.length === 0 ? <Card className="p-8 text-center text-sm text-muted-foreground">Nenhum link do Drive adicionado.</Card> : <div className="grid gap-3 sm:grid-cols-2">{items.map((item) => <Card key={item.id} className="flex items-center justify-between gap-3 p-4"><div className="min-w-0"><p className="truncate text-sm font-medium">{item.name}</p><a href={item.url} target="_blank" rel="noreferrer" className="text-xs text-primary hover:underline">Abrir no Google Drive</a></div><form action={removeDriveLink}><input type="hidden" name="pautaId" value={pautaId} /><input type="hidden" name="fileId" value={item.id} /><Button type="submit" variant="ghost" size="sm">Remover</Button></form></Card>)}</div>}
    </div>
  )
}

/* ---------------- Conteúdos ---------------- */
function ConteudosTab({ pautaId, items }: { pautaId: string; items: ContentItem[] }) {
  return <div className="flex flex-col gap-4"><Card className="p-4"><form action={createPautaContent} className="grid gap-3 md:grid-cols-[1fr_180px_auto]"><input type="hidden" name="pautaId" value={pautaId} /><label className="text-sm font-medium">Título<input required minLength={3} name="title" className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2" placeholder="Nome do conteúdo" /></label><label className="text-sm font-medium">Formato<select name="format" className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2"><option>Matéria</option><option>Post</option><option>Vídeo</option><option>Link</option></select></label><Button type="submit" className="self-end"><Plus className="size-4" />Criar conteúdo</Button></form></Card>{items.length ? <div className="grid gap-3 sm:grid-cols-2">{items.map((item) => <Card key={item.id} className="flex items-center justify-between gap-3 p-4"><div className="min-w-0"><p className="truncate text-sm font-medium">{item.title}</p><p className="text-xs text-muted-foreground">{item.format} · v{item.version}</p></div><Button variant="outline" size="sm" render={<Link href={`/conteudos/${item.id}`} />}>Abrir</Button></Card>)}</div> : <Card className="p-8 text-center text-sm text-muted-foreground">Nenhum conteúdo vinculado a esta pauta.</Card>}</div>
}

/* ---------------- Aprovações ---------------- */
function AprovacoesTab({ pautaId, items }: { pautaId: string; items: ContentItem[] }) {
  const submitted = items.filter((item) => ['review', 'approval', 'approved'].includes(item.status))
  return <div className="flex flex-col gap-4"><Card className="p-4"><form action={createPautaApproval} className="flex flex-col gap-3"><input type="hidden" name="pautaId" value={pautaId} /><label className="text-sm font-medium">Conteúdo existente<select name="contentId" className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2"><option value="">Criar caso rápido</option>{items.map((item) => <option key={item.id} value={item.id}>{item.title}</option>)}</select></label><div className="grid gap-3 sm:grid-cols-2"><label className="text-sm font-medium">Título do caso<input name="title" className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2" placeholder="Obrigatório no caso rápido" /></label><label className="text-sm font-medium">Texto ou link<input name="body" className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2" /></label></div><Button type="submit" className="self-end"><CheckSquare className="size-4" />Abrir aprovação</Button></form></Card>{submitted.length ? <div className="grid gap-3">{submitted.map((item) => <Card key={item.id} className="flex items-center justify-between gap-3 p-4"><div><p className="text-sm font-medium">{item.title}</p><p className="text-xs text-muted-foreground">Status: {item.status}</p></div><Button variant="outline" size="sm" render={<Link href={`/conteudos/${item.id}`} />}>Ver conteúdo</Button></Card>)}</div> : <Card className="p-8 text-center text-sm text-muted-foreground">Nenhum conteúdo desta pauta foi enviado para aprovação.</Card>}</div>
}

/* ---------------- Histórico ---------------- */
function HistoricoTab({ items }: { items: HistoryItem[] }) {
  const labels: Record<string, string> = { created: 'criou a pauta', status_changed: 'alterou o status', participant_added: 'adicionou um participante', message_sent: 'enviou uma mensagem' }
  if (!items.length) return <Card className="p-8 text-center text-sm text-muted-foreground">Nenhuma atividade registrada.</Card>
  return <Card className="p-6"><ol className="flex flex-col gap-4">{items.map((item) => <li key={item.id} className="flex gap-3"><Avatar initials={item.initials} color={item.color} size="xs" /><div><p className="text-sm"><span className="font-medium">{item.actor}</span>{' '}<span className="text-muted-foreground">{labels[item.action] || item.action}</span></p><p className="text-xs text-muted-foreground">{item.time}</p></div></li>)}</ol></Card>
}
