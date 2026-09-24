import Link from 'next/link'
import { redirect } from 'next/navigation'
import { ChevronLeft } from 'lucide-react'
import { contextoDeParticipantes } from '@/lib/participantes/acesso'
import { FormularioDeParticipante } from '@/components/app/participantes/formulario'

export default async function NovoParticipante() {
  const { nivel } = await contextoDeParticipantes()
  if (nivel < 2) redirect('/participantes')
  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-4">
      <Link href="/participantes" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"><ChevronLeft className="size-4" />Participantes</Link>
      <h1 className="text-2xl font-bold tracking-tight">Novo participante</h1>
      <FormularioDeParticipante p={null} />
    </div>
  )
}
