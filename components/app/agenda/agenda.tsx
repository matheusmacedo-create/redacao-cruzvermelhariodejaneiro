'use client'

import { useMemo, useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { AlertTriangle, BellRing, ChevronLeft, ChevronRight, Info, Layers, Plus, Settings2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { criarPautaDaData, salvarCamadasOcultas } from '@/app/actions/agenda'
import { CAMADAS, ROTULO_DO_ESTADO, type Camada, type ItemDaAgenda } from '@/lib/agenda/camadas'
import { DIAS_CURTOS, DIAS_DA_SEMANA, MESES, rotuloDoDia, somarDias, type DataComemorativa } from '@/lib/agenda/datas'
import { alertasDaAgenda, type Alerta } from '@/lib/agenda/regras'
import { VISOES, diasEntre, ehLongo, naJanela, noDia, type Janela as JanelaDaVisao, type Visao } from '@/lib/agenda/visao'
import { cn } from '@/lib/utils'
import { Agendar } from './agendar'
import { Configuracoes } from './configuracoes'
import { Janela } from './janela'

type Props = {
  itens: ItemDaAgenda[]
  visao: Visao
  dia: string
  janela: JanelaDaVisao
  agora: { dia: string; hora: string }
  alertasAte: string
  disponiveis: Camada[]
  ocultasIniciais: Camada[]
  falhas: Camada[]
  instalada: boolean
  resumoSemanal: boolean
  link: { camadas: Camada[]; criadoEm: string | null } | null
  datas: DataComemorativa[]
  podeEditarDatas: boolean
  abrirConfiguracoes: boolean
}

const MAXIMO_NO_DIA = 3
const ALERTAS_VISIVEIS = 6
const endereco = (visao: Visao, dia: string) => `/calendario?visao=${visao}&dia=${dia}`

export function Agenda(p: Props) {
  const router = useRouter()
  const [ocultas, setOcultas] = useState<Set<Camada>>(() => new Set(p.ocultasIniciais))
  const [avisoDasCamadas, setAvisoDasCamadas] = useState<string | null>(null)
  const [, iniciar] = useTransition()
  const [selecionado, setSelecionado] = useState<ItemDaAgenda | null>(null)
  const [diaAberto, setDiaAberto] = useState<string | null>(null)
  const [agendar, setAgendar] = useState<string | null>(null)
  const [configAberta, setConfigAberta] = useState(p.abrirConfiguracoes)
  const [todosOsAlertas, setTodosOsAlertas] = useState(false)
  const [camadasNoCelular, setCamadasNoCelular] = useState(false)

  const visiveis = useMemo(() => p.disponiveis.filter((c) => !ocultas.has(c)), [p.disponiveis, ocultas])
  const itens = useMemo(() => p.itens.filter((i) => !ocultas.has(i.camada)), [p.itens, ocultas])
  const alertas = useMemo(() => alertasDaAgenda(itens, p.agora, p.alertasAte), [itens, p.agora, p.alertasAte])
  const naTela = useMemo(() => itens.filter((i) => naJanela(i, p.janela.de, p.janela.ate)), [itens, p.janela])
  // No mês, a faixa do alto é só do mês (a grade começa e termina com dias dos meses vizinhos).
  const periodo = p.visao === 'mes' ? { de: `${p.dia.slice(0, 7)}-01`, ate: somarDias(p.janela.proximo, -1) } : p.janela
  const longos = naTela.filter((i) => ehLongo(i) && naJanela(i, periodo.de, periodo.ate))
  const doDia = (dia: string) => naTela.filter((i) => noDia(i, dia) && !ehLongo(i) && i.camada !== 'feriados')
  const feriadoDo = (dia: string) => naTela.find((i) => i.camada === 'feriados' && i.dia === dia)

  function alternar(camadas: Camada[], mostrar: boolean) {
    const nova = new Set(ocultas)
    for (const c of camadas) { if (mostrar) nova.delete(c); else nova.add(c) }
    definir(nova)
  }

  function definir(nova: Set<Camada>) {
    setOcultas(nova)
    iniciar(async () => {
      const r = await salvarCamadasOcultas([...nova])
      setAvisoDasCamadas(r.erro ?? null)
    })
  }

  const abrirItem = (i: ItemDaAgenda) => { setDiaAberto(null); setSelecionado(i) }
  const camadas = <Camadas disponiveis={p.disponiveis} ocultas={ocultas} alternar={alternar} soEsta={(c) => definir(new Set(p.disponiveis.filter((x) => x !== c)))} aviso={avisoDasCamadas} falhas={p.falhas} />
  const painelDeAlertas = <Alertas alertas={alertas} todos={todosOsAlertas} verTodos={() => setTodosOsAlertas(true)} abrir={abrirItem} itens={itens} />

  return (
    <div className="grid gap-5 lg:grid-cols-[13rem_minmax(0,1fr)] 2xl:grid-cols-[15rem_minmax(0,1fr)]">
      {/* No computador, camadas e alertas moram na coluna da esquerda; no celular, as camadas abrem por um botão e os alertas vêm depois da agenda. */}
      <aside className="hidden flex-col gap-4 lg:flex">
        {camadas}
        {painelDeAlertas}
      </aside>

      <div className="flex min-w-0 flex-col gap-4">
        <div className="flex flex-wrap items-center gap-2">
          <div data-ajuda="calendario.mes" className="flex items-center gap-1">
            <Link href={endereco(p.visao, p.janela.anterior)} aria-label="Anterior" className="inline-flex size-9 items-center justify-center rounded-lg border border-border hover:bg-muted"><ChevronLeft className="size-4" aria-hidden="true" /></Link>
            <Link href={endereco(p.visao, p.agora.dia)} className="inline-flex h-9 items-center rounded-lg border border-border px-3 text-sm font-medium hover:bg-muted">Hoje</Link>
            <Link href={endereco(p.visao, p.janela.proximo)} aria-label="Próximo" className="inline-flex size-9 items-center justify-center rounded-lg border border-border hover:bg-muted"><ChevronRight className="size-4" aria-hidden="true" /></Link>
            <h2 className="ml-2 text-lg font-semibold">{p.janela.titulo}</h2>
          </div>
          <div className="ml-auto flex flex-wrap items-center gap-2">
            <div data-ajuda="calendario.visao" role="group" aria-label="Visão" className="inline-flex rounded-lg border border-border p-0.5">
              {(Object.keys(VISOES) as Visao[]).map((v) => (
                <Link key={v} href={endereco(v, v === 'lista' && p.visao !== 'lista' ? (p.janela.de <= p.agora.dia && p.agora.dia <= p.janela.ate ? p.agora.dia : p.dia) : p.dia)} aria-current={v === p.visao ? 'page' : undefined}
                  className={cn('rounded-md px-3 py-1.5 text-sm', v === p.visao ? 'bg-primary text-primary-foreground' : 'hover:bg-muted')}>{VISOES[v]}</Link>
              ))}
            </div>
            <Button variant="outline" size="lg" className="lg:hidden" aria-expanded={camadasNoCelular} onClick={() => setCamadasNoCelular((v) => !v)}>
              <Layers aria-hidden="true" />Camadas{ocultas.size > 0 && <span className="text-xs text-muted-foreground">{p.disponiveis.length - p.disponiveis.filter((c) => ocultas.has(c)).length}/{p.disponiveis.length}</span>}
            </Button>
            <Button data-ajuda="calendario.configurar" variant="outline" size="lg" onClick={() => setConfigAberta(true)}><Settings2 aria-hidden="true" /><span className="sr-only sm:not-sr-only">Configurar</span></Button>
            <Button data-ajuda="calendario.agendar" size="lg" onClick={() => setAgendar(p.agora.dia)}><Plus className="size-4" aria-hidden="true" />Agendar</Button>
          </div>
        </div>

        {camadasNoCelular && <div className="lg:hidden">{camadas}</div>}

        {longos.length > 0 && (
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <span className="text-muted-foreground">Durante o período:</span>
            {longos.map((i) => (
              <button key={i.id} type="button" onClick={() => abrirItem(i)} className={cn('rounded-full border px-2.5 py-0.5 text-xs font-medium', CAMADAS[i.camada].chip)}>{i.titulo}</button>
            ))}
          </div>
        )}

        {p.visao === 'mes' && (
          <>
            <ListaDeDias className="sm:hidden" dias={diasEntre(p.janela.de, p.janela.ate).filter((d) => d.slice(0, 7) === p.dia.slice(0, 7))} doDia={doDia} feriadoDo={feriadoDo} hoje={p.agora.dia} abrir={abrirItem} vazio="Nada neste mês nas camadas ligadas." />
            <Card data-ajuda="calendario.grade" className="hidden overflow-hidden sm:block">
              <div className="grid grid-cols-7 border-b border-border bg-muted/40 text-xs font-medium text-muted-foreground">
                {DIAS_CURTOS.map((d) => <div key={d} className="px-2 py-2">{d}</div>)}
              </div>
              <div className="grid grid-cols-7">
                {diasEntre(p.janela.de, p.janela.ate).map((dia) => {
                  const lista = doDia(dia)
                  const feriado = feriadoDo(dia)
                  const foraDoMes = dia.slice(0, 7) !== p.dia.slice(0, 7)
                  return (
                    <div key={dia} className={cn('group min-h-28 border-b border-r border-border p-1.5 [&:nth-child(7n)]:border-r-0', foraDoMes && 'bg-muted/30')}>
                      <div className="mb-1 flex items-start justify-between gap-1">
                        <button type="button" onClick={() => setDiaAberto(dia)} aria-label={`Abrir ${rotuloDoDia(dia)}`}
                          className={cn('inline-flex size-7 items-center justify-center rounded-full text-xs font-medium hover:bg-muted', dia === p.agora.dia && 'bg-primary text-primary-foreground hover:bg-primary/90', foraDoMes && dia !== p.agora.dia && 'text-muted-foreground')}>
                          {Number(dia.slice(8))}
                        </button>
                        <button type="button" onClick={() => setAgendar(dia)} aria-label={`Agendar em ${rotuloDoDia(dia)}`} className="invisible inline-flex size-6 items-center justify-center rounded text-muted-foreground hover:bg-muted group-hover:visible focus-visible:visible"><Plus className="size-3.5" aria-hidden="true" /></button>
                      </div>
                      {feriado && <p className="mb-1 truncate px-1 text-[11px] text-muted-foreground" title={feriado.titulo}>{feriado.titulo}</p>}
                      <div className="flex flex-col gap-1">
                        {lista.slice(0, MAXIMO_NO_DIA).map((i) => <Item key={i.id} item={i} compacto abrir={abrirItem} />)}
                        {lista.length > MAXIMO_NO_DIA && (
                          <button type="button" onClick={() => setDiaAberto(dia)} className="rounded px-1 text-left text-xs font-medium text-muted-foreground hover:bg-muted">+{lista.length - MAXIMO_NO_DIA} mais</button>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            </Card>
          </>
        )}

        {p.visao === 'semana' && (
          <div data-ajuda="calendario.grade" className="grid gap-2 sm:grid-cols-7">
            {diasEntre(p.janela.de, p.janela.ate).map((dia) => {
              const feriado = feriadoDo(dia)
              return (
                <Card key={dia} className={cn('flex min-h-40 flex-col gap-1.5 p-2', dia === p.agora.dia && 'ring-2 ring-primary')}>
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-medium text-muted-foreground">{DIAS_CURTOS[new Date(`${dia}T12:00:00Z`).getUTCDay()]} <span className="text-base font-semibold text-foreground">{Number(dia.slice(8))}</span></span>
                    <button type="button" onClick={() => setAgendar(dia)} aria-label={`Agendar em ${rotuloDoDia(dia)}`} className="inline-flex size-6 items-center justify-center rounded text-muted-foreground hover:bg-muted"><Plus className="size-3.5" aria-hidden="true" /></button>
                  </div>
                  {feriado && <p className="text-[11px] text-muted-foreground">{feriado.titulo}</p>}
                  {doDia(dia).map((i) => <Item key={i.id} item={i} compacto inteiro abrir={abrirItem} />)}
                </Card>
              )
            })}
          </div>
        )}

        {p.visao === 'lista' && (
          <ListaDeDias data-ajuda="calendario.grade" dias={diasEntre(p.janela.de, p.janela.ate)} doDia={doDia} feriadoDo={feriadoDo} hoje={p.agora.dia} abrir={abrirItem} vazio="Nada nestes 30 dias nas camadas ligadas." />
        )}

        <div className="lg:hidden">{painelDeAlertas}</div>
      </div>

      <Janela aberta={selecionado !== null} aoFechar={() => setSelecionado(null)} titulo={selecionado?.titulo ?? ''}>
        {selecionado && <Detalhe item={selecionado} aoCriarPauta={(id) => { setSelecionado(null); router.push(`/pautas/${id}`) }} />}
      </Janela>

      <Janela aberta={diaAberto !== null} aoFechar={() => setDiaAberto(null)} titulo={diaAberto ? tituloDoDia(diaAberto) : ''}>
        {diaAberto && (
          <div className="flex flex-col gap-2">
            {feriadoDo(diaAberto) && <p className="text-sm text-muted-foreground">{feriadoDo(diaAberto)!.titulo} · {feriadoDo(diaAberto)!.detalhe}</p>}
            {doDia(diaAberto).map((i) => <Item key={i.id} item={i} abrir={abrirItem} />)}
            {!doDia(diaAberto).length && <p className="text-sm text-muted-foreground">Nada neste dia nas camadas ligadas.</p>}
            <Button type="button" variant="outline" className="mt-2" onClick={() => { const d = diaAberto; setDiaAberto(null); setAgendar(d) }}><Plus aria-hidden="true" />Agendar neste dia</Button>
          </div>
        )}
      </Janela>

      <Agendar aberta={agendar !== null} aoFechar={() => setAgendar(null)} diaInicial={agendar ?? p.agora.dia} />

      <Janela aberta={configAberta} aoFechar={() => setConfigAberta(false)} titulo="Configurar a agenda" larga>
        <Configuracoes instalada={p.instalada} resumoSemanal={p.resumoSemanal} link={p.link} visiveis={visiveis} disponiveis={p.disponiveis} datas={p.datas} podeEditarDatas={p.podeEditarDatas} />
      </Janela>
    </div>
  )
}

function tituloDoDia(dia: string) {
  const d = new Date(`${dia}T12:00:00Z`)
  return `${DIAS_DA_SEMANA[d.getUTCDay()]}, ${d.getUTCDate()} de ${MESES[d.getUTCMonth()].toLowerCase()}`
}

function Camadas({ disponiveis, ocultas, alternar, soEsta, aviso, falhas }: {
  disponiveis: Camada[]; ocultas: Set<Camada>; alternar: (c: Camada[], mostrar: boolean) => void; soEsta: (c: Camada) => void; aviso: string | null; falhas: Camada[]
}) {
  const todasLigadas = disponiveis.every((c) => !ocultas.has(c))
  return (
    <section className="rounded-xl border border-border bg-card p-3" data-ajuda="calendario.camadas" aria-labelledby="camadas-titulo">
      <h2 id="camadas-titulo" className="text-sm font-semibold">Minhas agendas</h2>
      <ul className="mt-2 flex flex-col gap-0.5">
        {disponiveis.map((c) => {
          const ligada = !ocultas.has(c)
          return (
            <li key={c} className="group/camada flex items-center gap-1">
              <label className="flex min-w-0 flex-1 cursor-pointer items-center gap-2 rounded-md px-1.5 py-1 text-sm hover:bg-muted" title={CAMADAS[c].descricao}>
                <input type="checkbox" className="peer sr-only" checked={ligada} onChange={(e) => alternar([c], e.target.checked)} />
                <span aria-hidden="true" className={cn('flex size-4 shrink-0 items-center justify-center rounded border-2 peer-focus-visible:outline-2 peer-focus-visible:outline-ring', ligada ? `${CAMADAS[c].cor} border-transparent` : 'border-muted-foreground/40 bg-transparent')}>
                  {ligada && <svg viewBox="0 0 12 12" className="size-3 text-white"><path d="M2.5 6.5l2.2 2.2L9.5 3.8" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>}
                </span>
                <span className={cn('truncate', !ligada && 'text-muted-foreground')}>{CAMADAS[c].nome}</span>
              </label>
              <button type="button" onClick={() => soEsta(c)}
                className="invisible shrink-0 rounded px-1 text-[11px] text-muted-foreground hover:bg-muted hover:text-foreground group-hover/camada:visible focus-visible:visible">só esta</button>
            </li>
          )
        })}
      </ul>
      {!todasLigadas && <button type="button" onClick={() => alternar(disponiveis, true)} className="mt-2 text-xs font-medium text-primary hover:underline">Ligar todas</button>}
      {aviso && <p className="mt-2 text-xs text-amber-700 dark:text-amber-400">{aviso}</p>}
      {falhas.length > 0 && <p className="mt-2 text-xs text-destructive">Não deu para carregar: {falhas.map((c) => CAMADAS[c].nome).join(', ')}.</p>}
    </section>
  )
}

const ICONE_DO_ALERTA = { urgente: AlertTriangle, atencao: BellRing, info: Info }
const COR_DO_ALERTA = { urgente: 'text-destructive', atencao: 'text-amber-600 dark:text-amber-400', info: 'text-muted-foreground' }

function Alertas({ alertas, todos, verTodos, abrir, itens }: { alertas: Alerta[]; todos: boolean; verTodos: () => void; abrir: (i: ItemDaAgenda) => void; itens: ItemDaAgenda[] }) {
  const mostrados = todos ? alertas : alertas.slice(0, ALERTAS_VISIVEIS)
  return (
    <section data-ajuda="calendario.alertas" aria-labelledby="alertas-titulo" className="rounded-xl border border-border bg-card p-3">
      <h2 id="alertas-titulo" className="text-sm font-semibold">Pede atenção {alertas.length > 0 && <span className="ml-1 rounded-full bg-muted px-1.5 py-0.5 text-xs font-medium">{alertas.length}</span>}</h2>
      {!alertas.length && <p className="mt-2 text-sm text-muted-foreground">Nada por agora nas camadas ligadas.</p>}
      <ul className="mt-2 flex flex-col gap-2">
        {mostrados.map((a) => {
          const Icone = ICONE_DO_ALERTA[a.nivel]
          const item = itens.find((i) => a.id.endsWith(i.id))
          return (
            <li key={a.id} className="flex gap-2 text-sm">
              <Icone className={cn('mt-0.5 size-4 shrink-0', COR_DO_ALERTA[a.nivel])} aria-hidden="true" />
              <div className="min-w-0">
                {item ? (
                  <button type="button" onClick={() => abrir(item)} className="text-left font-medium hover:underline">{a.titulo}</button>
                ) : a.href ? (
                  <Link href={a.href} className="font-medium hover:underline">{a.titulo}</Link>
                ) : (
                  <Link href={endereco('semana', a.dia)} className="font-medium hover:underline">{a.titulo}</Link>
                )}
                <p className="text-xs text-muted-foreground">{a.detalhe}</p>
              </div>
            </li>
          )
        })}
      </ul>
      {!todos && alertas.length > ALERTAS_VISIVEIS && <button type="button" onClick={verTodos} className="mt-2 text-xs font-medium text-primary hover:underline">Ver os {alertas.length}</button>}
    </section>
  )
}

function Item({ item, compacto = false, inteiro = false, abrir }: { item: ItemDaAgenda; compacto?: boolean; inteiro?: boolean; abrir: (i: ItemDaAgenda) => void }) {
  const legenda = [item.hora, item.canal, item.estado ? ROTULO_DO_ESTADO[item.estado] : null].filter(Boolean).join(' · ')
  return (
    <button type="button" onClick={() => abrir(item)} title={item.titulo}
      className={cn('block w-full rounded-md border-l-2 text-left hover:brightness-95 dark:hover:brightness-125', CAMADAS[item.camada].chip, compacto ? 'px-1.5 py-0.5 text-xs' : 'px-3 py-2 text-sm')}>
      <span className={cn('block font-medium', compacto && !inteiro && 'truncate', inteiro && 'break-words')}>{item.titulo}</span>
      {legenda && <span className={cn('block opacity-75', compacto ? 'text-[11px]' : 'text-xs', compacto && !inteiro && 'truncate')}>{legenda}</span>}
    </button>
  )
}

function ListaDeDias({ dias, doDia, feriadoDo, hoje, abrir, vazio, className, ...resto }: {
  dias: string[]; doDia: (d: string) => ItemDaAgenda[]; feriadoDo: (d: string) => ItemDaAgenda | undefined; hoje: string
  abrir: (i: ItemDaAgenda) => void; vazio: string; className?: string; 'data-ajuda'?: string
}) {
  const comAlgo = dias.map((dia) => ({ dia, lista: doDia(dia), feriado: feriadoDo(dia) })).filter((d) => d.lista.length || d.feriado)
  return (
    <Card data-ajuda={resto['data-ajuda'] ?? 'calendario.grade'} className={cn('divide-y divide-border', className)}>
      {!comAlgo.length && <p className="p-4 text-sm text-muted-foreground">{vazio}</p>}
      {comAlgo.map(({ dia, lista, feriado }) => (
        <div key={dia} className="flex gap-3 p-3">
          <div className={cn('w-12 shrink-0 text-center', dia === hoje && 'text-primary')}>
            <span className="block text-xs uppercase text-muted-foreground">{DIAS_CURTOS[new Date(`${dia}T12:00:00Z`).getUTCDay()]}</span>
            <span className="block text-xl font-semibold">{Number(dia.slice(8))}</span>
            <span className="block text-[11px] text-muted-foreground">{MESES[Number(dia.slice(5, 7)) - 1].slice(0, 3).toLowerCase()}</span>
          </div>
          <div className="flex min-w-0 flex-1 flex-col gap-1.5">
            {feriado && <p className="text-xs text-muted-foreground">{feriado.titulo} · {feriado.detalhe}</p>}
            {lista.map((i) => <Item key={i.id} item={i} abrir={abrir} />)}
          </div>
        </div>
      ))}
    </Card>
  )
}

function Detalhe({ item, aoCriarPauta }: { item: ItemDaAgenda; aoCriarPauta: (pautaId: string) => void }) {
  const [pendente, iniciar] = useTransition()
  const [erro, setErro] = useState<string | null>(null)
  const quando = item.ate && item.ate !== item.dia ? `De ${rotuloDoDia(item.dia)} a ${rotuloDoDia(item.ate)}` : `${rotuloDoDia(item.dia)}${item.hora ? ` às ${item.hora}` : ''}`
  const podeCriarPauta = item.camada === 'datas' && !item.temPauta && item.dataComemorativaId
  return (
    <div className="flex flex-col gap-3 text-sm">
      <p className="flex items-center gap-2"><span aria-hidden="true" className={cn('size-2.5 rounded-full', CAMADAS[item.camada].cor)} />{CAMADAS[item.camada].nome}</p>
      <p className="first-letter:uppercase">{quando}</p>
      {(item.canal || item.estado) && <p className="text-muted-foreground">{[item.canal, item.estado ? ROTULO_DO_ESTADO[item.estado] : null].filter(Boolean).join(' · ')}</p>}
      {item.detalhe && <p className="whitespace-pre-line text-muted-foreground">{item.detalhe}</p>}
      {item.camada === 'datas' && item.temPauta && <p className="text-emerald-700 dark:text-emerald-400">Já tem pauta neste ano.</p>}
      {erro && <p role="alert" className="rounded-lg bg-destructive/10 px-3 py-2 text-destructive">{erro}</p>}
      <div className="mt-1 flex flex-wrap gap-2">
        {podeCriarPauta && (
          <Button type="button" disabled={pendente} onClick={() => iniciar(async () => {
            const r = await criarPautaDaData(item.dataComemorativaId!, Number(item.dia.slice(0, 4)))
            if (r.erro || !r.id) setErro(r.erro ?? 'Não foi possível criar a pauta.')
            else aoCriarPauta(r.id)
          })}>{pendente ? 'Criando…' : 'Criar pauta'}</Button>
        )}
        {item.href && <Link href={item.href} className="inline-flex h-8 items-center rounded-lg border border-border px-3 text-sm font-medium hover:bg-muted">{item.camada === 'datas' ? 'Abrir a pauta' : 'Abrir'}</Link>}
      </div>
    </div>
  )
}
