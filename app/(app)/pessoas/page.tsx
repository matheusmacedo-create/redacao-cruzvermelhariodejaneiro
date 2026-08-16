import { Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { PageHeader } from '@/components/app/page-header'
import { PeopleView } from './people-view'

export default function PessoasPage() {
  return (
    <div>
      <PageHeader
        title="Pessoas"
        description="Rede de contatos da Redação: equipe, voluntários, especialistas e entrevistados."
        actions={
          <Button size="lg">
            <Plus className="size-4" />
            Adicionar pessoa
          </Button>
        }
      />
      <PeopleView />
    </div>
  )
}
