'use client'

import { useState, useTransition } from 'react'
import { Check, Copy, ExternalLink, Globe, RefreshCw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { publicarArtigoNoSite } from '@/app/actions/site'
import { gerarSlug } from '@/lib/site/slug'

export function PublicadorSite({
  contentId,
  titulo,
  siteUrl,
  publicadoEm,
  baseUrl,
  onPublicado,
}: {
  contentId: string
  titulo: string
  siteUrl?: string | null
  publicadoEm?: string | null
  baseUrl?: string | null
  onPublicado?: (url: string) => void
}) {
  const [enviando, iniciar] = useTransition()
  const [url, setUrl] = useState(siteUrl ?? '')
  const [erro, setErro] = useState('')
  const [aviso, setAviso] = useState('')
  const [copiado, setCopiado] = useState(false)

  // Prévia do endereço antes de publicar: quem escreve o título decide o
  // endereço, e é melhor ver isso antes do que descobrir depois.
  const previa = url || (baseUrl && titulo.trim() ? `${baseUrl.replace(/\/+$/, '')}/${gerarSlug(titulo)}/` : '')

  function publicar() {
    setErro(''); setAviso('')
    const form = new FormData()
    form.set('contentId', contentId)
    iniciar(async () => {
      const r = await publicarArtigoNoSite(form)
      if (r.erro) { setErro(r.erro); return }
      if (r.aviso) setAviso(r.aviso)
      if (r.url) { setUrl(r.url); onPublicado?.(r.url) }
    })
  }

  return (
    <div className="rounded-lg border border-border p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h3 className="flex items-center gap-2 text-sm font-semibold">
          <Globe className="size-4" />
          Página no site
        </h3>
        <Button size="sm" variant={url ? 'outline' : 'default'} onClick={publicar} disabled={enviando}>
          {url ? <RefreshCw className="size-4" /> : <Globe className="size-4" />}
          {enviando ? 'Publicando…' : url ? 'Republicar' : 'Publicar no site'}
        </Button>
      </div>

      <p className="mt-2 text-sm text-muted-foreground">
        {url
          ? 'A página está no ar. Republique depois de editar o texto para atualizar o que está publicado.'
          : 'Gera uma página no domínio da instituição, com endereço terminado em barra e as marcações que o Google e as redes leem. As imagens do texto sobem junto.'}
      </p>

      {previa && (
        <p className="mt-3 break-all rounded-md bg-muted px-3 py-2 font-mono text-xs">
          {url ? previa : <><span className="text-muted-foreground">endereço previsto: </span>{previa}</>}
        </p>
      )}

      {url && (
        <div className="mt-3 flex flex-wrap gap-2">
          <Button size="sm" variant="outline" render={<a href={url} target="_blank" rel="noreferrer" />}>
            <ExternalLink className="size-4" />Abrir
          </Button>
          <Button
            size="sm" variant="ghost"
            onClick={async () => {
              try {
                await navigator.clipboard.writeText(url)
                setCopiado(true); setTimeout(() => setCopiado(false), 2000)
              } catch { /* navegador sem permissão: o endereço continua na tela */ }
            }}
          >
            {copiado ? <><Check className="size-4" />Copiado</> : <><Copy className="size-4" />Copiar link</>}
          </Button>
        </div>
      )}

      {publicadoEm && url && (
        <p className="mt-2 text-xs text-muted-foreground">No ar desde {publicadoEm}.</p>
      )}

      {url && (
        <p className="mt-3 text-xs text-muted-foreground">
          Este endereço já entra como <strong className="font-medium">Link da matéria</strong> no publicador abaixo — é ele
          que vira o card da notícia quando o post sai nas redes.
        </p>
      )}

      {aviso && <p className="mt-3 text-sm text-amber-600 dark:text-amber-500">{aviso}</p>}
      {erro && <p className="mt-3 text-sm text-destructive">{erro}</p>}
    </div>
  )
}
