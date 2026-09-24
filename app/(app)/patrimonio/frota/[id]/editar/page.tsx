import { notFound } from 'next/navigation'
import { Card } from '@/components/ui/card'
import { PageHeader } from '@/components/app/page-header'
import { SecoesDoPatrimonio } from '@/components/app/patrimonio/secoes'
import { FormularioDoVeiculo, type Veiculo } from '@/components/app/patrimonio/frota'
import { cadastrosDoPatrimonio, contextoDoPatrimonio } from '@/lib/patrimonio/acesso'
import { bensSemVeiculo } from '@/lib/patrimonio/frota-servidor'
import { placaLegivel } from '@/lib/patrimonio/frota'

export const metadata = { title: 'Editar veículo' }
export const dynamic = 'force-dynamic'

export default async function EditarVeiculo({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound()
  const { context, supabase, nivel } = await contextoDoPatrimonio()
  if (nivel < 3) notFound()
  const { data: v } = await supabase.from('frota_veiculos').select('id,bem_id,placa,apelido,tipo,marca,modelo,ano_fabricacao,ano_modelo,cor,renavam,chassi,combustivel,tanque_litros,km_atual,local_id,situacao,observacao')
    .eq('id', id).eq('workspace_id', context.workspace.id).maybeSingle()
  if (!v) notFound()
  const c = await cadastrosDoPatrimonio()
  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-6">
      <SecoesDoPatrimonio atual="/patrimonio/frota" nivel={nivel} />
      <PageHeader title={`Editar ${placaLegivel(v.placa as string)}`} />
      <Card className="p-5 sm:p-6">
        <FormularioDoVeiculo v={{ ...v, km_atual: Number(v.km_atual), tanque_litros: v.tanque_litros === null ? null : Number(v.tanque_litros) } as Veiculo}
          locais={c.locais.filter((l) => l.ativo || l.id === v.local_id).map((l) => ({ id: l.id, nome: l.nome }))} bens={await bensSemVeiculo(v.bem_id as string | null)} />
      </Card>
    </div>
  )
}
