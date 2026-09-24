import Link from 'next/link'
import { AlertTriangle, ArrowRight, Check, ChevronLeft, ChevronRight, TrendingDown, TrendingUp, X } from 'lucide-react'
import { Card } from '@/components/ui/card'
import { Avatar } from '@/components/ui/avatar'
import { privateAvatarUrl } from '@/lib/avatar-url'
import { BarraDeProgresso, dataCurta, PillDaSituacao, type PessoaDoProjeto } from '@/components/app/projetos/comum'
import { haQuanto, type SituacaoNaTela } from '@/lib/projetos/cronograma'
import {
  cortarGrupos, pontosDaLinha, ROTULO_DA_COLUNA, ROTULO_DO_GRUPO,
  type Comparacao, type GrupoDePautas, type ItemDaSemana, type SaudeDoCanal,
} from '@/lib/dashboard/painel'

// ---------------------------------------------------------------------------
// Peças comuns
// ---------------------------------------------------------------------------

export function Secao({ titulo, acao, children, id }: { titulo: string; acao?: { href: string; rotulo: string }; children: React.ReactNode; id?: string }) {
  return (
    <section aria-labelledby={id} className="min-w-0">
      <div className="mb-3 flex items-center justify-between gap-3">
        <h2 id={id} className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">{titulo}</h2>
        {acao && <Link href={acao.href} className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline">{acao.rotulo}<ArrowRight className="size-3" /></Link>}
      </div>
      {children}
    </section>
  )
}

/** O título de cada camada: o que ela responde, em uma linha. */
export function Camada({ nome, pergunta, lado, children }: { nome: string; pergunta: string; lado?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end justify-between gap-3 border-b border-border pb-2">
        <div>
          <p className="text-lg font-bold tracking-tight">{nome}</p>
          <p className="text-xs text-muted-foreground">{pergunta}</p>
        </div>
        {lado}
      </div>
      {children}
    </div>
  )
}

function Pessoa({ p, tamanho = 'xs' }: { p?: PessoaDoProjeto; tamanho?: 'xs' | 'sm' }) {
  return <Avatar size={tamanho} initials={p?.iniciais ?? '?'} color={p?.cor ?? undefined} src={privateAvatarUrl(p?.avatar ?? null)} alt={p?.nome ?? ''} />
}

// ---------------------------------------------------------------------------
// Camada 1 — o meu dia
// ---------------------------------------------------------------------------

export type MinhaPauta = {
  id: string
  titulo: string
  status: string
  prazo: string | null
  criadaEm: string
  etiquetas: { id: string; nome: string; cor: string }[]
}

export function MinhasPautas({ grupos, total, hoje }: { grupos: { grupo: GrupoDePautas; pautas: MinhaPauta[] }[]; total: number; hoje: string }) {
  const cortados = cortarGrupos(grupos, 9)
  return (
    <Secao titulo="Minhas pautas" id="minhas-pautas" acao={{ href: '/pautas', rotulo: 'Abrir o quadro' }}>
      <Card className="overflow-hidden p-0">
        {!total ? (
          <p className="p-8 text-center text-sm text-muted-foreground">Nenhuma pauta sua em aberto. As pautas em que você é responsável aparecem aqui, separadas por prazo.</p>
        ) : cortados.map((g) => (
          <div key={g.grupo}>
            <div className={`flex items-center justify-between border-b border-border bg-muted/40 px-4 py-1.5 text-xs font-semibold ${g.grupo === 'atrasadas' ? 'text-destructive' : 'text-muted-foreground'}`}>
              <span className="inline-flex items-center gap-1.5">{g.grupo === 'atrasadas' && <AlertTriangle className="size-3.5" aria-hidden="true" />}{ROTULO_DO_GRUPO[g.grupo]}</span>
              <span className="tabular-nums">{g.pautas.length}</span>
            </div>
            {g.mostrar.map((p) => (
              <Link key={p.id} href={`/pautas/${p.id}`} className="flex min-w-0 items-center gap-3 border-b border-border px-4 py-2.5 text-sm transition-colors last:border-b-0 hover:bg-muted/40">
                <span className="min-w-0 flex-1 truncate font-medium">{p.titulo}</span>
                <span className="hidden shrink-0 gap-1 sm:flex">
                  {p.etiquetas.slice(0, 2).map((e) => (
                    <span key={e.id} className="max-w-28 truncate rounded px-1.5 py-0.5 text-[10.5px] font-semibold text-white" style={{ backgroundColor: e.cor }}>{e.nome}</span>
                  ))}
                </span>
                <span className="hidden w-20 shrink-0 text-xs text-muted-foreground md:block">{ROTULO_DA_COLUNA[p.status] ?? p.status}</span>
                <span className={`w-16 shrink-0 text-right text-xs tabular-nums ${g.grupo === 'atrasadas' ? 'font-semibold text-destructive' : 'text-muted-foreground'}`}>{p.prazo ? dataCurta(p.prazo, hoje) : '—'}</span>
              </Link>
            ))}
            {g.ocultas > 0 && (
              <Link href="/pautas" className="block border-b border-border px-4 py-2 text-xs text-muted-foreground last:border-b-0 hover:text-foreground">
                + {g.ocultas} {g.ocultas === 1 ? 'pauta' : 'pautas'} em “{ROTULO_DO_GRUPO[g.grupo]}” no quadro
              </Link>
            )}
          </div>
        ))}
      </Card>
    </Secao>
  )
}

export type PedidoDeAprovacao = { id: string; titulo: string; pedidoEm: string; quem?: PessoaDoProjeto }

export function EsperandoVoce({ pedidos, hoje }: { pedidos: PedidoDeAprovacao[]; hoje: string }) {
  return (
    <Secao titulo="Esperando você" id="esperando-voce" acao={{ href: '/aprovacoes', rotulo: 'Aprovações' }}>
      <Card className="divide-y divide-border overflow-hidden p-0">
        {pedidos.map((a) => (
          <Link key={a.id} href={`/aprovacoes/${a.id}`} className="flex min-w-0 items-center gap-3 px-4 py-2.5 text-sm transition-colors hover:bg-muted/40">
            <Pessoa p={a.quem} />
            <span className="min-w-0 flex-1 truncate">{a.titulo}</span>
            <span className="shrink-0 text-xs text-muted-foreground">{haQuanto(a.pedidoEm, hoje)}</span>
          </Link>
        ))}
        {!pedidos.length && <p className="px-4 py-6 text-center text-sm text-muted-foreground">Nada esperando a sua decisão.</p>}
      </Card>
    </Secao>
  )
}

export type ItemDoFeed = { id: string; quem?: PessoaDoProjeto; frase: string; quando: string; href: string | null }

const HORA = new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo', hour: '2-digit', minute: '2-digit' })

function quandoNoFeed(instante: string, hoje: string, dia: string) {
  return dia === hoje ? HORA.format(new Date(instante)) : haQuanto(dia, hoje)
}

export function EquipeAgora({ itens, hoje }: { itens: (ItemDoFeed & { dia: string })[]; hoje: string }) {
  return (
    <Secao titulo="A equipe agora" id="equipe-agora">
      <Card className="divide-y divide-border overflow-hidden p-0">
        {itens.map((i) => {
          const corpo = (
            <>
              <Pessoa p={i.quem} />
              <p className="min-w-0 flex-1 text-muted-foreground">
                <span className="font-semibold text-foreground">{i.quem?.nome.split(' ')[0] ?? 'Alguém'}</span> {i.frase}
                <span className="whitespace-nowrap text-xs"> · {quandoNoFeed(i.quando, hoje, i.dia)}</span>
              </p>
            </>
          )
          return i.href
            ? <Link key={i.id} href={i.href} className="flex items-start gap-3 px-4 py-2.5 text-sm transition-colors hover:bg-muted/40">{corpo}</Link>
            : <div key={i.id} className="flex items-start gap-3 px-4 py-2.5 text-sm">{corpo}</div>
        })}
        {!itens.length && <p className="px-4 py-6 text-center text-sm text-muted-foreground">Sem movimento registrado ainda.</p>}
      </Card>
    </Secao>
  )
}

export type ProjetoNoPainel = {
  id: string
  nome: string
  situacao: SituacaoNaTela
  pct: number
  fim: string | null
  meu: boolean
  vencido: boolean
}

export function ProjetosNoPainel({ projetos, hoje }: { projetos: ProjetoNoPainel[]; hoje: string }) {
  if (!projetos.length) return null
  return (
    <Secao titulo="Projetos em andamento" id="projetos-painel" acao={{ href: '/projetos', rotulo: 'Carteira' }}>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {projetos.map((p) => (
          <Link key={p.id} href={`/projetos/${p.id}`}>
            <Card className="flex h-full flex-col gap-2.5 p-4 transition-colors hover:bg-muted/40">
              <div className="flex items-start justify-between gap-2">
                <p className="line-clamp-2 text-sm font-semibold">{p.nome}</p>
                {p.meu && <span className="shrink-0 rounded bg-primary/10 px-1.5 py-0.5 text-[10px] font-semibold text-primary">Meu</span>}
              </div>
              <span className="self-start"><PillDaSituacao situacao={p.situacao} /></span>
              <div className="mt-auto flex items-center justify-between gap-3">
                <BarraDeProgresso pct={p.pct} rotulo={`Progresso de ${p.nome}`} />
                <span className={`shrink-0 text-xs tabular-nums ${p.vencido ? 'font-semibold text-destructive' : 'text-muted-foreground'}`}>{p.fim ? dataCurta(p.fim, hoje) : 'sem prazo'}</span>
              </div>
            </Card>
          </Link>
        ))}
      </div>
    </Secao>
  )
}

// ---------------------------------------------------------------------------
// Camada 2 — a semana
// ---------------------------------------------------------------------------

export function NavegacaoDaSemana({ anterior, proxima, ehAtual }: { anterior: string; proxima: string; ehAtual: boolean }) {
  const botao = 'inline-flex items-center gap-1 rounded-lg border border-border bg-background px-2.5 py-1.5 text-xs font-medium transition-colors hover:bg-muted'
  return (
    <nav className="flex items-center gap-1.5" aria-label="Navegar entre semanas">
      <Link href={`/dashboard?semana=${anterior}#semana`} className={botao} aria-label="Semana anterior"><ChevronLeft className="size-3.5" />Anterior</Link>
      {!ehAtual && <Link href="/dashboard#semana" className={botao}>Esta semana</Link>}
      <Link href={`/dashboard?semana=${proxima}#semana`} className={botao} aria-label="Próxima semana">Próxima<ChevronRight className="size-3.5" /></Link>
    </nav>
  )
}

export function Contador({ valor, rotulo, href, alerta }: { valor: number; rotulo: string; href?: string; alerta?: boolean }) {
  const corpo = (
    <Card className={`h-full p-3.5 transition-colors ${href ? 'hover:bg-muted/40' : ''} ${alerta ? 'border-destructive/60' : ''}`}>
      <p className={`text-2xl font-bold tabular-nums ${alerta ? 'text-destructive' : ''}`}>{valor}</p>
      <p className="text-xs text-muted-foreground">{rotulo}</p>
    </Card>
  )
  return href ? <Link href={href}>{corpo}</Link> : corpo
}

const NOME_DO_DIA = ['seg', 'ter', 'qua', 'qui', 'sex', 'sáb', 'dom']
const ROTULO_DO_TIPO: Record<string, string> = { prazo: 'Prazo', atividade: 'Atividade', publicacao: 'Publicação' }
const MAX_POR_DIA = 5

function ItemNaSemana({ i }: { i: ItemDaSemana }) {
  const canal = i.canal || ROTULO_DO_TIPO[i.tipo] || 'Agendamento'
  const estilo = i.estado === 'falhou'
    ? 'border-destructive/60 bg-destructive/10'
    : i.estado === 'publicado' ? 'border-border bg-muted/50' : i.tipo === 'publicacao' ? 'border-border bg-card' : 'border-dashed border-border bg-card'
  const marca = i.estado === 'falhou'
    ? <span className="inline-flex items-center gap-0.5 text-destructive"><X className="size-3" aria-hidden="true" />Falhou</span>
    : i.estado === 'publicado'
      ? <span className="inline-flex items-center gap-0.5 text-success"><Check className="size-3" aria-hidden="true" />{i.hora ?? 'No ar'}</span>
      : <span>{i.hora ?? ''}</span>
  const corpo = (
    <>
      <span className={`flex justify-between gap-1.5 text-[10.5px] font-semibold ${i.estado === 'falhou' ? 'text-destructive' : 'text-muted-foreground'}`}>
        <span className="truncate">{canal}</span>{marca}
      </span>
      <span className={`line-clamp-2 text-xs leading-snug ${i.estado === 'publicado' ? 'text-muted-foreground' : ''}`}>{i.titulo}</span>
    </>
  )
  const classe = `block rounded-md border px-2 py-1.5 ${estilo}`
  return i.href
    ? <Link href={i.href} className={`${classe} transition-colors hover:border-foreground/30`}>{corpo}</Link>
    : <div className={classe}>{corpo}</div>
}

export function GradeDaSemana({ dias, semana, hoje }: { dias: string[]; semana: Map<string, ItemDaSemana[]>; hoje: string }) {
  return (
    <>
      <ListaDaSemana dias={dias} semana={semana} hoje={hoje} />
      <Card className="hidden overflow-x-auto p-0 md:block">
      <div className="grid min-w-[46rem] grid-cols-7">
        {dias.map((dia, idx) => {
          const itens = semana.get(dia) ?? []
          const ehHoje = dia === hoje
          const fds = idx >= 5
          return (
            <div key={dia} className={`flex min-h-44 flex-col border-r border-border last:border-r-0 ${fds ? 'bg-muted/30' : ''}`}>
              <div className={`flex items-baseline gap-1.5 border-b border-border px-2.5 py-2 text-xs ${ehHoje ? 'bg-primary/10 text-primary' : 'text-muted-foreground'}`}>
                <span>{NOME_DO_DIA[idx]}</span>
                <span className={`text-base font-bold tabular-nums ${ehHoje ? '' : 'text-foreground'}`}>{Number(dia.slice(-2))}</span>
                {ehHoje && <span className="font-semibold">hoje</span>}
              </div>
              <div className="flex flex-col gap-1.5 p-1.5">
                {itens.slice(0, MAX_POR_DIA).map((i) => <ItemNaSemana key={i.id} i={i} />)}
                {itens.length > MAX_POR_DIA && (
                  <Link href="/calendario" className="px-1 text-[11px] font-medium text-muted-foreground hover:text-foreground">+ {itens.length - MAX_POR_DIA} no calendário</Link>
                )}
              </div>
            </div>
          )
        })}
      </div>
      </Card>
    </>
  )
}

/** No celular, sete colunas não cabem: os dias viram uma lista, e dia vazio vira uma linha só. */
function ListaDaSemana({ dias, semana, hoje }: { dias: string[]; semana: Map<string, ItemDaSemana[]>; hoje: string }) {
  return (
    <Card className="divide-y divide-border overflow-hidden p-0 md:hidden">
      {dias.map((dia, idx) => {
        const itens = semana.get(dia) ?? []
        const ehHoje = dia === hoje
        return (
          <div key={dia} className="flex gap-3 px-3 py-2.5">
            <div className={`w-11 shrink-0 pt-0.5 text-center text-xs ${ehHoje ? 'font-semibold text-primary' : 'text-muted-foreground'}`}>
              <p>{NOME_DO_DIA[idx]}</p>
              <p className={`text-base font-bold tabular-nums ${ehHoje ? '' : 'text-foreground'}`}>{Number(dia.slice(-2))}</p>
            </div>
            <div className="flex min-w-0 flex-1 flex-col gap-1.5">
              {itens.slice(0, MAX_POR_DIA).map((i) => <ItemNaSemana key={i.id} i={i} />)}
              {itens.length > MAX_POR_DIA && <Link href="/calendario" className="text-[11px] font-medium text-muted-foreground">+ {itens.length - MAX_POR_DIA} no calendário</Link>}
              {!itens.length && <p className="pt-2 text-xs text-muted-foreground">Nada programado</p>}
            </div>
          </div>
        )
      })}
    </Card>
  )
}

const SAUDE: Record<SaudeDoCanal, { rotulo: string; classe: string; ponto: string }> = {
  ativo: { rotulo: 'Ativo', classe: 'bg-success/15 text-success', ponto: 'bg-success' },
  com_falha: { rotulo: 'Com falha', classe: 'bg-destructive/10 text-destructive', ponto: 'bg-destructive' },
  parado: { rotulo: 'Parado', classe: 'bg-warning/20 text-warning-foreground', ponto: 'bg-warning' },
  sem_registro: { rotulo: 'Sem publicação', classe: 'bg-muted text-muted-foreground', ponto: 'bg-muted-foreground/40' },
}

export type CanalNoPainel = { id: string; nome: string; saude: SaudeDoCanal; detalhe: string }

export function SaudeDosCanais({ canais }: { canais: CanalNoPainel[] }) {
  return (
    <Secao titulo="Saúde dos canais" id="saude-canais" acao={{ href: '/registro', rotulo: 'Registro' }}>
      <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
        {canais.map((c) => (
          <Card key={c.id} className="flex items-center justify-between gap-3 px-4 py-3">
            <div className="min-w-0">
              <p className="flex items-center gap-2 text-sm font-medium"><span className={`size-2 shrink-0 rounded-full ${SAUDE[c.saude].ponto}`} aria-hidden="true" /><span className="truncate">{c.nome}</span></p>
              <p className="mt-0.5 pl-4 text-xs text-muted-foreground">{c.detalhe}</p>
            </div>
            <span className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold ${SAUDE[c.saude].classe}`}>{SAUDE[c.saude].rotulo}</span>
          </Card>
        ))}
      </div>
    </Secao>
  )
}

// ---------------------------------------------------------------------------
// Camada 3 — indicadores
// ---------------------------------------------------------------------------

const L = 160
const A = 44

/**
 * A tendência de 8 semanas. Cada ponto tem uma área de toque maior que ele,
 * com o valor da semana no título — o que a sparkline mostra, dá para ler.
 */
function Tendencia({ valores, rotulos, formatar, zeroNaBase, descricao }: {
  valores: (number | null)[]
  rotulos: string[]
  formatar: (v: number) => string
  zeroNaBase?: boolean
  descricao: string
}) {
  const { pontos, trechos } = pontosDaLinha(valores, L, A, { zeroNaBase, margem: 5 })
  if (!pontos.length) return <div className="mt-2 flex h-11 items-center text-[11px] text-muted-foreground">Sem dados nas últimas 8 semanas</div>
  const ultimo = pontos[pontos.length - 1]
  const lista = valores.map((v, i) => `${rotulos[i]}: ${v === null ? 'sem dado' : formatar(v)}`).join('; ')
  const em = (p: { x: number; y: number }) => ({ left: `${(p.x / L) * 100}%`, top: `${(p.y / A) * 100}%` })
  return (
    <div className="relative mt-2 h-11 w-full text-info" role="img" aria-label={`${descricao}. ${lista}`}>
      <svg viewBox={`0 0 ${L} ${A}`} className="absolute inset-0 size-full overflow-visible" preserveAspectRatio="none" aria-hidden="true">
        <line x1={0} x2={L} y1={A - 1} y2={A - 1} className="stroke-border" strokeWidth={1} vectorEffect="non-scaling-stroke" />
        {trechos.filter((t) => t.length > 1).map((t, k) => (
          <g key={k}>
            <path d={`M${t.map((p) => `${p.x} ${p.y}`).join(' L')} L${t[t.length - 1].x} ${A - 1} L${t[0].x} ${A - 1} Z`} fill="currentColor" fillOpacity={0.12} stroke="none" />
            <polyline points={t.map((p) => `${p.x},${p.y}`).join(' ')} fill="none" stroke="currentColor" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
          </g>
        ))}
      </svg>
      {/* Os pontos ficam fora da SVG esticada para continuarem redondos. */}
      {trechos.filter((t) => t.length === 1).map((t, k) => (
        <span key={`s${k}`} className="absolute size-1.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-current" style={em(t[0])} aria-hidden="true" />
      ))}
      <span className="absolute size-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-current ring-2 ring-card" style={em(ultimo)} aria-hidden="true" />
      {pontos.map((p) => (
        <span key={`h${p.indice}`} className="absolute size-5 -translate-x-1/2 -translate-y-1/2 rounded-full" style={em(p)} title={`${rotulos[p.indice]}: ${formatar(p.valor)}`} />
      ))}
    </div>
  )
}

export type Indicador = {
  nome: string
  valor: string
  unidade?: string
  comparacao: Comparacao
  delta: string
  anterior: string
  ajuda: string
  tendencia: { valores: (number | null)[]; rotulos: string[]; formatar: (v: number) => string; zeroNaBase?: boolean; descricao: string }
}

export function CartaoDoIndicador({ i }: { i: Indicador }) {
  const c = i.comparacao
  const Icone = c.direcao === 'subiu' ? TrendingUp : TrendingDown
  const cor = c.bom === true ? 'text-success' : c.bom === false ? 'text-destructive' : 'text-muted-foreground'
  return (
    <Card className="flex flex-col gap-1 p-4 pb-3">
      <p className="text-xs font-semibold text-muted-foreground">{i.nome}</p>
      <p className="text-3xl font-bold tracking-tight tabular-nums">{i.valor}{i.unidade && <span className="ml-0.5 text-sm font-semibold text-muted-foreground">{i.unidade}</span>}</p>
      <p className={`flex flex-wrap items-center gap-1 text-xs font-semibold ${cor}`}>
        {c.direcao === 'subiu' || c.direcao === 'caiu' ? <><Icone className="size-3.5" aria-hidden="true" />{i.delta}</> : c.direcao === 'igual' ? 'Igual' : 'Sem base de comparação'}
        {c.direcao !== 'sem_base' && <span className="font-normal text-muted-foreground">vs. {i.anterior} nos 30 dias anteriores</span>}
      </p>
      <Tendencia {...i.tendencia} />
      <p className="mt-1 text-[11px] leading-snug text-muted-foreground">{i.ajuda}</p>
    </Card>
  )
}
