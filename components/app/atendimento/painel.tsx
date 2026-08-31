'use client'

import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from 'react'
import {
  AlertTriangle, CheckCircle2, ChevronDown, ExternalLink, Eye, EyeOff, Inbox,
  Loader2, MessageCircle, MessageSquare, RefreshCw, Send, X,
} from 'lucide-react'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { carregarFila, responder, esconder, type Fila } from '@/app/actions/atendimento'
import type { Mensagem } from '@/lib/atendimento/normalizar'

/**
 * O painel de atendimento: o que o público escreveu, numa fila só.
 *
 * O layout é organizado por URGÊNCIA, não por ordem de chegada. Numa fila de
 * atendimento a pergunta não é "o que é mais recente" — é "quem está esperando
 * resposta". Conversa já respondida e comentário já tratado continuam
 * acessíveis, mas saem da frente.
 *
 * Carrega ao abrir, com botão de atualizar. Não há webhook de comentário nem
 * de DM neste conector, então "tempo real" seria promessa falsa.
 */

const REDES: Record<string, { nome: string; classe: string }> = {
  instagram: { nome: 'Instagram', classe: 'bg-pink-500/12 text-pink-700' },
  facebook: { nome: 'Facebook', classe: 'bg-blue-500/12 text-blue-700' },
  youtube: { nome: 'YouTube', classe: 'bg-red-500/12 text-red-700' },
  linkedin: { nome: 'LinkedIn', classe: 'bg-sky-600/12 text-sky-700' },
}

/**
 * Nomes das redes que aparecem só no rodapé de "não atendido aqui".
 *
 * Elas não têm cor porque não têm item na fila — mas precisam de nome: o
 * rodapé mostrava "google_business:" e "x:", identificadores de código
 * vazando para quem só quer saber onde ainda precisa olhar na mão.
 */
const NOMES_EXTRAS: Record<string, string> = {
  google_business: 'Perfil da Empresa (Google)',
  x: 'X', threads: 'Threads', bluesky: 'Bluesky', pinterest: 'Pinterest',
  tiktok: 'TikTok', reddit: 'Reddit', telegram: 'Telegram', discord: 'Discord',
  mastodon: 'Mastodon', messenger: 'Messenger',
}

const rede = (id: string) =>
  REDES[id] ?? { nome: NOMES_EXTRAS[id] ?? id, classe: 'bg-muted text-muted-foreground' }

function quando(iso: string): string {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  const min = Math.floor((Date.now() - d.getTime()) / 60_000)
  if (min < 1) return 'agora'
  if (min < 60) return `${min} min`
  if (min < 60 * 24) return `${Math.floor(min / 60)} h`
  if (min < 60 * 24 * 7) return `${Math.floor(min / (60 * 24))} d`
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })
}

/** Iniciais do autor, para dar rosto à fila sem depender de foto de perfil. */
function iniciais(nome: string): string {
  const limpo = nome.replace(/[^\p{L}\p{N}\s.]/gu, ' ').trim()
  const partes = limpo.split(/[\s.]+/).filter(Boolean)
  if (!partes.length) return '?'
  return (partes[0][0] + (partes[1]?.[0] ?? '')).toUpperCase()
}

type Aba = 'esperando' | 'tudo'

