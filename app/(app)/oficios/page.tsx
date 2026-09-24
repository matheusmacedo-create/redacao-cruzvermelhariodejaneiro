import Link from 'next/link'
import { Bitcoin, Plus, Search, Signature } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { PageHeader } from '@/components/app/page-header'
import { requireWorkspace } from '@/lib/session'
import { createClient } from '@/lib/supabase/server'
import { criarOficio } from '@/app/actions/oficios'
import { ESTADOS, ehEstado, lerCanonico, type EstadoDoOficio } from '@/lib/oficios/documento'
import { SeloDoCarimbo } from '@/components/app/oficios/painel'

export const dynamic = 'force-dynamic'

const TETO = 3000

const CLASSE_DO_ESTADO: Record<EstadoDoOficio, string> = {
  rascunho: 'bg-muted text-muted-foreground',
  em_assinatura: 'bg-warning/20 text-warning-foreground',
  assinado: 'bg-success/15 text-success',
  cancelado: 'bg-destructive/10 text-destructive',
}

const DATA = new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', year: 'numeric' })

type Linha = {
  id: string
  estado: string
  modo_assinatura: 'senha' | 'govbr'
  ano: number | null
  numero: number | null
  assunto: string
  destinatario_nome: string | null
  destinatario_orgao: string | null
  conteudo_canonico: string | null
  data_do_documento: string | null
  updated_at: string
  oficio_assinantes: { user_id: string | null; estado: string }[]
  oficio_carimbos: { estado: 'pendente' | 'enviado' | 'confirmado' }[]
}

/**
 * O livro de ofícios: todos os ofícios do espaço, do mais novo ao mais
 * antigo, com o que espera a minha assinatura no topo. Nada sai daqui —
 * cancelado continua listado, com o número que usou.
 */
