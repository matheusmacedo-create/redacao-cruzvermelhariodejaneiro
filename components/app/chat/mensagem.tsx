'use client'

import { useEffect, useMemo, useRef, useState, useTransition } from 'react'
import { Download, FileText, History, Loader2, Mic, Pencil, Reply, SmilePlus, Trash2 } from 'lucide-react'
import { Avatar } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import { privateAvatarUrl } from '@/lib/avatar-url'
import { apagarMensagem, editarMensagem, historicoDaMensagem, reagir, type VersaoDaMensagem } from '@/app/actions/chat'
import {
  abreNaTela, agrupar, alternarReacao, duracaoLegivel, REACOES, REACOES_RAPIDAS, rotuloDoDia, tamanhoLegivel, TAMANHO_MAXIMO, trechos,
  type AnexoDoChat, type MensagemDoChat, type PessoaDoChat,
} from '@/lib/chat/regras'

export const campo = 'w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-ring focus:ring-2 focus:ring-ring/30'
export const hora = (iso: string) => new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo' })
export const hojeEmSP = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date())
const diaEmSP = (iso: string) => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date(iso))
/** "hoje às 14:32", "ontem às 9:10", "segunda-feira, 22 de setembro às 8:00". */
export const quando = (iso: string) => `${rotuloDoDia(diaEmSP(iso), hojeEmSP()).toLowerCase()} às ${hora(iso)}`
export const urlDoArquivo = (a: { id: string }, baixar = false) => `/api/chat/arquivos/${a.id}${baixar ? '?baixar=1' : ''}`

export type Contexto = {
  eu: string
  ehAdmin: boolean
  pessoaDe: Map<string, PessoaDoChat>
  nomes: string[]
  /** Conversa aberta para escrever e reagir (não arquivada). */
  podeEscrever: boolean
  onErro: (e: string) => void
  onMudar: (m: MensagemDoChat) => void
  /** Abre o fio desta mensagem (na lista principal; dentro do fio não há). */
  onAbrirFio?: (m: MensagemDoChat) => void
  destaque?: string | null
}

/** A lista: separada por dia, mensagens seguidas da mesma pessoa juntas (como no Slack). */
export function Mensagens({ mensagens, ctx, semDias }: { mensagens: MensagemDoChat[]; ctx: Contexto; semDias?: boolean }) {
  const hoje = hojeEmSP()
  const dias = useMemo(() => agrupar(mensagens), [mensagens])
  return (
    <div className="flex flex-col gap-3">
      {dias.map((d) => (
        <div key={d.dia}>
          {!semDias && (
            <div className="relative my-2 flex items-center justify-center" role="separator">
              <span className="absolute inset-x-0 top-1/2 h-px bg-border" />
              <span className="relative rounded-full border border-border bg-card px-3 py-0.5 text-[11px] font-medium text-muted-foreground">{rotuloDoDia(d.dia, hoje)}</span>
            </div>
          )}
          {d.grupos.map((g) => {
            const p = g.autor_id ? ctx.pessoaDe.get(g.autor_id) : undefined
            return (
              <div key={g.mensagens[0].id} className="flex gap-2.5 py-1">
                <Avatar initials={p?.iniciais ?? '?'} color={p?.cor ?? undefined} src={privateAvatarUrl(p?.avatar)} size="sm" className="mt-0.5" />
                <div className="min-w-0 flex-1">
                  <p className="text-sm"><span className="font-semibold">{p?.nome ?? 'Alguém'}</span> <span className="text-[11px] text-muted-foreground">{hora(g.mensagens[0].created_at)}</span></p>
                  {g.mensagens.map((m) => <UmaMensagem key={m.id} m={m} ctx={ctx} />)}
                </div>
              </div>
            )
          })}
        </div>
      ))}
    </div>
  )
}

/** Uma mensagem com cabeçalho próprio (a principal no topo do fio). */
export function MensagemSozinha({ m, ctx }: { m: MensagemDoChat; ctx: Contexto }) {
  const p = m.autor_id ? ctx.pessoaDe.get(m.autor_id) : undefined
  return (
    <div className="flex gap-2.5 py-1">
      <Avatar initials={p?.iniciais ?? '?'} color={p?.cor ?? undefined} src={privateAvatarUrl(p?.avatar)} size="sm" className="mt-0.5" />
      <div className="min-w-0 flex-1">
        <p className="text-sm"><span className="font-semibold">{p?.nome ?? 'Alguém'}</span> <span className="text-[11px] text-muted-foreground">{quando(m.created_at)}</span></p>
        <UmaMensagem m={m} ctx={ctx} />
      </div>
    </div>
  )
}

