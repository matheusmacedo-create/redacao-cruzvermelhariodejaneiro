import Link from 'next/link'
import { Plus, Search, Settings } from 'lucide-react'
import { PageHeader } from '@/components/app/page-header'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { cn } from '@/lib/utils'
import { requireWorkspace } from '@/lib/session'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { pode } from '@/lib/permissoes'
import {
  ABERTOS, ENCERRADOS, PAUSADOS, PRIORIDADES, duracao, minutosUteisEntre, situacaoDoPrazo,
  type Prioridade, type Status,
} from '@/lib/chamados/regras'
import { filasQueAtendo } from '@/lib/chamados/servidor'
import { EtiquetaDePrazo, EtiquetaDePrioridade, EtiquetaDeStatus, dataHora } from '@/components/app/chamados/comum'

export const dynamic = 'force-dynamic'

type Linha = {
  id: string; codigo: string; titulo: string; status: Status; prioridade: Prioridade; fila_id: string; solicitante_id: string | null; responsavel_id: string | null
  setor_solicitante: string | null; criado_em: string; atualizado_em: string; prazo_resposta: string | null; prazo_solucao: string | null
  respondido_em: string | null; resolvido_em: string | null; fechado_em: string | null; avaliacao: number | null; categoria_id: string | null
}

const COLUNAS = 'id, codigo, titulo, status, prioridade, fila_id, solicitante_id, responsavel_id, setor_solicitante, criado_em, atualizado_em, prazo_resposta, prazo_solucao, respondido_em, resolvido_em, fechado_em, avaliacao, categoria_id'
const selectClass = 'rounded-lg border border-border bg-background px-3 py-2 text-sm'
const PESO: Record<Prioridade, number> = { critica: 0, alta: 1, media: 2, baixa: 3 }

type Filtro = { aba?: string; fila?: string; situacao?: string; resp?: string; q?: string }

