'use client'

import Link from 'next/link'
import { useEffect, useMemo, useRef, useState, useTransition } from 'react'
import { createPortal } from 'react-dom'
import { useRouter } from 'next/navigation'
import {
  AlertTriangle, Archive, CalendarDays, Check, CheckSquare, ExternalLink, FileText, Loader2, MessageSquare, Paperclip, Pencil, Plus,
  RotateCcw, Search, Tag, Trash2, X,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Avatar } from '@/components/ui/avatar'
import { privateAvatarUrl } from '@/lib/avatar-url'
import { createClient as clienteDoNavegador } from '@/lib/supabase/client'
import {
  adicionarItemDoChecklist, alternarEtiqueta, arquivarPautas, atualizarCartao, carregarChecklist, criarEtiqueta, criarPautaRapida,
  editarEtiqueta, excluirEtiqueta, listarArquivadas, marcarItemDoChecklist, moverPauta, removerItemDoChecklist, restaurarPauta,
  type Etiqueta, type ItemDoChecklist, type PautaArquivada,
} from '@/app/actions/quadro'
import {
  COLUNAS, COLUNAS_COM_CRIACAO, CORES_DE_ETIQUETA, ordenar, PASSO, posicaoEntre, PRIORIDADES, situacaoDoPrazo,
  type CorDeEtiqueta, type SituacaoDoPrazo, type StatusDoQuadro,
} from '@/lib/pautas/quadro'

export type PessoaDoQuadro = { id: string; nome: string; iniciais: string; cor: string | null; avatar: string | null }
export type CartaoDaPauta = {
  id: string
  titulo: string
  status: string
  prioridade: string
  prazo: string | null
  inicio: string | null
  responsavelId: string | null
  participantes: string[]
  etiquetas: string[]
  tipo: string
  coordenacao: string
  projeto: string
  posicao: number | null
  criadaEm: string
  checklist: { feitos: number; total: number }
  mensagens: number
  links: number
  conteudos: number
}

const campo = 'rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-ring focus:ring-2 focus:ring-ring/30'

/** Cor da etiqueta de prioridade — sempre com o nome escrito junto. */
const PRIORIDADE: Record<string, { rotulo: string; faixa: string; chip: string }> = {
  critical: { rotulo: 'Crítica', faixa: 'bg-red-600', chip: 'bg-red-600/12 text-red-700 dark:text-red-400' },
  high: { rotulo: 'Alta', faixa: 'bg-orange-500', chip: 'bg-orange-500/15 text-orange-700 dark:text-orange-400' },
  medium: { rotulo: 'Normal', faixa: 'bg-sky-500', chip: '' },
  low: { rotulo: 'Baixa', faixa: 'bg-slate-400', chip: '' },
}

const PRAZO: Record<SituacaoDoPrazo, string> = {
  atrasada: 'bg-destructive text-white',
  hoje: 'bg-amber-500 text-white',
  semana: 'bg-amber-500/15 text-amber-800 dark:text-amber-300',
  futura: 'bg-muted text-muted-foreground',
  sem: '',
}

/** "01 de set"; com o ano quando não é o ano corrente. */
const dataCurta = (iso: string, hoje: string) =>
  new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit', month: 'short', timeZone: 'UTC', ...(iso.slice(0, 4) !== hoje.slice(0, 4) ? { year: 'numeric' as const } : {}),
  }).format(new Date(`${iso}T12:00:00Z`)).replace('.', '')

function hojeLocal(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date())
}

/** Posições efetivas de uma coluna já ordenada: quem não tem posição (topo) ganha uma virtual abaixo da primeira. */
function efetivas(coluna: CartaoDaPauta[]): number[] {
  const primeiraReal = coluna.find((c) => c.posicao !== null)?.posicao ?? PASSO
  const nulos = coluna.filter((c) => c.posicao === null).length
  let i = 0
  return coluna.map((c) => (c.posicao !== null ? c.posicao : primeiraReal - PASSO * (nulos - i++)))
}

/** A etiqueta como aparece no cartão: cor de fundo da paleta, nome sempre escrito. */
function Chip({ etiqueta, grande = false }: { etiqueta: Etiqueta; grande?: boolean }) {
  return (
    <span className={`inline-flex max-w-full items-center truncate rounded font-semibold text-white ${grande ? 'px-2 py-0.5 text-xs' : 'px-1.5 text-[10px] leading-4'}`}
      style={{ backgroundColor: CORES_DE_ETIQUETA[etiqueta.cor]?.hex ?? CORES_DE_ETIQUETA.cinza.hex }}>
      {etiqueta.nome}
    </span>
  )
}