export function UmaMensagem({ m, ctx }: { m: MensagemDoChat; ctx: Contexto }) {
  const [editando, setEditando] = useState(false)
  const [texto, setTexto] = useState(m.corpo)
  const [escolhendo, setEscolhendo] = useState(false)
  const [historico, setHistorico] = useState(false)
  const [ocupado, iniciar] = useTransition()
  const minha = m.autor_id === ctx.eu
  const podeApagar = minha || ctx.ehAdmin
  const destacada = ctx.destaque === m.id

  const alternar = (emoji: string) => {
    setEscolhendo(false)
    const antes = m.reacoes ?? []
    ctx.onMudar({ ...m, reacoes: alternarReacao(antes, emoji, ctx.eu) })
    void reagir(m.id, emoji).then((r) => {
      if (r.erro) { ctx.onErro(r.erro); ctx.onMudar({ ...m, reacoes: antes }) } else if (r.reacoes) ctx.onMudar({ ...m, reacoes: r.reacoes })
    })
  }

  if (m.apagada_em) {
    return (
      <div data-mensagem={m.id} className={destacada ? 'rounded bg-warning/15 px-1' : ''}>
        <p className="text-sm italic text-muted-foreground">
          mensagem apagada
          {ctx.ehAdmin && <button type="button" className="ml-2 text-xs not-italic text-primary hover:underline" onClick={() => setHistorico(!historico)}>{historico ? 'esconder o original' : 'ver o original'}</button>}
        </p>
        {historico && <Historico id={m.id} ctx={ctx} />}
        {m.respostas > 0 && ctx.onAbrirFio && <ResumoDoFio m={m} ctx={ctx} />}
      </div>
    )
  }
  const salvar = () => iniciar(async () => { const r = await editarMensagem(m.id, texto); if (r.erro) ctx.onErro(r.erro); else setEditando(false) })
  return (
    // tabIndex: no celular, tocar na mensagem mostra as ações (reagir, responder…).
    <div className={`group relative -mx-1 rounded px-1 outline-none focus-within:bg-muted/40 ${destacada ? 'bg-warning/15' : 'hover:bg-muted/40'}`} data-mensagem={m.id} tabIndex={-1}>
      {editando ? (
        <div className="flex flex-col gap-1 py-1">
          <textarea value={texto} onChange={(e) => setTexto(e.target.value)} rows={2} maxLength={TAMANHO_MAXIMO} className={campo} autoFocus aria-label="Editar mensagem"
            onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); salvar() } if (e.key === 'Escape') setEditando(false) }} />
          <div className="flex gap-2 text-xs"><Button size="sm" disabled={ocupado} onClick={salvar}>Salvar</Button><Button size="sm" variant="ghost" onClick={() => { setEditando(false); setTexto(m.corpo) }}>Cancelar</Button></div>
        </div>
      ) : m.corpo ? (
        <p className="whitespace-pre-wrap break-words text-sm leading-relaxed">
          {trechos(m.corpo, ctx.nomes).map((t, i) => t.tipo === 'link'
            ? <a key={i} href={t.valor} target="_blank" rel="noopener noreferrer" className="text-primary underline underline-offset-2">{t.valor}</a>
            : t.tipo === 'mencao'
              ? <span key={i} className={`rounded px-0.5 font-medium ${t.valor === `@${ctx.pessoaDe.get(ctx.eu)?.nome}` || t.valor === '@canal' || t.valor === '@todos' ? 'bg-warning/25 text-foreground' : 'bg-primary/10 text-primary'}`}>{t.valor}</span>
              : <span key={i}>{t.valor}</span>)}
          {m.editada_em && <span className="ml-1 text-[11px] text-muted-foreground">(editada)</span>}
        </p>
      ) : null}
      {(m.anexos ?? []).length > 0 && <Anexos anexos={m.anexos} />}
      {(m.reacoes ?? []).length > 0 && <Reacoes m={m} ctx={ctx} onAlternar={alternar} onMais={() => setEscolhendo(true)} />}
      {m.respostas > 0 && ctx.onAbrirFio && <ResumoDoFio m={m} ctx={ctx} />}
      {historico && <Historico id={m.id} ctx={ctx} />}
      {escolhendo && <EscolherReacao onEscolher={alternar} onFechar={() => setEscolhendo(false)} />}

      {!editando && (
        <div className="absolute -top-3 right-1 hidden gap-0.5 rounded-md border border-border bg-card p-0.5 shadow-sm group-hover:flex group-focus-within:flex" data-acoes>
          {ctx.podeEscrever && REACOES_RAPIDAS.slice(0, 3).map((e) => (
            <button key={e} type="button" className="rounded px-1 text-sm hover:bg-muted" aria-label={`Reagir com ${e}`} onClick={() => alternar(e)}>{e}</button>
          ))}
          {ctx.podeEscrever && <Acao rotulo="Mais reações" onClick={() => setEscolhendo(!escolhendo)}><SmilePlus className="size-3.5" /></Acao>}
          {ctx.onAbrirFio && <Acao rotulo="Responder em fio" onClick={() => ctx.onAbrirFio?.(m)}><Reply className="size-3.5" /></Acao>}
          {minha && ctx.podeEscrever && <Acao rotulo="Editar mensagem" onClick={() => setEditando(true)}><Pencil className="size-3.5" /></Acao>}
          {ctx.ehAdmin && m.editada_em && <Acao rotulo="Histórico de edições" onClick={() => setHistorico(!historico)}><History className="size-3.5" /></Acao>}
          {podeApagar && <Acao rotulo="Apagar mensagem" perigo disabled={ocupado}
            onClick={() => { if (confirm('Apagar esta mensagem? Ela some da conversa (o registro fica guardado para a administração).')) iniciar(async () => { const r = await apagarMensagem(m.id); if (r.erro) ctx.onErro(r.erro) }) }}>
            <Trash2 className="size-3.5" /></Acao>}
        </div>
      )}
    </div>
  )
}

