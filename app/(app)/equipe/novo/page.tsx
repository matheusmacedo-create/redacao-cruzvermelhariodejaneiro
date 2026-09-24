import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ChevronLeft } from 'lucide-react'
import { PageHeader } from '@/components/app/page-header'
import { contextoDaEquipe } from '@/lib/rh/acesso'
import { FormularioDeMembro } from '@/components/app/equipe/formulario'
import { opcoesDaFicha } from '../opcoes'

export const dynamic = 'force-dynamic'

export default async function NovaPessoa() {
  const { context, supabase, nivel } = await contextoDaEquipe()
  if (nivel < 2) notFound()
  const { gestores, logins } = await opcoesDaFicha(supabase, context.workspace.id, null)
  return (
    <div className="flex flex-col gap-5">
      <Link href="/equipe" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"><ChevronLeft className="size-4" />Gestão da equipe</Link>
      <PageHeader title="Nova pessoa na equipe" description="Só o nome é obrigatório; o resto pode ser completado depois." />
      <FormularioDeMembro m={null} pessoais={null} nivel={nivel} gestores={gestores} logins={logins} />
    </div>
  )
}
