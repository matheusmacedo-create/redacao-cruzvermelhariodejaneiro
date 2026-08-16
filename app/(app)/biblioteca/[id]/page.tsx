import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ArrowLeft, ImageIcon, Video, Music, FileText, Download, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Avatar } from '@/components/ui/avatar'
import { FileStatusBadge } from '@/components/ui/status-badge'
import { getFile, getPerson } from '@/lib/data'

const kindIcon = { foto: ImageIcon, video: Video, audio: Music, documento: FileText }
const kindLabel = { foto: 'Foto', video: 'Vídeo', audio: 'Áudio', documento: 'Documento' }

export default async function FilePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const file = getFile(id)
  if (!file) notFound()
  const author = getPerson(file.authorId)
  const Icon = kindIcon[file.kind]

  return (
    <div>
      <nav className="mb-4 flex items-center gap-1 text-xs text-muted-foreground">
        <Link href="/biblioteca" className="flex items-center gap-1 hover:text-foreground">
          <ArrowLeft className="size-3.5" />
          Biblioteca
        </Link>
        <span>/</span>
        <span className="text-foreground">{file.name}</span>
      </nav>

      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        <Card className="flex items-center justify-center overflow-hidden" style={{ minHeight: 420 }}>
          <div
            className="flex size-full min-h-[420px] items-center justify-center"
            style={{ backgroundColor: file.bg }}
          >
            <Icon className="size-16 text-white/70" />
          </div>
        </Card>

        <div className="flex flex-col gap-4">
          <Card className="p-5">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="truncate font-semibold">{file.name}</p>
                <p className="text-xs text-muted-foreground">
                  {kindLabel[file.kind]} · {file.size}
                </p>
              </div>
              <FileStatusBadge status={file.status} />
            </div>

            <dl className="mt-4 space-y-3 border-t border-border pt-4 text-sm">
              <div className="flex items-center justify-between gap-2">
                <dt className="text-muted-foreground">Enviado por</dt>
                <dd className="flex items-center gap-1.5 font-medium">
                  <Avatar initials={author?.initials ?? '?'} color={author?.color} size="xs" />
                  {author?.name.split(' ')[0]}
                </dd>
              </div>
              <Row label="Data">{file.date}</Row>
              {file.project && <Row label="Projeto">{file.project}</Row>}
              {file.event && <Row label="Evento">{file.event}</Row>}
              {file.local && <Row label="Local">{file.local}</Row>}
            </dl>

            <div className="mt-4 flex flex-wrap gap-1.5 border-t border-border pt-4">
              {file.tags.map((t) => (
                <span key={t} className="rounded-md bg-muted px-2 py-0.5 text-xs text-muted-foreground">
                  #{t}
                </span>
              ))}
            </div>
          </Card>

          <Card className="p-5">
            <h3 className="text-sm font-semibold">Autorização de uso</h3>
            <p className="mt-1 text-xs text-muted-foreground">
              Defina se este arquivo pode ser utilizado em conteúdos públicos.
            </p>
            <div className="mt-3 flex flex-col gap-2">
              <Button variant="outline" size="lg" className="justify-start">
                Marcar como autorizado
              </Button>
              <Button variant="outline" size="lg" className="justify-start">
                Marcar autorização pendente
              </Button>
              <Button variant="destructive" size="lg" className="justify-start">
                Marcar como não utilizar
              </Button>
            </div>
          </Card>

          <div className="flex gap-2">
            <Button variant="outline" size="lg" className="flex-1">
              <Download className="size-4" />
              Baixar
            </Button>
            <Button variant="ghost" size="icon-lg" aria-label="Remover">
              <Trash2 className="size-4" />
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="text-right font-medium">{children}</dd>
    </div>
  )
}
