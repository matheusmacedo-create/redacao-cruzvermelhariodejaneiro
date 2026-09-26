'use client'

import { useState } from 'react'
import Link from 'next/link'
import { Check, Copy, Download, Printer } from 'lucide-react'

/** O link público e o QR code para imprimir no crachá, no cartaz ou mandar no grupo da equipe. */
export function LinkDaEquipe({ url, qr }: { url: string; qr: string }) {
  const [copiado, setCopiado] = useState(false)
  async function copiar() {
    try { await navigator.clipboard.writeText(url); setCopiado(true); setTimeout(() => setCopiado(false), 2000) } catch { /* sem área de transferência */ }
  }
  return (
    <div className="flex flex-col gap-4 rounded-xl border border-border bg-card p-4 sm:flex-row sm:items-center" data-ajuda="envios.link">
      <img src={qr} alt={`QR code para ${url}`} width={112} height={112} className="size-28 shrink-0 rounded-md border border-border bg-white p-1" />
      <div className="flex min-w-0 flex-col gap-2">
        <p className="text-sm font-semibold">Link para a equipe mandar ações</p>
        <p className="text-sm text-muted-foreground">Qualquer pessoa com o link manda fotos, vídeos, áudios e o relato — sem login. Imprima o cartaz com a nossa marca para a ação, ou mande o link no grupo da equipe.</p>
        <div className="flex flex-wrap items-center gap-2">
          <code className="min-w-0 break-all rounded bg-muted px-2 py-1 text-xs">{url}</code>
          <button type="button" onClick={copiar} className="inline-flex h-8 items-center gap-1.5 rounded-md border border-border px-2.5 text-xs font-medium hover:bg-muted">
            {copiado ? <Check className="size-3.5 text-emerald-600" aria-hidden="true" /> : <Copy className="size-3.5" aria-hidden="true" />}{copiado ? 'Copiado' : 'Copiar link'}
          </button>
          <a href={qr} download="qr-mandar-uma-acao.png" className="inline-flex h-8 items-center gap-1.5 rounded-md border border-border px-2.5 text-xs font-medium hover:bg-muted">
            <Download className="size-3.5" aria-hidden="true" />Baixar QR code
          </a>
          <Link href="/envios/cartaz" className="inline-flex h-8 items-center gap-1.5 rounded-md bg-primary px-2.5 text-xs font-medium text-primary-foreground hover:bg-primary/90">
            <Printer className="size-3.5" aria-hidden="true" />Cartaz para imprimir
          </Link>
        </div>
      </div>
    </div>
  )
}
