import 'server-only'

import type { ArquivosNoSite } from './paginas'

/**
 * Vídeo público do acervo: o player e a miniatura do YouTube (sem cookie) ou do Vimeo. A
 * miniatura do Vimeo vem do oEmbed público dele; sem ela, a página sai sem capa.
 */
export async function dadosDoVideo(url: string): Promise<NonNullable<ArquivosNoSite['video']>> {
  const yt = /^https:\/\/(?:www\.)?(?:youtube\.com\/watch\?(?:.*&)?v=|youtu\.be\/)([\w-]{6,20})/.exec(url)
  if (yt) {
    const id = yt[1]
    return { embed: `https://www.youtube-nocookie.com/embed/${id}`, pagina: `https://www.youtube.com/watch?v=${id}`, miniatura: `https://i.ytimg.com/vi/${id}/hqdefault.jpg` }
  }
  const vimeo = /^https:\/\/(?:www\.)?vimeo\.com\/(\d{5,12})/.exec(url)
  if (vimeo) {
    const id = vimeo[1]
    let miniatura: string | null = null
    try {
      const r = await fetch(`https://vimeo.com/api/oembed.json?url=${encodeURIComponent(`https://vimeo.com/${id}`)}`, { signal: AbortSignal.timeout(8_000), cache: 'no-store' })
      if (r.ok) {
        const d = (await r.json()) as { thumbnail_url?: unknown }
        if (typeof d.thumbnail_url === 'string' && /^https:\/\//.test(d.thumbnail_url)) miniatura = d.thumbnail_url
      }
    } catch { /* sem miniatura */ }
    return { embed: `https://player.vimeo.com/video/${id}`, pagina: `https://vimeo.com/${id}`, miniatura }
  }
  throw new Error('O link do vídeo precisa ser do YouTube ou do Vimeo.')
}
