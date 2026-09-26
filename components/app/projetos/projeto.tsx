'use client'

import Link from 'next/link'
import { useMemo, useState, useTransition } from 'react'
import { createPortal } from 'react-dom'
import { useRouter } from 'next/navigation'
import { AlertTriangle, CalendarRange, Check, CheckCircle2, Flag, KanbanSquare, Loader2, Pencil, Plus, RotateCcw, Trash2, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Avatar } from '@/components/ui/avatar'
import { privateAvatarUrl } from '@/lib/avatar-url'
import {
  alternarMarco, atualizarProjeto, concluirProjeto, criarMarco, definirDatasDaPauta, excluirAtualizacao, excluirMarco, publicarAtualizacao,
} from '@/app/actions/projetos'
import {
  diasEntre, escalaDoCronograma, haQuanto, passouDoPrazo, periodoDaPauta, posicaoNaEscala, progresso, SITUACOES,
  type Situacao, type SituacaoNaTela,
} from '@/lib/projetos/cronograma'
import { BarraDeProgresso, campo, dataCurta, PillDaSituacao, type PessoaDoProjeto } from './comum'

export type ProjetoNaTela = {
  id: string
  nome: string
  descricao: string
  inicio: string | null
  fim: string | null
  responsavelId: string | null
  situacao: SituacaoNaTela
  concluido: boolean
}
export type PautaDoProjeto = { id: string; titulo: string; status: string; inicio: string | null; fim: string | null }
export type AtualizacaoNaTela = { id: string; situacao: Situacao; texto: string; autorId: string | null; quando: string; podeApagar: boolean }
export type MarcoNaTela = { id: string; titulo: string; data: string; feito: boolean }

const ETAPA: Record<string, string> = {
  incoming: 'Entrada', collection: 'Coleta', production: 'Produção', review: 'Revisão', approval: 'Aprovação', approved: 'Pronto',
}

const CLASSE_DA_SITUACAO: Record<Situacao, string> = {
  no_prazo: 'border-emerald-600 bg-emerald-500/10 text-emerald-800 dark:text-emerald-300',
  em_risco: 'border-amber-600 bg-amber-500/10 text-amber-800 dark:text-amber-300',
  atrasado: 'border-red-600 bg-red-500/10 text-red-700 dark:text-red-300',
}
const BORDA_DA_SITUACAO: Record<Situacao, string> = { no_prazo: 'border-l-emerald-600', em_risco: 'border-l-amber-600', atrasado: 'border-l-red-600' }

const quando = new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short', timeZone: 'America/Sao_Paulo' })

