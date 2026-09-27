'use client'

import { useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { AlertTriangle, ArrowDownRight, ArrowUpRight, ExternalLink, FileText, Globe2, Minus, Settings2 } from 'lucide-react'
import { Card } from '@/components/ui/card'
import { cn } from '@/lib/utils'
import { PERIODOS, caminhoDaPagina, duracaoLegivel, variacao, type DadosDoSite, type Periodo } from '@/lib/analytics/relatorio'

export type SituacaoNaTela =
  | { estado: 'sem_chave' }
  | { estado: 'erro'; mensagem: string; email: string | null }
  | { estado: 'ok'; dados: DadosDoSite; lidoEm: number; email: string | null }

const numero = new Intl.NumberFormat('pt-BR')
const porcento = new Intl.NumberFormat('pt-BR', { style: 'percent', maximumFractionDigits: 0 })
const diaCurto = new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: 'short', timeZone: 'UTC' })
const diaLongo = new Intl.DateTimeFormat('pt-BR', { weekday: 'short', day: '2-digit', month: 'short', timeZone: 'UTC' })
const dataUTC = (iso: string) => new Date(`${iso}T12:00:00Z`)

/**
 * O site em Resultados, com os números do Google Analytics (GA4). Uma série
 * só (pessoas por dia) numa cor só; o resto são barras de magnitude na mesma
 * cor, com o nome e o valor em texto — a cor nunca é a única pista.
 */
export function SiteNoResultados({ situacao, dias, materias, ehAdmin, propriedade }: {
  situacao: SituacaoNaTela
  dias: Periodo
  /** caminho da página no site → pauta do Palácio (para "Ver a pauta"). */
  materias: Record<string, { pautaId: string }>
  ehAdmin: boolean
  propriedade: string
}) {
  return (
    <section data-ajuda="resultados.site" className="viz-site mt-7">
      <style>{`
        .viz-site { --serie: #2a78d6; --serie-lavado: rgba(42,120,214,0.10); --grade: #e7e6e2; }
        .dark .viz-site { --serie: #3987e5; --serie-lavado: rgba(57,135,229,0.14); --grade: #2e2e2c; }
      `}</style>
      <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">O site</h2>
          <p className="text-xs text-muted-foreground">Google Analytics · cruzvermelhariodejaneiro.org{situacao.estado === 'ok' ? ` · atualizado ${quandoLeu(situacao.lidoEm)}` : ''}</p>
        </div>
        <nav aria-label="Período do site" className="flex rounded-lg border border-border bg-card p-0.5" data-ajuda="resultados.periodo">
          {(Object.keys(PERIODOS) as unknown as Periodo[]).map((p) => {
            const ativo = Number(p) === dias
            return (
              <Link key={p} href={`/impacto?periodo=${p}`} scroll={false} aria-current={ativo ? 'page' : undefined}
                className={cn('rounded-md px-3 py-1.5 text-xs font-medium', ativo ? 'bg-primary/10 text-primary' : 'text-muted-foreground hover:text-foreground')}>
                {PERIODOS[p].replace('Últimos ', '')}
              </Link>
            )
          })}
        </nav>
      </div>

      {situacao.estado === 'sem_chave' && <Ligar ehAdmin={ehAdmin} propriedade={propriedade} />}
      {situacao.estado === 'erro' && (
        <Card className="flex items-start gap-3 border-warning/40 bg-warning/5 p-5 text-sm">
          <AlertTriangle className="mt-0.5 size-5 shrink-0 text-warning-foreground" />
          <div>
            <p className="font-medium">Não foi possível ler o Google Analytics</p>
            <p className="mt-1 text-muted-foreground">{situacao.mensagem}</p>
            {ehAdmin && <Link href="/configuracoes/integracoes" className="mt-2 inline-flex items-center gap-1 text-primary hover:underline"><Settings2 className="size-3.5" />Configurações → Integrações</Link>}
          </div>
        </Card>
      )}
      {situacao.estado === 'ok' && <Painel dados={situacao.dados} materias={materias} />}
    </section>
  )
}

