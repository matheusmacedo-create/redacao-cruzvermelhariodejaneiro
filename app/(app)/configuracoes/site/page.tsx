import { AnalyticsDoSite } from '@/components/admin/analytics-do-site'
import { exigirAdministracao } from '@/lib/configuracoes/servidor'

// Republicar uma matéria daqui pode narrar o texto (lib/voz, até PRAZO_DA_NARRACAO_MS) antes de subir a página.
export const maxDuration = 300

export const metadata = { title: 'Site — Configurações' }

export default async function SitePage() {
  await exigirAdministracao()
  return <AnalyticsDoSite />
}