function Acao({ rotulo, onClick, perigo, disabled, children }: { rotulo: string; onClick: () => void; perigo?: boolean; disabled?: boolean; children: React.ReactNode }) {
  return (
    <button type="button" className={`rounded p-1 text-muted-foreground hover:bg-muted ${perigo ? 'hover:text-destructive' : 'hover:text-foreground'}`}
      aria-label={rotulo} title={rotulo} disabled={disabled} onClick={onClick}>{children}</button>
  )
}

function EscolherReacao({ onEscolher, onFechar }: { onEscolher: (e: string) => void; onFechar: () => void }) {
  const caixa = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const fora = (e: MouseEvent) => { if (caixa.current && !caixa.current.contains(e.target as Node)) onFechar() }
    const tecla = (e: KeyboardEvent) => { if (e.key === 'Escape') onFechar() }
    document.addEventListener('mousedown', fora); document.addEventListener('keydown', tecla)
    return () => { document.removeEventListener('mousedown', fora); document.removeEventListener('keydown', tecla) }
  }, [onFechar])
  return (
    <div ref={caixa} className="absolute right-1 top-4 z-20 grid w-64 grid-cols-8 gap-0.5 rounded-lg border border-border bg-card p-1.5 shadow-lg" role="dialog" aria-label="Escolher reação">
      {REACOES.map((e) => <button key={e} type="button" className="rounded p-1 text-lg leading-none hover:bg-muted" aria-label={`Reagir com ${e}`} onClick={() => onEscolher(e)}>{e}</button>)}
    </div>
  )
}

function Reacoes({ m, ctx, onAlternar, onMais }: { m: MensagemDoChat; ctx: Contexto; onAlternar: (e: string) => void; onMais: () => void }) {
  return (
    <div className="mt-1 flex flex-wrap items-center gap-1" data-reacoes>
      {m.reacoes.map((r) => {
        const minha = r.pessoas.includes(ctx.eu)
        const quem = r.pessoas.map((id) => (id === ctx.eu ? 'você' : ctx.pessoaDe.get(id)?.nome ?? 'alguém')).join(', ')
        return (
          <button key={r.emoji} type="button" disabled={!ctx.podeEscrever} onClick={() => onAlternar(r.emoji)} title={`${quem} reagiu com ${r.emoji}`}
            aria-label={`${r.emoji} ${r.pessoas.length}${minha ? ', inclusive você' : ''}`} aria-pressed={minha}
            className={`flex items-center gap-1 rounded-full border px-1.5 py-0.5 text-xs ${minha ? 'border-primary/50 bg-primary/10 text-primary' : 'border-border bg-muted/40 hover:bg-muted'}`}>
            <span className="text-sm leading-none">{r.emoji}</span><span className="font-medium tabular-nums">{r.pessoas.length}</span>
          </button>
        )
      })}
      {ctx.podeEscrever && <button type="button" onClick={onMais} className="rounded-full border border-border p-1 text-muted-foreground hover:bg-muted" aria-label="Mais reações"><SmilePlus className="size-3" /></button>}
    </div>
  )
}