function quandoLeu(ms: number): string {
  const min = Math.round((Date.now() - ms) / 60_000)
  return min < 1 ? 'agora' : `há ${min} min`
}

/** Como ligar: o passo a passo, sem pedir chave no chat. */
function Ligar({ ehAdmin, propriedade }: { ehAdmin: boolean; propriedade: string }) {
  return (
    <Card className="p-5 text-sm">
      <div className="flex items-start gap-3">
        <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground"><Globe2 className="size-4" /></span>
        <div className="min-w-0">
          <p className="font-medium">O Google Analytics ainda não está ligado ao Palácio</p>
          <p className="mt-1 text-muted-foreground">O site já mede as visitas (propriedade {propriedade}). Falta o Palácio ter permissão de leitura: uma conta de serviço do Google, só com acesso de Leitor.</p>
          {ehAdmin ? (
            <ol className="mt-3 flex list-decimal flex-col gap-1.5 pl-5 text-muted-foreground">
              <li>No <a href="https://console.cloud.google.com/apis/library/analyticsdata.googleapis.com" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">Google Cloud</a>, no mesmo projeto do Gmail, ative a <strong className="font-medium text-foreground">Google Analytics Data API</strong>.</li>
              <li>Em <a href="https://console.cloud.google.com/iam-admin/serviceaccounts" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">Contas de serviço</a>, crie uma conta (por exemplo “palacio-analytics”), sem papéis no projeto.</li>
              <li>Na conta criada, em Chaves → Adicionar chave → <strong className="font-medium text-foreground">JSON</strong>, baixe o arquivo.</li>
              <li>No <a href="https://analytics.google.com/" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">Google Analytics</a>, em Administrador → Gerenciamento de acesso à propriedade, adicione o e-mail da conta de serviço (termina em .iam.gserviceaccount.com) com o papel <strong className="font-medium text-foreground">Leitor</strong>.</li>
              <li>Abra o arquivo JSON, copie tudo e cole no cartão “Google Analytics (conta de serviço)” em <Link href="/configuracoes/integracoes" className="text-primary hover:underline">Configurações → Integrações</Link>. A chave vai direto para o cofre: nunca mande por chat ou e-mail.</li>
            </ol>
          ) : <p className="mt-2 text-muted-foreground">Peça a um administrador para ligar em Configurações → Integrações.</p>}
        </div>
      </div>
    </Card>
  )
}

