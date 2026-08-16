import { notFound } from 'next/navigation'
import { getContent, getPauta, getPerson } from '@/lib/data'
import { ContentEditor } from './content-editor'

export default async function ContentPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const content = getContent(id)
  if (!content) notFound()
  const pauta = getPauta(content.pautaId)
  const responsible = getPerson(content.responsibleId)
  return <ContentEditor content={content} pauta={pauta} responsible={responsible} />
}
