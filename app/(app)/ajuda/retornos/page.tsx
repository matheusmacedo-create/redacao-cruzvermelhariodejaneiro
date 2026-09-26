import Link from 'next/link'
import { notFound } from 'next/navigation'
import { Download, MessageSquareHeart, ThumbsDown } from 'lucide-react'
import { PageHeader } from '@/components/app/page-header'
import { Card } from '@/components/ui/card'
import { ResponderRetorno } from '@/components/app/ajuda/responder-retorno'
import { requireWorkspace } from '@/lib/session'
import { createClient } from '@/lib/supabase/server'
import { areaDoCaminho } from '@/lib/navegacao'
import { perguntaDaAjuda } from '@/lib/ajuda'
import {
  ESTADOS_DO_RETORNO, NOTAS, ROTULO_DO_ESTADO, ROTULO_DO_TIPO, TIPOS_DE_RETORNO, contextoLegivel, lerContexto, menosUteis, resumoPorTela,
  type EstadoDoRetorno, type RetornoLido, type TipoDeRetorno, type VotoDaPergunta,
} from '@/lib/ajuda/retornos'
import { cn } from '@/lib/utils'

export const metadata = { title: 'Retornos do beta' }
export const dynamic = 'force-dynamic'

type Linha = RetornoLido & {
  id: string; autor_id: string | null; area: string | null; pergunta_id: string | null; util: boolean | null; texto: string | null
  contexto: unknown; resposta: string | null; respondido_em: string | null
}

/** O instante de N dias atrás (fora do componente: a regra de pureza do React não aceita Date.now() no corpo). */
function diasAtras(dias: number): string {
  return new Date(Date.now() - dias * 86400000).toISOString()
}
const quando = (iso: string) => new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo' }).format(new Date(iso))
const nomeDaTela = (caminho: string) => {
  const a = areaDoCaminho(caminho)
  return a ? (caminho === a.area.href ? a.area.rotulo : `${a.area.rotulo} › ${caminho.slice(a.area.href.length) || caminho}`) : caminho
}

/**
 * Os retornos do beta (docs/AJUDA.md §10), para a administração: as telas com
 * pior avaliação, as respostas da ajuda que não ajudaram e cada retorno, com
 * o contexto do aparelho, para responder e marcar a situação. Quem mandou vê
 * a resposta no sino e em "Seus retornos", na Central.
 */
