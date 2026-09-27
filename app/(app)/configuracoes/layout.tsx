import { PageHeader } from '@/components/app/page-header'
import { SubmenuDasConfiguracoes } from '@/components/admin/submenu-configuracoes'
import { requireWorkspace } from '@/lib/session'
import { pode } from '@/lib/permissoes'

/** O cabeçalho e o submenu, comuns a todas as telas das Configurações. */
export default async function LayoutDasConfiguracoes({ children }: { children: React.ReactNode }) {
  const context = await requireWorkspace()
  const admin = pode(context.role, 'integracoes.configurar')
  return (
    <div>
      <PageHeader title="Configurações"
        description={admin ? `A sua conta, os ajustes de cada área e a administração do espaço ${context.workspace.name}.` : 'A sua conta e onde ficam os ajustes de cada coisa.'} />
      {admin && <SubmenuDasConfiguracoes />}
      {children}
    </div>
  )
}
