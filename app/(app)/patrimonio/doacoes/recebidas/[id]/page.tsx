import Link from 'next/link'
import { notFound } from 'next/navigation'
import { FileText } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { PageHeader } from '@/components/app/page-header'
import { SecoesDoPatrimonio } from '@/components/app/patrimonio/secoes'
import { contextoDoPatrimonio } from '@/lib/patrimonio/acesso'
import { documentoFormatado } from '@/lib/patrimonio/doacoes'
import { quantidade } from '@/lib/patrimonio/estoque'

export const metadata = { title: 'Doação recebida' }
export const dynamic = 'force-dynamic'

const reais = (n: number) => n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
const dataBr = (d: string) => d.split('-').reverse().join('/')

function Dado({ rotulo, children }: { rotulo: string; children: React.ReactNode }) {
  return <div><dt className="text-xs text-muted-foreground">{rotulo}</dt><dd className="text-sm">{children || '—'}</dd></div>
}

export default async function DoacaoRecebida({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound()
  const { context, supabase, nivel } = await contextoDoPatrimonio()
  if (nivel < 1) notFound()
  const ws = context.workspace.id
  const { data: r } = await supabase.from('doa_recebimentos').select('id,codigo,data,doador_id,doador_nome,doador_documento,campanha_id,local_id,observacao,valor_total,criado_por,created_at').eq('id', id).eq('workspace_id', ws).maybeSingle()
  if (!r) notFound()
  const [{ data: itens }, { data: campanha }, { data: local }, { data: doador }, { data: quem }] = await Promise.all([
    supabase.from('doa_recebimento_itens').select('id,tipo,item_id,bem_id,descricao,quantidade,unidade,valor_unitario,valor_total,lote,validade').eq('recebimento_id', id).order('tipo', { ascending: false }).order('descricao'),
    r.campanha_id ? supabase.from('doa_campanhas').select('id,nome').eq('id', r.campanha_id).maybeSingle() : Promise.resolve({ data: null }),
    supabase.from('pat_locais').select('nome').eq('id', r.local_id).maybeSingle(),
    r.doador_id ? supabase.from('doa_doadores').select('email,telefone').eq('id', r.doador_id).maybeSingle() : Promise.resolve({ data: null }),
    r.criado_por ? supabase.from('profiles').select('full_name').eq('id', r.criado_por).maybeSingle() : Promise.resolve({ data: null }),
  ])
  return (
    <div className="flex flex-col gap-6">
      <SecoesDoPatrimonio atual="/patrimonio/doacoes" nivel={nivel} />
      <PageHeader
        title={`Doação ${r.codigo}`}
        description={`${r.doador_nome} · ${dataBr(r.data as string)}`}
        actions={<Button render={<a href={`/api/patrimonio/doacoes/recibo/${r.id}`} target="_blank" rel="noreferrer" />} id="baixar-recibo"><FileText className="size-4" />Recibo (PDF)</Button>}
      />
      <Card className="p-5">
        <dl className="grid gap-4 sm:grid-cols-3">
          <Dado rotulo="Doador">{r.doador_nome as string}{r.doador_documento && <span className="block text-xs text-muted-foreground">{documentoFormatado(r.doador_documento as string)}</span>}</Dado>
          <Dado rotulo="Contato">{[doador?.email, doador?.telefone].filter(Boolean).join(' · ')}</Dado>
          <Dado rotulo="Campanha">{campanha ? <Link href={`/patrimonio/doacoes/campanhas/${campanha.id}`} className="text-primary hover:underline">{campanha.nome as string}</Link> : null}</Dado>
          <Dado rotulo="Onde ficou">{local?.nome as string}</Dado>
          <Dado rotulo="Registrado por">{quem?.full_name as string}</Dado>
          <Dado rotulo="Total (valor de mercado)"><span className="font-semibold">{reais(Number(r.valor_total))}</span></Dado>
        </dl>
        {r.observacao && <p className="mt-4 text-sm text-muted-foreground">{r.observacao as string}</p>}
      </Card>
      <Card className="overflow-hidden p-0">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[40rem] border-collapse text-sm" id="itens-recebidos">
            <thead><tr className="border-b border-border bg-muted/40 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              <th className="px-3 py-2.5">Item</th><th className="px-3 py-2.5">Foi para</th><th className="px-3 py-2.5 text-right">Quantidade</th><th className="px-3 py-2.5 text-right">Valor cada</th><th className="px-3 py-2.5 text-right">Total</th>
            </tr></thead>
            <tbody>
              {(itens ?? []).map((i) => (
                <tr key={i.id as string} className="border-b border-border last:border-0">
                  <td className="px-3 py-3">
                    <Link href={i.tipo === 'bem' ? `/patrimonio/${i.bem_id}` : `/patrimonio/estoque/${i.item_id}`} className="hover:text-primary hover:underline">{i.descricao as string}</Link>
                    {(i.lote || i.validade) && <span className="block text-xs text-muted-foreground">{[i.lote ? `lote ${i.lote}` : null, i.validade ? `validade ${dataBr(i.validade as string)}` : null].filter(Boolean).join(' · ')}</span>}
                  </td>
                  <td className="px-3 py-3 text-xs">{i.tipo === 'bem' ? 'Patrimônio' : 'Estoque'}</td>
                  <td className="whitespace-nowrap px-3 py-3 text-right tabular-nums">{quantidade(Number(i.quantidade), i.unidade as string)}</td>
                  <td className="whitespace-nowrap px-3 py-3 text-right tabular-nums">{reais(Number(i.valor_unitario))}</td>
                  <td className="whitespace-nowrap px-3 py-3 text-right tabular-nums">{reais(Number(i.valor_total))}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
      <p className="text-xs text-muted-foreground">Recibo emitido pelo valor de mercado (ITG 2002). Para corrigir uma quantidade, use a contagem no Estoque; o recibo continua registrando o que o doador entregou.</p>
    </div>
  )
}
