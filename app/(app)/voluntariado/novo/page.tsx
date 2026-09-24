import Link from 'next/link'
import { redirect } from 'next/navigation'
import { ChevronLeft } from 'lucide-react'
import { contextoDeParticipantes } from '@/lib/participantes/acesso'
import { FormularioDeParticipante } from '@/components/app/participantes/formulario'
import { nomesDosSetores } from '@/lib/setores'

export default async function NovoParticipante() {
  const { context, supabase, nivel } = await contextoDeParticipantes()
  if (nivel < 2) redirect('/voluntariado')
  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-4">
      <Link href="/voluntariado" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"><ChevronLeft className="size-4" />Voluntários</Link>
      <h1 className="text-2xl font-bold tracking-tight">Novo voluntário</h1>
      <FormularioDeParticipante p={null} setores={await nomesDosSetores(supabase, context.workspace.id)} />
    </div>
  )
}
