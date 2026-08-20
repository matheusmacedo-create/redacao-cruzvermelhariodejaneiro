'use client'

import { Bookmark, Heart, MessageCircle, MoreHorizontal, Send, ThumbsUp } from 'lucide-react'
import { Card } from '@/components/ui/card'
import type { PostType, SocialPlatform } from '@/lib/meta/types'

/**
 * Preview de como o post aparece em cada rede.
 *
 * Não é enfeite: é o que evita descobrir uma legenda cortada ou uma imagem
 * mal enquadrada só depois de publicado. O Instagram corta a legenda em ~125
 * caracteres no feed, então mostramos exatamente esse corte.
 */

const CORTE_LEGENDA_IG = 125

type MidiaPreview = { id: string; url: string; contentType: string; name: string }

function Moldura({ midias, postType }: { midias: MidiaPreview[]; postType: PostType }) {
  const proporcao =
    postType === 'reels' || postType === 'story' ? 'aspect-[9/16]' : 'aspect-square'

  if (midias.length === 0) {
    return (
      <div className={`flex ${proporcao} items-center justify-center bg-muted text-xs text-muted-foreground`}>
        Nenhuma mídia selecionada
      </div>
    )
  }

  const primeira = midias[0]

  return (
    <div className={`relative ${proporcao} overflow-hidden bg-muted`}>
      {primeira.contentType.startsWith('video/') ? (
        <video src={primeira.url} className="size-full object-cover" muted playsInline preload="metadata" />
      ) : (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={primeira.url} alt={primeira.name} className="size-full object-cover" />
      )}
      {midias.length > 1 && (
        <span className="absolute right-2 top-2 rounded-full bg-foreground/70 px-2 py-0.5 text-[11px] font-medium text-background">
          1/{midias.length}
        </span>
      )}
    </div>
  )
}

function PreviewInstagram({
  conta,
  legenda,
  midias,
  postType,
}: {
  conta: string
  legenda: string
  midias: MidiaPreview[]
  postType: PostType
}) {
  const cortada = legenda.length > CORTE_LEGENDA_IG
  const visivel = cortada ? legenda.slice(0, CORTE_LEGENDA_IG) : legenda

  return (
    <Card className="w-full max-w-sm overflow-hidden">
      <div className="flex items-center gap-2 p-3">
        <span className="size-8 rounded-full bg-gradient-to-tr from-primary to-warning" />
        <span className="flex-1 truncate text-sm font-semibold">{conta}</span>
        <MoreHorizontal className="size-4 text-muted-foreground" />
      </div>

      <Moldura midias={midias} postType={postType} />

      {postType !== 'story' && (
        <>
          <div className="flex items-center gap-3 px-3 pt-3 text-foreground">
            <Heart className="size-5" />
            <MessageCircle className="size-5" />
            <Send className="size-5" />
            <Bookmark className="ml-auto size-5" />
          </div>
          <p className="px-3 pb-3 pt-2 text-sm leading-snug break-words">
            <span className="font-semibold">{conta}</span>{' '}
            <span className="whitespace-pre-wrap">{visivel}</span>
            {cortada && <span className="text-muted-foreground">… mais</span>}
          </p>
        </>
      )}
    </Card>
  )
}

function PreviewFacebook({
  conta,
  legenda,
  midias,
  postType,
}: {
  conta: string
  legenda: string
  midias: MidiaPreview[]
  postType: PostType
}) {
  return (
    <Card className="w-full max-w-sm overflow-hidden">
      <div className="flex items-center gap-2 p-3">
        <span className="size-8 rounded-full bg-info/20" />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold">{conta}</p>
          <p className="text-[11px] text-muted-foreground">Agora · Página</p>
        </div>
        <MoreHorizontal className="size-4 text-muted-foreground" />
      </div>

      {legenda && <p className="px-3 pb-3 text-sm leading-snug whitespace-pre-wrap break-words">{legenda}</p>}

      <Moldura midias={midias} postType={postType} />

      <div className="flex items-center gap-4 px-3 py-2 text-xs text-muted-foreground">
        <span className="flex items-center gap-1">
          <ThumbsUp className="size-3.5" /> Curtir
        </span>
        <span className="flex items-center gap-1">
          <MessageCircle className="size-3.5" /> Comentar
        </span>
      </div>
    </Card>
  )
}

export function PostPreview({
  plataformas,
  conta,
  legenda,
  midias,
  postType,
}: {
  plataformas: SocialPlatform[]
  conta: string
  legenda: string
  midias: MidiaPreview[]
  postType: PostType
}) {
  const mostrar = plataformas.length ? plataformas : (['instagram'] as SocialPlatform[])

  return (
    <div className="flex flex-wrap gap-4">
      {mostrar.includes('instagram') && (
        <div>
          <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Instagram</p>
          <PreviewInstagram conta={conta} legenda={legenda} midias={midias} postType={postType} />
        </div>
      )}
      {mostrar.includes('facebook') && (
        <div>
          <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Facebook</p>
          <PreviewFacebook conta={conta} legenda={legenda} midias={midias} postType={postType} />
        </div>
      )}
    </div>
  )
}
