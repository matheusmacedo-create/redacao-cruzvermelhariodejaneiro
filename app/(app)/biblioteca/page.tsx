import { UploadCloud } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { PageHeader } from '@/components/app/page-header'
import { LibraryView } from './library-view'
import { Card } from '@/components/ui/card'
import { requireWorkspace } from '@/lib/session'

export default async function BibliotecaPage() {
  const context = await requireWorkspace()
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
      {context.workspace.kind === 'demo' ? <LibraryView /> : <Card className="p-10 text-center"><p className="font-medium">Biblioteca vazia.</p><p className="mt-1 text-sm text-muted-foreground">Os arquivos enviados para Produção aparecerão aqui.</p></Card>}
    </div>
  )
}
