import Link from 'next/link'
import { Lock, Plus, Search } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { PageHeader } from '@/components/app/page-header'
import { hojeEmSaoPaulo } from '@/components/app/projetos/comum'
import { SecoesDoPatrimonio } from '@/components/app/patrimonio/secoes'
import { ImprimirEtiquetas } from '@/components/app/patrimonio/acoes'
import { cadastrosDoPatrimonio, contextoDoPatrimonio, COLUNAS_DO_BEM, lerBemDoBanco, type Bem } from '@/lib/patrimonio/acesso'
import { ESTADOS, SITUACOES, depreciacao, situacaoDaManutencao, type Estado } from '@/lib/patrimonio/regras'
import { tituloDaArea } from '@/lib/navegacao'

export const metadata = { title: tituloDaArea('/patrimonio') }
export const dynamic = 'force-dynamic'

const selectClass = 'rounded-lg border border-border bg-background px-3 py-2 text-sm'
const reais = (n: number) => n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

/**
 * Os bens da filial: onde estão, com quem, em que estado, quanto valem hoje
 * (depois da depreciação) e o que pede atenção (manutenção vencida, termo
 * sem aceite, devolução atrasada).
 */
export default async function PatrimonioPage({ searchParams }: { searchParams: Promise<{ q?: string; categoria?: string; local?: string; situacao?: string; filtro?: string }> }) {
  const sp = await searchParams
  const { context, supabase, nivel } = await contextoDoPatrimonio()
  if (nivel < 1) {
    return (
      <div className="flex flex-col gap-6">
        <SecoesDoPatrimonio atual="/patrimonio" nivel={nivel} />
        <PageHeader title="Patrimônio" description="Os bens da filial: onde estão, com quem e em que estado." />
        <Card className="flex items-start gap-3 p-6">
          <Lock className="mt-0.5 size-5 text-muted-foreground" />
          <div>
            <p className="font-medium">Você ainda não tem acesso ao Patrimônio.</p>
            <p className="mt-1 text-sm text-muted-foreground">Os bens que estão com você ficam em <Link href="/patrimonio/comigo" className="font-medium text-primary hover:underline">Comigo</Link>. Para ver os demais, peça acesso a um administrador.</p>
          </div>
        </Card>
      </div>
    )
  }
  const ws = context.workspace.id
  const hoje = hojeEmSaoPaulo()
  const mes = hoje.slice(0, 7)
  const c = await cadastrosDoPatrimonio()
  const [{ data: brutos }, { data: cautelas }, { data: manutencoes }] = await Promise.all([
    supabase.from('pat_bens').select(COLUNAS_DO_BEM).eq('workspace_id', ws).order('numero', { ascending: false }).limit(10000),
    supabase.from('pat_cautelas').select('bem_id,nome,termo_aceito_em,prevista_devolucao,participante_id').eq('workspace_id', ws).is('devolvido_em', null),
    supabase.from('pat_manutencoes').select('bem_id,prevista_para').eq('workspace_id', ws).is('realizada_em', null).not('prevista_para', 'is', null),
  ])
  const bens = (brutos ?? []).map(lerBemDoBanco) as Bem[]
  const comQuem = new Map((cautelas ?? []).map((x) => [x.bem_id as string, x]))
  const manutencaoVencida = new Set((manutencoes ?? []).filter((m) => situacaoDaManutencao(m.prevista_para as string, null, hoje) === 'vencida').map((m) => m.bem_id as string))
  const categoria = new Map(c.categorias.map((k) => [k.id, k]))
  const local = new Map(c.locais.map((l) => [l.id, l.nome]))
  const ativos = bens.filter((b) => b.situacao !== 'baixado')
  const contabil = (b: Bem) => {
    const k = categoria.get(b.categoria_id)
    return depreciacao({ valor: b.valor, aquisicao_em: b.aquisicao_em, vida_util_meses: k?.vida_util_meses ?? null, residual_pct: k?.residual_pct ?? 0, baixado_em: b.baixado_em, origem: b.origem }, mes)
  }
  const valorAquisicao = ativos.reduce((s, b) => s + (b.origem === 'comodato' ? 0 : b.valor ?? 0), 0)
  const valorHoje = ativos.reduce((s, b) => s + (contabil(b)?.contabil ?? (b.origem === 'comodato' ? 0 : b.valor ?? 0)), 0)
  const semAceite = (cautelas ?? []).filter((x) => !x.termo_aceito_em).length
  const devolucaoAtrasada = new Set((cautelas ?? []).filter((x) => x.prevista_devolucao && (x.prevista_devolucao as string) < hoje).map((x) => x.bem_id as string))

  const termo = (sp.q ?? '').trim().toLowerCase()
  const lista = bens
    .filter((b) => (sp.situacao === 'baixado' ? b.situacao === 'baixado' : sp.situacao ? b.situacao === sp.situacao : b.situacao !== 'baixado'))
    .filter((b) => !sp.categoria || b.categoria_id === sp.categoria)
    .filter((b) => !sp.local || b.local_id === sp.local)
    .filter((b) => sp.filtro !== 'manutencao' || manutencaoVencida.has(b.id))
    .filter((b) => sp.filtro !== 'sem_aceite' || (comQuem.has(b.id) && !comQuem.get(b.id)!.termo_aceito_em))
    .filter((b) => sp.filtro !== 'atrasada' || devolucaoAtrasada.has(b.id))
    .filter((b) => !termo || [b.plaqueta, b.plaqueta_antiga, b.nome, b.marca, b.modelo, b.numero_serie, comQuem.get(b.id)?.nome].filter(Boolean).join(' ').toLowerCase().includes(termo))

  return (
    <div className="flex flex-col gap-6">
      <SecoesDoPatrimonio atual="/patrimonio" nivel={nivel} />
      <PageHeader
        title="Patrimônio"
        description="Os bens da filial: plaqueta com QR, onde estão, com quem, manutenção e quanto valem hoje."
        actions={<div className="flex flex-wrap items-start gap-2">
          <ImprimirEtiquetas formId="form-etiquetas" />
          {nivel >= 2 && <Button data-ajuda="patrimonio.novo" render={<Link href="/patrimonio/novo" />}><Plus className="size-4" />Novo bem</Button>}
        </div>}
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5" id="resumo-patrimonio" data-ajuda="patrimonio.resumo">
        {[
          { v: String(ativos.length), r: 'bens no patrimônio' },
          { v: reais(valorAquisicao), r: 'valor de aquisição' },
          { v: reais(valorHoje), r: 'valor contábil hoje (depois da depreciação)' },
          { v: String(manutencaoVencida.size), r: 'com manutenção vencida', alerta: manutencaoVencida.size > 0, href: '/patrimonio?filtro=manutencao' },
          { v: String(semAceite + devolucaoAtrasada.size), r: `${semAceite} sem termo aceito · ${devolucaoAtrasada.size} com devolução atrasada`, alerta: semAceite + devolucaoAtrasada.size > 0, href: semAceite ? '/patrimonio?filtro=sem_aceite' : '/patrimonio?filtro=atrasada' },
        ].map((k, i) => {
          const conteudo = <><p className={`text-xl font-bold tabular-nums ${k.alerta ? 'text-warning-foreground' : ''}`}>{k.v}</p><p className="text-xs text-muted-foreground">{k.r}</p></>
          return k.href && k.alerta
            ? <Link key={i} href={k.href} className="rounded-xl border border-warning/60 bg-card p-4 hover:bg-muted/40">{conteudo}</Link>
            : <Card key={i} className="p-4">{conteudo}</Card>
        })}
      </div>

      <form className="flex flex-wrap items-center gap-2" role="search" data-ajuda="patrimonio.filtros">
        <div className="relative min-w-52 flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <input name="q" defaultValue={sp.q ?? ''} placeholder="Plaqueta, nome, série ou com quem está" aria-label="Buscar" className="w-full rounded-lg border border-border bg-background py-2 pl-9 pr-3 text-sm" />
        </div>
        <select name="categoria" defaultValue={sp.categoria ?? ''} aria-label="Categoria" className={selectClass}><option value="">Todas as categorias</option>{c.categorias.map((k) => <option key={k.id} value={k.id}>{k.nome}</option>)}</select>
        <select name="local" defaultValue={sp.local ?? ''} aria-label="Local" className={selectClass}><option value="">Todos os locais</option>{c.locais.map((l) => <option key={l.id} value={l.id}>{l.nome}</option>)}</select>
        <select name="situacao" defaultValue={sp.situacao ?? ''} aria-label="Situação" className={selectClass}>
          <option value="">No patrimônio</option><option value="em_uso">Em uso</option><option value="reserva">Reserva</option><option value="em_manutencao">Em manutenção</option><option value="baixado">Baixados</option>
        </select>
        <Button type="submit" variant="outline">Filtrar</Button>
      </form>

      <Card className="overflow-hidden p-0" data-ajuda="patrimonio.lista">
        {!lista.length ? (
          <p className="p-10 text-center text-sm text-muted-foreground">{bens.length ? 'Nenhum bem neste filtro.' : 'Nenhum bem cadastrado. Comece pelos que mais circulam: rádios, desfibriladores, macas.'}</p>
        ) : (
          <form id="form-etiquetas" action="/api/patrimonio/etiquetas" method="get" className="overflow-x-auto">
            <table className="w-full min-w-[52rem] border-collapse text-sm" id="bens">
              <thead><tr className="border-b border-border bg-muted/40 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                <th className="w-8 px-3 py-2.5"><span className="sr-only">Etiqueta</span></th>
                <th className="px-3 py-2.5">Plaqueta</th><th className="px-3 py-2.5">Bem</th><th className="px-3 py-2.5">Onde / com quem</th>
                <th className="px-3 py-2.5 text-right">Valor hoje</th><th className="px-3 py-2.5">Situação</th>
              </tr></thead>
              <tbody>
                {lista.map((b) => {
                  const q = comQuem.get(b.id)
                  const d = contabil(b)
                  return (
                    <tr key={b.id} className="border-b border-border last:border-0 hover:bg-muted/30" data-bem={b.plaqueta}>
                      <td className="px-3 py-3"><input type="checkbox" name="id" value={b.id} aria-label={`Etiqueta de ${b.plaqueta}`} /></td>
                      <td className="whitespace-nowrap px-3 py-3 font-mono text-xs">{b.plaqueta}{b.plaqueta_antiga && <span className="block text-muted-foreground">antiga {b.plaqueta_antiga}</span>}</td>
                      <td className="max-w-72 px-3 py-3">
                        <Link href={`/patrimonio/${b.id}`} className="block truncate font-medium hover:text-primary hover:underline">{b.nome}</Link>
                        <span className="block truncate text-xs text-muted-foreground">{[categoria.get(b.categoria_id)?.nome, b.marca, b.modelo].filter(Boolean).join(' · ')}</span>
                      </td>
                      <td className="px-3 py-3 text-xs">
                        <span className="block">{b.local_id ? local.get(b.local_id) : '—'}</span>
                        {q && <span className={q.termo_aceito_em ? 'text-muted-foreground' : 'text-warning-foreground'}>com {q.nome}{q.participante_id ? ' (voluntário)' : ''}{q.termo_aceito_em ? '' : ' · termo pendente'}</span>}
                      </td>
                      <td className="whitespace-nowrap px-3 py-3 text-right tabular-nums">{d ? reais(d.contabil) : b.valor !== null && b.origem !== 'comodato' ? reais(b.valor) : '—'}</td>
                      <td className="px-3 py-3">
                        <span className={`whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-semibold ${SITUACOES[b.situacao].classe}`}>{SITUACOES[b.situacao].rotulo}</span>
                        <span className="mt-1 block text-[11px] text-muted-foreground">{ESTADOS[b.estado as Estado] ?? b.estado}{manutencaoVencida.has(b.id) ? ' · manutenção vencida' : ''}{devolucaoAtrasada.has(b.id) ? ' · devolução atrasada' : ''}</span>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </form>
        )}
      </Card>
      <p className="text-xs text-muted-foreground">Marque os bens e use “Etiquetas dos marcados” para imprimir as plaquetas com QR (folha A4, 3 × 8). Ao ler o QR com o celular, o bem abre no Palácio Virtual.</p>
    </div>
  )
}