export default async function ChamadosPage({ searchParams }: { searchParams: Promise<Filtro> }) {
  const sp = await searchParams
  const context = await requireWorkspace()
  const supabase = await createClient()
  const admin = createAdminClient()
  const ws = context.workspace.id
  const atendo = await filasQueAtendo(admin, ws, context.user.id, context.role)
  const atende = atendo.size > 0
  const aba = sp.aba === 'atendimento' && atende ? 'atendimento' : sp.aba === 'indicadores' && atende ? 'indicadores' : 'meus'

  const { data: filas } = await supabase.from('chamado_filas').select('id, nome, atendimento_24h').eq('workspace_id', ws).order('ordem')
  const filaPorId = new Map((filas ?? []).map((f) => [f.id, f]))
  const minhasFilas = (filas ?? []).filter((f) => atendo.has(f.id))

  const abas = [
    { id: 'meus', rotulo: 'Meus chamados' },
    ...(atende ? [{ id: 'atendimento', rotulo: 'Atendimento' }, { id: 'indicadores', rotulo: 'Indicadores' }] : []),
  ]

  return (
    <div>
      <PageHeader
        title="Chamados"
        description="Pedidos entre setores: TI, Manutenção e outras equipes. Abra, acompanhe e avalie o atendimento."
        actions={<>
          {pode(context.role, 'chamados.configurar') && <Button variant="outline" size="lg" render={<Link href="/chamados/configurar" />}><Settings className="size-4" />Configurar</Button>}
          <Button size="lg" render={<Link href="/chamados/novo" />}><Plus className="size-4" />Abrir chamado</Button>
        </>}
      />
      <nav className="mb-5 flex gap-1.5">
        {abas.map((a) => <Link key={a.id} href={`/chamados?aba=${a.id}`} className={cn('rounded-lg px-3 py-1.5 text-sm font-medium', aba === a.id ? 'bg-foreground text-background' : 'bg-muted text-muted-foreground')}>{a.rotulo}</Link>)}
      </nav>
      {aba === 'meus' && <Meus />}
      {aba === 'atendimento' && <Atendimento />}
      {aba === 'indicadores' && <Indicadores />}
    </div>
  )

  // ---------------------------------------------------------------- meus

  async function Meus() {
    const { data } = await supabase.from('chamados').select(COLUNAS).eq('workspace_id', ws).eq('solicitante_id', context.user.id).order('atualizado_em', { ascending: false }).limit(300)
    const lista = (data ?? []) as Linha[]
    const abertos = lista.filter((c) => ABERTOS.includes(c.status) || c.status === 'resolvido')
    const antigos = lista.filter((c) => !abertos.includes(c))
    if (!lista.length) {
      return <Card className="flex flex-col items-center gap-3 p-10 text-center"><p className="font-medium">Você ainda não abriu nenhum chamado.</p><p className="max-w-md text-sm text-muted-foreground">Computador com problema, internet caindo, ar-condicionado pingando, um acesso que falta? Abra um chamado para a equipe certa e acompanhe por aqui.</p><Button render={<Link href="/chamados/novo" />}><Plus className="size-4" />Abrir chamado</Button></Card>
    }
    return (
      <div className="flex flex-col gap-6">
        <Tabela titulo="Em andamento" linhas={abertos} vazio="Nada em andamento." mostrarSolicitante={false} />
        {antigos.length > 0 && <Tabela titulo="Encerrados" linhas={antigos} vazio="" mostrarSolicitante={false} />}
      </div>
    )
  }

  // ---------------------------------------------------------------- atendimento

  async function Atendimento() {
    const situacao = sp.situacao ?? 'abertos'
    const statusDaSituacao: Record<string, readonly Status[]> = { abertos: ABERTOS, aguardando: PAUSADOS, resolvidos: ['resolvido'], encerrados: ENCERRADOS, todos: [...ABERTOS, 'resolvido', ...ENCERRADOS] }
    const filasFiltro = sp.fila && atendo.has(sp.fila) ? [sp.fila] : [...atendo]
    let q = supabase.from('chamados').select(COLUNAS).eq('workspace_id', ws).in('fila_id', filasFiltro).in('status', [...(statusDaSituacao[situacao] ?? ABERTOS)])
    if (sp.resp === 'meus') q = q.eq('responsavel_id', context.user.id)
    if (sp.resp === 'sem') q = q.is('responsavel_id', null)
    const termo = (sp.q ?? '').trim().slice(0, 80)
    if (termo) q = q.or(`titulo.ilike.%${termo.replace(/[%_,()]/g, ' ')}%,codigo.ilike.%${termo.replace(/[%_,()]/g, ' ')}%`)
    const { data } = await q.order('criado_em', { ascending: false }).limit(500)
    // Ordem de trabalho: atrasados primeiro, depois prioridade, depois o mais antigo.
    const agora = new Date()
    const lista = ((data ?? []) as Linha[]).sort((a, b) => {
      const atrasoA = a.prazo_solucao && !a.resolvido_em && new Date(a.prazo_solucao) < agora ? 0 : 1
      const atrasoB = b.prazo_solucao && !b.resolvido_em && new Date(b.prazo_solucao) < agora ? 0 : 1
      return atrasoA - atrasoB || PESO[a.prioridade] - PESO[b.prioridade] || a.criado_em.localeCompare(b.criado_em)
    })
    return (
      <div className="flex flex-col gap-4">
        <form className="flex flex-wrap items-center gap-2" role="search">
          <input type="hidden" name="aba" value="atendimento" />
          <div className="relative min-w-52 flex-1"><Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" /><input name="q" defaultValue={termo} placeholder="Buscar por código ou título" className={`${selectClass} w-full pl-9`} /></div>
          {minhasFilas.length > 1 && <select name="fila" defaultValue={sp.fila ?? ''} className={selectClass}><option value="">Todas as minhas filas</option>{minhasFilas.map((f) => <option key={f.id} value={f.id}>{f.nome}</option>)}</select>}
          <select name="situacao" defaultValue={situacao} className={selectClass}><option value="abertos">Em aberto</option><option value="aguardando">Aguardando</option><option value="resolvidos">Resolvidos (a confirmar)</option><option value="encerrados">Encerrados</option><option value="todos">Todos</option></select>
          <select name="resp" defaultValue={sp.resp ?? ''} className={selectClass}><option value="">Qualquer responsável</option><option value="meus">Comigo</option><option value="sem">Sem responsável</option></select>
          <Button type="submit" variant="outline" size="lg">Filtrar</Button>
        </form>
        <Tabela titulo={`${lista.length} ${lista.length === 1 ? 'chamado' : 'chamados'}`} linhas={lista} vazio="Nenhum chamado com esses filtros." mostrarSolicitante />
      </div>
    )
  }

  // ---------------------------------------------------------------- indicadores

  async function Indicadores() {
    const desde = new Date(Date.now() - 90 * 86_400_000).toISOString()
    const { data } = await supabase.from('chamados').select(COLUNAS).eq('workspace_id', ws).in('fila_id', [...atendo]).gte('criado_em', desde).limit(5000)
    const lista = (data ?? []) as Linha[]
    const { data: cats } = await supabase.from('chamado_categorias').select('id, nome').eq('workspace_id', ws)
    const nomeCat = new Map((cats ?? []).map((c) => [c.id, c.nome as string]))
    const agora = new Date()
    const h24 = (c: Linha) => Boolean(filaPorId.get(c.fila_id)?.atendimento_24h)
    const abertos = lista.filter((c) => ABERTOS.includes(c.status))
    const atrasados = abertos.filter((c) => c.prazo_solucao && new Date(c.prazo_solucao) < agora)
    const respondidos = lista.filter((c) => c.respondido_em)
    const resolvidos = lista.filter((c) => c.resolvido_em)
    const media = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : NaN)
    const tResposta = media(respondidos.map((c) => minutosUteisEntre(new Date(c.criado_em), new Date(c.respondido_em!), h24(c))))
    const tSolucao = media(resolvidos.map((c) => minutosUteisEntre(new Date(c.criado_em), new Date(c.resolvido_em!), h24(c))))
    const noPrazo = resolvidos.filter((c) => c.prazo_solucao && new Date(c.resolvido_em!) <= new Date(c.prazo_solucao)).length
    const avaliados = lista.filter((c) => c.avaliacao)
    const csat = media(avaliados.map((c) => c.avaliacao!))
    const satisfeitos = avaliados.filter((c) => c.avaliacao! >= 4).length
    const porCategoria = [...lista.reduce((m, c) => m.set(c.categoria_id ?? '', (m.get(c.categoria_id ?? '') ?? 0) + 1), new Map<string, number>())].sort((a, b) => b[1] - a[1]).slice(0, 8)
    const porFila = minhasFilas.map((f) => ({ nome: f.nome, abertos: abertos.filter((c) => c.fila_id === f.id).length, atrasados: atrasados.filter((c) => c.fila_id === f.id).length, total: lista.filter((c) => c.fila_id === f.id).length }))
    const porPrioridade = PRIORIDADES.map((p) => ({ p, n: abertos.filter((c) => c.prioridade === p).length })).reverse()
    const maxCat = Math.max(1, ...porCategoria.map(([, n]) => n))

    const numeros = [
      { rotulo: 'Em aberto', valor: String(abertos.length) },
      { rotulo: 'Atrasados', valor: String(atrasados.length), alerta: atrasados.length > 0 },
      { rotulo: '1ª resposta (média)', valor: Number.isNaN(tResposta) ? '—' : duracao(tResposta) },
      { rotulo: 'Solução (média)', valor: Number.isNaN(tSolucao) ? '—' : duracao(tSolucao) },
      { rotulo: 'Resolvidos no prazo', valor: resolvidos.length ? `${Math.round((noPrazo / resolvidos.length) * 100)}%` : '—' },
      { rotulo: 'Satisfação (CSAT)', valor: avaliados.length ? `${Math.round((satisfeitos / avaliados.length) * 100)}%` : '—', ajuda: avaliados.length ? `média ${csat.toFixed(1).replace('.', ',')} de 5 · ${avaliados.length} avaliações` : 'sem avaliações ainda' },
    ]
    return (
      <div className="flex flex-col gap-6">
        <p className="text-sm text-muted-foreground">Últimos 90 dias, nas filas que você atende. Tempos em horário de atendimento (seg–sex, 8h–18h), descontadas as esperas.</p>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
          {numeros.map((n) => <Card key={n.rotulo} className="p-4"><p className={cn('text-2xl font-bold tabular-nums', n.alerta && 'text-destructive')}>{n.valor}</p><p className="text-sm text-muted-foreground">{n.rotulo}</p>{n.ajuda && <p className="mt-1 text-xs text-muted-foreground">{n.ajuda}</p>}</Card>)}
        </div>
        <div className="grid gap-4 lg:grid-cols-3">
          <Card className="p-5">
            <h3 className="mb-3 font-semibold">Por fila</h3>
            <table className="w-full text-sm"><thead><tr className="text-left text-xs text-muted-foreground"><th className="pb-2 font-medium">Fila</th><th className="pb-2 text-right font-medium">Abertos</th><th className="pb-2 text-right font-medium">Atrasados</th><th className="pb-2 text-right font-medium">90 dias</th></tr></thead>
              <tbody>{porFila.map((f) => <tr key={f.nome} className="border-t border-border"><td className="py-2">{f.nome}</td><td className="py-2 text-right tabular-nums">{f.abertos}</td><td className={cn('py-2 text-right tabular-nums', f.atrasados && 'text-destructive')}>{f.atrasados}</td><td className="py-2 text-right tabular-nums">{f.total}</td></tr>)}</tbody></table>
          </Card>
          <Card className="p-5">
            <h3 className="mb-3 font-semibold">Abertos por prioridade</h3>
            <ul className="flex flex-col gap-2 text-sm">{porPrioridade.map(({ p, n }) => <li key={p} className="flex items-center justify-between"><EtiquetaDePrioridade prioridade={p} /><span className="tabular-nums">{n}</span></li>)}</ul>
          </Card>
          <Card className="p-5">
            <h3 className="mb-3 font-semibold">Assuntos mais pedidos</h3>
            {porCategoria.length ? <ul className="flex flex-col gap-2 text-sm">{porCategoria.map(([id, n]) => (
              <li key={id} className="flex flex-col gap-1"><span className="flex justify-between"><span className="truncate">{nomeCat.get(id) ?? 'Sem assunto'}</span><span className="tabular-nums text-muted-foreground">{n}</span></span><span className="h-1.5 rounded-full bg-primary/15"><span className="block h-full rounded-full bg-primary" style={{ width: `${(n / maxCat) * 100}%` }} /></span></li>
            ))}</ul> : <p className="text-sm text-muted-foreground">Sem chamados no período.</p>}
          </Card>
        </div>
      </div>
    )
  }

  // ---------------------------------------------------------------- tabela

  async function Tabela({ titulo, linhas, vazio, mostrarSolicitante }: { titulo: string; linhas: Linha[]; vazio: string; mostrarSolicitante: boolean }) {
    const ids = [...new Set(linhas.flatMap((c) => [c.solicitante_id, c.responsavel_id]).filter(Boolean) as string[])]
    const { data: pessoas } = ids.length ? await admin.from('profiles').select('id, full_name').in('id', ids) : { data: [] }
    const nome = new Map((pessoas ?? []).map((p) => [p.id, p.full_name as string]))
    return (
      <section className="flex flex-col gap-2">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">{titulo}</h2>
        <Card className="overflow-hidden">
          {linhas.length ? (
            <ul className="divide-y divide-border">
              {linhas.map((c) => {
                const f = filaPorId.get(c.fila_id)
                const pausado = PAUSADOS.includes(c.status)
                const encerrado = ENCERRADOS.includes(c.status)
                const situacao = encerrado ? null : situacaoDoPrazo({ inicio: new Date(c.criado_em), prazo: c.prazo_solucao ? new Date(c.prazo_solucao) : null, concluidoEm: c.resolvido_em ? new Date(c.resolvido_em) : null, pausado, vinteQuatroHoras: Boolean(f?.atendimento_24h) })
                return (
                  <li key={c.id}>
                    <Link href={`/chamados/${c.id}`} className="flex flex-col gap-1.5 px-4 py-3 hover:bg-muted/40 sm:flex-row sm:items-center sm:gap-4">
                      <span className="w-20 shrink-0 font-mono text-xs text-muted-foreground">{c.codigo}</span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium">{c.titulo}</span>
                        <span className="block truncate text-xs text-muted-foreground">
                          {f?.nome}{mostrarSolicitante && ` · ${nome.get(c.solicitante_id ?? '') ?? '—'}${c.setor_solicitante ? ` (${c.setor_solicitante})` : ''}`} · {c.responsavel_id ? `com ${nome.get(c.responsavel_id) ?? '—'}` : 'sem responsável'} · aberto {dataHora(c.criado_em)}
                        </span>
                      </span>
                      <span className="flex shrink-0 flex-wrap items-center gap-3">
                        <EtiquetaDePrioridade prioridade={c.prioridade} />
                        {c.status !== 'resolvido' && <EtiquetaDePrazo situacao={situacao} prazo={c.prazo_solucao} vinteQuatroHoras={Boolean(f?.atendimento_24h)} />}
                        <EtiquetaDeStatus status={c.status} paraEquipe={mostrarSolicitante} />
                      </span>
                    </Link>
                  </li>
                )
              })}
            </ul>
          ) : <p className="px-4 py-8 text-center text-sm text-muted-foreground">{vazio}</p>}
        </Card>
      </section>
    )
  }
}

