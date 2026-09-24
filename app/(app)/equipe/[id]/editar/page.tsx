import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ChevronLeft } from 'lucide-react'
import { PageHeader } from '@/components/app/page-header'
import { contextoDaEquipe, COLUNAS_DO_MEMBRO, COLUNAS_PESSOAIS, type Membro, type Pessoais } from '@/lib/rh/acesso'
import { FormularioDeMembro } from '@/components/app/equipe/formulario'
import { nomeDe } from '@/components/app/equipe/comum'
import { opcoesDaFicha } from '../../opcoes'

export const dynamic = 'force-dynamic'

export default async function EditarFicha({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound()
  const { context, supabase, nivel } = await contextoDaEquipe()
  if (nivel < 2) notFound()
  const [{ data: m }, { data: pessoais }, opcoes] = await Promise.all([
    supabase.from('equipe_membros').select(COLUNAS_DO_MEMBRO).eq('id', id).eq('workspace_id', context.workspace.id).maybeSingle(),
    supabase.from('equipe_pessoais').select(COLUNAS_PESSOAIS).eq('membro_id', id).maybeSingle(),
    opcoesDaFicha(supabase, context.workspace.id, id),
  ])
  if (!m) notFound()
  return (
    <div className="flex flex-col gap-5">
      <Link href={`/equipe/${id}`} className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"><ChevronLeft className="size-4" />{nomeDe(m as Membro)}</Link>
      <PageHeader title="Editar ficha" />
      <FormularioDeMembro m={m as Membro} pessoais={pessoais as Pessoais | null} nivel={nivel} gestores={opcoes.gestores} logins={opcoes.logins} setores={opcoes.setores} />
    </div>
  )
}