export function ProjetoAsana({ projeto, pautas, atualizacoes, marcos, pessoas, hoje, acoesExtras, visaoGeralExtra }: {
  projeto: ProjetoNaTela
  pautas: PautaDoProjeto[]
  atualizacoes: AtualizacaoNaTela[]
  marcos: MarcoNaTela[]
  pessoas: PessoaDoProjeto[]
  hoje: string
  acoesExtras: React.ReactNode
  visaoGeralExtra: React.ReactNode
}) {
  const router = useRouter()
  const [aba, setAba] = useState<'visao' | 'linha'>('visao')
  const [editando, setEditando] = useState(false)
  const [erro, setErro] = useState('')
  const [ocupado, rodar] = useTransition()
  const pessoaPorId = useMemo(() => new Map(pessoas.map((p) => [p.id, p])), [pessoas])
  const responsavel = projeto.responsavelId ? pessoaPorId.get(projeto.responsavelId) : undefined
  const vencido = passouDoPrazo(projeto.fim, hoje, projeto.concluido)

  function alternarConclusao() {
    setErro('')
    rodar(async () => {
      const f = new FormData(); f.set('id', projeto.id); f.set('concluir', String(!projeto.concluido))
      const r = await concluirProjeto(f)
      if (r.erro) setErro(r.erro); else router.refresh()
    })
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div data-ajuda="projetos.cabecalho" className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-2xl font-bold tracking-tight text-balance">{projeto.nome}</h1>
            <PillDaSituacao situacao={projeto.situacao} />
          </div>
          <p className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground">
            <span className="inline-flex items-center gap-1.5 tabular-nums"><CalendarRange className="size-4" />{dataCurta(projeto.inicio, hoje)} → {dataCurta(projeto.fim, hoje)}</span>
            {responsavel && (
              <span className="inline-flex items-center gap-1.5">
                <Avatar size="xs" initials={responsavel.iniciais} color={responsavel.cor ?? undefined} src={privateAvatarUrl(responsavel.avatar)} />{responsavel.nome}
              </span>
            )}
            {vencido && <span className="inline-flex items-center gap-1 font-medium text-destructive"><AlertTriangle className="size-4" />Prazo final vencido</span>}
          </p>
        </div>
        <div data-ajuda="projetos.acoes" className="flex shrink-0 flex-wrap items-center gap-2">
          <Button render={<Link href={`/registrar?projeto=${projeto.id}`} />}><Plus className="size-4" />Nova pauta</Button>
          <Button variant="outline" render={<Link href={`/pautas?projeto=${projeto.id}`} />}><KanbanSquare className="size-4" />Quadro</Button>
          <Button variant="outline" onClick={() => setEditando(true)}><Pencil className="size-4" />Editar</Button>
          <Button variant="outline" onClick={alternarConclusao} disabled={ocupado}>
            {ocupado ? <Loader2 className="size-4 animate-spin" /> : projeto.concluido ? <RotateCcw className="size-4" /> : <CheckCircle2 className="size-4" />}
            {projeto.concluido ? 'Reabrir' : 'Concluir'}
          </Button>
          {acoesExtras}
        </div>
      </div>
      {erro && <p className="text-sm text-destructive">{erro}</p>}

      <div data-ajuda="projetos.abas-do-projeto" className="flex gap-1 border-b border-border" role="tablist">
        {([['visao', 'Visão geral'], ['linha', 'Linha do tempo']] as const).map(([id, rotulo]) => (
          <button key={id} type="button" role="tab" aria-selected={aba === id} onClick={() => setAba(id)}
            className={`-mb-px border-b-2 px-3 py-2 text-sm font-medium ${aba === id ? 'border-primary text-foreground' : 'border-transparent text-muted-foreground hover:text-foreground'}`}>
            {rotulo}
          </button>
        ))}
      </div>

      {aba === 'visao' ? (
        <>
          <div className="grid gap-5 lg:grid-cols-[1fr_20rem]">
            <Atualizacoes projetoId={projeto.id} atualizacoes={atualizacoes} pessoaPorId={pessoaPorId} hoje={hoje} />
            <div className="flex flex-col gap-5">
              <Resumo projeto={projeto} pautas={pautas} hoje={hoje} />
              <Marcos projetoId={projeto.id} marcos={marcos} hoje={hoje} />
            </div>
          </div>
          {visaoGeralExtra}
        </>
      ) : (
        <Cronograma projeto={projeto} pautas={pautas} marcos={marcos} hoje={hoje} />
      )}

      {editando && <EditarProjeto projeto={projeto} pessoas={pessoas} aoFechar={() => setEditando(false)} />}
    </div>
  )
}