function Painel({ dados, materias }: { dados: DadosDoSite; materias: Record<string, { pautaId: string }> }) {
  const { atual, anterior } = dados
  const taxaDeEngajamento = atual.visitas ? atual.visitasEngajadas / atual.visitas : 0
  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        <Numero rotulo="Pessoas" valor={numero.format(atual.pessoas)} v={variacao(atual.pessoas, anterior.pessoas)} ajuda="Quem visitou o site (aceitou os cookies)" />
        <Numero rotulo="Visitas" valor={numero.format(atual.visitas)} v={variacao(atual.visitas, anterior.visitas)} ajuda={`${porcento.format(taxaDeEngajamento)} com leitura de verdade`} />
        <Numero rotulo="Páginas vistas" valor={numero.format(atual.paginas)} v={variacao(atual.paginas, anterior.paginas)} ajuda="Cada página aberta conta uma vez" />
        <Numero rotulo="Tempo de leitura" valor={duracaoLegivel(atual.engajamentoPorPessoa)} v={variacao(atual.engajamentoPorPessoa, anterior.engajamentoPorPessoa)} ajuda="Por pessoa, com a página na tela" />
      </div>
      <p className="-mt-1 text-xs text-muted-foreground">Comparado com os {dados.dias} dias anteriores. O período vai até ontem.</p>

      <Card className="p-5">
        <p className="text-sm font-semibold">Pessoas por dia</p>
        <p className="text-xs text-muted-foreground">Passe o dedo ou o mouse para ver cada dia.</p>
        <Serie serie={dados.serie} />
      </Card>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card className="p-5">
          <p className="text-sm font-semibold">De onde vêm as visitas</p>
          <Barras itens={dados.canais.map((c) => ({ nome: c.nome, valor: c.visitas, extra: porcento.format(c.fatia) }))} unidade="visitas" vazio="Sem visitas no período." />
        </Card>
        <Card className="p-5">
          <p className="text-sm font-semibold">Aparelho</p>
          <Barras itens={dados.dispositivos.map((c) => ({ nome: c.nome, valor: c.pessoas, extra: porcento.format(c.fatia) }))} unidade="pessoas" vazio="Sem dados no período." />
          {dados.cidades.length > 0 && (
            <>
              <p className="mt-5 text-sm font-semibold">Cidades</p>
              <Barras itens={dados.cidades.map((c) => ({ nome: c.nome, valor: c.pessoas }))} unidade="pessoas" vazio="" />
            </>
          )}
        </Card>
      </div>

      <Card className="p-5">
        <p className="text-sm font-semibold">Páginas mais vistas</p>
        <p className="text-xs text-muted-foreground">As matérias publicadas pelo Palácio levam à pauta de origem.</p>
        <ol className="mt-3 flex flex-col divide-y divide-border">
          {dados.paginas.map((p, i) => {
            const max = dados.paginas[0]?.vistas || 1
            const pauta = materias[caminhoDaPagina(p.caminho)]
            return (
              <li key={p.caminho} className="flex items-center gap-3 py-2.5" data-pagina={p.caminho}>
                <span className="w-5 shrink-0 text-right text-xs tabular-nums text-muted-foreground">{i + 1}</span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline justify-between gap-3">
                    <a href={`https://cruzvermelhariodejaneiro.org${p.caminho}`} target="_blank" rel="noopener noreferrer" className="min-w-0 truncate text-sm font-medium hover:text-primary hover:underline" title={p.caminho}>
                      {p.caminho === '/' ? 'Página inicial' : p.titulo || p.caminho}<ExternalLink className="ml-1 inline size-3 text-muted-foreground" aria-hidden="true" />
                    </a>
                    <span className="shrink-0 text-sm font-semibold tabular-nums">{numero.format(p.vistas)}</span>
                  </div>
                  <div className="mt-1 flex items-center gap-3">
                    <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted" aria-hidden="true">
                      <span className="block h-full rounded-full" style={{ width: `${Math.max(2, (p.vistas / max) * 100)}%`, background: 'var(--serie)' }} />
                    </span>
                    <span className="shrink-0 text-xs text-muted-foreground">{numero.format(p.pessoas)} pessoas</span>
                    {pauta && <Link href={`/pautas/${pauta.pautaId}`} className="inline-flex shrink-0 items-center gap-1 text-xs text-primary hover:underline"><FileText className="size-3" />Ver a pauta</Link>}
                  </div>
                </div>
              </li>
            )
          })}
          {!dados.paginas.length && <li className="py-6 text-center text-sm text-muted-foreground">Nenhuma página vista no período.</li>}
        </ol>
      </Card>
      <p className="text-xs text-muted-foreground">
        O site só mede quem aceita os cookies (LGPD): os números do Analytics ficam abaixo das visitas reais. Servem para comparar períodos e matérias entre si.
      </p>
    </div>
  )
}

function Numero({ rotulo, valor, v, ajuda }: { rotulo: string; valor: string; v: number | null; ajuda: string }) {
  const Seta = v === null || Math.abs(v) < 0.005 ? Minus : v > 0 ? ArrowUpRight : ArrowDownRight
  return (
    <Card className="p-4">
      <p className="text-xs font-medium text-muted-foreground">{rotulo}</p>
      <p className="mt-1 text-2xl font-bold tabular-nums">{valor}</p>
      <p className="mt-1 flex items-center gap-1 text-xs text-muted-foreground">
        <Seta className={cn('size-3.5', v !== null && v > 0.005 && 'text-emerald-600', v !== null && v < -0.005 && 'text-destructive')} aria-hidden="true" />
        <span className="font-medium text-foreground">{v === null ? 'sem base' : `${v > 0 ? '+' : ''}${porcento.format(v)}`}</span>
        <span className="sr-only">em relação ao período anterior</span>
      </p>
      <p className="mt-1 text-[11px] leading-snug text-muted-foreground">{ajuda}</p>
    </Card>
  )
}

