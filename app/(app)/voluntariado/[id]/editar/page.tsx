import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { ChevronLeft } from 'lucide-react'
import { contextoDeParticipantes } from '@/lib/participantes/acesso'
import { FormularioDeParticipante, type ParticipanteNoFormulario } from '@/components/app/participantes/formulario'
import { nomesDosSetores } from '@/lib/setores'

export default async function EditarParticipante({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound()
  const { context, supabase, nivel } = await contextoDeParticipantes()
  if (nivel < 2) redirect(`/voluntariado/${id}`)
  const { data: p } = await supabase.from('participantes')
    .select('id,nome,nome_social,vinculo,funcao,setores,email,telefone,data_nascimento,cpf_mascara,cep,logradouro,numero,complemento,bairro,cidade,uf,emergencia_nome,emergencia_telefone,emergencia_parentesco,tem_dados_de_saude,responsavel_nome,responsavel_telefone,habilidades,idiomas,disponibilidade,observacoes,anonimizado_em')
    .eq('id', id).eq('workspace_id', context.workspace.id).maybeSingle()
  if (!p || p.anonimizado_em) notFound()
  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-4">
      <Link href={`/voluntariado/${id}`} className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"><ChevronLeft className="size-4" />{p.nome}</Link>
      <h1 className="text-2xl font-bold tracking-tight">Editar cadastro</h1>
      <FormularioDeParticipante p={p as ParticipanteNoFormulario} setores={await nomesDosSetores(supabase, context.workspace.id)} />
    </div>
  )
}
