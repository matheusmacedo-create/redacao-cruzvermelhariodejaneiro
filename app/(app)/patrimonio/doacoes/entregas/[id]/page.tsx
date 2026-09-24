import Link from 'next/link'
import { notFound } from 'next/navigation'
import { FileSignature } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { PageHeader } from '@/components/app/page-header'
import { SecoesDoPatrimonio } from '@/components/app/patrimonio/secoes'
import { contextoDoPatrimonio } from '@/lib/patrimonio/acesso'
import { BENEFICIARIOS, type TipoDeBeneficiario } from '@/lib/patrimonio/doacoes'
import { quantidade } from '@/lib/patrimonio/estoque'

export const metadata = { title: 'Entrega de doação' }
export const dynamic = 'force-dynamic'

const reais = (n: number) => n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
const dataBr = (d: string) => d.split('-').reverse().join('/')

function Dado({ rotulo, children }: { rotulo: string; children: React.ReactNode }) {
  return <div><dt className="text-xs text-muted-foreground">{rotulo}</dt><dd className="text-sm">{children || '—'}</dd></div>
}

export default async function EntregaDeDoacao({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound()
  const { context, supabase, nivel } = await contextoDoPatrimonio()
  if (nivel < 1) notFound()
  const { data: e } = await supabase.from('doa_entregas').select('id,codigo,data,beneficiario_tipo,beneficiario_nome,beneficiario_documento,responsavel,pessoas,municipio,bairro,campanha_id,local_id,observacao,valor_total,criado_por')
    .eq('id', id).eq('workspace_id', context.workspace.id).maybeSingle()
  if (!e) notFound()
  const [{ data: itens }, { data: campanha }, { data: local }, { data: quem }] = await Promise.all([
    supabase.from('doa_entrega_itens').select('id,item_id,descricao,quantidade,unidade,valor').eq('entrega_id', id).order('descricao'),
    e.campanha_id ? supabase.from('doa_campanhas').select('id,nome').eq('id', e.campanha_id).maybeSingle() : Promise.resolve({ data: null }),
    supabase.from('pat_locais').select('nome').eq('id', e.local_id).maybeSingle(),
    e.criado_por ? supabase.from('profiles').select('full_name').eq('id', e.criado_por).maybeSingle() : Promise.resolve({ data: null }),
  ])
  return (
    <div className="flex flex-col gap-6">
      <SecoesDoPatrimonio atual="/patrimonio/doacoes" nivel={nivel} />
      <PageHeader
        title={`Entrega ${e.codigo}`}
        description={`${e.beneficiario_nome} · ${dataBr(e.data as string)}`}
        actions={<Button render={<a href={`/api/patrimonio/doacoes/termo/${e.id}`} target="_blank" rel="noreferrer" />} id="baixar-termo"><FileSignature className="size-4" />Termo para assinar (PDF)</Button>}
      />
      <Card className="p-5">
        <dl className="grid gap-4 sm:grid-cols-3">
          <Dado rotulo="Quem recebeu">{e.beneficiario_nome as string}<span className="block text-xs text-muted-foreground">{BENEFICIARIOS[e.beneficiario_tipo as TipoDeBeneficiario]}{e.beneficiario_documento ? ` · ${e.beneficiario_documento}` : ''}</span></Dado>
          <Dado rotulo="Assinou">{e.responsavel as string}</Dado>
          <Dado rotulo="Pessoas atendidas">{e.pessoas as number}</Dado>
          <Dado rotulo="Onde">{[e.bairro, e.municipio].filter(Boolean).join(', ')}</Dado>
          <Dado rotulo="Campanha">{campanha ? <Link href={`/patrimonio/doacoes/campanhas/${campanha.id}`} className="text-primary hover:underline">{campanha.nome as string}</Link> : null}</Dado>
          <Dado rotulo="Saiu de">{local?.nome as string}{quem?.full_name ? ` · por ${quem.full_name}` : ''}</Dado>
        </dl>
        {e.observacao && <p className="mt-4 text-sm text-muted-foreground">{e.observacao as string}</p>}
      </Card>
      <Card className="overflow-hidden p-0">
        <table className="w-full border-collapse text-sm" id="itens-entregues">
          <thead><tr className="border-b border-border bg-muted/40 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            <th className="px-3 py-2.5">Item</th><th className="px-3 py-2.5 text-right">Quantidade</th><th className="px-3 py-2.5 text-right">Valor (custo médio)</th>
          </tr></thead>
          <tbody>
            {(itens ?? []).map((i) => (
              <tr key={i.id as string} className="border-b border-border last:border-0">
                <td className="px-3 py-3"><Link href={`/patrimonio/estoque/${i.item_id}`} className="hover:text-primary hover:underline">{i.descricao as string}</Link></td>
                <td className="whitespace-nowrap px-3 py-3 text-right tabular-nums">{quantidade(Number(i.quantidade), i.unidade as string)}</td>
                <td className="whitespace-nowrap px-3 py-3 text-right tabular-nums">{reais(Number(i.valor))}</td>
              </tr>
            ))}
            <tr className="bg-muted/30 font-semibold"><td className="px-3 py-2.5">Total</td><td /><td className="px-3 py-2.5 text-right tabular-nums">{reais(Number(e.valor_total))}</td></tr>
          </tbody>
        </table>
      </Card>
      <p className="text-xs text-muted-foreground">Imprima o termo, colha a assinatura de quem recebeu e guarde com a prestação de contas da campanha.</p>
    </div>
  )
}
