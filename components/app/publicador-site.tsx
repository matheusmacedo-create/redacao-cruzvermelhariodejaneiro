'use client'

import { useState, useTransition } from 'react'
import { Check, Copy, ExternalLink, Globe, RefreshCw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { publicarArtigoNoSite } from '@/app/actions/site'
import { gerarSlug } from '@/lib/site/slug'

export type DadosDaMateria = { titulo: string; subtitulo: string; corpo: string }

/**
 * Seção "Site" do publicador de redes.
 *
 * Vive dentro do cartão de publicar, como mais um destino, porque é assim que
 * quem publica pensa: o site é uma das redes. O formulário manda o texto que
 * está na tela — a ação salva antes de publicar, então o que você vê é o que
 * sobe.
 */
export function SecaoSite({
  contentId,
  siteUrl,
  publicadoEm,
  baseUrl,
  dados,
  onPublicado,
}: {
  contentId: string
  siteUrl?: string | null
  publicadoEm?: string | null
  baseUrl?: string | null
  dados: () => DadosDaMateria
  onPublicado?: (url: string) => void
}) {
  const [enviando, iniciar] = useTransition()
  const [url, setUrl] = useState(siteUrl ?? '')
  const [erro, setErro] = useState('')
  const [aviso, setAviso] = useState('')
  const [copiado, setCopiado] = useState(false)

  const titulo = dados().titulo
  // O endereço nasce do título. Mostrar antes de publicar deixa a pessoa
  // corrigir o título enquanto ainda é barato; depois de no ar, ele congela.
  const previa = url || (baseUrl && titulo.trim() ? `${baseUrl.replace(/\/+$/, '')}/${gerarSlug(titulo)}/` : '')

  function publicar() {
    setErro(''); setAviso('')
    const atual = dados()
    const form = new FormData()
    form.set('contentId', contentId)
    form.set('title', atual.titulo)
    form.set('subtitle', atual.subtitulo)
    form.set('body', atual.corpo)
    iniciar(async () => {
      const r = await publicarArtigoNoSite(form)
      if (r.erro) { setErro(r.erro); return }
      if (r.aviso) setAviso(r.aviso)
      if (r.url) { setUrl(r.url); onPublicado?.(r.url) }
    })
  }

  return (
    <div className="rounded-lg border border-border bg-muted/30 p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          <Globe className="size-3.5" />
          Site da instituição
        </p>
        <div className="flex items-center gap-1.5">
          {url && (
            <>
              <Button size="sm" variant="ghost" render={<a href={url} target="_blank" rel="noreferrer" />}>
                <ExternalLink className="size-3.5" />Abrir
              </Button>
              <Button
                size="sm" variant="ghost"
                onClick={async () => {
                  try {
                    await navigator.clipboard.writeText(url)
                    setCopiado(true); setTimeout(() => setCopiado(false), 2000)
                  } catch { /* sem permissão de área de transferência: o endereço segue visível */ }
                }}
              >
                {copiado ? <><Check className="size-3.5" />Copiado</> : <><Copy className="size-3.5" />Copiar</>}
              </Button>
            </>
          )}
          <Button size="sm" variant={url ? 'outline' : 'default'} onClick={publicar} disabled={enviando || !titulo.trim()}>
            {url ? <RefreshCw className="size-3.5" /> : <Globe className="size-3.5" />}
            {enviando ? 'Publicando…' : url ? 'Republicar' : 'Publicar página'}
          </Button>
        </div>
      </div>

      {previa && (
        <p className="mt-2 break-all font-mono text-xs text-muted-foreground">
          {url ? previa : <>vai para: {previa}</>}
          {url && publicadoEm && <span className="font-sans"> · no ar desde {publicadoEm}</span>}
        </p>
      )}

      {url && (
        <p className="mt-1.5 text-xs text-muted-foreground">
          O endereço já entrou como link da matéria: os posts abaixo saem apontando para ele.
        </p>
      )}

      {aviso && <p className="mt-2 text-sm text-amber-600 dark:text-amber-500">{aviso}</p>}
      {erro && <p className="mt-2 text-sm text-destructive">{erro}</p>}
    </div>
  )
}
