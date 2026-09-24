import { notFound } from 'next/navigation'
import { PerfilSocial } from '@/components/app/pessoas/perfil-social'
import { requireWorkspace } from '@/lib/session'
import { carregarPerfil } from '@/lib/pessoas/perfil-servidor'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Perfil' }

/**
 * O perfil de uma pessoa da Redação, no jeito de uma rede social:
 * apresentação, como ela responde à equipe (métricas) e os contatos que ela
 * escolheu mostrar para quem está lendo.
 */
export default async function PerfilDaPessoaPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const context = await requireWorkspace()
  const perfil = await carregarPerfil({ workspaceId: context.workspace.id, leitorId: context.user.id, papelDoLeitor: context.role, alvoId: id })
  if (!perfil) notFound()
  return <PerfilSocial p={perfil} />
}

