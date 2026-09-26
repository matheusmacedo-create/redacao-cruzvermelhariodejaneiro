'use client'

import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from 'react'
import {
  AlertTriangle, ArrowLeft, AtSign, CheckCircle2, ChevronDown, CircleCheck, ExternalLink, Eye, EyeOff,
  Loader2, MessageCircle, MessageSquare, Paperclip, RefreshCw, RotateCcw, Send, X,
} from 'lucide-react'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { carregarFila, esconder, marcarSituacao, responder, type Fila, type Resultado } from '@/app/actions/atendimento'
import type { Fala, Mensagem } from '@/lib/atendimento/normalizar'
import { ROTULO_DA_SITUACAO, situacaoDe, type Registro, type Situacao } from '@/lib/atendimento/situacao'

/**
 * O Direct das redes: o atendimento ao público nas redes sociais, em duas
 * abas — Mensagens (o Direct do Instagram, aberto como chat) e Comentários
 * (debaixo da publicação de cada um, como na rede).
 *
 * O que muda em relação à antiga Caixa de entrada: a situação de cada item
 * (pendente, respondida, resolvida) é da EQUIPE, não do navegador de cada um —
 * quem abre vê quem já atendeu. E a fila abre nos pendentes.
 *
 * Carrega ao abrir, com botão de atualizar. Não há webhook de comentário nem
 * de DM neste conector, então "tempo real" seria promessa falsa.
 */

const REDES: Record<string, { nome: string; classe: string }> = {
  instagram: { nome: 'Instagram', classe: 'bg-pink-500/12 text-pink-700 dark:text-pink-300' },
  facebook: { nome: 'Facebook', classe: 'bg-blue-500/12 text-blue-700 dark:text-blue-300' },
  youtube: { nome: 'YouTube', classe: 'bg-red-500/12 text-red-700 dark:text-red-300' },
  linkedin: { nome: 'LinkedIn', classe: 'bg-sky-600/12 text-sky-700 dark:text-sky-300' },
}

const NOMES_EXTRAS: Record<string, string> = {
  google_business: 'Perfil da Empresa (Google)',
  x: 'X', threads: 'Threads', bluesky: 'Bluesky', pinterest: 'Pinterest',
  tiktok: 'TikTok', reddit: 'Reddit', telegram: 'Telegram', discord: 'Discord',
  mastodon: 'Mastodon', messenger: 'Messenger',
}

const rede = (id: string) =>
  REDES[id] ?? { nome: NOMES_EXTRAS[id] ?? id, classe: 'bg-muted text-muted-foreground' }

/** O Direct do Instagram na web. O conector não dá o endereço da conversa, só a caixa. */
const DIRECT_DO_INSTAGRAM = 'https://www.instagram.com/direct/inbox/'

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

/** Hora do balão, como nos aplicativos de mensagem: só a hora se foi hoje. */
function horaDoBalao(iso: string): string {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  const hora = d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
  const hoje = new Date().toDateString() === d.toDateString()
  return hoje ? hora : `${d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })} ${hora}`
}

/** Iniciais do autor, para dar rosto à fila sem depender de foto de perfil. */
function iniciais(nome: string): string {
  const limpo = nome.replace(/[^\p{L}\p{N}\s.]/gu, ' ').trim()
  const partes = limpo.split(/[\s.]+/).filter(Boolean)
  if (!partes.length) return '?'
  return (partes[0][0] + (partes[1]?.[0] ?? '')).toUpperCase()
}

/** A foto de perfil quando a rede devolve; as iniciais quando não. */
function Rosto({ nome, foto, classe, tamanho = 'size-9' }: { nome: string; foto?: string; classe: string; tamanho?: string }) {
  const [quebrou, setQuebrou] = useState(false)
  if (foto && !quebrou) {
    return (
      // A foto vem da CDN da rede, fora dos domínios do next/image.
      <img src={foto} alt="" aria-hidden onError={() => setQuebrou(true)} className={cn('shrink-0 rounded-full object-cover', tamanho)} />
    )
  }
  return (
    <span aria-hidden className={cn('flex shrink-0 items-center justify-center rounded-full text-xs font-bold', tamanho, classe)}>
      {iniciais(nome)}
    </span>
  )
}

