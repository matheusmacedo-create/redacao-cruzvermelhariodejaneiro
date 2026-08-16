import { notFound } from 'next/navigation'
import { getApproval, getContent, getPerson } from '@/lib/data'
import { ReviewView } from './review-view'

export default async function ReviewPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const approval = getApproval(id)
  if (!approval) notFound()
  const content = getContent(approval.contentId)
  const requester = getPerson(approval.requesterId)
  return <ReviewView approval={approval} content={content} requester={requester} />
}
