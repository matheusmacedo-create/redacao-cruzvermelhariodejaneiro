import { PageHeader } from '@/components/app/page-header'
import { SettingsView } from './settings-view'

export default function ConfiguracoesPage() {
  return (
    <div>
      <PageHeader
        title="Configurações"
        description="Administração de usuários, coordenações e preferências do sistema."
      />
      <SettingsView />
    </div>
  )
}
