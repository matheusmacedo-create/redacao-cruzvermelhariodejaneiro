import Link from 'next/link'
import { notFound } from 'next/navigation'
import { Card } from '@/components/ui/card'
import { PageHeader } from '@/components/app/page-header'
import { SecoesDoPatrimonio } from '@/components/app/patrimonio/secoes'
import { NovaCampanha } from '@/components/app/patrimonio/doacoes'
import { cadastrosDoPatrimonio, contextoDoPatrimonio } from '@/lib/patrimonio/acesso'

export const metadata = { title: 'Campanhas de doação' }
export const dynamic = 'force-dynamic'

const reais = (n: number) => n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
const dataBr = (d: string | null) => (d ? d.split('-').reverse().join('/') : null)

/** Campanhas (ex.: enchentes, inverno): juntam o que foi doado e entregue para prestar contas. */
export default async function CampanhasPage() {
  const { context, supabase, nivel } = await contextoDoPatrimonio()
  if (nivel < 1) notFound()
  const ws = context.workspace.id
  const c = await cadastrosDoPatrimonio()
  const [{ data: campanhas }, { data: rec }, { data: ent }] = await Promise.all([
    supabase.from('doa_campanhas').select('id,nome,descricao,inicio,fim,ativa').eq('workspace_id', ws).order('ativa', { ascending: false }).order('inicio', { ascending: false, nullsFirst: false }),
    supabase.from('doa_recebimentos').select('campanha_id,valor_total').eq('workspace_id', ws).not('campanha_id', 'is', null).limit(50000),
    supabase.from('doa_entregas').select('campanha_id,valor_total,pessoas').eq('workspace_id', ws).not('campanha_id', 'is', null).limit(50000),
  ])
  const soma = (lista: { campanha_id: unknown; valor_total: unknown }[] | null, id: string) => (lista ?? []).filter((x) => x.campanha_id === id).reduce((s, x) => s + Number(x.valor_total), 0)
  return (
    <div className="flex flex-col gap-6">
      <SecoesDoPatrimonio atual="/patrimonio/doacoes" nivel={nivel} />
      <PageHeader title="Campanhas" description="Cada campanha junta as doações recebidas e as entregas, para a prestação de contas a doadores e financiadores." />
      {nivel >= 3 && <div><NovaCampanha projetos={c.projetos.map((p) => ({ id: p.id, nome: p.name }))} /></div>}
      <Card className="overflow-hidden p-0">
        {!(campanhas ?? []).length ? <p className="p-10 text-center text-sm text-muted-foreground">Nenhuma campanha ainda.{nivel >= 3 ? ' Crie a primeira: "SOS Chuvas", "Campanha do Agasalho"…' : ''}</p> : (
          <ul className="divide-y divide-border" id="campanhas">
            {(campanhas ?? []).map((k) => {
              const recebido = soma(rec, k.id as string), entregue = soma(ent, k.id as string)
              const pessoas = (ent ?? []).filter((x) => x.campanha_id === k.id).reduce((s, x) => s + Number(x.pessoas ?? 0), 0)
              const periodo = [dataBr(k.inicio as string | null), dataBr(k.fim as string | null)].filter(Boolean).join(' a ')
              return (
                <li key={k.id as string} className="flex flex-wrap items-center justify-between gap-3 px-5 py-4">
                  <div className="min-w-0">
                    <Link href={`/patrimonio/doacoes/campanhas/${k.id}`} className="font-medium hover:text-primary hover:underline">{k.nome as string}</Link>
                    <span className={`ml-2 rounded-full px-2 py-0.5 text-[11px] font-semibold ${k.ativa ? 'bg-success/15 text-success' : 'bg-muted text-muted-foreground'}`}>{k.ativa ? 'Recebendo' : 'Encerrada'}</span>
                    {periodo && <span className="block text-xs text-muted-foreground">{periodo}</span>}
                  </div>
                  <div className="flex gap-6 text-right text-sm tabular-nums">
                    <div><p className="font-semibold">{reais(recebido)}</p><p className="text-xs text-muted-foreground">recebido</p></div>
                    <div><p className="font-semibold">{reais(entregue)}</p><p className="text-xs text-muted-foreground">entregue</p></div>
                    <div><p className="font-semibold">{pessoas}</p><p className="text-xs text-muted-foreground">pessoas</p></div>
                  </div>
                </li>
              )
            })}
          </ul>
        )}
      </Card>
    </div>
  )
}
