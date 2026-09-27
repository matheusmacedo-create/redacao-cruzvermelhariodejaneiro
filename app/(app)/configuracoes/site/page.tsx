import { AnalyticsDoSite } from '@/components/admin/analytics-do-site'
import { exigirAdministracao } from '@/lib/configuracoes/servidor'

export const metadata = { title: 'Site — Configurações' }

export default async function SitePage() {
  await exigirAdministracao()
  return <AnalyticsDoSite />
}