export function PainelDeAtendimento({
  carregar = carregarFila,
  enviar = responder,
  alternarVisibilidade = esconder,
}: {
  carregar?: () => Promise<Fila>
  enviar?: (dados: FormData) => Promise<{ erro?: string; recado?: string }>
  alternarVisibilidade?: (dados: FormData) => Promise<{ erro?: string; recado?: string }>
} = {}) {
  const [fila, setFila] = useState<Fila | null>(null)
  const [carregando, setCarregando] = useState(true)
  const [aba, setAba] = useState<Aba>('esperando')
  const [canal, setCanal] = useState<string>('todos')
  const [recado, setRecado] = useState<{ tom: 'ok' | 'erro'; texto: string } | null>(null)
  const [escondidos, setEscondidos] = useState<Set<string>>(new Set())
  const [respondidos, setRespondidos] = useState<Set<string>>(new Set())
  const [avisosAbertos, setAvisosAbertos] = useState(false)
  const jaBuscou = useRef(false)

  const buscar = useCallback(async () => {
    setCarregando(true)
    setFila(await carregar())
    setCarregando(false)
  }, [carregar])

  useEffect(() => {
    // O modo estrito do React roda o efeito duas vezes em desenvolvimento, e
    // cada busca aqui são várias chamadas ao conector.
    if (jaBuscou.current) return
    jaBuscou.current = true
    void buscar()
  }, [buscar])

  const todas = useMemo(
    () => (fila?.mensagens ?? []).filter((m) => !respondidos.has(m.id)),
    [fila, respondidos],
  )

  /** Esperando = comentário (sempre pede resposta) ou DM cuja última fala não foi nossa. */
  const esperando = useMemo(
    () => todas.filter((m) => m.origem === 'comentario' || m.aguardandoResposta !== false),
    [todas],
  )

  const canaisPresentes = useMemo(
    () => [...new Set(todas.map((m) => m.canal))].sort(),
    [todas],
  )

  const lista = useMemo(() => {
    const base = aba === 'esperando' ? esperando : todas
    return canal === 'todos' ? base : base.filter((m) => m.canal === canal)
  }, [aba, canal, esperando, todas])

  const avisos = fila?.avisos ?? []
  const foraDoAlcance = fila?.foraDoAlcance ?? []

  return (
    <Card className="mb-6 overflow-hidden">
      {/* ---- cabeçalho ---- */}
      <div className="flex flex-wrap items-start justify-between gap-3 p-5 pb-4">
        <div className="min-w-0">
          <h2 className="flex items-center gap-2 text-lg font-semibold">
            <Inbox className="size-5 text-primary" />
            O que o público escreveu
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {carregando && !fila
              ? 'Buscando nas redes…'
              : esperando.length
                ? `${esperando.length} ${esperando.length === 1 ? 'pessoa espera' : 'pessoas esperam'} resposta.`
                : todas.length
                  ? 'Nada pendente — tudo respondido.'
                  : 'Nenhum comentário ou mensagem nas publicações recentes.'}
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={() => void buscar()} disabled={carregando}>
          {carregando ? <Loader2 className="size-4 animate-spin" /> : <RefreshCw className="size-4" />}
          Atualizar
        </Button>
      </div>

      {/* ---- filtros ---- */}
      {todas.length > 0 && (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-border px-5 pb-4">
          <div className="flex gap-1" role="tablist">
            {([
              ['esperando', `Esperando${esperando.length ? ` (${esperando.length})` : ''}`],
              ['tudo', `Tudo (${todas.length})`],
            ] as [Aba, string][]).map(([id, rotulo]) => (
              <button
                key={id}
                role="tab"
                aria-selected={aba === id}
                onClick={() => setAba(id)}
                className={cn(
                  'rounded-lg px-3 py-1.5 text-sm font-medium transition-colors',
                  aba === id ? 'bg-foreground text-background' : 'text-muted-foreground hover:text-foreground',
                )}
              >
                {rotulo}
              </button>
            ))}
          </div>

          {canaisPresentes.length > 1 && (
            <div className="flex flex-wrap gap-1">
              {['todos', ...canaisPresentes].map((id) => (
                <button
                  key={id}
                  onClick={() => setCanal(id)}
                  className={cn(
                    'rounded-md px-2.5 py-1 text-xs font-medium transition-colors',
                    canal === id ? 'bg-muted text-foreground' : 'text-muted-foreground hover:text-foreground',
                  )}
                >
                  {id === 'todos' ? 'Todas as redes' : rede(id).nome}
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ---- recado de ação ---- */}
      {recado && (
        <div className={cn(
          'flex items-start gap-2 border-b border-border px-5 py-3 text-sm',
          recado.tom === 'erro' ? 'bg-destructive/10 text-destructive' : 'bg-success/12 text-success',
        )}>
          {recado.tom === 'erro' ? <AlertTriangle className="mt-0.5 size-4 shrink-0" /> : <CheckCircle2 className="mt-0.5 size-4 shrink-0" />}
          <p className="flex-1">{recado.texto}</p>
          <button type="button" onClick={() => setRecado(null)} aria-label="Fechar aviso"><X className="size-4" /></button>
        </div>
      )}

      {/* ---- corpo ---- */}
      {carregando && !fila && (
        <div className="p-12 text-center text-sm text-muted-foreground">
          <Loader2 className="mx-auto mb-3 size-6 animate-spin" />
          Consultando comentários e mensagens das redes…
        </div>
      )}

      {fila?.erro && <p className="px-5 py-6 text-sm text-destructive">{fila.erro}</p>}

      {fila && !fila.erro && !lista.length && !carregando && (
        <div className="p-12 text-center">
          <CheckCircle2 className="mx-auto size-8 text-success" />
          <p className="mt-3 font-medium">
            {todas.length ? 'Nada esperando resposta' : 'Nenhuma mensagem por aqui'}
          </p>
          <p className="mx-auto mt-1 max-w-md text-sm leading-relaxed text-muted-foreground">
            {todas.length
              ? 'Abra “Tudo” para rever as conversas já respondidas.'
              : 'As perguntas do público aparecem aqui assim que alguém comentar numa publicação ou mandar mensagem.'}
          </p>
        </div>
      )}

      {lista.length > 0 && (
        <ul className="divide-y divide-border">
          {lista.map((m) => (
            <Linha
              key={m.id}
              mensagem={m}
              escondido={escondidos.has(m.id)}
              aoResponder={(texto) => enviarResposta(m, texto)}
              aoEsconder={() => trocarVisibilidade(m)}
            />
          ))}
        </ul>
      )}

      {/* ---- avisos, recolhidos: informação de rodapé não pode competir com a fila ---- */}
      {(avisos.length > 0 || foraDoAlcance.length > 0) && (
        <div className="border-t border-border bg-muted/30">
          <button
            type="button"
            onClick={() => setAvisosAbertos((v) => !v)}
            aria-expanded={avisosAbertos}
            className="flex w-full items-center gap-2 px-5 py-3 text-left text-xs font-medium text-muted-foreground hover:text-foreground"
          >
            <ChevronDown className={cn('size-4 transition-transform', avisosAbertos && 'rotate-180')} />
            {avisos.length > 0
              ? `${avisos.length} ${avisos.length === 1 ? 'rede não respondeu' : 'redes não responderam'} · o que não é atendido aqui`
              : 'O que não é atendido por este painel'}
          </button>
          {avisosAbertos && (
            <div className="space-y-2 px-5 pb-4 text-xs leading-relaxed text-muted-foreground">
              {avisos.map((aviso, i) => (
                <p key={`a${i}`} className="flex items-start gap-1.5">
                  <AlertTriangle className="mt-0.5 size-3 shrink-0 text-warning" />{aviso}
                </p>
              ))}
              {foraDoAlcance.map((f) => (
                <p key={f.canal}>
                  <strong className="text-foreground">{rede(f.canal).nome}:</strong> {f.motivo}
                </p>
              ))}
            </div>
          )}
        </div>
      )}
    </Card>
  )

  async function enviarResposta(m: Mensagem, texto: string) {
    const dados = new FormData()
    dados.set('origem', m.origem)
    dados.set('canal', m.canal)
    dados.set('texto', texto)
    if (m.comentarioId) dados.set('comentarioId', m.comentarioId)
    if (m.postId) dados.set('postId', m.postId)
    if (m.destinatarioId) dados.set('destinatarioId', m.destinatarioId)

    const r = await enviar(dados)
    if (r.erro) { setRecado({ tom: 'erro', texto: r.erro }); return false }
    setRespondidos((antes) => new Set(antes).add(m.id))
    setRecado({ tom: 'ok', texto: r.recado ?? 'Resposta enviada.' })
    return true
  }

  async function trocarVisibilidade(m: Mensagem) {
    if (!m.comentarioId) return
    const estaEscondido = escondidos.has(m.id)
    const dados = new FormData()
    dados.set('canal', m.canal)
    dados.set('comentarioId', m.comentarioId)
    if (estaEscondido) dados.set('mostrar', '1')

    const r = await alternarVisibilidade(dados)
    if (r.erro) { setRecado({ tom: 'erro', texto: r.erro }); return }
    setEscondidos((antes) => {
      const novo = new Set(antes)
      if (estaEscondido) novo.delete(m.id); else novo.add(m.id)
      return novo
    })
    setRecado({ tom: 'ok', texto: r.recado ?? 'Pronto.' })
  }
}

function Linha({ mensagem, escondido, aoResponder, aoEsconder }: {
  mensagem: Mensagem
  escondido: boolean
  aoResponder: (texto: string) => Promise<boolean>
  aoEsconder: () => Promise<void>
}) {
  const [abrindo, setAbrindo] = useState(false)
  const [texto, setTexto] = useState('')
  const [enviando, comecar] = useTransition()

  const eDm = mensagem.origem === 'dm'
  const r = rede(mensagem.canal)
  const respondida = eDm && mensagem.aguardandoResposta === false

  return (
    <li className={cn('px-5 py-4 transition-colors hover:bg-muted/30', escondido && 'opacity-55')}>
      <div className="flex gap-3">
        {/* rosto: dá identidade à fila sem depender de foto de perfil */}
        <div
          aria-hidden
          className={cn('mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-full text-xs font-bold', r.classe)}
        >
          {iniciais(mensagem.autor)}
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
            <span className="font-semibold">{mensagem.autor}</span>
            <span className={cn('rounded px-1.5 py-0.5 text-[11px] font-medium', r.classe)}>{r.nome}</span>
            <span className="flex items-center gap-1 text-[11px] text-muted-foreground">
              {eDm ? <MessageSquare className="size-3" /> : <MessageCircle className="size-3" />}
              {eDm ? 'mensagem direta' : 'comentário'}
            </span>
            {mensagem.quando && <span className="text-[11px] text-muted-foreground">· {quando(mensagem.quando)}</span>}
            {respondida && (
              <span className="rounded bg-success/12 px-1.5 py-0.5 text-[11px] font-medium text-success">Respondida</span>
            )}
            {escondido && (
              <span className="rounded bg-secondary px-1.5 py-0.5 text-[11px] font-medium text-secondary-foreground">Escondido</span>
            )}
            {mensagem.formatoDesconhecido && (
              <span className="rounded bg-warning/20 px-1.5 py-0.5 text-[11px] font-medium text-warning-foreground">
                formato não reconhecido
              </span>
            )}
            {mensagem.identidadeIncerta && (
              <span className="rounded bg-warning/20 px-1.5 py-0.5 text-[11px] font-medium text-warning-foreground">
                confira quem escreveu
              </span>
            )}
          </div>

          <p className="mt-1.5 whitespace-pre-wrap break-words text-sm leading-relaxed">{mensagem.texto}</p>

          {mensagem.postTitulo && (
            <p className="mt-1.5 flex items-center gap-1 truncate text-xs text-muted-foreground">
              em “{mensagem.postTitulo}”
              {mensagem.postUrl && (
                <a href={mensagem.postUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-0.5 text-primary hover:underline">
                  ver <ExternalLink className="size-3" />
                </a>
              )}
            </p>
          )}

          {!mensagem.respondivel && mensagem.motivo && (
            <p className="mt-2 flex items-start gap-1.5 rounded-lg bg-muted/70 px-3 py-2 text-xs leading-relaxed text-muted-foreground">
              <AlertTriangle className="mt-0.5 size-3 shrink-0 text-warning" />{mensagem.motivo}
            </p>
          )}

          {(mensagem.respondivel || (!eDm && mensagem.comentarioId)) && !abrindo && (
            <div className="mt-2.5 flex flex-wrap gap-1">
              {mensagem.respondivel && (
                <Button size="sm" variant="outline" onClick={() => setAbrindo(true)}>
                  <Send className="size-3.5" />Responder
                </Button>
              )}
              {!eDm && mensagem.comentarioId && (
                <Button size="sm" variant="ghost" onClick={() => void aoEsconder()}>
                  {escondido ? <><Eye className="size-3.5" />Mostrar</> : <><EyeOff className="size-3.5" />Esconder</>}
                </Button>
              )}
            </div>
          )}

          {abrindo && (
            <form
              className="mt-3"
              onSubmit={(e) => {
                e.preventDefault()
                comecar(async () => {
                  const foi = await aoResponder(texto)
                  if (foi) { setTexto(''); setAbrindo(false) }
                })
              }}
            >
              <textarea
                value={texto}
                onChange={(e) => setTexto(e.target.value)}
                rows={3}
                maxLength={2000}
                autoFocus
                aria-label={`Resposta para ${mensagem.autor}`}
                placeholder={eDm ? `Responder ${mensagem.autor}…` : 'Sua resposta pública ao comentário…'}
                className="w-full rounded-lg border border-border bg-background p-3 text-sm outline-none focus:border-primary"
              />
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <Button type="submit" size="sm" disabled={enviando || !texto.trim()}>
                  {enviando ? <Loader2 className="size-3.5 animate-spin" /> : <Send className="size-3.5" />}
                  {eDm ? 'Enviar mensagem' : 'Publicar resposta'}
                </Button>
                <Button type="button" size="sm" variant="ghost" onClick={() => { setAbrindo(false); setTexto('') }}>
                  Cancelar
                </Button>
                <span className="text-xs text-muted-foreground">
                  {eDm ? 'A mensagem vai direto para a pessoa.' : 'A resposta fica pública, sob o comentário.'}
                </span>
              </div>
            </form>
          )}
        </div>
      </div>
    </li>
  )
}
