import { notFound } from 'next/navigation'
import { Card } from '@/components/ui/card'
import { PageHeader } from '@/components/app/page-header'
import { SecoesDoPatrimonio } from '@/components/app/patrimonio/secoes'
import { FormularioDoVeiculo } from '@/components/app/patrimonio/frota'
import { cadastrosDoPatrimonio, contextoDoPatrimonio } from '@/lib/patrimonio/acesso'
import { bensSemVeiculo } from '@/lib/patrimonio/frota-servidor'

export const metadata = { title: 'Novo veículo' }
export const dynamic = 'force-dynamic'

export default async function NovoVeiculo() {
  const { nivel } = await contextoDoPatrimonio()
  if (nivel < 3) notFound()
  const c = await cadastrosDoPatrimonio()
  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-6">
      <SecoesDoPatrimonio atual="/patrimonio/frota" nivel={nivel} />
      <PageHeader title="Novo veículo" description="Dados do documento (CRLV) e o hodômetro de hoje. Ligue ao bem do patrimônio para ter plaqueta, valor e depreciação." />
      <Card className="p-5 sm:p-6"><FormularioDoVeiculo locais={c.locais.filter((l) => l.ativo).map((l) => ({ id: l.id, nome: l.nome }))} bens={await bensSemVeiculo(null)} /></Card>
    </div>
  )
}
