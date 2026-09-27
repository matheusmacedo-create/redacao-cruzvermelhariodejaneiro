'use client'

import { useEffect, useMemo, useRef, useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import {
  AlertTriangle, Archive, ArrowLeft, CheckCircle2, ChevronDown, Forward, Inbox, Loader2, Lock, Mail, MailOpen, MailX, Paperclip,
  PenSquare, RefreshCw, Reply, ReplyAll, ScrollText, Search, Send, SendHorizonal, X,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { cn } from '@/lib/utils'
import { enviarEmailDoSetor, marcarConversa } from '@/app/actions/correio'
import {
  assuntoDaResposta, destinatariosDaResposta, documentoDeLeitura, tamanhoLegivel,
  type AnexoLido, type MensagemLida, type Pasta,
} from '@/lib/correio/leitura'
import type { CaixaVisivel, ConversaNaLista } from '@/lib/correio/caixa-de-entrada'

export type EnvioNaTela = {
  id: string
  de: string
  para: string[]
  cc: string[]
  assunto: string
  corpo: string
  estado: 'enviado' | 'falhou'
  erro: string | null
  quando: string
  setor: string
  autor: string
}

/** Onde a pessoa está: tudo no endereço (dá para voltar, recarregar e mandar o link). */
export type Estado = { caixa: string; pasta: Pasta | 'registro'; q: string; conversa: string | null; pagina: string | null; escrever: boolean }

const campo = 'w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-ring focus:ring-2 focus:ring-ring/30'
const fuso = 'America/Sao_Paulo'
const hora = new Intl.DateTimeFormat('pt-BR', { hour: '2-digit', minute: '2-digit', timeZone: fuso })
const diaMes = new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: 'short', timeZone: fuso })
const completo = new Intl.DateTimeFormat('pt-BR', { dateStyle: 'medium', timeStyle: 'short', timeZone: fuso })
const diaDe = new Intl.DateTimeFormat('en-CA', { timeZone: fuso })

function url(e: Estado, muda: Partial<Estado>): string {
  const n = { ...e, ...muda }
  const p = new URLSearchParams()
  if (n.caixa) p.set('caixa', n.caixa)
  if (n.pasta !== 'entrada') p.set('pasta', n.pasta)
  if (n.q) p.set('q', n.q)
  if (n.pagina) p.set('pagina', n.pagina)
  if (n.conversa) p.set('conversa', n.conversa)
  if (n.escrever) p.set('escrever', '1')
  const s = p.toString()
  return `/correio${s ? `?${s}` : ''}`
}

/** "14:32" se foi hoje; "27 de set." antes. */
function quandoNaLista(iso: string | null, hoje: string): string {
  if (!iso) return ''
  const d = new Date(iso)
  return diaDe.format(d) === hoje ? hora.format(d) : diaMes.format(d)
}

const iniciais = (nome: string, email: string) => (nome || email).split(/[\s@.]+/).filter(Boolean).slice(0, 2).map((p) => p[0]?.toUpperCase()).join('')

// ---------------------------------------------------------------- a tela

