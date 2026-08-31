'use client'

import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from 'react'
import Link from 'next/link'
import {
  AlertTriangle, Archive, ArrowLeft, ArrowRight, AtSign, CheckCircle2, ChevronDown,
  ExternalLink, Eye, EyeOff, Loader2, Mail, MessageCircle, MessageSquare, RefreshCw, Send, X,
} from 'lucide-react'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { carregarFila, responder, esconder, type Fila } from '@/app/actions/atendimento'
import { archiveInboxItem, convertInboxToPauta } from '@/app/actions/editorial'
import type { Fala, Mensagem } from '@/lib/atendimento/normalizar'

/**
 * A Caixa de Entrada em pastas, como um atendimento de verdade.
 *
 * Três pastas — Mensagens, Comentários, E-mail e materiais — porque três
 * coisas diferentes chegam aqui e cada uma se lê de um jeito. E cada uma abre
 * o mais perto possível da rede de origem: a DM vira o chat inteiro em balões,
 * como no Direct; o comentário aparece sob a publicação dele, como no
 * Instagram; o material interno abre como um e-mail. Uma fila achatada
 * mostrava uma fala solta sem o antes e o depois — e quem atende precisa da
 * conversa, não do fragmento.
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

/** Um material interno (formulário, e-mail encaminhado, registro de atividade). */
export type ItemInterno = {
  id: string
  titulo: string
  resumo: string
  tipo: string
  coordenacao: string
  remetente: string
  quando: string
  status: string
}

type Pasta = 'mensagens' | 'comentarios' | 'internos'

const PASTAS: { id: Pasta; rotulo: string; icone: typeof Mail; descricao: string }[] = [
  { id: 'mensagens', rotulo: 'Mensagens', icone: MessageSquare, descricao: 'Direct do Instagram' },
  { id: 'comentarios', rotulo: 'Comentários', icone: MessageCircle, descricao: 'Nas publicações' },
  { id: 'internos', rotulo: 'E-mail e materiais', icone: Mail, descricao: 'O que chegou por dentro' },
]

