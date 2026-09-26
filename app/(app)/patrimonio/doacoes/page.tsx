import Link from 'next/link'
import { notFound } from 'next/navigation'
import { HandHeart, Megaphone, PackageOpen, Users } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { PageHeader } from '@/components/app/page-header'
import { hojeEmSaoPaulo } from '@/components/app/projetos/comum'
import { SecoesDoPatrimonio } from '@/components/app/patrimonio/secoes'
import { contextoDoPatrimonio } from '@/lib/patrimonio/acesso'
import { BENEFICIARIOS, type TipoDeBeneficiario } from '@/lib/patrimonio/doacoes'

export const metadata = { title: 'Doações' }
export const dynamic = 'force-dynamic'

const reais = (n: number) => n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
const dataBr = (d: string) => d.split('-').reverse().join('/')
const selectClass = 'rounded-lg border border-border bg-background px-3 py-2 text-sm'

/**
 * Doações em espécie: o que chegou (com doador e recibo) e o que foi
 * entregue (com beneficiário e termo). Dinheiro doado não entra aqui: é
 * receita no Financeiro.
 */
export default async function DoacoesPage({ searchParams }: { searchParams: Promise<{ aba?: string; campanha?: string }> }) {
  const sp = await searchParams
  const { context, supabase, nivel } = await contextoDoPatrimonio()
  if (nivel < 1) notFound()
  const ws = context.workspace.id
  const aba = sp.aba === 'entregas' ? 'entregas' : 'recebidas'
  const campanha = sp.campanha && /^[0-9a-f-]{36}$/.test(sp.campanha) ? sp.campanha : ''
  const mes = hojeEmSaoPaulo().slice(0, 7)
  let rec = supabase.from('doa_recebimentos').select('id,codigo,data,doador_nome,campanha_id,valor_total').eq('workspace_id', ws).order('data', { ascending: false }).order('numero', { ascending: false }).limit(200)
  let ent = supabase.from('doa_entregas').select('id,codigo,data,beneficiario_tipo,beneficiario_nome,pessoas,municipio,bairro,campanha_id,valor_total').eq('workspace_id', ws).order('data', { ascending: false }).order('numero', { ascending: false }).limit(200)
  if (campanha) { rec = rec.eq('campanha_id', campanha); ent = ent.eq('campanha_id', campanha) }
  const [{ data: recebidas }, { data: entregas }, { data: campanhas }, { data: doMesR }, { data: doMesE }] = await Promise.all([
    rec, ent,
    supabase.from('doa_campanhas').select('id,nome,ativa').eq('workspace_id', ws).order('ativa', { ascending: false }).order('nome'),
    supabase.from('doa_recebimentos').select('valor_total').eq('workspace_id', ws).gte('data', `${mes}-01`),
    supabase.from('doa_entregas').select('pessoas').eq('workspace_id', ws).gte('data', `${mes}-01`),
  ])
  const nomeDaCampanha = new Map((campanhas ?? []).map((c) => [c.id as string, c.nome as string]))
  const ativas = (campanhas ?? []).filter((c) => c.ativa)
  const qs = (a: string) => `/patrimonio/doacoes?aba=${a}${campanha ? `&campanha=${campanha}` : ''}`

  return (
    <div className="flex flex-col gap-6">
      <SecoesDoPatrimonio atual="/patrimonio/doacoes" nivel={nivel} />
      <PageHeader
        title="Doações"
        description="Itens doados (alimentos, roupas, ajuda humanitária): quem doou, com recibo, e para quem foi, com termo de entrega. Doação em dinheiro é receita no Financeiro."
        actions={<div className="flex flex-wrap items-start gap-2">
          {nivel >= 2 && <Button data-ajuda="patrimonio.doacoes-receber" render={<Link href={`/patrimonio/doacoes/receber${campanha ? `?campanha=${campanha}` : ''}`} />}><HandHeart className="size-4" />Receber doação</Button>}
          {nivel >= 2 && <Button variant="outline" render={<Link href={`/patrimonio/doacoes/entregar${campanha ? `?campanha=${campanha}` : ''}`} />}><PackageOpen className="size-4" />Entregar</Button>}
          <Button variant="outline" data-ajuda="patrimonio.doacoes-campanhas" render={<Link href="/patrimonio/doacoes/campanhas" />}><Megaphone className="size-4" />Campanhas</Button>
          <Button variant="outline" render={<Link href="/patrimonio/doacoes/doadores" />}><Users className="size-4" />Doadores</Button>
        </div>}
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4" id="resumo-doacoes" data-ajuda="patrimonio.doacoes-resumo">
        {[
          { v: String((doMesR ?? []).length), r: 'doações recebidas este mês' },
          { v: reais((doMesR ?? []).reduce((s, x) => s + Number(x.valor_total), 0)), r: 'recebido este mês (valor de mercado)' },
          { v: String((doMesE ?? []).length), r: 'entregas este mês' },
          { v: String((doMesE ?? []).reduce((s, x) => s + Number(x.pessoas ?? 0), 0)), r: 'pessoas atendidas este mês' },
        ].map((k) => <Card key={k.r} className="p-4"><p className="text-xl font-bold tabular-nums">{k.v}</p><p className="text-xs text-muted-foreground">{k.r}</p></Card>)}
      </div>

      {ativas.length > 0 && (
        <p className="text-sm">Campanhas recebendo: {ativas.map((c, i) => <span key={c.id as string}>{i ? ', ' : ''}<Link href={`/patrimonio/doacoes/campanhas/${c.id}`} className="font-medium text-primary hover:underline">{c.nome as string}</Link></span>)}.</p>
      )}

      <div className="flex flex-wrap items-end justify-between gap-3" data-ajuda="patrimonio.doacoes-abas">
        <nav className="flex gap-1 border-b border-border" aria-label="Abas">
          {(['recebidas', 'entregas'] as const).map((a) => (
            <Link key={a} href={qs(a)} aria-current={aba === a ? 'page' : undefined}
              className={`-mb-px border-b-2 px-3 py-2 text-sm ${aba === a ? 'border-primary font-medium text-foreground' : 'border-transparent text-muted-foreground hover:text-foreground'}`}>{a === 'recebidas' ? 'Recebidas' : 'Entregues'}</Link>
          ))}
        </nav>
        <form className="flex gap-2">
          <input type="hidden" name="aba" value={aba} />
          <select name="campanha" defaultValue={campanha} aria-label="Campanha" className={selectClass}><option value="">Todas as campanhas</option>{(campanhas ?? []).map((c) => <option key={c.id as string} value={c.id as string}>{c.nome as string}</option>)}</select>
          <Button type="submit" variant="outline">Filtrar</Button>
        </form>
      </div>

      <Card className="overflow-hidden p-0">
        {aba === 'recebidas' ? (
          !(recebidas ?? []).length ? <p className="p-10 text-center text-sm text-muted-foreground">Nenhuma doação registrada{campanha ? ' nesta campanha' : ''}.</p> : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[40rem] border-collapse text-sm" id="recebidas">
                <thead><tr className="border-b border-border bg-muted/40 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  <th className="px-3 py-2.5">Recibo</th><th className="px-3 py-2.5">Data</th><th className="px-3 py-2.5">Doador</th><th className="px-3 py-2.5">Campanha</th><th className="px-3 py-2.5 text-right">Valor</th>
                </tr></thead>
                <tbody>
                  {(recebidas ?? []).map((r) => (
                    <tr key={r.id as string} className="border-b border-border last:border-0 hover:bg-muted/30">
                      <td className="whitespace-nowrap px-3 py-3"><Link href={`/patrimonio/doacoes/recebidas/${r.id}`} className="font-mono text-xs font-medium text-primary hover:underline">{r.codigo as string}</Link></td>
                      <td className="whitespace-nowrap px-3 py-3 text-xs">{dataBr(r.data as string)}</td>
                      <td className="px-3 py-3">{r.doador_nome as string}</td>
                      <td className="px-3 py-3 text-xs text-muted-foreground">{r.campanha_id ? nomeDaCampanha.get(r.campanha_id as string) : '—'}</td>
                      <td className="whitespace-nowrap px-3 py-3 text-right tabular-nums">{reais(Number(r.valor_total))}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )
        ) : (
          !(entregas ?? []).length ? <p className="p-10 text-center text-sm text-muted-foreground">Nenhuma entrega registrada{campanha ? ' nesta campanha' : ''}.</p> : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[44rem] border-collapse text-sm" id="entregas">
                <thead><tr className="border-b border-border bg-muted/40 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  <th className="px-3 py-2.5">Termo</th><th className="px-3 py-2.5">Data</th><th className="px-3 py-2.5">Quem recebeu</th><th className="px-3 py-2.5">Onde</th><th className="px-3 py-2.5 text-right">Pessoas</th><th className="px-3 py-2.5 text-right">Valor</th>
                </tr></thead>
                <tbody>
                  {(entregas ?? []).map((e) => (
                    <tr key={e.id as string} className="border-b border-border last:border-0 hover:bg-muted/30">
                      <td className="whitespace-nowrap px-3 py-3"><Link href={`/patrimonio/doacoes/entregas/${e.id}`} className="font-mono text-xs font-medium text-primary hover:underline">{e.codigo as string}</Link></td>
                      <td className="whitespace-nowrap px-3 py-3 text-xs">{dataBr(e.data as string)}</td>
                      <td className="px-3 py-3">{e.beneficiario_nome as string}<span className="block text-xs text-muted-foreground">{BENEFICIARIOS[e.beneficiario_tipo as TipoDeBeneficiario]?.split(' (')[0]}{e.campanha_id ? ` · ${nomeDaCampanha.get(e.campanha_id as string)}` : ''}</span></td>
                      <td className="px-3 py-3 text-xs">{[e.bairro, e.municipio].filter(Boolean).join(', ') || '—'}</td>
                      <td className="px-3 py-3 text-right tabular-nums">{(e.pessoas as number | null) ?? '—'}</td>
                      <td className="whitespace-nowrap px-3 py-3 text-right tabular-nums">{reais(Number(e.valor_total))}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )
        )}
      </Card>
    </div>
  )
}