export default async function OficiosPage({ searchParams }: { searchParams: Promise<{ estado?: string; q?: string }> }) {
  const { estado: estadoParam, q } = await searchParams
  const context = await requireWorkspace()
  const supabase = await createClient()

  const linhas: Linha[] = []
  for (let de = 0; de < TETO; de += 1000) {
    const { data } = await supabase.from('oficios')
      .select('id,estado,modo_assinatura,ano,numero,assunto,destinatario_nome,destinatario_orgao,conteudo_canonico,data_do_documento,updated_at,oficio_assinantes(user_id,estado),oficio_carimbos(estado)')
      .eq('workspace_id', context.workspace.id)
      .order('ano', { ascending: false, nullsFirst: true }).order('numero', { ascending: false, nullsFirst: true }).order('updated_at', { ascending: false })
      .range(de, de + 999)
    linhas.push(...((data ?? []) as unknown as Linha[]))
    if (!data || data.length < 1000) break
  }

  const estado = estadoParam && ehEstado(estadoParam) ? estadoParam : null
  const termo = (q ?? '').trim().toLowerCase()
  const codigo = (l: Linha) => (l.numero && l.ano ? `${String(l.numero).padStart(3, '0')}/${l.ano}` : null)
  // Depois de emitido, o que vale é o texto congelado.
  const visivel = (l: Linha) => {
    const doc = lerCanonico(l.conteudo_canonico)
    return { assunto: doc?.assunto ?? l.assunto, destinatario: [doc?.destinatario.nome ?? l.destinatario_nome, doc?.destinatario.orgao ?? l.destinatario_orgao].filter(Boolean).join(' · ') }
  }
  const filtradas = linhas.filter((l) => (!estado || l.estado === estado) && (!termo || [codigo(l) ?? '', visivel(l).assunto, visivel(l).destinatario].join(' ').toLowerCase().includes(termo)))
  const esperandoMim = linhas.filter((l) => l.estado === 'em_assinatura' && l.oficio_assinantes.some((a) => a.user_id === context.user.id && a.estado === 'pendente'))
  const contagem = (e: EstadoDoOficio | null) => (e ? linhas.filter((l) => l.estado === e).length : linhas.length)
  const link = (e: EstadoDoOficio | null) => `/oficios${e ? `?estado=${e}` : ''}${termo ? `${e ? '&' : '?'}q=${encodeURIComponent(q ?? '')}` : ''}`

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Ofícios"
        description="Numerados por ano, assinados com senha e registrados no Bitcoin. Emitido não se apaga: cancelado fica guardado com o motivo."
        actions={<form action={criarOficio}><Button type="submit"><Plus className="size-4" />Novo ofício</Button></form>}
      />

      {esperandoMim.length > 0 && (
        <Card className="border-primary/40 bg-primary/5 p-0">
          <p className="flex items-center gap-2 border-b border-primary/20 px-4 py-2.5 text-sm font-semibold"><Signature className="size-4 text-primary" />Esperando a sua assinatura</p>
          <ul className="divide-y divide-primary/10">
            {esperandoMim.map((l) => (
              <li key={l.id}><Link href={`/oficios/${l.id}`} className="flex items-center gap-3 px-4 py-2.5 text-sm hover:bg-primary/10">
                <span className="w-20 shrink-0 font-semibold tabular-nums">{codigo(l)}</span>
                <span className="min-w-0 flex-1 truncate">{visivel(l).assunto}</span>
                <span className="text-xs font-medium text-primary">Assinar →</span>
              </Link></li>
            ))}
          </ul>
        </Card>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <nav className="flex flex-wrap overflow-hidden rounded-lg border border-border" aria-label="Filtrar por estado">
          {([null, 'rascunho', 'em_assinatura', 'assinado', 'cancelado'] as (EstadoDoOficio | null)[]).map((e) => (
            <Link key={e ?? 'todos'} href={link(e)} aria-current={estado === e ? 'page' : undefined}
              className={`border-r border-border px-3 py-1.5 text-sm last:border-r-0 ${estado === e ? 'bg-primary/10 font-medium text-primary' : 'text-muted-foreground hover:text-foreground'}`}>
              {e ? ESTADOS[e].rotulo : 'Todos'} <span className="text-xs tabular-nums">({contagem(e)})</span>
            </Link>
          ))}
        </nav>
        <form className="relative min-w-52 flex-1" role="search">
          {estado && <input type="hidden" name="estado" value={estado} />}
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <input name="q" defaultValue={q ?? ''} placeholder="Buscar por número, assunto ou destinatário" aria-label="Buscar ofícios"
            className="w-full rounded-lg border border-border bg-background py-2 pl-9 pr-3 text-sm outline-none focus:border-ring focus:ring-2 focus:ring-ring/30" />
        </form>
      </div>

      <Card className="overflow-hidden p-0">
        {!filtradas.length ? (
          <p className="p-10 text-center text-sm text-muted-foreground">
            {linhas.length ? 'Nenhum ofício neste filtro.' : 'Nenhum ofício ainda. Crie o primeiro: ele ganha número quando for emitido para assinatura.'}
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[48rem] border-collapse text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/40 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  <th className="px-4 py-2.5">Número</th>
                  <th className="px-3 py-2.5">Assunto</th>
                  <th className="px-3 py-2.5">Estado</th>
                  <th className="px-3 py-2.5">Assinaturas</th>
                  <th className="px-3 py-2.5"><span className="inline-flex items-center gap-1"><Bitcoin className="size-3.5" />Bitcoin</span></th>
                  <th className="px-3 py-2.5">Data</th>
                </tr>
              </thead>
              <tbody>
                {filtradas.map((l) => {
                  const v = visivel(l)
                  const e = ehEstado(l.estado) ? l.estado : 'rascunho'
                  const assinadas = l.oficio_assinantes.filter((a) => a.estado === 'assinado').length
                  const carimbo = l.oficio_carimbos[0]
                  return (
                    <tr key={l.id} className="border-b border-border last:border-0 hover:bg-muted/30">
                      <td className="whitespace-nowrap px-4 py-3 font-semibold tabular-nums">
                        <Link href={`/oficios/${l.id}`} className="hover:text-primary hover:underline">{codigo(l) ?? <span className="font-normal italic text-muted-foreground">sem número</span>}</Link>
                      </td>
                      <td className="max-w-md px-3 py-3">
                        <Link href={`/oficios/${l.id}`} className="block truncate font-medium hover:text-primary hover:underline">{v.assunto || <span className="italic text-muted-foreground">(sem assunto)</span>}</Link>
                        {v.destinatario && <span className="block truncate text-xs text-muted-foreground">{v.destinatario}</span>}
                      </td>
                      <td className="px-3 py-3"><span className={`whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-semibold ${CLASSE_DO_ESTADO[e]}`}>{ESTADOS[e].rotulo}</span></td>
                      <td className="px-3 py-3 text-xs tabular-nums text-muted-foreground">
                        {l.oficio_assinantes.length ? `${assinadas} de ${l.oficio_assinantes.length}` : '—'}
                        {l.estado !== 'rascunho' && l.modo_assinatura === 'govbr' && <span className="ml-1.5 rounded bg-info/15 px-1.5 py-0.5 text-[10px] font-semibold text-info">gov.br</span>}
                      </td>
                      <td className="px-3 py-3">{carimbo ? <SeloDoCarimbo estado={carimbo.estado} /> : <span className="text-xs text-muted-foreground">—</span>}</td>
                      <td className="whitespace-nowrap px-3 py-3 text-xs tabular-nums text-muted-foreground">
                        {l.data_do_documento ? DATA.format(new Date(`${l.data_do_documento}T12:00:00Z`)) : `editado ${DATA.format(new Date(l.updated_at))}`}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  )
}
