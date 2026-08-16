import { notFound } from 'next/navigation'
import { getPauta } from '@/lib/data'
import { PautaRoom } from './pauta-room'

export default async function PautaPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const pauta = getPauta(id)
  if (!pauta) notFound()
  return <PautaRoom pauta={pauta} />
}