export function CaixaDeAtendimento({
  internos,
  atalhos,
  carregar = carregarFila,
  enviar = responder,
  alternarVisibilidade = esconder,
}: {
  internos: ItemInterno[]
  atalhos: { rascunhos: number; aprovacoes: number }
  carregar?: () => Promise<Fila>
  enviar?: (dados: FormData) => Promise<{ erro?: string; recado?: string }>
  alternarVisibilidade?: (dados: FormData) => Promise<{ erro?: string; recado?: string }>
}) {
  const [fila, setFila] = useState<Fila | null>(null)
  const [carregando, setCarregando] = useState(true)
  const [pasta, setPasta] = useState<Pasta>('mensagens')
  const [abertoId, setAbertoId] = useState<string | null>(null)
  const [recado, setRecado] = useState<{ tom: 'ok' | 'erro'; texto: string } | null>(null)
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

  const mensagens = fila?.mensagens ?? []
  const dms = useMemo(() => mensagens.filter((m) => m.origem === 'dm'), [mensagens])
  const comentarios = useMemo(() => mensagens.filter((m) => m.origem === 'comentario'), [mensagens])

  /** Uma DM respondida nesta sessão deixa de esperar, mesmo sem recarregar. */
  const aguardandoDm = (m: Mensagem) => m.aguardandoResposta !== false && !ecosDm[m.id]?.length

  const esperandoDms = dms.filter(aguardandoDm).length
  const esperandoComentarios = comentarios.filter((m) => !ecosComentario[m.comentarioId ?? m.id]).length
  const novosInternos = internos.filter((i) => i.status === 'new').length

  const contagem: Record<Pasta, number> = {
    mensagens: esperandoDms,
    comentarios: esperandoComentarios,
    internos: novosInternos,
  }

  const avisos = fila?.avisos ?? []
  const foraDoAlcance = fila?.foraDoAlcance ?? []

  const dmAberta = pasta === 'mensagens' ? dms.find((m) => m.id === abertoId) : undefined
  const internoAberto = pasta === 'internos' ? internos.find((i) => i.id === abertoId) : undefined

  function trocarPasta(p: Pasta) {
    setPasta(p)
    setAbertoId(null)
  }

  return (
    <Card className="mb-6 overflow-hidden">
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

      <div className="md:grid md:grid-cols-[230px_1fr]">
        {/* ---- as pastas ---- */}
        <aside className="border-b border-border bg-muted/30 md:border-b-0 md:border-r">
          <nav className="flex gap-1 overflow-x-auto p-2 md:flex-col md:p-3" aria-label="Pastas da caixa de entrada">
            {PASTAS.map(({ id, rotulo, icone: Icone, descricao }) => (
              <button
                key={id}
                onClick={() => trocarPasta(id)}
                aria-current={pasta === id}
                className={cn(
                  'flex shrink-0 items-center gap-2.5 rounded-lg px-3 py-2.5 text-left text-sm transition-colors',
                  pasta === id ? 'bg-background font-semibold shadow-sm' : 'text-muted-foreground hover:bg-background/60 hover:text-foreground',
                )}
              >
                <Icone className={cn('size-4 shrink-0', pasta === id && 'text-primary')} />
                <span className="min-w-0">
                  <span className="block leading-tight">{rotulo}</span>
                  <span className="hidden text-[11px] font-normal text-muted-foreground md:block">{descricao}</span>
                </span>
                {contagem[id] > 0 && (
                  <span className="ml-auto rounded-full bg-primary px-1.5 py-0.5 text-[11px] font-bold leading-none text-primary-foreground">
                    {contagem[id]}
                  </span>
                )}
              </button>
            ))}
            {/* no celular a coluna vira faixa e o Atualizar entra nela */}
            <button
              onClick={() => void buscar()}
              disabled={carregando}
              aria-label="Atualizar"
              className="ml-auto shrink-0 rounded-lg px-3 py-2.5 text-muted-foreground hover:text-foreground md:hidden"
            >
              {carregando ? <Loader2 className="size-4 animate-spin" /> : <RefreshCw className="size-4" />}
            </button>
          </nav>

          <div className="hidden border-t border-border p-3 md:block">
            <Button variant="ghost" size="sm" className="w-full justify-start text-muted-foreground" onClick={() => void buscar()} disabled={carregando}>
              {carregando ? <Loader2 className="size-4 animate-spin" /> : <RefreshCw className="size-4" />}
              Atualizar
            </Button>
            {(atalhos.rascunhos > 0 || atalhos.aprovacoes > 0) && (
              <div className="mt-2 space-y-1 border-t border-border pt-2 text-xs text-muted-foreground">
                {atalhos.rascunhos > 0 && (
                  <Link href="/conteudos" className="flex items-center justify-between rounded px-2 py-1 hover:bg-background/60 hover:text-foreground">
                    Meus rascunhos <span>{atalhos.rascunhos}</span>
                  </Link>
                )}
                {atalhos.aprovacoes > 0 && (
                  <Link href="/aprovacoes" className="flex items-center justify-between rounded px-2 py-1 hover:bg-background/60 hover:text-foreground">
                    Aguardando aprovação <span>{atalhos.aprovacoes}</span>
                  </Link>
                )}
              </div>
            )}
          </div>
        </aside>

        {/* ---- o conteúdo da pasta ---- */}
        <section className="min-h-[420px]">
          {pasta !== 'internos' && carregando && !fila && (
            <div className="p-12 text-center text-sm text-muted-foreground">
              <Loader2 className="mx-auto mb-3 size-6 animate-spin" />
              Consultando as redes…
            </div>
          )}

          {pasta !== 'internos' && fila?.erro && (
            <p className="px-5 py-6 text-sm text-destructive">{fila.erro}</p>
          )}

          {pasta === 'mensagens' && fila && !fila.erro && (
            dmAberta ? (
              <Conversa
                mensagem={dmAberta}
                ecos={ecosDm[dmAberta.id] ?? []}
                aoVoltar={() => setAbertoId(null)}
                aoEnviar={(texto) => enviarDm(dmAberta, texto)}
              />
            ) : (
              <ListaDeConversas dms={dms} ecos={ecosDm} aoAbrir={setAbertoId} carregando={carregando} />
            )
          )}

          {pasta === 'comentarios' && fila && !fila.erro && (
            <Comentarios
              comentarios={comentarios}
              escondidos={escondidos}
              ecos={ecosComentario}
              aoResponder={(m, texto) => responderComentarioDaTela(m, texto)}
              aoEsconder={(m) => trocarVisibilidade(m)}
              carregando={carregando}
            />
          )}

          {pasta === 'internos' && (
            internoAberto ? (
              <Leitura item={internoAberto} aoVoltar={() => setAbertoId(null)} />
            ) : (
              <ListaDeInternos itens={internos} aoAbrir={setAbertoId} />
            )
          )}
        </section>
      </div>

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

  async function enviarDm(m: Mensagem, texto: string) {
    const dados = new FormData()
    dados.set('origem', 'dm')
    dados.set('canal', m.canal)
    dados.set('texto', texto)
    if (m.destinatarioId) dados.set('destinatarioId', m.destinatarioId)

    const r = await enviar(dados)
    if (r.erro) { setRecado({ tom: 'erro', texto: r.erro }); return false }
    // O eco no chat: a mensagem aparece no balão na hora, como na rede.
    setEcosDm((antes) => ({
      ...antes,
      [m.id]: [...(antes[m.id] ?? []), { id: `eco:${Date.now()}`, texto, quando: new Date().toISOString(), nossa: true, autor: 'Você' }],
    }))
    return true
  }

  async function responderComentarioDaTela(m: Mensagem, texto: string) {
    const dados = new FormData()
    dados.set('origem', 'comentario')
    dados.set('canal', m.canal)
    dados.set('texto', texto)
    if (m.comentarioId) dados.set('comentarioId', m.comentarioId)
    if (m.postId) dados.set('postId', m.postId)

    const r = await enviar(dados)
    if (r.erro) { setRecado({ tom: 'erro', texto: r.erro }); return false }
    setEcosComentario((antes) => ({
      ...antes,
      [m.comentarioId ?? m.id]: { texto, quando: new Date().toISOString() },
    }))
    setRecado({ tom: 'ok', texto: r.recado ?? 'Resposta publicada.' })
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

/* ================================================================== */
/* Pasta Mensagens: a lista de conversas e o chat                      */
/* ================================================================== */

function ListaDeConversas({ dms, ecos, aoAbrir, carregando }: {
  dms: Mensagem[]
  ecos: Record<string, Fala[]>
  aoAbrir: (id: string) => void
  carregando: boolean
}) {
  if (!dms.length) {
    return <Vazio texto={carregando ? 'Buscando conversas…' : 'Nenhuma mensagem direta nas conversas recentes.'} />
  }

  // Quem espera vem primeiro; conversa em dia continua acessível, atrás.
  const ordenadas = [...dms].sort((a, b) => {
    const ea = a.aguardandoResposta !== false && !ecos[a.id]?.length ? 0 : 1
    const eb = b.aguardandoResposta !== false && !ecos[b.id]?.length ? 0 : 1
    return ea - eb
  })

  return (
    <ul className="divide-y divide-border">
      {ordenadas.map((m) => {
        const emDia = m.aguardandoResposta === false || Boolean(ecos[m.id]?.length)
        const eco = ecos[m.id]?.at(-1)
        return (
          <li key={m.id}>
            <button
              onClick={() => aoAbrir(m.id)}
              className="flex w-full items-center gap-3 px-5 py-3.5 text-left transition-colors hover:bg-muted/40"
            >
              <span aria-hidden className="flex size-11 shrink-0 items-center justify-center rounded-full bg-pink-500/12 text-sm font-bold text-pink-700">
                {iniciais(m.autor)}
              </span>
              <span className="min-w-0 flex-1">
                <span className="flex items-baseline gap-2">
                  <span className={cn('truncate', emDia ? 'font-medium' : 'font-bold')}>{m.autor}</span>
                  <span className="ml-auto shrink-0 text-[11px] text-muted-foreground">{quando(eco?.quando ?? m.quando)}</span>
                </span>
                <span className={cn('mt-0.5 block truncate text-sm', emDia ? 'text-muted-foreground' : 'text-foreground')}>
                  {eco ? `Você: ${eco.texto}` : m.conversa?.at(-1)?.nossa ? `Você: ${m.texto}` : m.texto}
                </span>
              </span>
              {!emDia && <span aria-label="Esperando resposta" className="size-2.5 shrink-0 rounded-full bg-primary" />}
            </button>
          </li>
        )
      })}
    </ul>
  )
}

function Conversa({ mensagem, ecos, aoVoltar, aoEnviar }: {
  mensagem: Mensagem
  ecos: Fala[]
  aoVoltar: () => void
  aoEnviar: (texto: string) => Promise<boolean>
}) {
  const [texto, setTexto] = useState('')
  const [enviando, comecar] = useTransition()
  const fimRef = useRef<HTMLDivElement>(null)

  const falas = useMemo(() => [...(mensagem.conversa ?? []), ...ecos], [mensagem.conversa, ecos])

  useEffect(() => {
    fimRef.current?.scrollIntoView({ block: 'end' })
  }, [falas.length])

  return (
    <div className="flex h-full flex-col">
      {/* cabeçalho da conversa, como no Direct */}
      <div className="flex items-center gap-3 border-b border-border px-4 py-3">
        <button onClick={aoVoltar} aria-label="Voltar para as conversas" className="rounded-lg p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground">
          <ArrowLeft className="size-4" />
        </button>
        <span aria-hidden className="flex size-9 items-center justify-center rounded-full bg-pink-500/12 text-xs font-bold text-pink-700">
          {iniciais(mensagem.autor)}
        </span>
        <div className="min-w-0 flex-1">
          <p className="flex items-center gap-1 truncate font-semibold"><AtSign className="size-3.5 text-muted-foreground" />{mensagem.autor}</p>
          <p className="text-[11px] text-muted-foreground">Instagram · mensagem direta</p>
        </div>
        {mensagem.identidadeIncerta && (
          <span className="rounded bg-warning/20 px-1.5 py-0.5 text-[11px] font-medium text-warning-foreground">confira quem escreveu</span>
        )}
      </div>

      {/* a conversa, em balões */}
      <div className="max-h-[55vh] min-h-[260px] flex-1 overflow-y-auto p-4">
        <div className="flex flex-col gap-1.5">
          {falas.map((f, i) => (
            <div key={`${f.id}:${i}`} className={cn('flex max-w-[78%] flex-col', f.nossa ? 'self-end items-end' : 'self-start items-start')}>
              <p className={cn(
                'whitespace-pre-wrap break-words rounded-2xl px-3.5 py-2 text-sm leading-relaxed',
                f.nossa ? 'rounded-br-md bg-primary text-primary-foreground' : 'rounded-bl-md bg-muted',
              )}>
                {f.texto}
              </p>
              {f.quando && <span className="mt-0.5 px-1 text-[10px] text-muted-foreground">{horaDoBalao(f.quando)}</span>}
            </div>
          ))}
          <div ref={fimRef} />
        </div>
      </div>

      {/* o campo de resposta, ou o motivo de ele não existir */}
      {mensagem.respondivel ? (
        <form
          className="flex items-center gap-2 border-t border-border p-3"
          onSubmit={(e) => {
            e.preventDefault()
            if (!texto.trim()) return
            comecar(async () => {
              const foi = await aoEnviar(texto.trim())
              if (foi) setTexto('')
            })
          }}
        >
          <input
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            maxLength={2000}
            autoFocus
            aria-label={`Mensagem para ${mensagem.autor}`}
            placeholder="Mensagem…"
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
/* Pasta Comentários: agrupados por publicação, como na rede           */
/* ================================================================== */

function Comentarios({ comentarios, escondidos, ecos, aoResponder, aoEsconder, carregando }: {
  comentarios: Mensagem[]
  escondidos: Set<string>
  ecos: Record<string, { texto: string; quando: string }>
  aoResponder: (m: Mensagem, texto: string) => Promise<boolean>
  aoEsconder: (m: Mensagem) => Promise<void>
  carregando: boolean
}) {
  const [canal, setCanal] = useState('todos')

  const canais = useMemo(() => [...new Set(comentarios.map((m) => m.canal))].sort(), [comentarios])
  const filtrados = canal === 'todos' ? comentarios : comentarios.filter((m) => m.canal === canal)

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

  if (!comentarios.length) {
    return <Vazio texto={carregando ? 'Buscando comentários…' : 'Nenhum comentário nas publicações recentes.'} />
  }

  return (
    <div>
      {canais.length > 1 && (
        <div className="flex flex-wrap gap-1 border-b border-border px-4 py-2.5">
          {['todos', ...canais].map((id) => (
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

      {grupos.map((grupo, gi) => (
        <section key={gi} className="border-b border-border last:border-b-0">
          {/* a publicação, como cabeçalho da conversa que acontece nela */}
          <div className="flex items-center gap-2 bg-muted/40 px-4 py-2.5">
            <span className={cn('rounded px-1.5 py-0.5 text-[11px] font-medium', rede(grupo.canal).classe)}>{rede(grupo.canal).nome}</span>
            <p className="min-w-0 flex-1 truncate text-xs font-medium text-muted-foreground">
              {grupo.titulo ?? 'Publicação'}
            </p>
            {grupo.url && (
              <a href={grupo.url} target="_blank" rel="noreferrer" className="inline-flex shrink-0 items-center gap-1 text-xs text-primary hover:underline">
                ver publicação <ExternalLink className="size-3" />
              </a>
            )}
          </div>

          <ul>
            {grupo.itens.map((m) => (
              <Comentario
                key={m.id}
                mensagem={m}
                escondido={escondidos.has(m.id)}
                eco={ecos[m.comentarioId ?? m.id]}
                aoResponder={(texto) => aoResponder(m, texto)}
                aoEsconder={() => aoEsconder(m)}
              />
            ))}
          </ul>
        </section>
      ))}
    </div>
  )
}

function Comentario({ mensagem, escondido, eco, aoResponder, aoEsconder }: {
  mensagem: Mensagem
  escondido: boolean
  eco?: { texto: string; quando: string }
  aoResponder: (texto: string) => Promise<boolean>
  aoEsconder: () => Promise<void>
}) {
  const [abrindo, setAbrindo] = useState(false)
  const [texto, setTexto] = useState('')
  const [enviando, comecar] = useTransition()
  const r = rede(mensagem.canal)

  return (
    <li className={cn('px-4 py-3', escondido && 'opacity-55')}>
      <div className="flex gap-3">
        <span aria-hidden className={cn('mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-full text-[11px] font-bold', r.classe)}>
          {iniciais(mensagem.autor)}
        </span>
        <div className="min-w-0 flex-1">
          {/* como na rede: nome e texto na mesma linha de leitura */}
          <p className="text-sm leading-relaxed">
            <span className="font-semibold">{mensagem.autor}</span>{' '}
            <span className="whitespace-pre-wrap break-words">{mensagem.texto}</span>
          </p>
          <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
            {mensagem.quando && <span>{quando(mensagem.quando)}</span>}
            {mensagem.respondivel && !abrindo && !eco && (
              <button onClick={() => setAbrindo(true)} className="font-semibold hover:text-foreground">Responder</button>
            )}
            {mensagem.comentarioId && (
              <button onClick={() => void aoEsconder()} className="inline-flex items-center gap-1 hover:text-foreground">
                {escondido ? <><Eye className="size-3" />Mostrar</> : <><EyeOff className="size-3" />Esconder</>}
              </button>
            )}
            {escondido && <span className="rounded bg-secondary px-1.5 py-0.5 font-medium text-secondary-foreground">Escondido do público</span>}
            {mensagem.formatoDesconhecido && (
              <span className="rounded bg-warning/20 px-1.5 py-0.5 font-medium text-warning-foreground">formato não reconhecido</span>
            )}
          </div>

          {!mensagem.respondivel && mensagem.motivo && (
            <p className="mt-2 flex items-start gap-1.5 rounded-lg bg-muted/70 px-3 py-2 text-xs leading-relaxed text-muted-foreground">
              <AlertTriangle className="mt-0.5 size-3 shrink-0 text-warning" />{mensagem.motivo}
            </p>
          )}

          {/* a nossa resposta, aninhada sob o comentário, como na rede */}
          {eco && (
            <div className="mt-2 flex gap-2 border-l-2 border-border pl-3">
              <div className="min-w-0">
                <p className="text-sm leading-relaxed">
                  <span className="font-semibold text-primary">Você</span>{' '}
                  <span className="whitespace-pre-wrap break-words">{eco.texto}</span>
                </p>
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
                comecar(async () => {
                  const foi = await aoResponder(texto.trim())
                  if (foi) { setTexto(''); setAbrindo(false) }
                })
              }}
            >
              <input
                value={texto}
                onChange={(e) => setTexto(e.target.value)}
                maxLength={2000}
                autoFocus
                aria-label={`Resposta para ${mensagem.autor}`}
                placeholder={`Responder ${mensagem.autor}… (fica pública)`}
                className="min-w-0 flex-1 rounded-full border border-border bg-background px-4 py-2 text-sm outline-none focus:border-primary"
              />
              <Button type="submit" size="sm" className="rounded-full" disabled={enviando || !texto.trim()} aria-label="Publicar resposta">
                {enviando ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
              </Button>
              <Button type="button" size="sm" variant="ghost" onClick={() => { setAbrindo(false); setTexto('') }}>
                Cancelar
              </Button>
            </form>
          )}
        </div>
      </div>
    </li>
  )
}

/* ================================================================== */
/* Pasta E-mail e materiais: lista e leitura, como um e-mail           */
/* ================================================================== */

function ListaDeInternos({ itens, aoAbrir }: { itens: ItemInterno[]; aoAbrir: (id: string) => void }) {
  if (!itens.length) {
    return <Vazio texto="Nenhum material recebido. O que chegar por formulário ou registro aparece aqui." />
  }
  return (
    <ul className="divide-y divide-border">
      {itens.map((item) => {
        const novo = item.status === 'new'
        return (
          <li key={item.id}>
            <button
              onClick={() => aoAbrir(item.id)}
              className="flex w-full items-center gap-3 px-5 py-3.5 text-left transition-colors hover:bg-muted/40"
            >
              <span aria-hidden className="flex size-9 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-bold text-muted-foreground">
                {iniciais(item.remetente || item.titulo)}
              </span>
              <span className="min-w-0 flex-1">
                <span className="flex items-baseline gap-2">
                  <span className={cn('truncate text-sm', novo ? 'font-bold' : 'font-medium')}>{item.remetente || 'Remetente não informado'}</span>
                  {item.tipo && <span className="shrink-0 rounded bg-primary/10 px-1.5 py-0.5 text-[10px] font-medium text-primary">{item.tipo}</span>}
                  <span className="ml-auto shrink-0 text-[11px] text-muted-foreground">{quando(item.quando)}</span>
                </span>
                <span className={cn('mt-0.5 block truncate text-sm', novo ? 'font-semibold' : 'text-muted-foreground')}>
                  {item.titulo}
                  {item.resumo && <span className="font-normal text-muted-foreground"> — {item.resumo}</span>}
                </span>
              </span>
              {novo && <span aria-label="Novo" className="size-2.5 shrink-0 rounded-full bg-primary" />}
            </button>
          </li>
        )
      })}
    </ul>
  )
}

function Leitura({ item, aoVoltar }: { item: ItemInterno; aoVoltar: () => void }) {
  const dataLonga = item.quando
    ? new Intl.DateTimeFormat('pt-BR', { dateStyle: 'long', timeStyle: 'short' }).format(new Date(item.quando))
    : ''
  return (
    <div>
      <div className="flex items-center gap-3 border-b border-border px-4 py-3">
        <button onClick={aoVoltar} aria-label="Voltar para a lista" className="rounded-lg p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground">
          <ArrowLeft className="size-4" />
        </button>
        <div className="min-w-0 flex-1">
          <p className="truncate font-semibold">{item.titulo}</p>
          <p className="truncate text-[11px] text-muted-foreground">
            De {item.remetente || 'remetente não informado'}{dataLonga ? ` · ${dataLonga}` : ''}
          </p>
        </div>
      </div>

      <div className="p-5">
        <div className="flex flex-wrap gap-2">
          {item.tipo && <span className="rounded-md bg-primary/10 px-2 py-1 text-xs text-primary">{item.tipo}</span>}
          <span className="rounded-md bg-muted px-2 py-1 text-xs">{item.coordenacao || 'Sem coordenação'}</span>
        </div>
        <div className="mt-4 whitespace-pre-wrap rounded-lg bg-muted/50 p-5 text-sm leading-relaxed">
          {item.resumo || 'Nenhuma descrição informada.'}
        </div>
        <div className="mt-5 flex flex-wrap gap-2">
          <form action={convertInboxToPauta}>
            <input type="hidden" name="id" value={item.id} />
            <Button type="submit" size="sm">Transformar em pauta <ArrowRight className="size-3.5" /></Button>
          </form>
          <form action={archiveInboxItem}>
            <input type="hidden" name="id" value={item.id} />
            <Button type="submit" variant="outline" size="sm"><Archive className="size-4" />Arquivar</Button>
          </form>
        </div>
      </div>
    </div>
  )
}

function Vazio({ texto }: { texto: string }) {
  return (
    <div className="p-12 text-center">
      <CheckCircle2 className="mx-auto size-8 text-success" />
      <p className="mx-auto mt-3 max-w-md text-sm leading-relaxed text-muted-foreground">{texto}</p>
    </div>
  )
}