function Atualizacoes({ projetoId, atualizacoes, pessoaPorId, hoje }: {
  projetoId: string
  atualizacoes: AtualizacaoNaTela[]
  pessoaPorId: Map<string, PessoaDoProjeto>
  hoje: string
}) {
  const router = useRouter()
  const [situacao, setSituacao] = useState<Situacao | ''>(atualizacoes[0]?.situacao ?? '')
  const [texto, setTexto] = useState('')
  const [erro, setErro] = useState('')
  const [publicando, publicar] = useTransition()

  function enviar() {
    setErro('')
    publicar(async () => {
      const f = new FormData(); f.set('projectId', projetoId); f.set('situacao', situacao); f.set('texto', texto)
      const r = await publicarAtualizacao(f)
      if (r.erro) { setErro(r.erro); return }
      setTexto('')
      router.refresh()
    })
  }

  function apagar(a: AtualizacaoNaTela) {
    if (!confirm('Apagar esta atualização? A situação do projeto volta a ser a da anterior.')) return
    publicar(async () => {
      const f = new FormData(); f.set('id', a.id)
      const r = await excluirAtualizacao(f)
      if (r.erro) setErro(r.erro); else router.refresh()
    })
  }

  return (
    <section className="flex min-w-0 flex-col gap-4">
      <Card data-ajuda="projetos.atualizacao" className="flex flex-col gap-3 p-4">
        <h2 className="text-sm font-semibold">Atualização de status</h2>
        <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Situação do projeto">
          {(Object.keys(SITUACOES) as Situacao[]).map((s) => (
            <button key={s} type="button" role="radio" aria-checked={situacao === s} onClick={() => setSituacao(s)}
              className={`rounded-full border px-3 py-1 text-sm font-medium transition ${situacao === s ? CLASSE_DA_SITUACAO[s] : 'border-border text-muted-foreground hover:text-foreground'}`}>
              {situacao === s && <Check className="mr-1 inline size-3.5 align-[-2px]" />}{SITUACOES[s].rotulo}
            </button>
          ))}
        </div>
        <textarea value={texto} onChange={(e) => setTexto(e.target.value)} rows={3} maxLength={4000} aria-label="Texto da atualização"
          placeholder="O que avançou, o que está travando e qual é o próximo passo" className={campo} />
        {erro && <p className="text-xs text-destructive">{erro}</p>}
        <div className="flex justify-end">
          <Button onClick={enviar} disabled={publicando || !situacao || texto.trim().length < 3}>
            {publicando && <Loader2 className="size-4 animate-spin" />}Publicar atualização
          </Button>
        </div>
      </Card>

      {atualizacoes.length === 0 ? (
        <p className="rounded-lg border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
          Nenhuma atualização ainda. A primeira define a situação do projeto na carteira.
        </p>
      ) : (
        <ol className="flex flex-col gap-3" aria-label="Histórico de atualizações">
          {atualizacoes.map((a) => {
            const autor = a.autorId ? pessoaPorId.get(a.autorId) : undefined
            return (
              <li key={a.id}>
                <Card className={`border-l-4 p-4 ${BORDA_DA_SITUACAO[a.situacao]}`}>
                  <div className="flex flex-wrap items-center gap-2">
                    <PillDaSituacao situacao={a.situacao} />
                    <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                      {autor && <Avatar size="xs" initials={autor.iniciais} color={autor.cor ?? undefined} src={privateAvatarUrl(autor.avatar)} />}
                      {autor?.nome ?? 'Alguém que saiu do espaço'} · <span title={quando.format(new Date(a.quando))}>{haQuanto(a.quando, hoje)}</span>
                    </span>
                    {a.podeApagar && (
                      <button type="button" onClick={() => apagar(a)} aria-label="Apagar atualização" className="ml-auto rounded p-1 text-muted-foreground hover:text-destructive">
                        <Trash2 className="size-3.5" />
                      </button>
                    )}
                  </div>
                  <p className="mt-2 whitespace-pre-wrap text-sm">{a.texto}</p>
                </Card>
              </li>
            )
          })}
        </ol>
      )}
    </section>
  )
}

function Resumo({ projeto, pautas, hoje }: { projeto: ProjetoNaTela; pautas: PautaDoProjeto[]; hoje: string }) {
  const p = progresso(pautas.map((x) => x.status))
  const restante = projeto.fim && !projeto.concluido ? diasEntre(hoje, projeto.fim) : null
  return (
    <Card data-ajuda="projetos.resumo" className="flex flex-col gap-3 p-4 text-sm">
      <h2 className="font-semibold">Resumo</h2>
      {projeto.descricao && <p className="text-muted-foreground">{projeto.descricao}</p>}
      <div>
        <BarraDeProgresso pct={p.pct} />
        <p className="mt-1 text-xs tabular-nums text-muted-foreground">{p.feitas} de {p.total} pautas prontas</p>
      </div>
      <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5">
        <dt className="text-muted-foreground">Início</dt><dd className="text-right tabular-nums">{dataCurta(projeto.inicio, hoje)}</dd>
        <dt className="text-muted-foreground">Prazo final</dt><dd className="text-right tabular-nums">{dataCurta(projeto.fim, hoje)}</dd>
        {restante !== null && (
          <>
            <dt className="text-muted-foreground">{restante < 0 ? 'Atraso' : 'Faltam'}</dt>
            <dd className={`text-right tabular-nums ${restante < 0 ? 'font-semibold text-destructive' : ''}`}>{Math.abs(restante)} dia(s)</dd>
          </>
        )}
      </dl>
    </Card>
  )
}

