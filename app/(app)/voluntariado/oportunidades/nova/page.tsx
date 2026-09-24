import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ChevronLeft } from 'lucide-react'
import { Card } from '@/components/ui/card'
import { PageHeader } from '@/components/app/page-header'
import { contextoDeParticipantes } from '@/lib/participantes/acesso'
import { FormularioDeOportunidade } from '@/components/app/oportunidades/formulario'

export const dynamic = 'force-dynamic'

export default async function NovaOportunidade() {
  const { nivel } = await contextoDeParticipantes()
  if (nivel < 2) notFound()
  return (
    <div className="flex flex-col gap-5">
      <Link href="/voluntariado/oportunidades" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"><ChevronLeft className="size-4" />Oportunidades</Link>
      <PageHeader title="Nova oportunidade" description="Nasce como rascunho; publique quando estiver pronta." />
      <Card className="p-5"><FormularioDeOportunidade o={null} /></Card>
    </div>
  )
}
