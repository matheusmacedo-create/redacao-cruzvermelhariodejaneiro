'use client'

import { useRouter } from 'next/navigation'
import { useTransition } from 'react'
import { Loader2, Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { criarPost } from '@/app/actions/social'

export function NovaPublicacaoButton() {
  const router = useRouter()
  const [pendente, iniciar] = useTransition()

  return (
    <Button
      size="lg"
      disabled={pendente}
      onClick={() =>
        iniciar(async () => {
          const form = new FormData()
          form.set('postType', 'feed')
          const { postId } = await criarPost(form)
          router.push(`/publicacoes/${postId}`)
        })
      }
    >
      {pendente ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />}
      Nova publicação
    </Button>
  )
}