function Marcos({ projetoId, marcos, hoje }: { projetoId: string; marcos: MarcoNaTela[]; hoje: string }) {
  const router = useRouter()
  const [titulo, setTitulo] = useState('')
  const [data, setData] = useState('')
  const [erro, setErro] = useState('')
  const [ocupado, rodar] = useTransition()
  const executar = (fn: () => Promise<{ erro?: string }>, depois?: () => void) => rodar(async () => {
    const r = await fn()
    if (r.erro) { setErro(r.erro); return }
    setErro(''); depois?.(); router.refresh()
  })

  return (
    <Card data-ajuda="projetos.marcos" className="flex flex-col gap-3 p-4 text-sm">
      <h2 className="flex items-center gap-1.5 font-semibold"><Flag className="size-4 text-primary" />Marcos</h2>
      {marcos.length === 0 ? <p className="text-xs text-muted-foreground">Datas que não podem passar: lançamento, dia do evento, balanço.</p> : (
        <ul className="flex flex-col gap-1.5">
          {marcos.map((m) => {
            const vencido = !m.feito && m.data < hoje
            return (
              <li key={m.id} className="group flex items-center gap-2">
                <input type="checkbox" className="size-4" checked={m.feito} aria-label={`Marco ${m.titulo} cumprido`}
                  onChange={() => { const f = new FormData(); f.set('id', m.id); f.set('feito', String(!m.feito)); executar(() => alternarMarco(f)) }} />
                <span className={`w-16 shrink-0 text-xs tabular-nums ${vencido ? 'font-semibold text-destructive' : 'text-muted-foreground'}`}>{dataCurta(m.data, hoje)}</span>
                <span className={`min-w-0 flex-1 truncate ${m.feito ? 'text-muted-foreground line-through' : ''}`}>{m.titulo}</span>
                <button type="button" aria-label={`Apagar marco ${m.titulo}`} className="rounded p-0.5 text-muted-foreground opacity-0 hover:text-destructive group-hover:opacity-100 focus:opacity-100"
                  onClick={() => { if (confirm(`Apagar o marco "${m.titulo}"?`)) { const f = new FormData(); f.set('id', m.id); executar(() => excluirMarco(f)) } }}>
                  <Trash2 className="size-3.5" />
                </button>
              </li>
            )
          })}
        </ul>
      )}
      <form className="flex flex-col gap-2" onSubmit={(e) => {
        e.preventDefault()
        const f = new FormData(); f.set('projectId', projetoId); f.set('titulo', titulo); f.set('data', data)
        executar(() => criarMarco(f), () => { setTitulo(''); setData('') })
      }}>
        <input value={titulo} onChange={(e) => setTitulo(e.target.value)} maxLength={120} placeholder="Novo marco" aria-label="Nome do marco" className={campo} />
        <div className="flex gap-2">
          <input type="date" value={data} onChange={(e) => setData(e.target.value)} aria-label="Data do marco" className={`min-w-0 flex-1 ${campo}`} />
          <Button type="submit" variant="outline" disabled={ocupado || !titulo.trim() || !data}><Plus className="size-4" />Adicionar</Button>
        </div>
      </form>
      {erro && <p className="text-xs text-destructive">{erro}</p>}
    </Card>
  )
}

/**
 * A linha do tempo: pautas como barras entre início e prazo, marcos como
 * losangos, o período do projeto sombreado e uma linha no dia de hoje. A
 * escala (dias, semanas ou meses) se ajusta ao tamanho do projeto.
 */