export function CaixaDoCorreio({ caixas, estado, naoLidas, lista, proxima, conversa, historico, situacao, semLeitura, erroDoGmail, ehAdmin, hoje }: {
  caixas: CaixaVisivel[]
  estado: Estado
  naoLidas: Record<string, number>
  lista: ConversaNaLista[]
  proxima: string | null
  conversa: MensagemLida[] | null
  historico: EnvioNaTela[]
  situacao: 'ok' | 'expirada' | 'desconectado'
  semLeitura: boolean
  erroDoGmail: string | null
  ehAdmin: boolean
  hoje: string
}) {
  if (situacao !== 'ok' || !caixas.length) {
    return (
      <div className="flex flex-col gap-6">
        <Card className="flex items-start gap-3 border-dashed p-5 text-sm" data-ajuda="correio.aviso">
          <MailX className="mt-0.5 size-5 shrink-0 text-muted-foreground" />
          <p className="text-muted-foreground">
            {situacao === 'expirada' ? 'A autorização da conta Google expirou. ' : situacao === 'desconectado' ? 'O correio ainda não foi ligado à conta Google. ' : 'Você ainda não faz parte de um setor com endereço ativo. '}
            {ehAdmin ? <>Resolva em <a href="/configuracoes/email" className="text-primary hover:underline">Configurações → E-mail dos setores</a>.</> : situacao === 'ok' ? 'Peça a um administrador para incluir você no seu setor.' : 'Avise um administrador.'}
          </p>
        </Card>
        <Historico envios={historico} />
      </div>
    )
  }

  const caixa = caixas.find((c) => c.id === estado.caixa) ?? caixas[0]
  const aberta = Boolean(conversa) || estado.escrever
  return (
    <div className="flex flex-col gap-3">
      {semLeitura && (
        <p className="flex items-start gap-2 rounded-lg border border-warning/40 bg-warning/10 px-3 py-2 text-sm" data-ajuda="correio.aviso">
          <AlertTriangle className="mt-0.5 size-4 shrink-0 text-warning-foreground" />
          <span>
            A caixa de entrada precisa de uma permissão nova do Google (ler os e-mails dos setores). Enviar continua funcionando.{' '}
            {ehAdmin ? <>Reconecte a conta em <a href="/configuracoes/email" className="font-medium text-primary hover:underline">Configurações → E-mail dos setores</a> (“Reconectar”).</> : 'Avise um administrador para reconectar a conta Google.'}
          </span>
        </p>
      )}
      {erroDoGmail && !semLeitura && (
        <p className="flex items-start gap-2 rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive"><AlertTriangle className="mt-0.5 size-4 shrink-0" />{erroDoGmail}</p>
      )}

      <div className="grid min-h-[70dvh] grid-cols-1 overflow-hidden rounded-xl border border-border bg-card lg:h-[calc(100dvh-11rem)] lg:grid-cols-[15rem_minmax(18rem,24rem)_1fr]">
        {/* Coluna 1: as caixas e as pastas */}
        <nav aria-label="Caixas e pastas" data-ajuda="correio.caixas" className={cn('flex flex-col gap-3 border-border p-3 lg:overflow-y-auto lg:border-r', aberta && 'hidden lg:flex')}>
          <Button render={<Link href={url(estado, { caixa: caixa.id, escrever: true, conversa: null })} />} className="w-full justify-start" data-ajuda="correio.escrever">
            <PenSquare className="size-4" />Escrever
          </Button>
          <div className="flex gap-2 overflow-x-auto lg:flex-col lg:overflow-visible">
            {caixas.map((c) => (
              <div key={c.id} className="flex min-w-56 flex-col gap-0.5 lg:min-w-0">
                <p className="truncate px-2 pt-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground" title={c.email}>{c.setor || c.email}</p>
                <p className="truncate px-2 pb-1 text-[11px] text-muted-foreground">{c.email}</p>
                {(['entrada', 'enviados', 'todas'] as const).map((p) => {
                  const ativa = c.id === caixa.id && estado.pasta === p && !estado.escrever
                  const Icone = p === 'entrada' ? Inbox : p === 'enviados' ? SendHorizonal : Mail
                  const n = p === 'entrada' ? naoLidas[c.id] ?? 0 : 0
                  return (
                    <Link key={p} href={url({ ...estado, q: '' }, { caixa: c.id, pasta: p, conversa: null, pagina: null, escrever: false })} aria-current={ativa ? 'page' : undefined}
                      className={cn('flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm', ativa ? 'bg-primary/10 font-semibold text-primary' : 'text-foreground/85 hover:bg-muted')}>
                      <Icone className="size-4 shrink-0" />
                      <span className="flex-1 truncate">{p === 'entrada' ? 'Caixa de entrada' : p === 'enviados' ? 'Enviados' : 'Todas'}</span>
                      {n > 0 && <span className="rounded-full bg-primary px-1.5 text-[11px] font-semibold tabular-nums text-primary-foreground" aria-label={`${n} não lidas`}>{n > 99 ? '99+' : n}</span>}
                    </Link>
                  )
                })}
              </div>
            ))}
          </div>
          <Link href={url({ ...estado, q: '' }, { pasta: 'registro', conversa: null, pagina: null, escrever: false })} aria-current={estado.pasta === 'registro' ? 'page' : undefined}
            className={cn('mt-auto flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm', estado.pasta === 'registro' ? 'bg-primary/10 font-semibold text-primary' : 'text-muted-foreground hover:bg-muted')}>
            <ScrollText className="size-4" />Registro do Palácio
          </Link>
        </nav>

        {/* Coluna 2: a lista */}
        <section aria-label="Conversas" className={cn('flex min-h-0 flex-col border-border lg:border-r', aberta && 'hidden lg:flex', estado.pasta === 'registro' && 'lg:col-span-2')}>
          {estado.pasta === 'registro'
            ? <div className="min-h-0 flex-1 overflow-y-auto"><Historico envios={historico} embutido /></div>
            : <Lista caixa={caixa} estado={estado} lista={lista} proxima={proxima} hoje={hoje} semLeitura={semLeitura} />}
        </section>

        {/* Coluna 3: leitura ou escrita */}
        {estado.pasta !== 'registro' && (
          <section aria-label="Leitura" className={cn('min-h-0 flex-col', aberta ? 'flex' : 'hidden lg:flex')}>
            {estado.escrever
              ? <Compositor caixas={caixas} caixaInicial={caixa.id} voltar={url(estado, { escrever: false })} />
              : conversa
                ? <Leitura key={estado.conversa} caixa={caixa} mensagens={conversa} estado={estado} caixas={caixas} />
                : (
                  <div className="flex flex-1 flex-col items-center justify-center gap-2 p-8 text-center text-sm text-muted-foreground">
                    <MailOpen className="size-10 text-muted-foreground/50" />
                    Escolha uma conversa para ler, ou toque em “Escrever”.
                  </div>
                )}
          </section>
        )}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------- lista

function Lista({ caixa, estado, lista, proxima, hoje, semLeitura }: { caixa: CaixaVisivel; estado: Estado; lista: ConversaNaLista[]; proxima: string | null; hoje: string; semLeitura: boolean }) {
  const router = useRouter()
  const [atualizando, atualizar] = useTransition()
  const pasta = estado.pasta as Pasta
  return (
    <>
      <div className="flex flex-col gap-2 border-b border-border p-3">
        <div className="flex items-center justify-between gap-2">
          <div className="min-w-0">
            <p className="truncate font-semibold">{pasta === 'entrada' ? 'Caixa de entrada' : pasta === 'enviados' ? 'Enviados' : 'Todas'}</p>
            <p className="truncate text-xs text-muted-foreground">{caixa.setor} · {caixa.email}</p>
          </div>
          <Button variant="ghost" size="icon" aria-label="Atualizar" disabled={atualizando} onClick={() => atualizar(() => router.refresh())}>
            <RefreshCw className={cn('size-4', atualizando && 'animate-spin')} />
          </Button>
        </div>
        <form action="/correio" className="relative" data-ajuda="correio.busca">
          <input type="hidden" name="caixa" value={caixa.id} />
          {pasta !== 'entrada' && <input type="hidden" name="pasta" value={pasta} />}
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <input name="q" defaultValue={estado.q} placeholder="Buscar nesta pasta" aria-label="Buscar nesta pasta" className={`pl-9 ${campo}`} />
        </form>
      </div>
      <ul className="min-h-0 flex-1 divide-y divide-border overflow-y-auto" data-ajuda="correio.lista">
        {lista.map((c) => {
          const ativa = estado.conversa === c.id
          return (
            <li key={c.id}>
              <Link href={url(estado, { conversa: c.id, escrever: false })} aria-current={ativa ? 'true' : undefined} data-conversa={c.id}
                className={cn('flex gap-2 px-3 py-2.5 hover:bg-muted/50', ativa && 'bg-primary/[0.07]', c.naoLida && !ativa && 'bg-background')}>
                <span className={cn('mt-1.5 size-2 shrink-0 rounded-full', c.naoLida ? 'bg-primary' : 'bg-transparent')} aria-hidden="true" />
                <span className="min-w-0 flex-1">
                  <span className="flex items-baseline justify-between gap-2">
                    <span className={cn('truncate text-sm', c.naoLida ? 'font-bold' : 'font-medium text-foreground/85')}>{c.quem || caixa.email}</span>
                    <span className={cn('shrink-0 text-xs tabular-nums', c.naoLida ? 'font-semibold text-foreground' : 'text-muted-foreground')}>{quandoNaLista(c.quando, hoje)}</span>
                  </span>
                  <span className={cn('flex items-center gap-1 truncate text-sm', c.naoLida ? 'font-semibold' : 'text-foreground/85')}>
                    {c.temAnexo && <Paperclip className="size-3.5 shrink-0 text-muted-foreground" aria-label="Com anexo" />}
                    <span className="truncate">{c.assunto}</span>
                  </span>
                  <span className="line-clamp-1 text-xs text-muted-foreground">{c.resumo}</span>
                </span>
              </Link>
            </li>
          )
        })}
        {!lista.length && (
          <li className="p-8 text-center text-sm text-muted-foreground">
            {semLeitura ? 'A caixa de entrada aparece depois que a conta Google for reconectada.' : estado.q ? 'Nada nesta busca.' : pasta === 'entrada' ? 'Nenhuma mensagem na caixa de entrada.' : 'Nada por aqui.'}
          </li>
        )}
      </ul>
      {(proxima || estado.pagina) && (
        <div className="flex justify-between gap-2 border-t border-border p-2">
          {estado.pagina ? <Button variant="ghost" size="sm" render={<Link href={url(estado, { pagina: null, conversa: null })} />}>Mais recentes</Button> : <span />}
          {proxima && <Button variant="ghost" size="sm" render={<Link href={url(estado, { pagina: proxima, conversa: null })} />}>Mais antigas</Button>}
        </div>
      )}
    </>
  )
}

// ---------------------------------------------------------------- leitura

/** O quadro do e-mail cresce até o tamanho dele (e mede de novo quando as imagens chegam). */
function ajustarAltura(quadro: HTMLIFrameElement) {
  const doc = quadro.contentDocument
  if (!doc) return
  const medir = () => { quadro.style.height = `${Math.max(doc.documentElement.scrollHeight, 40) + 4}px` }
  medir()
  doc.querySelectorAll('img').forEach((img) => { if (!img.complete) img.addEventListener('load', medir, { once: true }) })
}

const urlDoAnexo = (caixaId: string, mensagemId: string, a: AnexoLido, baixar = false) =>
  `/api/correio/anexo?caixa=${caixaId}&mensagem=${mensagemId}&parte=${encodeURIComponent(a.parte)}${baixar ? '&baixar=1' : ''}`

type Modo = 'responder' | 'todos' | 'encaminhar'

function Leitura({ caixa, mensagens, estado, caixas }: { caixa: CaixaVisivel; mensagens: MensagemLida[]; estado: Estado; caixas: CaixaVisivel[] }) {
  const router = useRouter()
  const ultima = mensagens[mensagens.length - 1]
  // Abertas: a última e as não lidas; as outras ficam num resumo de uma linha, como no Gmail.
  const [abertas, setAbertas] = useState<Set<string>>(() => new Set([ultima.id, ...mensagens.filter((m) => m.naoLida).map((m) => m.id)]))
  const [resposta, setResposta] = useState<{ modo: Modo; mensagem: MensagemLida } | null>(null)
  const [ocupado, rodar] = useTransition()
  const [erro, setErro] = useState('')
  const naEntrada = estado.pasta === 'entrada'

  // Abrir é ler: marca como lida uma vez, depois que a tela abriu (não no servidor: o
  // pré-carregamento dos links não pode marcar nada como lido).
  const marcou = useRef(false)
  useEffect(() => {
    if (marcou.current || !mensagens.some((m) => m.naoLida)) return
    marcou.current = true
    marcarConversa(caixa.id, ultima.threadId, 'lida').then((r) => { if (!r.erro) router.refresh() })
  }, [caixa.id, mensagens, ultima.threadId, router])

  const acao = (a: 'nao_lida' | 'arquivar' | 'entrada') => rodar(async () => {
    setErro('')
    const r = await marcarConversa(caixa.id, ultima.threadId, a)
    if (r.erro) { setErro(r.erro); return }
    router.push(url(estado, { conversa: null }))
  })

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex flex-wrap items-center gap-1 border-b border-border p-2" data-ajuda="correio.acoes">
        <Button variant="ghost" size="sm" className="lg:hidden" render={<Link href={url(estado, { conversa: null })} />}><ArrowLeft className="size-4" />Voltar</Button>
        <Button variant="ghost" size="sm" onClick={() => setResposta({ modo: 'responder', mensagem: ultima })}><Reply className="size-4" />Responder</Button>
        <Button variant="ghost" size="sm" onClick={() => setResposta({ modo: 'todos', mensagem: ultima })}><ReplyAll className="size-4" />Responder a todos</Button>
        <Button variant="ghost" size="sm" onClick={() => setResposta({ modo: 'encaminhar', mensagem: ultima })}><Forward className="size-4" />Encaminhar</Button>
        <span className="flex-1" />
        <Button variant="ghost" size="sm" disabled={ocupado} onClick={() => acao('nao_lida')}><Mail className="size-4" />Não lida</Button>
        {naEntrada
          ? <Button variant="ghost" size="sm" disabled={ocupado} onClick={() => acao('arquivar')}><Archive className="size-4" />Arquivar</Button>
          : estado.pasta === 'todas' && <Button variant="ghost" size="sm" disabled={ocupado} onClick={() => acao('entrada')}><Inbox className="size-4" />Mover para a entrada</Button>}
      </div>
      {erro && <p role="alert" className="mx-3 mt-2 rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">{erro}</p>}

      <div className="min-h-0 flex-1 overflow-y-auto p-3 sm:p-4" data-ajuda="correio.leitura">
        <h2 className="mb-3 text-lg font-semibold leading-snug text-balance">{mensagens[0].assunto}</h2>
        <ol className="flex flex-col gap-2">
          {mensagens.map((m) => {
            const aberta = abertas.has(m.id)
            const de = m.de ?? { nome: '', email: '?' }
            return (
              <li key={m.id} className="rounded-lg border border-border bg-background" data-mensagem={m.id}>
                <button type="button" onClick={() => setAbertas((s) => { const n = new Set(s); if (n.has(m.id)) n.delete(m.id); else n.add(m.id); return n })}
                  className="flex w-full items-start gap-3 p-3 text-left" aria-expanded={aberta}>
                  <span className={cn('flex size-9 shrink-0 items-center justify-center rounded-full text-xs font-semibold', de.email === caixa.email ? 'bg-primary/10 text-primary' : 'bg-muted text-muted-foreground')}>{iniciais(de.nome, de.email)}</span>
                  <span className="min-w-0 flex-1">
                    <span className="flex flex-wrap items-baseline justify-between gap-x-2">
                      <span className="truncate text-sm"><strong>{de.nome || de.email}</strong>{de.nome && <span className="text-muted-foreground"> &lt;{de.email}&gt;</span>}</span>
                      <span className="shrink-0 text-xs text-muted-foreground">{m.data ? completo.format(new Date(m.data)) : ''}</span>
                    </span>
                    <span className="block truncate text-xs text-muted-foreground">
                      {aberta ? <>para {m.para.map((e) => e.email === caixa.email ? 'mim' : (e.nome || e.email)).join(', ') || '—'}{m.cc.length ? ` · cc ${m.cc.map((e) => e.nome || e.email).join(', ')}` : ''}</> : m.resumo}
                    </span>
                  </span>
                </button>
                {aberta && (
                  <div className="border-t border-border px-3 pb-3 pt-2">
                    <iframe title={`Mensagem de ${de.nome || de.email}`} sandbox="allow-same-origin allow-popups allow-popups-to-escape-sandbox"
                      srcDoc={documentoDeLeitura(m, (a) => urlDoAnexo(caixa.id, m.id, a))} onLoad={(e) => ajustarAltura(e.currentTarget)}
                      className="h-24 w-full rounded bg-white" />
                    {m.anexos.filter((a) => !a.embutido).length > 0 && (
                      <ul className="mt-3 flex flex-wrap gap-2" aria-label="Anexos">
                        {m.anexos.filter((a) => !a.embutido).map((a) => (
                          <li key={a.parte}>
                            <a href={urlDoAnexo(caixa.id, m.id, a)} target="_blank" rel="noreferrer" data-anexo={a.nome}
                              className="flex max-w-64 items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm hover:border-primary/40 hover:bg-muted/40">
                              <Paperclip className="size-4 shrink-0 text-muted-foreground" />
                              <span className="min-w-0"><span className="block truncate font-medium">{a.nome}</span><span className="text-xs text-muted-foreground">{tamanhoLegivel(a.tamanho)}</span></span>
                            </a>
                          </li>
                        ))}
                      </ul>
                    )}
                    <div className="mt-3 flex flex-wrap gap-1">
                      <Button variant="outline" size="sm" onClick={() => setResposta({ modo: 'responder', mensagem: m })}><Reply className="size-4" />Responder</Button>
                      <Button variant="outline" size="sm" onClick={() => setResposta({ modo: 'encaminhar', mensagem: m })}><Forward className="size-4" />Encaminhar</Button>
                    </div>
                  </div>
                )}
              </li>
            )
          })}
        </ol>
        {resposta && (
          <div className="mt-4">
            <Compositor key={`${resposta.modo}-${resposta.mensagem.id}`} caixas={caixas} caixaInicial={caixa.id} fixa resposta={resposta} onFechar={() => setResposta(null)} />
          </div>
        )}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------- escrever e responder

/** O quadro da assinatura cresce até o tamanho dela (imagem do Gmail chega depois: mede de novo quando carrega). */
function ajustarAssinatura(quadro: HTMLIFrameElement) {
  const doc = quadro.contentDocument
  if (!doc) return
  const medir = () => { quadro.style.height = `${Math.min(Math.max(doc.documentElement.scrollHeight, 48), 480)}px` }
  medir()
  doc.querySelectorAll('img').forEach((img) => { if (!img.complete) img.addEventListener('load', medir, { once: true }) })
}

function Compositor({ caixas, caixaInicial, fixa = false, resposta, voltar, onFechar }: {
  caixas: CaixaVisivel[]
  caixaInicial: string
  /** Resposta: sai sempre pela caixa da conversa. */
  fixa?: boolean
  resposta?: { modo: Modo; mensagem: MensagemLida }
  voltar?: string
  onFechar?: () => void
}) {
  const router = useRouter()
  const [caixaId, setCaixaId] = useState(caixaInicial)
  const caixa = caixas.find((c) => c.id === caixaId) ?? caixas[0]
  const inicial = useMemo(() => {
    if (!resposta) return { para: '', cc: '', assunto: '' }
    const m = resposta.mensagem
    if (resposta.modo === 'encaminhar') return { para: '', cc: '', assunto: assuntoDaResposta(m.assunto, 'encaminhar') }
    const d = destinatariosDaResposta(m, caixa.email, resposta.modo === 'todos')
    return { para: d.para.join(', '), cc: d.cc.join(', '), assunto: assuntoDaResposta(m.assunto, 'responder') }
  }, [resposta, caixa.email])
  const [para, setPara] = useState(inicial.para)
  const [cc, setCc] = useState(inicial.cc)
  const [mostrarCc, setMostrarCc] = useState(Boolean(inicial.cc))
  const [assunto, setAssunto] = useState(inicial.assunto)
  const [corpo, setCorpo] = useState('')
  const [recado, setRecado] = useState<{ tom: 'ok' | 'erro'; texto: string } | null>(null)
  const [enviando, enviar] = useTransition()
  const titulo = !resposta ? 'Nova mensagem' : resposta.modo === 'encaminhar' ? 'Encaminhar' : resposta.modo === 'todos' ? 'Responder a todos' : 'Responder'

  function disparar() {
    setRecado(null)
    enviar(async () => {
      const f = new FormData()
      f.set('caixaId', caixa.id); f.set('para', para); f.set('cc', cc); f.set('assunto', assunto); f.set('corpo', corpo)
      if (resposta) {
        f.set('mensagemId', resposta.mensagem.id); f.set('threadId', resposta.mensagem.threadId)
        f.set('modo', resposta.modo === 'encaminhar' ? 'encaminhar' : 'responder')
      }
      const r = await enviarEmailDoSetor(f)
      if (r.erro) { setRecado({ tom: 'erro', texto: r.erro }); return }
      setRecado({ tom: 'ok', texto: r.recado ?? 'Enviado.' })
      setPara(''); setCc(''); setAssunto(''); setCorpo('')
      if (onFechar) { onFechar(); router.refresh() } else if (voltar) router.push(voltar)
    })
  }

  return (
    <Card className="flex flex-col gap-3 p-4" data-compositor>
      <div className="flex items-center justify-between gap-2">
        <p className="font-semibold">{titulo}</p>
        {onFechar
          ? <Button variant="ghost" size="icon" aria-label="Descartar" onClick={onFechar}><X className="size-4" /></Button>
          : voltar && <Button variant="ghost" size="sm" render={<Link href={voltar} />}><X className="size-4" />Descartar</Button>}
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-[5rem_1fr] sm:items-center">
        <span className="text-sm font-medium">De</span>
        {fixa || caixas.length === 1 ? (
          <p className="flex items-center gap-2 text-sm" data-ajuda="correio.de">
            <Lock className="size-3.5 text-muted-foreground" />
            <span className="truncate"><strong>{caixa.nome || caixa.email}</strong> &lt;{caixa.email}&gt;</span>
            <span className="shrink-0 text-xs text-muted-foreground">· {caixa.setor}</span>
          </p>
        ) : (
          <select value={caixaId} onChange={(e) => setCaixaId(e.target.value)} disabled={enviando} className={campo} aria-label="Enviar de" data-ajuda="correio.de">
            {caixas.map((c) => <option key={c.id} value={c.id}>{c.nome ? `${c.nome} <${c.email}>` : c.email} — {c.setor}</option>)}
          </select>
        )}
        <label htmlFor="correio-para" className="text-sm font-medium">Para</label>
        <div className="flex gap-2" data-ajuda="correio.para">
          <input id="correio-para" value={para} onChange={(e) => setPara(e.target.value)} disabled={enviando} placeholder="nome@exemplo.org, outro@exemplo.org" className={campo} />
          {!mostrarCc && <Button variant="ghost" size="sm" onClick={() => setMostrarCc(true)}>Cc</Button>}
        </div>
        {mostrarCc && (
          <>
            <label htmlFor="correio-cc" className="text-sm font-medium">Cc</label>
            <input id="correio-cc" value={cc} onChange={(e) => setCc(e.target.value)} disabled={enviando} className={campo} />
          </>
        )}
        <label htmlFor="correio-assunto" className="text-sm font-medium">Assunto</label>
        <input id="correio-assunto" value={assunto} onChange={(e) => setAssunto(e.target.value)} disabled={enviando} maxLength={200} className={campo} />
      </div>

      <textarea value={corpo} onChange={(e) => setCorpo(e.target.value)} disabled={enviando} rows={resposta ? 6 : 10} aria-label="Mensagem" autoFocus={Boolean(resposta)}
        placeholder={resposta ? 'Escreva a resposta…' : 'Escreva a mensagem…'} className={campo} />
      {resposta && (
        <p className="text-xs text-muted-foreground">
          {resposta.modo === 'encaminhar' ? 'A mensagem original vai abaixo da assinatura (sem os anexos dela).' : 'A mensagem original vai citada abaixo da assinatura, e a resposta fica na mesma conversa.'}
        </p>
      )}

      <details className="rounded-lg border border-border bg-muted/30 p-3" data-ajuda="correio.assinatura" open={!resposta}>
        <summary className="flex cursor-pointer list-none items-center gap-1.5 text-xs font-medium text-muted-foreground">
          <Lock className="size-3.5" />Assinatura do setor — entra automaticamente e não pode ser alterada aqui
          <ChevronDown className="ml-auto size-3.5" />
        </summary>
        <div className="mt-2">
          {caixa.assinatura
            // A assinatura vem do Gmail; mostrada num quadro sem script. `allow-same-origin` sem
            // `allow-scripts` não deixa nada rodar lá dentro, e permite medir a altura para não cortar.
            ? <iframe key={caixa.id} title="Assinatura" sandbox="allow-same-origin" srcDoc={`<body style="margin:8px">${caixa.assinatura}</body>`}
                onLoad={(e) => ajustarAssinatura(e.currentTarget)} className="h-32 w-full rounded-md border border-border bg-white" />
            : <p className="text-xs text-muted-foreground">Este endereço não tem assinatura no Gmail.</p>}
        </div>
      </details>

      {recado && (
        <p className={`flex items-start gap-2 text-sm ${recado.tom === 'erro' ? 'text-destructive' : 'text-emerald-700 dark:text-emerald-500'}`} role={recado.tom === 'erro' ? 'alert' : 'status'}>
          {recado.tom === 'erro' ? <AlertTriangle className="mt-0.5 size-4 shrink-0" /> : <CheckCircle2 className="mt-0.5 size-4 shrink-0" />}{recado.texto}
        </p>
      )}

      <div className="flex justify-end">
        <Button onClick={disparar} disabled={enviando || !para.trim() || !assunto.trim() || !corpo.trim()} data-ajuda="correio.enviar">
          {enviando ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}Enviar
        </Button>
      </div>
    </Card>
  )
}

// ---------------------------------------------------------------- registro

const quandoNoRegistro = new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short', timeZone: fuso })

/** O registro do Palácio: tudo o que saiu pelas caixas por aqui, com quem enviou (o Gmail não sabe quem foi). */
function Historico({ envios, embutido = false }: { envios: EnvioNaTela[]; embutido?: boolean }) {
  const [busca, setBusca] = useState('')
  const [aberto, setAberto] = useState<string | null>(null)
  const lista = useMemo(() => {
    const t = busca.trim().toLowerCase()
    return t ? envios.filter((e) => `${e.assunto} ${e.de} ${e.para.join(' ')} ${e.autor}`.toLowerCase().includes(t)) : envios
  }, [envios, busca])

  const conteudo = (
    <>
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-4 py-3">
        <div>
          <p className="font-medium">Registro do Palácio</p>
          <p className="text-xs text-muted-foreground">O que saiu pelo Palácio Virtual, com quem enviou. Você vê o dos seus setores; administradores veem todos.</p>
        </div>
        <div className="relative min-w-56">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar" className={`pl-9 ${campo}`} />
        </div>
      </div>
      {!lista.length ? (
        <p className="p-8 text-center text-sm text-muted-foreground">{envios.length ? 'Nada na busca.' : 'Nada enviado ainda.'}</p>
      ) : (
        <ul className="divide-y divide-border">
          {lista.map((e) => (
            <li key={e.id}>
              <button type="button" onClick={() => setAberto(aberto === e.id ? null : e.id)} aria-expanded={aberto === e.id}
                className="flex w-full flex-wrap items-center gap-3 px-4 py-3 text-left hover:bg-muted/30">
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium">{e.assunto}</p>
                  <p className="truncate text-xs text-muted-foreground">{e.de} → {e.para.join(', ')}{e.cc.length ? ` · cc ${e.cc.join(', ')}` : ''}</p>
                </div>
                <span className="text-xs text-muted-foreground">{e.setor} · {e.autor}{e.quando && !Number.isNaN(Date.parse(e.quando)) ? ` · ${quandoNoRegistro.format(new Date(e.quando))}` : ''}</span>
                <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${e.estado === 'enviado' ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-500' : 'bg-destructive/10 text-destructive'}`}>
                  {e.estado === 'enviado' ? 'Enviado' : 'Falhou'}
                </span>
                <ChevronDown className={`size-4 text-muted-foreground transition-transform ${aberto === e.id ? 'rotate-180' : ''}`} />
              </button>
              {aberto === e.id && (
                <div className="border-t border-border bg-muted/20 px-4 py-3 text-sm">
                  {e.erro && <p className="mb-2 text-xs text-destructive">{e.erro}</p>}
                  <p className="whitespace-pre-wrap">{e.corpo}</p>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </>
  )
  return embutido ? <div data-ajuda="correio.enviados">{conteudo}</div> : <Card className="overflow-hidden p-0" data-ajuda="correio.enviados">{conteudo}</Card>
}
