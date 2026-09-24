import { notFound } from 'next/navigation'
import { Card } from '@/components/ui/card'
import { PageHeader } from '@/components/app/page-header'
import { hojeEmSaoPaulo } from '@/components/app/projetos/comum'
import { SecoesDoPatrimonio } from '@/components/app/patrimonio/secoes'
import { FormularioDoBem } from '@/components/app/patrimonio/formulario'
import { cadastrosDoPatrimonio, contextoDoPatrimonio } from '@/lib/patrimonio/acesso'

export const metadata = { title: 'Novo bem' }
export const dynamic = 'force-dynamic'

export default async function NovoBem() {
  const { nivel } = await contextoDoPatrimonio()
  if (nivel < 2) notFound()
  const c = await cadastrosDoPatrimonio()
  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6">
      <SecoesDoPatrimonio atual="/patrimonio" nivel={nivel} />
      <PageHeader title="Novo bem" description="O que é, onde fica e como chegou à filial. A plaqueta é numerada ao salvar." />
      <Card className="p-5 sm:p-6"><FormularioDoBem c={c} hoje={hojeEmSaoPaulo()} /></Card>
    </div>
  )
}
