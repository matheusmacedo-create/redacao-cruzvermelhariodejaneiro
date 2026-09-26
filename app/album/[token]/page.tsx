import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { Download } from 'lucide-react'
import { Logo } from '@/components/membro/marca'
import { Galeria } from '@/components/album/galeria'
import { albumPeloToken } from '@/lib/envios/eventos'
import { LIMITE_DO_ZIP, resumoDoAlbum } from '@/lib/envios/album'
import { tamanhoLegivel } from '@/lib/envios/regras'

// Página pública, sem login: o link secreto do álbum do evento (docs/envio-de-acoes.md §9).
// Fora do Google, e sem mandar o endereço (com o token) para outros sites.
export const metadata: Metadata = {
  title: 'Álbum do evento — Cruz Vermelha RJ',
  robots: { index: false, follow: false },
  referrer: 'no-referrer',
}
export const dynamic = 'force-dynamic'

const dataLonga = (d: string) => new Date(`${d}T12:00:00Z`).toLocaleDateString('pt-BR', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' })

export default async function Album({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const album = await albumPeloToken(token)
  if (!album) notFound()
  const { evento, fotos } = album
  const bytes = fotos.reduce((s, f) => s + f.tamanho, 0)
  const bytesDeFotos = fotos.filter((f) => f.categoria === 'foto').reduce((s, f) => s + f.tamanho, 0)
  const temVideo = fotos.some((f) => f.categoria === 'video')
  const zip = `/api/publico/album/${encodeURIComponent(token)}/zip`
  const botao = 'inline-flex min-h-11 items-center justify-center gap-2 rounded-lg px-4 text-sm font-semibold'

  return (
    <div className="min-h-dvh bg-sidebar text-foreground">
      <header className="border-b border-border bg-card">
        <div className="mx-auto flex h-14 max-w-5xl items-center px-4 sm:px-6 lg:h-16"><Logo className="w-28 sm:w-32" /></div>
      </header>
      <main className="mx-auto flex max-w-5xl flex-col gap-5 px-4 pb-12 pt-6 sm:px-6">
        <div className="flex flex-col gap-1">
          <p className="text-xs font-semibold uppercase tracking-wide text-primary">Álbum do evento</p>
          <h1 className="text-2xl font-bold leading-tight sm:text-3xl">{evento.nome}</h1>
          <p className="text-sm text-muted-foreground">{[evento.data_do_evento ? dataLonga(evento.data_do_evento) : null, evento.local].filter(Boolean).join(' · ')}</p>
          <p className="text-sm text-muted-foreground">{resumoDoAlbum(fotos)}. Toque numa foto para ver maior e baixar.</p>
        </div>

        {fotos.length > 0 && (
          <div className="flex flex-col gap-2 sm:flex-row">
            {bytes <= LIMITE_DO_ZIP && (
              <a href={zip} className={`${botao} bg-primary text-primary-foreground hover:bg-primary/90`}>
                <Download className="size-4" aria-hidden="true" />Baixar tudo ({tamanhoLegivel(bytes)}, .zip)
              </a>
            )}
            {temVideo && bytesDeFotos > 0 && bytesDeFotos <= LIMITE_DO_ZIP && (
              <a href={`${zip}?so=fotos`} className={`${botao} border border-border bg-card hover:bg-muted`}>
                <Download className="size-4" aria-hidden="true" />Só as fotos ({tamanhoLegivel(bytesDeFotos)})
              </a>
            )}
          </div>
        )}

        {fotos.length
          ? <Galeria token={token} fotos={fotos.map(({ id, nome, categoria, autor, temMiniatura }) => ({ id, nome, categoria, autor, temMiniatura }))} />
          : <p className="rounded-xl border border-border bg-card p-6 text-center text-sm text-muted-foreground">Ainda não chegou nenhuma foto. Quem esteve no evento pode mandar pelo link de envio que a comunicação compartilhou.</p>}

        <p className="text-xs text-muted-foreground">As fotos são de quem esteve no evento e da Cruz Vermelha Brasileira – Filial RJ. Use com respeito às pessoas retratadas; para publicar, fale com a comunicação.</p>
      </main>
    </div>
  )
}
