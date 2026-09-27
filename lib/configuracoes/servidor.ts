import 'server-only'
import { redirect } from 'next/navigation'
import { requireWorkspace } from '@/lib/session'
import { pode } from '@/lib/permissoes'

/** As telas de dentro das Configurações são só da administração; quem não é volta para a visão geral. */
export async function exigirAdministracao() {
  const context = await requireWorkspace()
  if (!pode(context.role, 'integracoes.configurar')) redirect('/configuracoes')
  return context
}