function Cronograma({ projeto, pautas, marcos, hoje }: { projeto: ProjetoNaTela; pautas: PautaDoProjeto[]; marcos: MarcoNaTela[]; hoje: string }) {
  const router = useRouter()
  const [editando, setEditando] = useState<string | null>(null)

  const comPeriodo = pautas
    .map((p) => ({ ...p, periodo: periodoDaPauta(p.inicio, p.fim) }))
    .filter((p) => p.status !== 'archived')
  const datadas = comPeriodo.filter((p) => p.periodo).sort((a, b) => a.periodo!.inicio.localeCompare(b.periodo!.inicio))
  const semData = comPeriodo.filter((p) => !p.periodo)

  const escala = escalaDoCronograma([
    projeto.inicio, projeto.fim, ...marcos.map((m) => m.data),
    ...datadas.flatMap((p) => [p.periodo!.inicio, p.periodo!.fim]),
  ], hoje)
  const pxPorDia = escala.dias <= 45 ? 30 : escala.dias <= 200 ? 12 : 5
  const largura = Math.max(640, escala.dias * pxPorDia)
  const noIntervalo = (d: string) => d >= escala.inicio && d <= escala.fim
  const hojePos = noIntervalo(hoje) ? posicaoNaEscala(escala, hoje, hoje) : null
  const faixa = projeto.inicio && projeto.fim ? posicaoNaEscala(escala, projeto.inicio, projeto.fim) : null

  const fundo = (
    <>
      {faixa && <span aria-hidden="true" className="absolute inset-y-0 bg-primary/[0.04]" style={{ left: `${faixa.esquerda}%`, width: `${faixa.largura}%` }} />}
      {hojePos && <span aria-hidden="true" className="absolute inset-y-0 w-0.5 bg-primary/60" style={{ left: `calc(${hojePos.esquerda + hojePos.largura / 2}% - 1px)` }} />}
    </>
  )

  return (
    <div className="flex flex-col gap-4">
      <Card className="overflow-hidden p-0">
        <div className="overflow-x-auto">
          <div style={{ width: `calc(${largura}px + 15rem)` }} className="min-w-full">
            <div className="flex border-b border-border bg-muted/40">
              <Nome><span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Pauta · {escala.abertura}</span></Nome>
              <div className="relative h-9" style={{ width: largura }}>
                {escala.marcas.map((m) => {
                  const pos = posicaoNaEscala(escala, m.data, m.data)
                  return <span key={m.data} className="absolute top-2.5 whitespace-nowrap border-l border-border pl-1 text-[11px] text-muted-foreground" style={{ left: `${pos.esquerda}%` }}>{m.rotulo}</span>
                })}
              </div>
            </div>

            <div className="flex border-b border-border">
              <Nome><span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Marcos</span></Nome>
              <div className="relative h-11" style={{ width: largura }}>
                {fundo}
                {marcos.filter((m) => noIntervalo(m.data)).map((m) => {
                  const pos = posicaoNaEscala(escala, m.data, m.data)
                  return (
                    <span key={m.id} className="absolute top-1/2 flex -translate-y-1/2 items-center gap-1.5 whitespace-nowrap text-[11px] font-medium"
                      style={{ left: `calc(${pos.esquerda + pos.largura / 2}% - 6px)` }} title={`${dataCurta(m.data, hoje)} · ${m.titulo}`}>
                      <span className={`size-3 rotate-45 ${m.feito ? 'bg-muted-foreground' : 'bg-primary'}`} aria-hidden="true" />
                      <span className="rounded bg-card/90 px-1">{m.titulo}</span>
                    </span>
                  )
                })}
              </div>
            </div>

            {datadas.map((p) => {
              const pos = posicaoNaEscala(escala, p.periodo!.inicio, p.periodo!.fim)
              const pronta = p.status === 'approved'
              const atrasada = !pronta && p.periodo!.fim < hoje
              const rotulo = atrasada ? 'Atrasada' : ETAPA[p.status] ?? p.status
              // Barra de um ou dois dias não comporta o texto: ele vai ao lado.
              const curta = diasEntre(p.periodo!.inicio, p.periodo!.fim) < 2
              return (
                <div key={p.id} className="flex border-b border-border last:border-0">
                  <Nome><Link href={`/pautas/${p.id}`} className="truncate py-2.5 hover:text-primary hover:underline" title={p.titulo}>{p.titulo}</Link></Nome>
                  <div className="relative h-11" style={{ width: largura }}>
                    {fundo}
                    <button type="button" onClick={() => setEditando(editando === p.id ? null : p.id)}
                      title={`${p.titulo}: ${dataCurta(p.periodo!.inicio, hoje)} → ${dataCurta(p.periodo!.fim, hoje)} · clique para mudar as datas`}
                      className={`absolute top-1/2 flex h-6 -translate-y-1/2 items-center overflow-hidden whitespace-nowrap rounded-md px-2 text-[11px] font-semibold ${
                        pronta ? 'bg-secondary text-secondary-foreground' : atrasada ? 'bg-red-500/10 text-red-700 ring-1 ring-red-600 dark:text-red-300' : 'bg-primary/15 text-foreground ring-1 ring-primary/40'}`}
                      style={{ left: `${pos.esquerda}%`, width: `max(${pos.largura}%, 1.5rem)` }}>
                      {pronta ? <Check className="mr-1 size-3 shrink-0" /> : null}{curta ? <span className="sr-only">{rotulo}</span> : rotulo}
                    </button>
                    {curta && (
                      <span aria-hidden="true" className={`pointer-events-none absolute top-1/2 -translate-y-1/2 whitespace-nowrap pl-1.5 text-[11px] font-semibold ${atrasada ? 'text-red-700 dark:text-red-300' : 'text-muted-foreground'}`}
                        style={{ left: `calc(${pos.esquerda + pos.largura}% + 0.25rem)` }}>
                        {rotulo}
                      </span>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
        {!datadas.length && <p className="border-t border-border p-6 text-center text-sm text-muted-foreground">Nenhuma pauta com data ainda. Defina início e prazo nas pautas abaixo para elas aparecerem na linha do tempo.</p>}
      </Card>

      {editando && (() => {
        const p = comPeriodo.find((x) => x.id === editando)
        return p ? <EditorDeDatas pauta={p} aoFechar={() => setEditando(null)} aoSalvar={() => { setEditando(null); router.refresh() }} /> : null
      })()}

      <div className="flex flex-wrap gap-4 text-xs text-muted-foreground">
        <span className="flex items-center gap-1.5"><span className="size-2.5 rotate-45 bg-primary" />Marco</span>
        <span className="flex items-center gap-1.5"><span className="h-3 w-0.5 bg-primary/60" />Hoje</span>
        <span className="flex items-center gap-1.5"><span className="h-3 w-5 rounded bg-primary/[0.08]" />Período do projeto</span>
        <span className="flex items-center gap-1.5"><span className="h-3 w-5 rounded bg-red-500/10 ring-1 ring-red-600" />Pauta atrasada</span>
      </div>

      {semData.length > 0 && (
        <Card className="p-0">
          <h3 className="border-b border-border px-4 py-2.5 text-sm font-semibold">Sem datas ({semData.length})</h3>
          <ul className="divide-y divide-border">
            {semData.map((p) => (
              <li key={p.id} className="flex items-center gap-3 px-4 py-2.5 text-sm">
                <Link href={`/pautas/${p.id}`} className="min-w-0 flex-1 truncate hover:text-primary hover:underline">{p.titulo}</Link>
                <span className="text-xs text-muted-foreground">{ETAPA[p.status] ?? p.status}</span>
                <Button size="sm" variant="outline" onClick={() => setEditando(p.id)}><CalendarRange className="size-4" />Definir datas</Button>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  )
}

/** A coluna fixa com o nome da linha: fica parada quando a linha do tempo rola de lado. */
function Nome({ children }: { children: React.ReactNode }) {
  return <div className="sticky left-0 z-10 flex w-48 shrink-0 items-center border-r border-border bg-card px-3 text-sm sm:w-60">{children}</div>
}

function EditorDeDatas({ pauta, aoFechar, aoSalvar }: { pauta: PautaDoProjeto; aoFechar: () => void; aoSalvar: () => void }) {
  const [inicio, setInicio] = useState(pauta.inicio ?? '')
  const [fim, setFim] = useState(pauta.fim ?? '')
  const [erro, setErro] = useState('')
  const [salvando, salvar] = useTransition()
  return (
    <Card className="flex flex-wrap items-end gap-3 p-4" role="group" aria-label={`Datas de ${pauta.titulo}`}>
      <p className="w-full text-sm font-medium">{pauta.titulo}</p>
      <label className="flex flex-col gap-1 text-xs font-medium">Início<input type="date" value={inicio} onChange={(e) => setInicio(e.target.value)} className={campo} /></label>
      <label className="flex flex-col gap-1 text-xs font-medium">Prazo<input type="date" value={fim} min={inicio || undefined} onChange={(e) => setFim(e.target.value)} className={campo} /></label>
      <Button disabled={salvando} onClick={() => salvar(async () => {
        const f = new FormData(); f.set('id', pauta.id); f.set('inicio', inicio); f.set('fim', fim)
        const r = await definirDatasDaPauta(f)
        if (r.erro) setErro(r.erro); else aoSalvar()
      })}>{salvando && <Loader2 className="size-4 animate-spin" />}Salvar datas</Button>
      <Button variant="ghost" onClick={aoFechar}>Cancelar</Button>
      <Link href={`/pautas/${pauta.id}`} className="ml-auto text-sm text-primary hover:underline">Abrir pauta</Link>
      {erro && <p className="w-full text-xs text-destructive">{erro}</p>}
    </Card>
  )
}

function EditarProjeto({ projeto, pessoas, aoFechar }: { projeto: ProjetoNaTela; pessoas: PessoaDoProjeto[]; aoFechar: () => void }) {
  const router = useRouter()
  const [nome, setNome] = useState(projeto.nome)
  const [descricao, setDescricao] = useState(projeto.descricao)
  const [inicio, setInicio] = useState(projeto.inicio ?? '')
  const [fim, setFim] = useState(projeto.fim ?? '')
  const [responsavel, setResponsavel] = useState(projeto.responsavelId ?? '')
  const [erro, setErro] = useState('')
  const [salvando, salvar] = useTransition()

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-foreground/45 p-4 py-10"
      onMouseDown={(e) => { if (e.target === e.currentTarget && !salvando) aoFechar() }} role="dialog" aria-modal="true" aria-labelledby="editar-projeto-titulo">
      <Card className="w-full max-w-lg p-0 shadow-2xl">
        <header className="flex items-center justify-between border-b border-border px-5 py-4">
          <h2 id="editar-projeto-titulo" className="font-semibold">Editar projeto</h2>
          <button type="button" onClick={aoFechar} aria-label="Fechar" className="rounded-md p-1 text-muted-foreground hover:bg-muted"><X className="size-5" /></button>
        </header>
        <div className="grid gap-3 px-5 py-4 sm:grid-cols-2">
          <label className="flex flex-col gap-1 text-sm font-medium sm:col-span-2">Nome<input value={nome} onChange={(e) => setNome(e.target.value)} maxLength={120} className={campo} /></label>
          <label className="flex flex-col gap-1 text-sm font-medium sm:col-span-2">Objetivo<textarea value={descricao} onChange={(e) => setDescricao(e.target.value)} rows={3} className={campo} /></label>
          <label className="flex flex-col gap-1 text-sm font-medium">Início<input type="date" value={inicio} onChange={(e) => setInicio(e.target.value)} className={campo} /></label>
          <label className="flex flex-col gap-1 text-sm font-medium">Prazo final<input type="date" value={fim} min={inicio || undefined} onChange={(e) => setFim(e.target.value)} className={campo} /></label>
          <label className="flex flex-col gap-1 text-sm font-medium sm:col-span-2">Responsável
            <select value={responsavel} onChange={(e) => setResponsavel(e.target.value)} className={campo}>
              <option value="">Sem responsável</option>
              {pessoas.map((p) => <option key={p.id} value={p.id}>{p.nome}</option>)}
            </select>
          </label>
        </div>
        {erro && <p className="px-5 text-xs text-destructive">{erro}</p>}
        <div className="flex justify-end gap-2 px-5 py-4">
          <Button variant="outline" onClick={aoFechar} disabled={salvando}>Cancelar</Button>
          <Button disabled={salvando || nome.trim().length < 3} onClick={() => salvar(async () => {
            const f = new FormData()
            f.set('id', projeto.id); f.set('nome', nome); f.set('descricao', descricao); f.set('inicio', inicio); f.set('fim', fim); f.set('responsavel', responsavel)
            const r = await atualizarProjeto(f)
            if (r.erro) { setErro(r.erro); return }
            aoFechar(); router.refresh()
          })}>{salvando && <Loader2 className="size-4 animate-spin" />}Salvar</Button>
        </div>
      </Card>
    </div>,
    document.body,
  )
}