const primeiroNome = (nome?: string | null) => (nome ?? '').trim().split(/\s+/)[0] || 'alguém da equipe'

/** "Respondida por Ana · 2 h", "Pendente", "Em dia" — a mesma para toda a equipe. */
function Selo({ situacao, registro }: { situacao: Situacao; registro?: Registro }) {
  if (situacao === 'pendente') return <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-semibold text-primary"><span className="size-1.5 rounded-full bg-primary" />Pendente</span>
  const quem = registro && situacao !== 'em_dia' ? ` por ${primeiroNome(registro.nome)} · ${quando(registro.em)}` : ''
  return <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground"><CircleCheck className="size-3" />{ROTULO_DA_SITUACAO[situacao]}{quem}</span>
}

type Aba = 'mensagens' | 'comentarios'
type Filtro = 'pendentes' | 'todas'

export function DirectDasRedes({
  registrosIniciais,
  situacaoGuardada,
  carregar = carregarFila,
  enviar = responder,
  alternarVisibilidade = esconder,
  mudarSituacao = marcarSituacao,
}: {
  registrosIniciais: Record<string, Registro>
  /** false quando a tabela da situação ainda não existe (migração pendente). */
  situacaoGuardada: boolean
  carregar?: () => Promise<Fila>
  enviar?: (dados: FormData) => Promise<Resultado>
  alternarVisibilidade?: (dados: FormData) => Promise<Resultado>
  mudarSituacao?: (chave: string, resolvida: boolean) => Promise<Resultado>
}) {
  const [fila, setFila] = useState<Fila | null>(null)
  const [carregando, setCarregando] = useState(true)
  const [aba, setAba] = useState<Aba>('mensagens')
  const [filtro, setFiltro] = useState<Filtro>('pendentes')
  const [abertoId, setAbertoId] = useState<string | null>(null)
  const [recado, setRecado] = useState<{ tom: 'ok' | 'erro'; texto: string } | null>(null)
  const [registros, setRegistros] = useState(registrosIniciais)
  const [escondidos, setEscondidos] = useState<Set<string>>(new Set())
  /** As falas que enviamos nesta sessão, por conversa — o eco do chat. */
  const [ecosDm, setEcosDm] = useState<Record<string, Fala[]>>({})
  /** As respostas que demos a comentários nesta sessão, por comentário. */
  const [ecosComentario, setEcosComentario] = useState<Record<string, { texto: string; quando: string }>>({})
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

  const mensagens = useMemo(() => fila?.mensagens ?? [], [fila])
  const dms = useMemo(() => mensagens.filter((m) => m.origem === 'dm'), [mensagens])
  const comentarios = useMemo(() => mensagens.filter((m) => m.origem === 'comentario'), [mensagens])
  const situacao = useCallback((m: Mensagem) => situacaoDe(m, registros[m.id]), [registros])

  const pendentes: Record<Aba, number> = {
    mensagens: dms.filter((m) => situacao(m) === 'pendente').length,
    comentarios: comentarios.filter((m) => situacao(m) === 'pendente').length,
  }

  const avisos = fila?.avisos ?? []
  const foraDoAlcance = fila?.foraDoAlcance ?? []
  const dmAberta = aba === 'mensagens' ? dms.find((m) => m.id === abertoId) : undefined

  function guardar(m: Mensagem, r: Resultado) {
    if (r.registro === undefined) return
    setRegistros((antes) => {
      const novo = { ...antes }
      if (r.registro) novo[m.id] = r.registro; else delete novo[m.id]
      return novo
    })
  }

  async function resolver(m: Mensagem, resolvida: boolean) {
    const r = await mudarSituacao(m.id, resolvida)
    if (r.erro) { setRecado({ tom: 'erro', texto: r.erro }); return }
    guardar(m, r)
    setRecado({ tom: 'ok', texto: resolvida ? 'Marcada como resolvida para toda a equipe.' : 'Voltou para os pendentes.' })
  }

  return (
    <Card className="mb-6 overflow-hidden">
      {recado && (
        <div role={recado.tom === 'erro' ? 'alert' : 'status'} className={cn(
          'flex items-start gap-2 border-b border-border px-5 py-3 text-sm',
          recado.tom === 'erro' ? 'bg-destructive/10 text-destructive' : 'bg-success/12 text-success',
        )}>
          {recado.tom === 'erro' ? <AlertTriangle className="mt-0.5 size-4 shrink-0" /> : <CheckCircle2 className="mt-0.5 size-4 shrink-0" />}
          <p className="flex-1">{recado.texto}</p>
          <button type="button" onClick={() => setRecado(null)} aria-label="Fechar aviso"><X className="size-4" /></button>
        </div>
      )}

      {/* ---- abas, filtro e atualizar ---- */}
      <div className="flex flex-wrap items-center gap-2 border-b border-border px-3 py-2.5 sm:px-4">
        <div role="tablist" aria-label="O que ver" className="flex gap-1" data-ajuda="direct.abas">
          {([['mensagens', 'Mensagens', MessageSquare], ['comentarios', 'Comentários', MessageCircle]] as const).map(([id, rotulo, Icone]) => (
            <button
              key={id} role="tab" type="button" aria-selected={aba === id}
              onClick={() => { setAba(id); setAbertoId(null) }}
              className={cn('flex items-center gap-2 rounded-lg px-3 py-2 text-sm transition-colors', aba === id ? 'bg-muted font-semibold' : 'text-muted-foreground hover:text-foreground')}
            >
              <Icone className={cn('size-4', aba === id && 'text-primary')} />{rotulo}
              {pendentes[id] > 0 && <span className="rounded-full bg-primary px-1.5 py-0.5 text-[11px] font-bold leading-none text-primary-foreground">{pendentes[id]}</span>}
            </button>
          ))}
        </div>
        <div className="ml-auto flex items-center gap-2">
          <div role="group" aria-label="Filtro" className="inline-flex rounded-lg border border-border p-0.5 text-xs" data-ajuda="direct.filtro">
            {(['pendentes', 'todas'] as const).map((f) => (
              <button key={f} type="button" aria-pressed={filtro === f} onClick={() => setFiltro(f)}
                className={cn('rounded-md px-2.5 py-1', filtro === f ? 'bg-foreground text-background' : 'text-muted-foreground hover:text-foreground')}>
                {f === 'pendentes' ? 'Pendentes' : 'Todas'}
              </button>
            ))}
          </div>
          <Button variant="ghost" size="sm" onClick={() => void buscar()} disabled={carregando} data-ajuda="direct.atualizar" aria-label="Atualizar">
            {carregando ? <Loader2 className="size-4 animate-spin" /> : <RefreshCw className="size-4" />}<span className="hidden sm:inline">Atualizar</span>
          </Button>
        </div>
      </div>

      {!situacaoGuardada && (
        <p className="border-b border-border bg-warning/10 px-5 py-2 text-xs text-warning-foreground">
          A situação compartilhada (quem respondeu, o que foi resolvido) ainda não foi instalada no banco. As respostas saem normalmente.
        </p>
      )}

      <section className="min-h-[420px]" data-ajuda="direct.conteudo">
        {carregando && !fila && (
          <div className="p-12 text-center text-sm text-muted-foreground">
            <Loader2 className="mx-auto mb-3 size-6 animate-spin" />Consultando as redes…
          </div>
        )}
        {fila?.erro && <p className="px-5 py-6 text-sm text-destructive">{fila.erro}</p>}

        {aba === 'mensagens' && fila && !fila.erro && (
          dmAberta ? (
            <Conversa
              mensagem={dmAberta}
              ecos={ecosDm[dmAberta.id] ?? []}
              situacao={situacao(dmAberta)}
              registro={registros[dmAberta.id]}
              aoVoltar={() => setAbertoId(null)}
              aoEnviar={(texto) => enviarDm(dmAberta, texto)}
              aoResolver={(v) => resolver(dmAberta, v)}
            />
          ) : (
            <ListaDeConversas
              dms={dms} filtro={filtro} situacao={situacao} registros={registros} ecos={ecosDm}
              aoAbrir={setAbertoId} carregando={carregando} verTodas={() => setFiltro('todas')}
            />
          )
        )}

        {aba === 'comentarios' && fila && !fila.erro && (
          <Comentarios
            comentarios={comentarios} filtro={filtro} situacao={situacao} registros={registros}
            escondidos={escondidos} ecos={ecosComentario} carregando={carregando} verTodas={() => setFiltro('todas')}
            aoResponder={responderComentarioDaTela} aoEsconder={trocarVisibilidade} aoResolver={resolver}
          />
        )}
      </section>

      {/* ---- avisos, recolhidos: informação de rodapé não pode competir com a fila ---- */}
      {(avisos.length > 0 || foraDoAlcance.length > 0) && (
        <div className="border-t border-border bg-muted/30" data-ajuda="direct.avisos">
          <button type="button" onClick={() => setAvisosAbertos((v) => !v)} aria-expanded={avisosAbertos}
            className="flex w-full items-center gap-2 px-5 py-3 text-left text-xs font-medium text-muted-foreground hover:text-foreground">
            <ChevronDown className={cn('size-4 transition-transform', avisosAbertos && 'rotate-180')} />
            {avisos.length > 0
              ? `${avisos.length} ${avisos.length === 1 ? 'rede não respondeu' : 'redes não responderam'} · o que não é atendido aqui`
              : 'O que não é atendido por esta tela'}
          </button>
          {avisosAbertos && (
            <div className="space-y-2 px-5 pb-4 text-xs leading-relaxed text-muted-foreground">
              {avisos.map((aviso, i) => (
                <p key={`a${i}`} className="flex items-start gap-1.5"><AlertTriangle className="mt-0.5 size-3 shrink-0 text-warning" />{aviso}</p>
              ))}
              {foraDoAlcance.map((f) => (
                <p key={f.canal}><strong className="text-foreground">{rede(f.canal).nome}:</strong> {f.motivo}</p>
              ))}
            </div>
          )}
        </div>
      )}
    </Card>
  )

  async function enviarDm(m: Mensagem, texto: string) {
    const dados = new FormData()
    dados.set('origem', 'dm'); dados.set('canal', m.canal); dados.set('texto', texto); dados.set('chave', m.id)
    if (m.destinatarioId) dados.set('destinatarioId', m.destinatarioId)
    const r = await enviar(dados)
    if (r.erro) { setRecado({ tom: 'erro', texto: r.erro }); return false }
    // O eco no chat: a mensagem aparece no balão na hora, como na rede.
    setEcosDm((antes) => ({ ...antes, [m.id]: [...(antes[m.id] ?? []), { id: `eco:${Date.now()}`, texto, quando: new Date().toISOString(), nossa: true, autor: 'Você' }] }))
    guardar(m, r)
    if (r.registro === null && situacaoGuardada) setRecado({ tom: 'erro', texto: 'A mensagem saiu, mas não deu para marcar como respondida para a equipe.' })
    return true
  }

  async function responderComentarioDaTela(m: Mensagem, texto: string) {
    const dados = new FormData()
    dados.set('origem', 'comentario'); dados.set('canal', m.canal); dados.set('texto', texto); dados.set('chave', m.id)
    if (m.comentarioId) dados.set('comentarioId', m.comentarioId)
    if (m.postId) dados.set('postId', m.postId)
    const r = await enviar(dados)
    if (r.erro) { setRecado({ tom: 'erro', texto: r.erro }); return false }
    setEcosComentario((antes) => ({ ...antes, [m.id]: { texto, quando: new Date().toISOString() } }))
    guardar(m, r)
    setRecado({ tom: 'ok', texto: r.recado ?? 'Resposta publicada.' })
    return true
  }

  async function trocarVisibilidade(m: Mensagem) {
    if (!m.comentarioId) return
    const estaEscondido = escondidos.has(m.id)
    const dados = new FormData()
    dados.set('canal', m.canal); dados.set('comentarioId', m.comentarioId)
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

/* ================================================================== */
/* Mensagens: a lista de conversas e o chat                            */
/* ================================================================== */

function TextoDaFala({ texto, semTexto }: { texto: string; semTexto?: boolean }) {
  if (!semTexto) return <>{texto}</>
  return <span className="inline-flex items-center gap-1 italic"><Paperclip className="size-3.5 shrink-0" />{texto}</span>
}

function ListaDeConversas({ dms, filtro, situacao, registros, ecos, aoAbrir, carregando, verTodas }: {
  dms: Mensagem[]; filtro: Filtro; situacao: (m: Mensagem) => Situacao; registros: Record<string, Registro>
  ecos: Record<string, Fala[]>; aoAbrir: (id: string) => void; carregando: boolean; verTodas: () => void
}) {
  if (!dms.length) return <Vazio texto={carregando ? 'Buscando conversas…' : 'Nenhuma mensagem direta nas conversas recentes.'} />
  const visiveis = filtro === 'pendentes' ? dms.filter((m) => situacao(m) === 'pendente') : dms
  if (!visiveis.length) return <Vazio texto="Nenhuma conversa esperando resposta. Tudo em dia." acao={{ rotulo: 'Ver todas as conversas', aoClicar: verTodas }} />
  // Pendentes primeiro; dentro de cada grupo, a mais recente em cima (a ordem do conector).
  const ordenadas = [...visiveis].sort((a, b) => Number(situacao(b) === 'pendente') - Number(situacao(a) === 'pendente'))

  return (
    <ul className="divide-y divide-border">
      {ordenadas.map((m) => {
        const s = situacao(m)
        const eco = ecos[m.id]?.at(-1)
        const nossaUltima = m.conversa?.at(-1)?.nossa
        return (
          <li key={m.id}>
            <button type="button" onClick={() => aoAbrir(m.id)} className="flex w-full items-center gap-3 px-4 py-3.5 text-left transition-colors hover:bg-muted/40 sm:px-5">
              <Rosto nome={m.autor} foto={m.foto} classe="bg-pink-500/12 text-pink-700" tamanho="size-11" />
              <span className="min-w-0 flex-1">
                <span className="flex items-baseline gap-2">
                  <span className={cn('truncate', s === 'pendente' ? 'font-bold' : 'font-medium')}>@{m.autor}</span>
                  <span className="ml-auto shrink-0 text-[11px] text-muted-foreground">{quando(eco?.quando ?? m.quando)}</span>
                </span>
                <span className={cn('mt-0.5 block truncate text-sm', s === 'pendente' ? 'text-foreground' : 'text-muted-foreground')}>
                  {eco ? `Você: ${eco.texto}` : <>{nossaUltima ? 'Nós: ' : ''}<TextoDaFala texto={m.texto} semTexto={m.semTexto} /></>}
                </span>
                <span className="mt-1 block"><Selo situacao={s} registro={registros[m.id]} /></span>
              </span>
            </button>
          </li>
        )
      })}
    </ul>
  )
}

function Conversa({ mensagem, ecos, situacao, registro, aoVoltar, aoEnviar, aoResolver }: {
  mensagem: Mensagem; ecos: Fala[]; situacao: Situacao; registro?: Registro
  aoVoltar: () => void; aoEnviar: (texto: string) => Promise<boolean>; aoResolver: (resolvida: boolean) => Promise<void>
}) {
  const [texto, setTexto] = useState('')
  const [enviando, comecar] = useTransition()
  const [mudando, mudar] = useTransition()
  const fimRef = useRef<HTMLDivElement>(null)
  const falas = useMemo(() => [...(mensagem.conversa ?? []), ...ecos], [mensagem.conversa, ecos])

  useEffect(() => { fimRef.current?.scrollIntoView({ block: 'end' }) }, [falas.length])

  return (
    <div className="flex h-full flex-col">
      <div className="flex flex-wrap items-center gap-3 border-b border-border px-4 py-3">
        <button type="button" onClick={aoVoltar} aria-label="Voltar para as conversas" className="rounded-lg p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground">
          <ArrowLeft className="size-4" />
        </button>
        <Rosto nome={mensagem.autor} foto={mensagem.foto} classe="bg-pink-500/12 text-pink-700" />
        <div className="min-w-0 flex-1">
          <p className="flex items-center gap-1 truncate font-semibold"><AtSign className="size-3.5 text-muted-foreground" />{mensagem.autor}</p>
          <p className="mt-0.5"><Selo situacao={situacao} registro={registro} /></p>
        </div>
        {mensagem.identidadeIncerta && <span className="rounded bg-warning/20 px-1.5 py-0.5 text-[11px] font-medium text-warning-foreground">confira quem escreveu</span>}
        <div className="flex gap-1.5" data-ajuda="direct.resolver">
          {situacao === 'pendente' ? (
            <Button type="button" variant="outline" size="sm" disabled={mudando} onClick={() => mudar(() => aoResolver(true))}><CircleCheck />Não precisa responder</Button>
          ) : situacao === 'resolvida' ? (
            <Button type="button" variant="ghost" size="sm" disabled={mudando} onClick={() => mudar(() => aoResolver(false))}><RotateCcw />Reabrir</Button>
          ) : null}
          <a href={DIRECT_DO_INSTAGRAM} target="_blank" rel="noreferrer" className="inline-flex h-7 items-center gap-1 rounded-md px-2.5 text-[0.8rem] font-medium text-primary hover:bg-muted">
            Abrir no Instagram <ExternalLink className="size-3" />
          </a>
        </div>
      </div>

      <div className="max-h-[55vh] min-h-[260px] flex-1 overflow-y-auto p-4">
        <div className="flex flex-col gap-1.5">
          {falas.map((f, i) => (
            <div key={`${f.id}:${i}`} className={cn('flex max-w-[78%] flex-col', f.nossa ? 'self-end items-end' : 'self-start items-start')}>
              {f.imagem && <img src={f.imagem} alt="Anexo da mensagem" className="mb-1 max-h-60 rounded-2xl border border-border object-cover" />}
              <p className={cn(
                'whitespace-pre-wrap break-words rounded-2xl px-3.5 py-2 text-sm leading-relaxed',
                f.nossa ? 'rounded-br-md bg-primary text-primary-foreground' : 'rounded-bl-md bg-muted',
              )}>
                <TextoDaFala texto={f.texto} semTexto={f.semTexto} />
              </p>
              {f.semTexto && !f.imagem && <span className="mt-0.5 px-1 text-[10px] text-muted-foreground">Só dá para ver no Instagram</span>}
              {f.quando && <span className="mt-0.5 px-1 text-[10px] text-muted-foreground">{horaDoBalao(f.quando)}</span>}
            </div>
          ))}
          <div ref={fimRef} />
        </div>
      </div>

      {mensagem.respondivel ? (
        <form
          className="flex items-center gap-2 border-t border-border p-3"
          onSubmit={(e) => {
            e.preventDefault()
            if (!texto.trim()) return
            comecar(async () => { if (await aoEnviar(texto.trim())) setTexto('') })
          }}
        >
          <input
            value={texto} onChange={(e) => setTexto(e.target.value)} maxLength={2000} autoFocus
            aria-label={`Mensagem para ${mensagem.autor}`} placeholder="Mensagem…"
            className="min-w-0 flex-1 rounded-full border border-border bg-background px-4 py-2.5 text-sm outline-none focus:border-primary"
          />
          <Button type="submit" size="sm" className="rounded-full" disabled={enviando || !texto.trim()} aria-label="Enviar mensagem">
            {enviando ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
          </Button>
        </form>
      ) : (
        <p className="flex items-start gap-1.5 border-t border-border bg-muted/50 px-4 py-3 text-xs leading-relaxed text-muted-foreground">
          <AlertTriangle className="mt-0.5 size-3.5 shrink-0 text-warning" />
          {mensagem.motivo ?? 'Esta conversa não aceita resposta por aqui.'}
        </p>
      )}
    </div>
  )
}

/* ================================================================== */
/* Comentários: agrupados por publicação, como na rede                 */
/* ================================================================== */

function Comentarios({ comentarios, filtro, situacao, registros, escondidos, ecos, carregando, verTodas, aoResponder, aoEsconder, aoResolver }: {
  comentarios: Mensagem[]; filtro: Filtro; situacao: (m: Mensagem) => Situacao; registros: Record<string, Registro>
  escondidos: Set<string>; ecos: Record<string, { texto: string; quando: string }>; carregando: boolean; verTodas: () => void
  aoResponder: (m: Mensagem, texto: string) => Promise<boolean>
  aoEsconder: (m: Mensagem) => Promise<void>
  aoResolver: (m: Mensagem, resolvida: boolean) => Promise<void>
}) {
  const [canal, setCanal] = useState('todos')
  const canais = useMemo(() => [...new Set(comentarios.map((m) => m.canal))].sort(), [comentarios])
  const filtrados = comentarios.filter((m) => (canal === 'todos' || m.canal === canal) && (filtro === 'todas' || situacao(m) === 'pendente'))

  /** Um grupo por publicação: o comentário se lê debaixo do post dele. */
  const grupos = useMemo(() => {
    const porPost = new Map<string, { canal: string; titulo?: string; url?: string; itens: Mensagem[] }>()
    for (const m of filtrados) {
      const chave = `${m.canal}:${m.postId ?? 'sem-post'}`
      const grupo = porPost.get(chave) ?? { canal: m.canal, titulo: m.postTitulo, url: m.postUrl, itens: [] }
      grupo.itens.push(m)
      porPost.set(chave, grupo)
    }
    return [...porPost.values()]
  }, [filtrados])

  if (!comentarios.length) return <Vazio texto={carregando ? 'Buscando comentários…' : 'Nenhum comentário nas publicações recentes.'} />

  return (
    <div>
      {canais.length > 1 && (
        <div className="flex flex-wrap gap-1 border-b border-border px-4 py-2.5" data-ajuda="direct.redes">
          {['todos', ...canais].map((id) => (
            <button key={id} type="button" onClick={() => setCanal(id)} aria-pressed={canal === id}
              className={cn('rounded-md px-2.5 py-1 text-xs font-medium transition-colors', canal === id ? 'bg-muted text-foreground' : 'text-muted-foreground hover:text-foreground')}>
              {id === 'todos' ? 'Todas as redes' : rede(id).nome}
            </button>
          ))}
        </div>
      )}

      {!grupos.length && <Vazio texto="Nenhum comentário esperando resposta. Tudo em dia." acao={filtro === 'pendentes' ? { rotulo: 'Ver todos os comentários', aoClicar: verTodas } : undefined} />}

      {grupos.map((grupo, gi) => (
        <section key={gi} className="border-b border-border last:border-b-0">
          <div className="flex items-center gap-2 bg-muted/40 px-4 py-2.5">
            <span className={cn('rounded px-1.5 py-0.5 text-[11px] font-medium', rede(grupo.canal).classe)}>{rede(grupo.canal).nome}</span>
            <p className="min-w-0 flex-1 truncate text-xs font-medium text-muted-foreground">{grupo.titulo ?? 'Publicação'}</p>
            {grupo.url && (
              <a href={grupo.url} target="_blank" rel="noreferrer" className="inline-flex shrink-0 items-center gap-1 text-xs text-primary hover:underline">
                ver publicação <ExternalLink className="size-3" />
              </a>
            )}
          </div>
          <ul>
            {grupo.itens.map((m) => (
              <Comentario
                key={m.id} mensagem={m} situacao={situacao(m)} registro={registros[m.id]}
                escondido={escondidos.has(m.id)} eco={ecos[m.id]}
                aoResponder={(texto) => aoResponder(m, texto)} aoEsconder={() => aoEsconder(m)} aoResolver={(v) => aoResolver(m, v)}
              />
            ))}
          </ul>
        </section>
      ))}
    </div>
  )
}

function Comentario({ mensagem, situacao, registro, escondido, eco, aoResponder, aoEsconder, aoResolver }: {
  mensagem: Mensagem; situacao: Situacao; registro?: Registro; escondido: boolean; eco?: { texto: string; quando: string }
  aoResponder: (texto: string) => Promise<boolean>; aoEsconder: () => Promise<void>; aoResolver: (resolvida: boolean) => Promise<void>
}) {
  const [abrindo, setAbrindo] = useState(false)
  const [texto, setTexto] = useState('')
  const [enviando, comecar] = useTransition()
  const [mudando, mudar] = useTransition()
  const r = rede(mensagem.canal)

  return (
    <li className={cn('px-4 py-3', escondido && 'opacity-55')}>
      <div className="flex gap-3">
        <span className="mt-0.5"><Rosto nome={mensagem.autor} foto={mensagem.foto} classe={r.classe} tamanho="size-8" /></span>
        <div className="min-w-0 flex-1">
          <p className="text-sm leading-relaxed">
            <span className="font-semibold">{mensagem.autor}</span>{' '}
            <span className="whitespace-pre-wrap break-words">{mensagem.texto}</span>
          </p>
          <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
            {mensagem.quando && <span>{quando(mensagem.quando)}</span>}
            <Selo situacao={situacao} registro={registro} />
            {mensagem.respondivel && !abrindo && !eco && (
              <button type="button" onClick={() => setAbrindo(true)} className="font-semibold hover:text-foreground">Responder</button>
            )}
            {situacao === 'pendente' && (
              <button type="button" disabled={mudando} onClick={() => mudar(() => aoResolver(true))} className="hover:text-foreground">Não precisa responder</button>
            )}
            {situacao !== 'pendente' && (
              <button type="button" disabled={mudando} onClick={() => mudar(() => aoResolver(false))} className="inline-flex items-center gap-1 hover:text-foreground"><RotateCcw className="size-3" />Reabrir</button>
            )}
            {mensagem.comentarioId && (
              <button type="button" onClick={() => void aoEsconder()} className="inline-flex items-center gap-1 hover:text-foreground">
                {escondido ? <><Eye className="size-3" />Mostrar</> : <><EyeOff className="size-3" />Esconder</>}
              </button>
            )}
            {escondido && <span className="rounded bg-secondary px-1.5 py-0.5 font-medium text-secondary-foreground">Escondido do público</span>}
            {mensagem.formatoDesconhecido && <span className="rounded bg-warning/20 px-1.5 py-0.5 font-medium text-warning-foreground">formato não reconhecido</span>}
          </div>

          {!mensagem.respondivel && mensagem.motivo && (
            <p className="mt-2 flex items-start gap-1.5 rounded-lg bg-muted/70 px-3 py-2 text-xs leading-relaxed text-muted-foreground">
              <AlertTriangle className="mt-0.5 size-3 shrink-0 text-warning" />{mensagem.motivo}
            </p>
          )}

          {eco && (
            <div className="mt-2 flex gap-2 border-l-2 border-border pl-3">
              <div className="min-w-0">
                <p className="text-sm leading-relaxed"><span className="font-semibold text-primary">Você</span>{' '}<span className="whitespace-pre-wrap break-words">{eco.texto}</span></p>
                <p className="mt-0.5 text-[11px] text-muted-foreground">{quando(eco.quando)} · publicada</p>
              </div>
            </div>
          )}

          {abrindo && (
            <form
              className="mt-2 flex items-center gap-2"
              onSubmit={(e) => {
                e.preventDefault()
                if (!texto.trim()) return
                comecar(async () => { if (await aoResponder(texto.trim())) { setTexto(''); setAbrindo(false) } })
              }}
            >
              <input
                value={texto} onChange={(e) => setTexto(e.target.value)} maxLength={2000} autoFocus
                aria-label={`Resposta para ${mensagem.autor}`} placeholder={`Responder ${mensagem.autor}… (fica pública)`}
                className="min-w-0 flex-1 rounded-full border border-border bg-background px-4 py-2 text-sm outline-none focus:border-primary"
              />
              <Button type="submit" size="sm" className="rounded-full" disabled={enviando || !texto.trim()} aria-label="Publicar resposta">
                {enviando ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
              </Button>
              <Button type="button" size="sm" variant="ghost" onClick={() => { setAbrindo(false); setTexto('') }}>Cancelar</Button>
            </form>
          )}
        </div>
      </div>
    </li>
  )
}

function Vazio({ texto, acao }: { texto: string; acao?: { rotulo: string; aoClicar: () => void } }) {
  return (
    <div className="p-12 text-center">
      <CheckCircle2 className="mx-auto size-8 text-success" />
      <p className="mx-auto mt-3 max-w-md text-sm leading-relaxed text-muted-foreground">{texto}</p>
      {acao && <Button type="button" variant="outline" size="sm" className="mt-3" onClick={acao.aoClicar}>{acao.rotulo}</Button>}
    </div>
  )
}