/** Barras horizontais de magnitude: nome e valor em texto, barra fina na cor da série. */
function Barras({ itens, unidade, vazio }: { itens: { nome: string; valor: number; extra?: string }[]; unidade: string; vazio: string }) {
  const max = Math.max(1, ...itens.map((i) => i.valor))
  if (!itens.length) return vazio ? <p className="mt-3 text-sm text-muted-foreground">{vazio}</p> : null
  return (
    <ul className="mt-3 flex flex-col gap-2.5">
      {itens.map((i) => (
        <li key={i.nome} title={`${i.nome}: ${numero.format(i.valor)} ${unidade}`}>
          <div className="flex items-baseline justify-between gap-3 text-sm">
            <span className="truncate">{i.nome}</span>
            <span className="shrink-0 tabular-nums"><strong className="font-semibold">{numero.format(i.valor)}</strong>{i.extra && <span className="ml-1.5 text-xs text-muted-foreground">{i.extra}</span>}</span>
          </div>
          <span className="mt-1 block h-1.5 overflow-hidden rounded-full bg-muted" aria-hidden="true">
            <span className="block h-full rounded-full" style={{ width: `${Math.max(1.5, (i.valor / max) * 100)}%`, background: 'var(--serie)' }} />
          </span>
        </li>
      ))}
    </ul>
  )
}

/** Um teto "redondo" para o eixo (0, 1.000, 2.000…). */
function tetoRedondo(v: number): number {
  if (v <= 5) return 5
  const ordem = 10 ** Math.floor(Math.log10(v))
  for (const f of [1, 2, 2.5, 5, 10]) if (f * ordem >= v) return f * ordem
  return 10 * ordem
}

