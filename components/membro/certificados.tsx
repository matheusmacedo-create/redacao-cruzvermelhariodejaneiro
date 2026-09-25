'use client'

import { useEffect, useRef, useState } from 'react'
import { Check, Link2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { botaoFantasma, campoDoMembro } from './marca'

/**
 * Copia o link público de verificação do certificado (para mandar a quem
 * pediu o comprovante). Confirma na hora ("Link copiado") e avisa o leitor
 * de tela. Sem acesso à área de transferência (navegador antigo, permissão
 * negada), mostra o link num campo já selecionado para copiar à mão.
 */
export function CopiarLink({ url, className }: { url: string; className?: string }) {
  const [estado, setEstado] = useState<'parado' | 'copiado' | 'falhou'>('parado')
  const relogio = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const campo = useRef<HTMLInputElement>(null)

  useEffect(() => () => clearTimeout(relogio.current), [])
  useEffect(() => {
    if (estado === 'falhou') { campo.current?.focus(); campo.current?.select() }
  }, [estado])

  const copiar = async () => {
    clearTimeout(relogio.current)
    try {
      await navigator.clipboard.writeText(url)
      setEstado('copiado')
      relogio.current = setTimeout(() => setEstado('parado'), 4000)
    } catch {
      setEstado('falhou')
    }
  }

  return (
    <>
      <button type="button" onClick={copiar} className={cn(botaoFantasma, className)}>
        {estado === 'copiado' ? <Check className="size-4 shrink-0 text-success" aria-hidden="true" /> : <Link2 className="size-4 shrink-0" aria-hidden="true" />}
        {estado === 'copiado' ? 'Link copiado' : 'Copiar link de verificação'}
      </button>
      {/* Sempre na página (vazia até copiar): região que já existe é a que o leitor de tela anuncia. */}
      <span className="sr-only" role="status">{estado === 'copiado' ? 'Link de verificação copiado.' : ''}</span>
      {estado === 'falhou' && (
        <label className="flex flex-col gap-1 text-sm text-muted-foreground">
          Não deu para copiar sozinho. Copie o link:
          <input ref={campo} readOnly value={url} className={campoDoMembro} onFocus={(e) => e.currentTarget.select()} />
        </label>
      )}
    </>
  )
}
