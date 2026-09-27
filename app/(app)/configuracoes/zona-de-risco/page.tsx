import { DangerZone } from '@/components/admin/danger-zone'
import { exigirAdministracao } from '@/lib/configuracoes/servidor'

export const metadata = { title: 'Zona de risco — Configurações' }

export default async function ZonaDeRiscoPage() {
  const context = await exigirAdministracao()
  return <DangerZone workspace={context.workspace} />
}