export function QuadroDePautas({ cartoes: iniciais, pessoas, etiquetas: etiquetasIniciais, eu, workspaceId, projetoId }: {
  cartoes: CartaoDaPauta[]
  pessoas: PessoaDoQuadro[]
  etiquetas: Etiqueta[]
  eu: string
  workspaceId: string
  projetoId: string | null
}) {
  const router = useRouter()
  const [cartoes, setCartoes] = useState(iniciais)
  const [etiquetas, setEtiquetas] = useState(etiquetasIniciais)
  const [filtroEtiqueta, setFiltroEtiqueta] = useState('todas')
  const [arquivadasAberto, setArquivadasAberto] = useState(false)
  const [aoVivo, setAoVivo] = useState(false)
  const arrastandoRef = useRef<string | null>(null)
  const [busca, setBusca] = useState('')
  const [responsavel, setResponsavel] = useState('todos')
  const [prioridade, setPrioridade] = useState('todas')
  const [prazo, setPrazo] = useState('todos')
  const [arrastando, setArrastando] = useState<string | null>(null)
  const [alvo, setAlvo] = useState<{ status: StatusDoQuadro; antesDe: string | null } | null>(null)
  const [aberto, setAberto] = useState<string | null>(null)
  const [aviso, setAviso] = useState('')
  const [hoje] = useState(hojeLocal)

  // O servidor é a fonte de verdade: quando a página recarrega, o quadro
  // adota o que veio (inclusive mudanças feitas por outras pessoas).
  const [vindosDoServidor, setVindosDoServidor] = useState(iniciais)
  if (vindosDoServidor !== iniciais) {
    setVindosDoServidor(iniciais)
    setCartoes(iniciais)
  }
  const [etiquetasDoServidor, setEtiquetasDoServidor] = useState(etiquetasIniciais)
  if (etiquetasDoServidor !== etiquetasIniciais) {
    setEtiquetasDoServidor(etiquetasIniciais)
    setEtiquetas(etiquetasIniciais)
  }

  // Ao vivo: qualquer mudança numa pauta ou etiqueta deste espaço (de outra
  // pessoa, de outra aba) recarrega o quadro. Com espera curta para juntar
  // rajadas, e sem recarregar no meio de um arrasto.
  useEffect(() => {
    let supabase: ReturnType<typeof clienteDoNavegador>
    try { supabase = clienteDoNavegador() } catch { return }
    let espera: ReturnType<typeof setTimeout> | undefined
    const atualizar = () => {
      clearTimeout(espera)
      espera = setTimeout(function tentar() {
        if (arrastandoRef.current) { espera = setTimeout(tentar, 500); return }
        router.refresh()
      }, 400)
    }
    const canal = supabase.channel(`quadro-de-pautas-${workspaceId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'pautas', filter: `workspace_id=eq.${workspaceId}` }, atualizar)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'etiquetas', filter: `workspace_id=eq.${workspaceId}` }, atualizar)
      .subscribe((estado: string) => setAoVivo(estado === 'SUBSCRIBED'))
    return () => { clearTimeout(espera); void supabase.removeChannel(canal) }
  }, [workspaceId, router])

  const etiquetaPorId = useMemo(() => new Map(etiquetas.map((e) => [e.id, e])), [etiquetas])

  const pessoaPorId = useMemo(() => new Map(pessoas.map((p) => [p.id, p])), [pessoas])

  const visiveis = useMemo(() => {
    const termo = busca.trim().toLowerCase()
    return cartoes.filter((c) => {
      const nomesDasEtiquetas = c.etiquetas.map((id) => etiquetaPorId.get(id)?.nome ?? '').join(' ')
      if (termo && !`${c.titulo} ${c.tipo} ${c.coordenacao} ${c.projeto} ${nomesDasEtiquetas}`.toLowerCase().includes(termo)) return false
      if (filtroEtiqueta === 'sem' && c.etiquetas.length) return false
      if (!['todas', 'sem'].includes(filtroEtiqueta) && !c.etiquetas.includes(filtroEtiqueta)) return false
      if (responsavel === 'eu' && c.responsavelId !== eu && !c.participantes.includes(eu)) return false
      if (responsavel === 'sem' && c.responsavelId) return false
      if (!['todos', 'eu', 'sem'].includes(responsavel) && c.responsavelId !== responsavel) return false
      if (prioridade !== 'todas' && c.prioridade !== prioridade) return false
      if (prazo !== 'todos') {
        const s = situacaoDoPrazo(c.prazo, hoje, c.status === 'approved')
        if (prazo === 'atrasadas' && s !== 'atrasada') return false
        if (prazo === 'semana' && !['hoje', 'semana', 'atrasada'].includes(s)) return false
        if (prazo === 'sem' && s !== 'sem') return false
      }
      return true
    })
  }, [cartoes, busca, responsavel, prioridade, prazo, eu, hoje, filtroEtiqueta, etiquetaPorId])

  const porColuna = useMemo(() => {
    const m = new Map<string, CartaoDaPauta[]>()
    for (const col of COLUNAS) m.set(col.status, ordenar(visiveis.filter((c) => c.status === col.status)))
    return m
  }, [visiveis])

  const filtrando = busca || responsavel !== 'todos' || prioridade !== 'todas' || prazo !== 'todos' || filtroEtiqueta !== 'todas'

  async function arquivar(status: StatusDoQuadro, ids: string[]) {
    if (!ids.length) return
    const antes = cartoes
    setCartoes((atual) => atual.filter((c) => !ids.includes(c.id)))
    const f = new FormData()
    f.set('status', status); f.set('ids', JSON.stringify(ids))
    const r = await arquivarPautas(f)
    if (r.erro) { setCartoes(antes); setAviso(r.erro) }
  }

  async function mover(id: string, status: StatusDoQuadro, antesDe: string | null) {
    const cartao = cartoes.find((c) => c.id === id)
    if (!cartao) return
    const coluna = (porColuna.get(status) ?? []).filter((c) => c.id !== id)
    const pos = efetivas(coluna)
    const idx = antesDe ? coluna.findIndex((c) => c.id === antesDe) : coluna.length
    const i = idx === -1 ? coluna.length : idx
    const nova = posicaoEntre(i > 0 ? pos[i - 1] : null, i < coluna.length ? pos[i] : null)
    if (cartao.status === status && cartao.posicao === nova) return
    if (cartao.status !== status && status === 'approval'
      && !confirm(`Enviar "${cartao.titulo}" para aprovação? Isso abre a rodada de aprovação da pauta.`)) return

    const antes = cartoes
    setCartoes((atual) => atual.map((c) => (c.id === id ? { ...c, status, posicao: nova } : c)))
    const f = new FormData()
    f.set('id', id); f.set('status', status); f.set('posicao', String(nova))
    const r = await moverPauta(f)
    if (r.erro) { setCartoes(antes); setAviso(r.erro) } else if (cartao.status !== status) router.refresh()
  }

  function aoArrastarSobre(e: React.DragEvent, status: StatusDoQuadro) {
    if (!arrastando) return
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
    const elementos = [...(e.currentTarget as HTMLElement).querySelectorAll<HTMLElement>('[data-cartao]')]
      .filter((el) => el.dataset.cartao !== arrastando)
    const debaixo = elementos.find((el) => {
      const r = el.getBoundingClientRect()
      return e.clientY < r.top + r.height / 2
    })
    const antesDe = debaixo?.dataset.cartao ?? null
    if (alvo?.status !== status || alvo.antesDe !== antesDe) setAlvo({ status, antesDe })
  }

  const cartaoAberto = aberto ? cartoes.find((c) => c.id === aberto) ?? null : null

  return (
    <div className="flex flex-col gap-3">
      <div data-ajuda="pautas.filtros" className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-52 flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar pautas" className={`w-full pl-9 ${campo}`} />
        </div>
        <select value={responsavel} onChange={(e) => setResponsavel(e.target.value)} className={campo} aria-label="Responsável">
          <option value="todos">Todas as pessoas</option>
          <option value="eu">Minhas (responsável ou participante)</option>
          <option value="sem">Sem responsável</option>
          {pessoas.map((p) => <option key={p.id} value={p.id}>{p.nome}</option>)}
        </select>
        <select value={prioridade} onChange={(e) => setPrioridade(e.target.value)} className={campo} aria-label="Prioridade">
          <option value="todas">Toda prioridade</option>
          {PRIORIDADES.map((p) => <option key={p.id} value={p.id}>{p.rotulo}</option>)}
        </select>
        <select value={prazo} onChange={(e) => setPrazo(e.target.value)} className={campo} aria-label="Prazo">
          <option value="todos">Todo prazo</option>
          <option value="atrasadas">Atrasadas</option>
          <option value="semana">Vencem em até 7 dias</option>
          <option value="sem">Sem prazo</option>
        </select>
        {etiquetas.length > 0 && (
          <select value={filtroEtiqueta} onChange={(e) => setFiltroEtiqueta(e.target.value)} className={campo} aria-label="Etiqueta">
            <option value="todas">Toda etiqueta</option>
            <option value="sem">Sem etiqueta</option>
            {etiquetas.map((e) => <option key={e.id} value={e.id}>{e.nome}</option>)}
          </select>
        )}
        {filtrando && (
          <Button variant="ghost" size="sm" onClick={() => { setBusca(''); setResponsavel('todos'); setPrioridade('todas'); setPrazo('todos'); setFiltroEtiqueta('todas') }}>
            <X className="size-4" />Limpar
          </Button>
        )}
        <Button variant="outline" size="sm" onClick={() => setArquivadasAberto(true)}><Archive className="size-4" />Arquivadas</Button>
        <span className="flex items-center gap-1.5 text-xs text-muted-foreground" title={aoVivo ? 'O quadro se atualiza sozinho quando alguém mexe' : 'Sem conexão ao vivo: recarregue a página para ver mudanças de outras pessoas'}>
          <span className={`size-2 rounded-full ${aoVivo ? 'bg-emerald-500' : 'bg-muted-foreground/40'}`} aria-hidden="true" />
          {aoVivo ? 'Ao vivo' : 'Offline'}
        </span>
      </div>

      {aviso && (
        <p className="flex items-center gap-2 rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">
          <AlertTriangle className="size-4 shrink-0" />{aviso}
          <button type="button" className="ml-auto" onClick={() => setAviso('')} aria-label="Fechar aviso"><X className="size-4" /></button>
        </p>
      )}

      {/* Colunas lado a lado com rolagem horizontal, também no celular (como o Trello). */}
      <div data-ajuda="pautas.quadro" className="-mx-4 flex snap-x snap-mandatory gap-3 overflow-x-auto px-4 pb-4 md:mx-0 md:snap-none md:px-0">
        {COLUNAS.map((col) => {
          const itens = porColuna.get(col.status) ?? []
          const soltandoAqui = alvo?.status === col.status
          return (
            <section
              key={col.status}
              aria-label={col.rotulo}
              className={`flex w-[82vw] shrink-0 snap-start flex-col rounded-xl bg-muted/60 p-2 sm:w-72 ${soltandoAqui ? 'ring-2 ring-primary/40' : ''}`}
              onDragOver={(e) => aoArrastarSobre(e, col.status)}
              onDragLeave={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setAlvo(null) }}
              onDrop={(e) => {
                e.preventDefault()
                const id = arrastando
                const destino = alvo
                setArrastando(null); setAlvo(null); arrastandoRef.current = null
                if (id && destino) void mover(id, destino.status, destino.antesDe)
              }}
            >
              <div className="flex items-center justify-between px-2 py-1.5">
                <h2 className="text-sm font-semibold">{col.rotulo}</h2>
                <span className="flex items-center gap-1">
                  <span className="rounded-full bg-background px-2 text-xs tabular-nums text-muted-foreground">{itens.length}</span>
                  {itens.length > 0 && (
                    <button type="button" title={`Arquivar ${filtrando ? 'os cartões visíveis' : 'todos os cartões'} desta coluna`}
                      aria-label={`Arquivar cartões da coluna ${col.rotulo}`}
                      onClick={() => {
                        if (confirm(`Arquivar ${itens.length} cartão(ões) de "${col.rotulo}"${filtrando ? ' (só os visíveis com o filtro atual)' : ''}? Eles podem ser restaurados em "Arquivadas".`)) {
                          void arquivar(col.status, itens.map((c) => c.id))
                        }
                      }}
                      className="rounded p-1 text-muted-foreground hover:bg-background hover:text-foreground">
                      <Archive className="size-3.5" />
                    </button>
                  )}
                </span>
              </div>
              <div className="flex min-h-10 flex-col gap-2">
                {itens.map((c) => (
                  <div key={c.id} data-ajuda={c === itens[0] ? 'pautas.cartao' : undefined}>
                    {soltandoAqui && alvo?.antesDe === c.id && <div className="mb-2 h-1 rounded-full bg-primary" />}
                    <CartaoNoQuadro
                      cartao={c}
                      pessoaPorId={pessoaPorId}
                      etiquetaPorId={etiquetaPorId}
                      hoje={hoje}
                      arrastando={arrastando === c.id}
                      aoIniciar={(e) => { e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', c.id); setArrastando(c.id); arrastandoRef.current = c.id }}
                      aoTerminar={() => { setArrastando(null); setAlvo(null); arrastandoRef.current = null }}
                      aoAbrir={() => setAberto(c.id)}
                    />
                  </div>
                ))}
                {soltandoAqui && alvo?.antesDe === null && <div className="h-1 rounded-full bg-primary" />}
              </div>
              {COLUNAS_COM_CRIACAO.includes(col.status) && (
                <CriarRapido status={col.status} projetoId={projetoId} aoCriar={() => router.refresh()} aoErrar={setAviso} />
              )}
            </section>
          )
        })}
      </div>

      {cartaoAberto && (
        <CartaoAberto
          cartao={cartaoAberto}
          pessoas={pessoas}
          etiquetas={etiquetas}
          aoFechar={() => setAberto(null)}
          aoMudarLocal={(mudanca) => setCartoes((atual) => atual.map((c) => (c.id === cartaoAberto.id ? { ...c, ...mudanca } : c)))}
          aoMover={(status) => { void mover(cartaoAberto.id, status, null) }}
          aoArquivar={() => { setAberto(null); void arquivar(cartaoAberto.status as StatusDoQuadro, [cartaoAberto.id]) }}
          aoMudarEtiquetas={setEtiquetas}
        />
      )}
      {arquivadasAberto && <Arquivadas aoFechar={() => setArquivadasAberto(false)} aoRestaurar={() => router.refresh()} />}
    </div>
  )
}

function CartaoNoQuadro({ cartao: c, pessoaPorId, etiquetaPorId, hoje, arrastando, aoIniciar, aoTerminar, aoAbrir }: {
  cartao: CartaoDaPauta
  pessoaPorId: Map<string, PessoaDoQuadro>
  etiquetaPorId: Map<string, Etiqueta>
  hoje: string
  arrastando: boolean
  aoIniciar: (e: React.DragEvent) => void
  aoTerminar: () => void
  aoAbrir: () => void
}) {
  const p = PRIORIDADE[c.prioridade] ?? PRIORIDADE.medium
  const situacao = situacaoDoPrazo(c.prazo, hoje, c.status === 'approved')
  const gente = [...new Set([c.responsavelId, ...c.participantes].filter((x): x is string => Boolean(x)))]
    .map((id) => pessoaPorId.get(id)).filter((x): x is PessoaDoQuadro => Boolean(x))
  const checklistCompleto = c.checklist.total > 0 && c.checklist.feitos === c.checklist.total

  return (
    <div
      data-cartao={c.id}
      draggable
      onDragStart={aoIniciar}
      onDragEnd={aoTerminar}
      onClick={aoAbrir}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); aoAbrir() } }}
      role="button"
      tabIndex={0}
      aria-label={`Abrir pauta ${c.titulo}`}
      className={`cursor-pointer rounded-lg border border-border bg-card p-2.5 shadow-xs transition hover:border-primary/40 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring ${arrastando ? 'opacity-40' : ''}`}
    >
      <div className="mb-1.5 flex flex-wrap items-center gap-1">
        <span className={`h-1.5 w-8 rounded-full ${p.faixa}`} title={`Prioridade ${p.rotulo.toLowerCase()}`} aria-hidden="true" />
        {p.chip && <span className={`rounded px-1.5 text-[10px] font-semibold uppercase tracking-wide ${p.chip}`}>{p.rotulo}</span>}
        {c.tipo && c.tipo !== 'Outro' && <span className="rounded bg-muted px-1.5 text-[10px] text-muted-foreground">{c.tipo}</span>}
        {c.etiquetas.map((id) => etiquetaPorId.get(id)).filter((e): e is Etiqueta => Boolean(e)).map((e) => <Chip key={e.id} etiqueta={e} />)}
      </div>
      <p className="break-words text-sm font-medium leading-snug">{c.titulo}</p>
      {(c.projeto || c.coordenacao) && <p className="mt-1 truncate text-[11px] text-muted-foreground">{[c.projeto, c.coordenacao].filter(Boolean).join(' · ')}</p>}
      <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
        {c.prazo && (
          <span className={`inline-flex items-center gap-1 rounded px-1.5 py-0.5 font-medium ${PRAZO[situacao]}`} title={situacao === 'atrasada' ? 'Prazo vencido' : 'Prazo'}>
            <CalendarDays className="size-3" />{dataCurta(c.prazo, hoje)}{situacao === 'atrasada' && <span className="sr-only"> (atrasada)</span>}
          </span>
        )}
        {c.checklist.total > 0 && (
          <span className={`inline-flex items-center gap-1 rounded px-1.5 py-0.5 ${checklistCompleto ? 'bg-emerald-600 text-white' : ''}`}>
            <CheckSquare className="size-3" />{c.checklist.feitos}/{c.checklist.total}
          </span>
        )}
        {c.mensagens > 0 && <span className="inline-flex items-center gap-1" title="Mensagens"><MessageSquare className="size-3" />{c.mensagens}</span>}
        {c.links > 0 && <span className="inline-flex items-center gap-1" title="Links e arquivos"><Paperclip className="size-3" />{c.links}</span>}
        {c.conteudos > 0 && <span className="inline-flex items-center gap-1" title="Conteúdos"><FileText className="size-3" />{c.conteudos}</span>}
        {gente.length > 0 && (
          <span className="ml-auto flex -space-x-1.5">
            {gente.slice(0, 3).map((g) => (
              <Avatar key={g.id} size="xs" initials={g.iniciais} color={g.cor ?? undefined} src={privateAvatarUrl(g.avatar)} alt={g.nome} className="ring-2 ring-card" />
            ))}
            {gente.length > 3 && <span className="inline-flex size-6 items-center justify-center rounded-full bg-muted text-[10px] ring-2 ring-card">+{gente.length - 3}</span>}
          </span>
        )}
      </div>
    </div>
  )
}

function CriarRapido({ status, projetoId, aoCriar, aoErrar }: {
  status: StatusDoQuadro
  projetoId: string | null
  aoCriar: () => void
  aoErrar: (m: string) => void
}) {
  const [aberto, setAberto] = useState(false)
  const [titulo, setTitulo] = useState('')
  const [criando, criar] = useTransition()
  const campoRef = useRef<HTMLTextAreaElement>(null)

  function enviar() {
    if (titulo.trim().length < 2) return
    criar(async () => {
      const f = new FormData()
      f.set('titulo', titulo); f.set('status', status)
      if (projetoId) f.set('projeto', projetoId)
      const r = await criarPautaRapida(f)
      if (r.erro) { aoErrar(r.erro); return }
      setTitulo('')
      campoRef.current?.focus()
      aoCriar()
    })
  }

  if (!aberto) {
    return (
      <button type="button" data-ajuda="pautas.adicionar" onClick={() => setAberto(true)} className="mt-2 flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-left text-sm text-muted-foreground hover:bg-background/70 hover:text-foreground">
        <Plus className="size-4" />Adicionar pauta
      </button>
    )
  }
  return (
    <div className="mt-2 flex flex-col gap-2">
      <textarea
        ref={campoRef}
        autoFocus
        rows={2}
        value={titulo}
        disabled={criando}
        onChange={(e) => setTitulo(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); enviar() }
          if (e.key === 'Escape') { setAberto(false); setTitulo('') }
        }}
        placeholder="Título da pauta (Enter para criar)"
        aria-label="Título da nova pauta"
        className={`w-full resize-none ${campo}`}
      />
      <div className="flex items-center gap-2">
        <Button size="sm" onClick={enviar} disabled={criando || titulo.trim().length < 2}>
          {criando && <Loader2 className="size-4 animate-spin" />}Adicionar
        </Button>
        <Button size="sm" variant="ghost" onClick={() => { setAberto(false); setTitulo('') }} aria-label="Cancelar"><X className="size-4" /></Button>
      </div>
    </div>
  )
}

/**
 * O cartão aberto: edita o essencial sem sair do quadro. O que é da sala
 * (mensagens, arquivos, conteúdos, aprovação) continua na sala, por um link.
 */
function CartaoAberto({ cartao, pessoas, etiquetas, aoFechar, aoMudarLocal, aoMover, aoArquivar, aoMudarEtiquetas }: {
  cartao: CartaoDaPauta
  pessoas: PessoaDoQuadro[]
  etiquetas: Etiqueta[]
  aoFechar: () => void
  aoMudarLocal: (m: Partial<CartaoDaPauta>) => void
  aoMover: (status: StatusDoQuadro) => void
  aoArquivar: () => void
  aoMudarEtiquetas: (lista: Etiqueta[]) => void
}) {
  const router = useRouter()
  const [titulo, setTitulo] = useState(cartao.titulo)
  const [prazo, setPrazo] = useState(cartao.prazo ?? '')
  const [inicio, setInicio] = useState(cartao.inicio ?? '')
  const [prioridade, setPrioridade] = useState(cartao.prioridade)
  const [responsavel, setResponsavel] = useState(cartao.responsavelId ?? '')
  const [itens, setItens] = useState<ItemDoChecklist[] | null>(null)
  const [descricao, setDescricao] = useState('')
  const [novoItem, setNovoItem] = useState('')
  const [erro, setErro] = useState('')
  const [salvando, salvar] = useTransition()
  const [, rodar] = useTransition()

  useEffect(() => {
    const f = new FormData(); f.set('id', cartao.id)
    let vivo = true
    void carregarChecklist(f).then((r) => {
      if (!vivo) return
      if (r.erro) setErro(r.erro)
      setItens(r.itens ?? [])
      setDescricao(r.descricao ?? '')
    })
    return () => { vivo = false }
  }, [cartao.id])

  useEffect(() => {
    const noEscape = (e: KeyboardEvent) => { if (e.key === 'Escape') aoFechar() }
    document.addEventListener('keydown', noEscape)
    return () => document.removeEventListener('keydown', noEscape)
  }, [aoFechar])

  const mudou = titulo.trim() !== cartao.titulo || prazo !== (cartao.prazo ?? '') || inicio !== (cartao.inicio ?? '') || prioridade !== cartao.prioridade || responsavel !== (cartao.responsavelId ?? '')

  function guardar() {
    setErro('')
    salvar(async () => {
      const f = new FormData()
      f.set('id', cartao.id); f.set('titulo', titulo); f.set('prazo', prazo); f.set('inicio', inicio); f.set('prioridade', prioridade); f.set('responsavel', responsavel)
      const r = await atualizarCartao(f)
      if (r.erro) { setErro(r.erro); return }
      aoMudarLocal({ titulo: titulo.trim(), prazo: prazo || null, inicio: inicio || null, prioridade, responsavelId: responsavel || null })
      router.refresh()
    })
  }

  const contarChecklist = (lista: ItemDoChecklist[]) =>
    aoMudarLocal({ checklist: { feitos: lista.filter((i) => i.feito).length, total: lista.length } })

  function adicionar() {
    const texto = novoItem.trim()
    if (!texto) return
    setNovoItem('')
    rodar(async () => {
      const f = new FormData(); f.set('pautaId', cartao.id); f.set('texto', texto)
      const r = await adicionarItemDoChecklist(f)
      if (r.erro || !r.item) { setErro(r.erro ?? 'Não foi possível adicionar.'); return }
      const lista = [...(itens ?? []), r.item]
      setItens(lista); contarChecklist(lista)
    })
  }

  function marcar(item: ItemDoChecklist) {
    const lista = (itens ?? []).map((i) => (i.id === item.id ? { ...i, feito: !i.feito } : i))
    setItens(lista); contarChecklist(lista)
    rodar(async () => {
      const f = new FormData(); f.set('id', item.id); f.set('feito', String(!item.feito))
      const r = await marcarItemDoChecklist(f)
      if (r.erro) { setErro(r.erro); setItens(itens); if (itens) contarChecklist(itens) }
    })
  }

  function remover(item: ItemDoChecklist) {
    const lista = (itens ?? []).filter((i) => i.id !== item.id)
    setItens(lista); contarChecklist(lista)
    rodar(async () => {
      const f = new FormData(); f.set('id', item.id)
      const r = await removerItemDoChecklist(f)
      if (r.erro) { setErro(r.erro); setItens(itens); if (itens) contarChecklist(itens) }
    })
  }

  const feitos = (itens ?? []).filter((i) => i.feito).length
  const total = itens?.length ?? 0

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-foreground/45 p-4 py-10"
      onMouseDown={(e) => { if (e.target === e.currentTarget) aoFechar() }} role="dialog" aria-modal="true" aria-labelledby="cartao-titulo">
      <Card className="w-full max-w-2xl p-0 shadow-2xl">
        <header className="flex items-start gap-3 border-b border-border px-5 py-4">
          <textarea id="cartao-titulo" value={titulo} onChange={(e) => setTitulo(e.target.value)} rows={1}
            className="min-h-9 flex-1 resize-none rounded-md border border-transparent bg-transparent px-1 text-lg font-semibold outline-none hover:border-border focus:border-ring" />
          <button type="button" onClick={aoFechar} aria-label="Fechar" className="rounded-md p-1 text-muted-foreground hover:bg-muted"><X className="size-5" /></button>
        </header>

        <div className="grid gap-5 px-5 py-4 md:grid-cols-[1fr_13rem]">
          <div className="flex min-w-0 flex-col gap-5">
            <EtiquetasDoCartao
              cartao={cartao}
              etiquetas={etiquetas}
              aoMudarLocal={aoMudarLocal}
              aoMudarEtiquetas={aoMudarEtiquetas}
              aoErrar={setErro}
            />
            <section>
              <h3 className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Descrição</h3>
              {itens === null ? <p className="text-sm text-muted-foreground">Carregando…</p>
                : descricao ? <p className="line-clamp-6 whitespace-pre-wrap text-sm">{descricao}</p>
                  : <p className="text-sm text-muted-foreground">Sem descrição. Escreva o briefing na sala da pauta.</p>}
            </section>

            <section>
              <div className="mb-2 flex items-center justify-between">
                <h3 className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground"><CheckSquare className="size-4" />Checklist</h3>
                {total > 0 && <span className="text-xs tabular-nums text-muted-foreground">{feitos}/{total}</span>}
              </div>
              {total > 0 && (
                <div className="mb-2 h-1.5 overflow-hidden rounded-full bg-muted" role="progressbar" aria-valuenow={Math.round((feitos / total) * 100)} aria-valuemin={0} aria-valuemax={100} aria-label="Progresso do checklist">
                  <div className={`h-full rounded-full ${feitos === total ? 'bg-emerald-600' : 'bg-primary'}`} style={{ width: `${(feitos / total) * 100}%` }} />
                </div>
              )}
              <ul className="flex flex-col gap-1">
                {(itens ?? []).map((i) => (
                  <li key={i.id} className="group flex items-start gap-2 rounded-md px-1 py-1 hover:bg-muted/50">
                    <input type="checkbox" checked={i.feito} onChange={() => marcar(i)} className="mt-0.5 size-4" aria-label={i.texto} />
                    <span className={`flex-1 text-sm ${i.feito ? 'text-muted-foreground line-through' : ''}`}>{i.texto}</span>
                    <button type="button" onClick={() => remover(i)} aria-label={`Remover ${i.texto}`} className="rounded p-0.5 text-muted-foreground opacity-0 hover:text-destructive group-hover:opacity-100 focus:opacity-100"><Trash2 className="size-3.5" /></button>
                  </li>
                ))}
              </ul>
              <div className="mt-2 flex gap-2">
                <input value={novoItem} onChange={(e) => setNovoItem(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); adicionar() } }}
                  placeholder="Adicionar item" aria-label="Novo item do checklist" maxLength={300} className={`flex-1 ${campo}`} />
                <Button variant="outline" onClick={adicionar} disabled={!novoItem.trim()}><Plus className="size-4" /></Button>
              </div>
            </section>
          </div>

          <aside className="flex flex-col gap-3 text-sm">
            <label className="flex flex-col gap-1 font-medium">Etapa
              <select value={cartao.status} onChange={(e) => aoMover(e.target.value as StatusDoQuadro)} className={campo}>
                {COLUNAS.map((c) => <option key={c.status} value={c.status}>{c.rotulo}</option>)}
              </select>
            </label>
            <label className="flex flex-col gap-1 font-medium">Responsável
              <select value={responsavel} onChange={(e) => setResponsavel(e.target.value)} className={campo}>
                <option value="">Sem responsável</option>
                {pessoas.map((p) => <option key={p.id} value={p.id}>{p.nome}</option>)}
              </select>
            </label>
            <label className="flex flex-col gap-1 font-medium">Início
              <input type="date" value={inicio} max={prazo || undefined} onChange={(e) => setInicio(e.target.value)} className={campo} />
            </label>
            <label className="flex flex-col gap-1 font-medium">Prazo
              <input type="date" value={prazo} min={inicio || undefined} onChange={(e) => setPrazo(e.target.value)} className={campo} />
            </label>
            <label className="flex flex-col gap-1 font-medium">Prioridade
              <select value={prioridade} onChange={(e) => setPrioridade(e.target.value)} className={campo}>
                {PRIORIDADES.map((p) => <option key={p.id} value={p.id}>{p.rotulo}</option>)}
              </select>
            </label>
            <Button onClick={guardar} disabled={salvando || !mudou || titulo.trim().length < 2}>
              {salvando && <Loader2 className="size-4 animate-spin" />}Salvar
            </Button>
            <Button variant="outline" render={<Link href={`/pautas/${cartao.id}`} />}>
              <ExternalLink className="size-4" />Abrir sala da pauta
            </Button>
            <p className="text-xs text-muted-foreground">Mensagens, arquivos, conteúdos e aprovação ficam na sala.</p>
            <Button variant="ghost" className="justify-start text-muted-foreground" onClick={() => {
              if (confirm(`Arquivar "${cartao.titulo}"? Ela sai do quadro e pode ser restaurada em "Arquivadas".`)) aoArquivar()
            }}>
              <Archive className="size-4" />Arquivar
            </Button>
          </aside>
        </div>
        {erro && <p className="border-t border-border px-5 py-2 text-xs text-destructive">{erro}</p>}
      </Card>
    </div>,
    document.body,
  )
}

/**
 * As etiquetas no cartão aberto: marcar e desmarcar, criar (já entra no
 * cartão), renomear, trocar a cor e apagar do espaço.
 */
function EtiquetasDoCartao({ cartao, etiquetas, aoMudarLocal, aoMudarEtiquetas, aoErrar }: {
  cartao: CartaoDaPauta
  etiquetas: Etiqueta[]
  aoMudarLocal: (m: Partial<CartaoDaPauta>) => void
  aoMudarEtiquetas: (lista: Etiqueta[]) => void
  aoErrar: (m: string) => void
}) {
  const [editando, setEditando] = useState<string | 'nova' | null>(null)
  const [nome, setNome] = useState('')
  const [cor, setCor] = useState<CorDeEtiqueta>('azul')
  const [ocupado, rodar] = useTransition()
  const marcadas = new Set(cartao.etiquetas)

  function alternar(e: Etiqueta) {
    const ligar = !marcadas.has(e.id)
    const antes = cartao.etiquetas
    aoMudarLocal({ etiquetas: ligar ? [...antes, e.id] : antes.filter((id) => id !== e.id) })
    rodar(async () => {
      const f = new FormData(); f.set('pautaId', cartao.id); f.set('etiquetaId', e.id); f.set('ligar', String(ligar))
      const r = await alternarEtiqueta(f)
      if (r.erro) { aoMudarLocal({ etiquetas: antes }); aoErrar(r.erro) }
    })
  }

  function abrirEdicao(e: Etiqueta | null) {
    setEditando(e ? e.id : 'nova'); setNome(e?.nome ?? ''); setCor(e?.cor ?? 'azul')
  }

  function salvar() {
    const f = new FormData(); f.set('nome', nome); f.set('cor', cor)
    rodar(async () => {
      if (editando === 'nova') {
        const r = await criarEtiqueta(f)
        if (r.erro || !r.etiqueta) { aoErrar(r.erro ?? 'Não foi possível criar.'); return }
        const nova = r.etiqueta
        aoMudarEtiquetas([...etiquetas, nova].sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR')))
        setEditando(null)
        // Etiqueta criada no cartão já entra nele, como no Trello.
        alternar(nova)
        return
      }
      f.set('id', editando as string)
      const r = await editarEtiqueta(f)
      if (r.erro) { aoErrar(r.erro); return }
      aoMudarEtiquetas(etiquetas.map((e) => (e.id === editando ? { ...e, nome: nome.trim(), cor } : e)))
      setEditando(null)
    })
  }

  function apagar(e: Etiqueta) {
    if (!confirm(`Apagar a etiqueta "${e.nome}"? Ela sai de todos os cartões que a usam.`)) return
    rodar(async () => {
      const f = new FormData(); f.set('id', e.id)
      const r = await excluirEtiqueta(f)
      if (r.erro) { aoErrar(r.erro); return }
      aoMudarEtiquetas(etiquetas.filter((x) => x.id !== e.id))
      aoMudarLocal({ etiquetas: cartao.etiquetas.filter((id) => id !== e.id) })
      setEditando(null)
    })
  }

  const formulario = (
    <div className="flex flex-col gap-2 rounded-lg border border-border p-2">
      <input value={nome} onChange={(e) => setNome(e.target.value)} maxLength={40} placeholder="Nome da etiqueta" aria-label="Nome da etiqueta" autoFocus
        onKeyDown={(e) => { if (e.key === 'Enter' && nome.trim()) { e.preventDefault(); salvar() } }} className={campo} />
      <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="Cor da etiqueta">
        {(Object.keys(CORES_DE_ETIQUETA) as CorDeEtiqueta[]).map((c) => (
          <button key={c} type="button" role="radio" aria-checked={cor === c} aria-label={CORES_DE_ETIQUETA[c].rotulo} title={CORES_DE_ETIQUETA[c].rotulo}
            onClick={() => setCor(c)} className={`flex size-7 items-center justify-center rounded ${cor === c ? 'ring-2 ring-foreground ring-offset-2 ring-offset-background' : ''}`}
            style={{ backgroundColor: CORES_DE_ETIQUETA[c].hex }}>
            {cor === c && <Check className="size-4 text-white" />}
          </button>
        ))}
      </div>
      {nome.trim() && <div><Chip etiqueta={{ id: 'previa', nome: nome.trim(), cor }} grande /></div>}
      <div className="flex flex-wrap gap-2">
        <Button size="sm" onClick={salvar} disabled={ocupado || !nome.trim()}>{ocupado && <Loader2 className="size-4 animate-spin" />}{editando === 'nova' ? 'Criar' : 'Salvar'}</Button>
        <Button size="sm" variant="ghost" onClick={() => setEditando(null)}>Cancelar</Button>
        {editando && editando !== 'nova' && (
          <Button size="sm" variant="ghost" className="ml-auto text-destructive" disabled={ocupado}
            onClick={() => { const e = etiquetas.find((x) => x.id === editando); if (e) apagar(e) }}>
            <Trash2 className="size-4" />Apagar
          </Button>
        )}
      </div>
    </div>
  )

  return (
    <section>
      <h3 className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground"><Tag className="size-4" />Etiquetas</h3>
      <ul className="flex flex-col gap-1">
        {etiquetas.map((e) => (
          <li key={e.id}>
            {editando === e.id ? formulario : (
              <div className="group flex items-center gap-2">
                <input type="checkbox" checked={marcadas.has(e.id)} onChange={() => alternar(e)} className="size-4" aria-label={`Etiqueta ${e.nome}`} />
                <button type="button" onClick={() => alternar(e)} className="min-w-0 flex-1 text-left"><Chip etiqueta={e} grande /></button>
                <button type="button" onClick={() => abrirEdicao(e)} aria-label={`Editar etiqueta ${e.nome}`}
                  className="rounded p-1 text-muted-foreground opacity-60 hover:bg-muted hover:text-foreground group-hover:opacity-100"><Pencil className="size-3.5" /></button>
              </div>
            )}
          </li>
        ))}
      </ul>
      {editando === 'nova' ? <div className="mt-2">{formulario}</div> : (
        <button type="button" onClick={() => abrirEdicao(null)} className="mt-2 flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
          <Plus className="size-4" />{etiquetas.length ? 'Nova etiqueta' : 'Criar a primeira etiqueta'}
        </button>
      )}
    </section>
  )
}

const ROTULO_DA_COLUNA = new Map<string, string>(COLUNAS.map((c) => [c.status, c.rotulo]))

/** O que foi arquivado: buscar e devolver ao quadro, na etapa de onde saiu. */
function Arquivadas({ aoFechar, aoRestaurar }: { aoFechar: () => void; aoRestaurar: () => void }) {
  const [lista, setLista] = useState<PautaArquivada[] | null>(null)
  const [busca, setBusca] = useState('')
  const [erro, setErro] = useState('')
  const [restaurando, setRestaurando] = useState<string | null>(null)

  useEffect(() => {
    let vivo = true
    void listarArquivadas().then((r) => { if (!vivo) return; if (r.erro) setErro(r.erro); setLista(r.pautas ?? []) })
    return () => { vivo = false }
  }, [])
  useEffect(() => {
    const noEscape = (e: KeyboardEvent) => { if (e.key === 'Escape') aoFechar() }
    document.addEventListener('keydown', noEscape)
    return () => document.removeEventListener('keydown', noEscape)
  }, [aoFechar])

  async function restaurar(p: PautaArquivada) {
    setRestaurando(p.id); setErro('')
    const f = new FormData(); f.set('id', p.id)
    const r = await restaurarPauta(f)
    setRestaurando(null)
    if (r.erro) { setErro(r.erro); return }
    setLista((atual) => (atual ?? []).filter((x) => x.id !== p.id))
    aoRestaurar()
  }

  const termo = busca.trim().toLowerCase()
  const visiveis = (lista ?? []).filter((p) => !termo || p.titulo.toLowerCase().includes(termo))

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-foreground/45 p-4 py-10"
      onMouseDown={(e) => { if (e.target === e.currentTarget) aoFechar() }} role="dialog" aria-modal="true" aria-labelledby="arquivadas-titulo">
      <Card className="w-full max-w-lg p-0 shadow-2xl">
        <header className="flex items-center justify-between border-b border-border px-5 py-4">
          <h2 id="arquivadas-titulo" className="flex items-center gap-2 font-semibold"><Archive className="size-4" />Pautas arquivadas</h2>
          <button type="button" onClick={aoFechar} aria-label="Fechar" className="rounded-md p-1 text-muted-foreground hover:bg-muted"><X className="size-5" /></button>
        </header>
        <div className="flex flex-col gap-3 px-5 py-4">
          <input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar nas arquivadas" aria-label="Buscar nas arquivadas" className={campo} />
          {erro && <p className="text-xs text-destructive">{erro}</p>}
          {lista === null ? <p className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="size-4 animate-spin" />Carregando…</p>
            : !visiveis.length ? <p className="py-6 text-center text-sm text-muted-foreground">{lista.length ? 'Nada na busca.' : 'Nenhuma pauta arquivada.'}</p>
              : (
                <ul className="max-h-[60vh] divide-y divide-border overflow-y-auto rounded-lg border border-border">
                  {visiveis.map((p) => (
                    <li key={p.id} className="flex items-center gap-3 px-3 py-2">
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium">{p.titulo}</p>
                        <p className="text-xs text-muted-foreground">Saiu de {ROTULO_DA_COLUNA.get(p.de) ?? '—'}</p>
                      </div>
                      <Button size="sm" variant="outline" disabled={restaurando === p.id} onClick={() => void restaurar(p)}>
                        {restaurando === p.id ? <Loader2 className="size-4 animate-spin" /> : <RotateCcw className="size-4" />}Restaurar
                      </Button>
                    </li>
                  ))}
                </ul>
              )}
        </div>
      </Card>
    </div>,
    document.body,
  )
}