export default async function RetornosDoBetaPage({ searchParams }: { searchParams: Promise<{ tipo?: string; estado?: string; tela?: string }> }) {
  const context = await requireWorkspace()
  if (context.role !== 'admin') notFound()
  const sp = await searchParams
  const tipo = TIPOS_DE_RETORNO.includes(sp.tipo as TipoDeRetorno) ? sp.tipo as TipoDeRetorno : null
  const estado = sp.estado === 'todos' ? null : ESTADOS_DO_RETORNO.includes(sp.estado as EstadoDoRetorno) ? sp.estado as EstadoDoRetorno : 'abertos'
  const tela = typeof sp.tela === 'string' && sp.tela.startsWith('/') ? sp.tela.slice(0, 300) : null

  const supabase = await createClient()
  const desde = diasAtras(180)
  const [{ data, error }, { data: votos }] = await Promise.all([
    supabase.from('ajuda_retornos').select('id,autor_id,tipo,caminho,area,pergunta_id,nota,util,texto,contexto,estado,resposta,respondido_em,created_at')
      .eq('workspace_id', context.workspace.id).gte('created_at', desde).order('created_at', { ascending: false }).limit(2000),
    supabase.rpc('ajuda_votos_das_perguntas', { p_workspace_id: context.workspace.id, p_dias: 180 }),
  ])
  if (error) {
    return (
      <div className="mx-auto max-w-3xl">
        <PageHeader title="Retornos do beta" />
        <Card className="p-6 text-sm">{error.code === '42P01' || error.code === 'PGRST205' ? 'O banco ainda não tem os retornos do beta (migração 20260929010000_cvrj_ajuda_retornos).' : 'Não foi possível ler os retornos agora.'}</Card>
      </div>
    )
  }
  const todos = (data ?? []) as Linha[]
  const autores = [...new Set(todos.map((r) => r.autor_id).filter(Boolean))] as string[]
  const { data: perfis } = autores.length ? await supabase.from('profiles').select('id,full_name').in('id', autores) : { data: [] as { id: string; full_name: string }[] }
  const nomeDe = new Map((perfis ?? []).map((p) => [p.id, p.full_name as string]))

  const semVotos = todos.filter((r) => r.tipo !== 'pergunta')
  const notas = semVotos.filter((r) => r.tipo === 'tela' && r.nota)
  const media = notas.length ? Math.round((notas.reduce((s, r) => s + (r.nota ?? 0), 0) / notas.length) * 10) / 10 : null
  const abertos = semVotos.filter((r) => r.estado === 'novo' || r.estado === 'em_analise')
  const porTela = resumoPorTela(todos).slice(0, 12)
  const naoAjudaram = menosUteis((votos ?? []) as VotoDaPergunta[], 8)
  const oQueFaltou = todos.filter((r) => r.tipo === 'pergunta' && r.util === false && r.texto)

  const lista = semVotos
    .filter((r) => !tipo || r.tipo === tipo)
    .filter((r) => !tela || r.caminho === tela)
    .filter((r) => (estado === 'abertos' ? r.estado === 'novo' || r.estado === 'em_analise' : !estado || r.estado === estado))
    .slice(0, 200)
  const link = (mudar: Record<string, string | null>) => {
    const q = new URLSearchParams()
    const atual = { tipo, estado: estado === 'abertos' ? null : estado ?? 'todos', tela, ...mudar }
    for (const [k, v] of Object.entries(atual)) if (v) q.set(k, v)
    const s = q.toString()
    return `/ajuda/retornos${s ? `?${s}` : ''}`
  }
  const pilula = (ativo: boolean) => cn('inline-flex min-h-9 items-center rounded-full border px-3 text-sm', ativo ? 'border-primary bg-primary/5 font-medium text-primary' : 'border-border hover:bg-muted')

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-8">
      <PageHeader
        title="Retornos do beta"
        description="O que a equipe acha de cada tela, as dúvidas, os problemas e as ideias — com a tela e o aparelho. Responda: a pessoa recebe no sino e vê em “Seus retornos”, na Central de ajuda."
        breadcrumbs={[{ label: 'Central de ajuda', href: '/ajuda' }, { label: 'Retornos do beta' }]}
        actions={<a href="/api/ajuda/retornos" className="inline-flex h-10 items-center gap-2 rounded-lg border border-border px-3 text-sm font-medium hover:bg-muted"><Download className="size-4" aria-hidden="true" />Baixar planilha (CSV)</a>}
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4" data-numeros-do-beta>
        {[
          { rotulo: 'Esperando resposta', valor: String(abertos.length), alerta: abertos.length > 0 },
          { rotulo: 'Nota média das telas', valor: media === null ? '—' : `${String(media).replace('.', ',')} de 5` },
          { rotulo: 'Opiniões sobre telas', valor: String(notas.length) },
          { rotulo: 'Pessoas que participaram', valor: String(autores.length) },
        ].map((n) => (
          <Card key={n.rotulo} className={cn('p-4', n.alerta && 'border-warning/50')}>
            <p className="text-xs font-medium text-muted-foreground">{n.rotulo}</p>
            <p className="mt-1 text-2xl font-bold tabular-nums">{n.valor}</p>
          </Card>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <section aria-labelledby="telas-titulo" className="min-w-0">
          <h2 id="telas-titulo" className="mb-3 text-base font-semibold">Telas, da pior para a melhor avaliação</h2>
          {porTela.length === 0 ? <Card className="p-5 text-sm text-muted-foreground">Nenhuma opinião ainda.</Card> : (
            <ul className="flex flex-col divide-y divide-border rounded-xl border border-border bg-card">
              {porTela.map((t) => (
                <li key={t.caminho}>
                  <Link href={link({ tela: t.caminho, tipo: null })} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-3 text-sm hover:bg-muted/40">
                    <span className="min-w-0 flex-1 truncate font-medium" title={t.caminho}>{nomeDaTela(t.caminho)}</span>
                    <span className="tabular-nums">{t.media === null ? '—' : `${NOTAS[Math.round(t.media) - 1]?.rosto ?? ''} ${String(t.media).replace('.', ',')}`}</span>
                    <span className="w-full text-xs text-muted-foreground sm:w-auto">{t.opinioes} {t.opinioes === 1 ? 'opinião' : 'opiniões'}{t.negativas ? ` · ${t.negativas} negativa${t.negativas === 1 ? '' : 's'}` : ''}{t.abertos ? ` · ${t.abertos} em aberto` : ''}</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section aria-labelledby="ajuda-titulo" className="min-w-0">
          <h2 id="ajuda-titulo" className="mb-3 text-base font-semibold">Respostas da ajuda que não ajudaram</h2>
          {naoAjudaram.length === 0 ? <Card className="p-5 text-sm text-muted-foreground">Ninguém marcou “Não” em “Isso ajudou?” ainda.</Card> : (
            <ul className="flex flex-col divide-y divide-border rounded-xl border border-border bg-card">
              {naoAjudaram.map((v) => {
                const p = v.area ? perguntaDaAjuda(v.area, v.pergunta_id) : null
                const faltou = oQueFaltou.filter((r) => r.pergunta_id === v.pergunta_id)
                return (
                  <li key={`${v.area}#${v.pergunta_id}`} className="px-4 py-3 text-sm">
                    <p className="flex items-start gap-2">
                      <ThumbsDown className="mt-0.5 size-4 shrink-0 text-destructive" aria-hidden="true" />
                      {p ? <Link href={p.href} className="font-medium hover:underline">{p.pergunta}</Link> : <span className="font-medium">{v.pergunta_id}</span>}
                    </p>
                    <p className="mt-0.5 pl-6 text-xs text-muted-foreground">{v.nao} não · {v.sim} sim</p>
                    {faltou.slice(0, 3).map((r) => <p key={r.id} className="mt-1 pl-6 text-xs italic">“{r.texto}”</p>)}
                  </li>
                )
              })}
            </ul>
          )}
        </section>
      </div>

      <section aria-labelledby="lista-titulo" className="flex flex-col gap-4">
        <div className="flex flex-col gap-3">
          <h2 id="lista-titulo" className="flex items-center gap-2 text-base font-semibold"><MessageSquareHeart className="size-5 text-primary" aria-hidden="true" />Retornos{tela ? ` de ${nomeDaTela(tela)}` : ''}</h2>
          <nav aria-label="Situação" className="flex flex-wrap gap-2">
            <Link href={link({ estado: null })} className={pilula(estado === 'abertos')}>Em aberto</Link>
            {ESTADOS_DO_RETORNO.map((e) => <Link key={e} href={link({ estado: e })} className={pilula(estado === e)}>{ROTULO_DO_ESTADO[e]}</Link>)}
            <Link href={link({ estado: 'todos' })} className={pilula(estado === null)}>Todos</Link>
          </nav>
          <nav aria-label="Tipo" className="flex flex-wrap gap-2">
            <Link href={link({ tipo: null })} className={pilula(!tipo)}>Todos os tipos</Link>
            {TIPOS_DE_RETORNO.filter((t) => t !== 'pergunta').map((t) => <Link key={t} href={link({ tipo: t })} className={pilula(tipo === t)}>{ROTULO_DO_TIPO[t]}</Link>)}
            {tela && <Link href={link({ tela: null })} className={pilula(false)}>Todas as telas ✕</Link>}
          </nav>
        </div>
        {lista.length === 0 ? <Card className="p-6 text-center text-sm text-muted-foreground">Nada por aqui.</Card> : (
          <ul className="flex flex-col gap-3" data-lista-de-retornos>
            {lista.map((r) => {
              const ctx = contextoLegivel(lerContexto(r.contexto))
              return (
                <li key={r.id} id={`retorno-${r.id}`} className="scroll-mt-6 rounded-xl border border-border bg-card p-4 shadow-xs target:border-primary/60 target:ring-2 target:ring-primary/20">
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
                    <span className={cn('rounded-full px-2 py-0.5 font-medium', r.tipo === 'problema' ? 'bg-destructive/10 text-destructive' : r.tipo === 'elogio' ? 'bg-success/15 text-success' : 'bg-primary/10 text-primary')}>{ROTULO_DO_TIPO[r.tipo]}</span>
                    {r.nota && <span className="text-sm" title={NOTAS[r.nota - 1].rotulo}>{NOTAS[r.nota - 1].rosto} <span className="sr-only">{NOTAS[r.nota - 1].rotulo}</span></span>}
                    <span className="font-medium text-foreground">{nomeDe.get(r.autor_id ?? '') ?? 'Alguém'}</span>
                    <span>· {quando(r.created_at)}</span>
                    <Link href={r.caminho} className="max-w-full truncate text-primary hover:underline">· {nomeDaTela(r.caminho)}</Link>
                    {ctx && <span className="w-full sm:w-auto">· {ctx}</span>}
                  </div>
                  {r.texto && <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed">{r.texto}</p>}
                  <ResponderRetorno id={r.id} estado={r.estado} resposta={r.resposta} />
                </li>
              )
            })}
          </ul>
        )}
      </section>
    </div>
  )
}