function ResumoDoFio({ m, ctx }: { m: MensagemDoChat; ctx: Contexto }) {
  return (
    <button type="button" onClick={() => ctx.onAbrirFio?.(m)} data-resumo-do-fio
      className="mt-1 flex items-center gap-2 rounded-md border border-transparent px-1 py-0.5 text-xs hover:border-border hover:bg-card">
      <span className="flex -space-x-1">
        {(m.respondentes ?? []).slice(0, 3).map((id) => { const p = ctx.pessoaDe.get(id); return <Avatar key={id} initials={p?.iniciais ?? '?'} color={p?.cor ?? undefined} src={privateAvatarUrl(p?.avatar)} size="xs" className="size-5 text-[9px] ring-2 ring-card" /> })}
      </span>
      <span className="font-semibold text-primary">{m.respostas} {m.respostas === 1 ? 'resposta' : 'respostas'}</span>
      {m.ultima_resposta_em && <span className="text-muted-foreground">última {quando(m.ultima_resposta_em)}</span>}
    </button>
  )
}

/** Os arquivos da mensagem: imagem em miniatura, áudio e vídeo com player, o resto em cartão para baixar. */
export function Anexos({ anexos }: { anexos: AnexoDoChat[] }) {
  const imagens = anexos.filter((a) => a.tipo === 'imagem' && abreNaTela(a.mime))
  const outros = anexos.filter((a) => !imagens.includes(a))
  return (
    <div className="mt-1 flex flex-col gap-1.5" data-anexos>
      {imagens.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {imagens.map((a) => (
            <a key={a.id} href={urlDoArquivo(a)} target="_blank" rel="noopener noreferrer" title={a.nome}>
              <img src={urlDoArquivo(a)} alt={a.nome} loading="lazy" className="max-h-60 max-w-[min(100%,18rem)] rounded-lg border border-border bg-muted object-cover" />
            </a>
          ))}
        </div>
      )}
      {outros.map((a) => a.tipo === 'audio' ? (
        <div key={a.id} className="flex max-w-sm flex-col gap-1 rounded-lg border border-border bg-muted/30 p-2" data-audio>
          <p className="flex items-center gap-1.5 text-xs text-muted-foreground"><Mic className="size-3.5" />Mensagem de voz{a.duracao ? ` · ${duracaoLegivel(a.duracao)}` : ''}</p>
          <audio controls preload="none" src={urlDoArquivo(a)} className="h-9 w-full" />
        </div>
      ) : a.tipo === 'video' && abreNaTela(a.mime) ? (
        <video key={a.id} controls preload="metadata" src={urlDoArquivo(a)} className="max-h-72 max-w-full rounded-lg border border-border bg-black" />
      ) : (
        <a key={a.id} href={urlDoArquivo(a, !abreNaTela(a.mime))} target="_blank" rel="noopener noreferrer"
          className="flex max-w-sm items-center gap-3 rounded-lg border border-border bg-card p-2 hover:bg-muted/50">
          <FileText className="size-8 shrink-0 text-primary" />
          <span className="min-w-0 flex-1"><span className="block truncate text-sm font-medium">{a.nome}</span><span className="text-xs text-muted-foreground">{tamanhoLegivel(a.tamanho)}</span></span>
          <Download className="size-4 shrink-0 text-muted-foreground" />
        </a>
      ))}
    </div>
  )
}

/** O que a mensagem já foi — só a administração vê. */
function Historico({ id, ctx }: { id: string; ctx: Contexto }) {
  const [versoes, setVersoes] = useState<VersaoDaMensagem[] | null>(null)
  const avisarErro = useRef(ctx.onErro)
  useEffect(() => { avisarErro.current = ctx.onErro })
  useEffect(() => {
    let vivo = true
    void historicoDaMensagem(id).then((r) => { if (!vivo) return; if (r.erro) avisarErro.current(r.erro); setVersoes(r.versoes ?? []) })
    return () => { vivo = false }
  }, [id])
  if (!versoes) return <p className="my-1 flex items-center gap-1 text-xs text-muted-foreground"><Loader2 className="size-3 animate-spin" />Abrindo o histórico…</p>
  if (!versoes.length) return <p className="my-1 text-xs text-muted-foreground">Sem versões anteriores.</p>
  return (
    <ol className="my-1 flex flex-col gap-1 rounded-lg border border-dashed border-border bg-muted/30 p-2 text-xs" data-historico>
      {versoes.map((v, i) => (
        <li key={i}>
          <p className="text-muted-foreground">{v.acao === 'apagada' ? 'Apagada' : 'Antes da edição'} · {quando(v.created_at)}{v.por ? ` · por ${ctx.pessoaDe.get(v.por)?.nome ?? 'alguém'}` : ''}</p>
          {v.corpo && <p className="whitespace-pre-wrap break-words">{v.corpo}</p>}
          {(v.anexos ?? []).map((a) => <a key={a.id} href={urlDoArquivo(a, true)} className="mr-2 text-primary underline">📎 {a.nome}</a>)}
        </li>
      ))}
    </ol>
  )
}
