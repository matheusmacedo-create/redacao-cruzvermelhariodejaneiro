import { UploadCloud } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { PageHeader } from '@/components/app/page-header'
import { LibraryView } from './library-view'

export default function BibliotecaPage() {
  return (
    <div>
      <PageHeader
        title="Biblioteca"
        description="Acervo de fotos, vídeos, áudios e documentos da Redação CVRJ."
        actions={
          <Button size="lg">
            <UploadCloud className="size-4" />
            Enviar arquivos
          </Button>
        }
      />
      <LibraryView />
    </div>
  )
}