/** A série diária: linha de 2px com lavado a 10%, grade recessiva, cruz e dica ao passar. */
function Serie({ serie }: { serie: DadosDoSite['serie'] }) {
  const caixa = useRef<HTMLDivElement>(null)
  const [foco, setFoco] = useState<number | null>(null)
  const n = serie.length
  const teto = tetoRedondo(Math.max(0, ...serie.map((p) => p.pessoas)))
  const x = (i: number) => (n <= 1 ? 50 : (i / (n - 1)) * 100)
  const y = (v: number) => 100 - (v / teto) * 100
  const { linha, area } = useMemo(() => {
    const pts = serie.map((p, i) => `${x(i).toFixed(3)},${y(p.pessoas).toFixed(3)}`)
    return { linha: `M${pts.join('L')}`, area: `M${x(0)},100L${pts.join('L')}L${x(n - 1)},100Z` }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [serie, teto])
  const marcas = [0, 0.5, 1].map((f) => Math.round(teto * f))
  const rotulosX = n > 1 ? [0, Math.floor((n - 1) / 2), n - 1] : [0]

  const mover = (clientX: number) => {
    const r = caixa.current?.getBoundingClientRect()
    if (!r || !n) return
    setFoco(Math.min(n - 1, Math.max(0, Math.round(((clientX - r.left) / r.width) * (n - 1)))))
  }
  const p = foco !== null ? serie[foco] : null

  return (
    <div className="mt-4">
      <div className="flex gap-2">
        <div className="relative h-44 w-10 shrink-0 text-right text-[11px] tabular-nums text-muted-foreground" aria-hidden="true">
          {marcas.map((m) => <span key={m} className="absolute right-0 -translate-y-1/2" style={{ top: `${y(m)}%` }}>{numero.format(m)}</span>)}
        </div>
        <div ref={caixa} className="relative h-44 flex-1 touch-pan-y outline-none" tabIndex={0} role="img"
          aria-label={`Pessoas por dia: de ${numero.format(Math.min(...serie.map((s) => s.pessoas)))} a ${numero.format(Math.max(...serie.map((s) => s.pessoas)))} por dia.`}
          onPointerMove={(e) => mover(e.clientX)} onPointerDown={(e) => mover(e.clientX)} onPointerLeave={() => setFoco(null)} onBlur={() => setFoco(null)}
          onKeyDown={(e) => {
            if (e.key === 'ArrowRight') setFoco((f) => Math.min(n - 1, (f ?? -1) + 1))
            else if (e.key === 'ArrowLeft') setFoco((f) => Math.max(0, (f ?? n) - 1))
          }}>
          <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="absolute inset-0 size-full overflow-visible" aria-hidden="true">
            {marcas.map((m) => <line key={m} x1="0" x2="100" y1={y(m)} y2={y(m)} stroke="var(--grade)" strokeWidth="1" vectorEffect="non-scaling-stroke" />)}
            <path d={area} fill="var(--serie-lavado)" />
            <path d={linha} fill="none" stroke="var(--serie)" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
          </svg>
          {p && foco !== null && (
            <>
              <span className="pointer-events-none absolute inset-y-0 w-px bg-foreground/25" style={{ left: `${x(foco)}%` }} aria-hidden="true" />
              <span className="pointer-events-none absolute size-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full ring-2 ring-card" style={{ left: `${x(foco)}%`, top: `${y(p.pessoas)}%`, background: 'var(--serie)' }} aria-hidden="true" />
              <div role="status" data-dica className={cn('pointer-events-none absolute top-0 z-10 w-max rounded-lg border border-border bg-popover px-3 py-2 text-xs shadow-md', x(foco) > 60 ? '-translate-x-[calc(100%+10px)]' : 'translate-x-[10px]')}
                style={{ left: `${x(foco)}%` }}>
                <p className="text-muted-foreground">{diaLongo.format(dataUTC(p.dia))}</p>
                <p><strong className="text-sm">{numero.format(p.pessoas)}</strong> pessoas</p>
                <p className="text-muted-foreground">{numero.format(p.paginas)} páginas vistas</p>
              </div>
            </>
          )}
        </div>
      </div>
      <div className="relative ml-12 mt-1 h-4 text-[11px] text-muted-foreground" aria-hidden="true">
        {rotulosX.map((i) => (
          <span key={i} className={cn('absolute', i === 0 ? 'left-0' : i === n - 1 ? 'right-0' : '-translate-x-1/2')} style={i !== 0 && i !== n - 1 ? { left: `${x(i)}%` } : undefined}>
            {diaCurto.format(dataUTC(serie[i].dia))}
          </span>
        ))}
      </div>
      <details className="mt-3 text-sm">
        <summary className="cursor-pointer text-xs text-muted-foreground hover:text-foreground">Ver em tabela</summary>
        <div className="mt-2 max-h-64 overflow-y-auto rounded-lg border border-border">
          <table className="w-full text-xs">
            <thead className="sticky top-0 bg-muted"><tr><th className="px-3 py-1.5 text-left font-medium">Dia</th><th className="px-3 py-1.5 text-right font-medium">Pessoas</th><th className="px-3 py-1.5 text-right font-medium">Páginas vistas</th></tr></thead>
            <tbody>{[...serie].reverse().map((s) => <tr key={s.dia} className="border-t border-border"><td className="px-3 py-1">{diaLongo.format(dataUTC(s.dia))}</td><td className="px-3 py-1 text-right tabular-nums">{numero.format(s.pessoas)}</td><td className="px-3 py-1 text-right tabular-nums">{numero.format(s.paginas)}</td></tr>)}</tbody>
          </table>
        </div>
      </details>
    </div>
  )
}
