'use client' // Error boundaries precisam ser componentes do cliente.

import { useEffect } from 'react'
import Link from 'next/link'
import { House, RotateCw, TriangleAlert } from 'lucide-react'
import { botaoDoMembro, botaoSecundario } from '@/components/membro/marca'

/**
 * Erro ao montar uma página da área, dentro da casca: cabeçalho e abas
 * continuam, e a pessoa tem para onde ir. No Next 16 a recuperação é
 * `retry()` (busca de novo no servidor); `reset()` só redesenharia o que já veio.
 */
export default function ErroNaArea({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  useEffect(() => {
    console.error(error)
  }, [error])

  return (
    <div className="flex flex-col items-center gap-4 rounded-xl border border-border bg-card px-6 py-10 text-center" role="alert">
      <TriangleAlert className="size-8 text-destructive" aria-hidden="true" />
      <div>
        <h1 className="text-xl font-bold tracking-tight">Algo deu errado ao abrir esta página.</h1>
        <p className="mx-auto mt-1 max-w-prose text-sm text-muted-foreground">Pode ser uma falha passageira. Tente de novo; se continuar, volte ao início e abra a página outra vez.</p>
      </div>
      <div className="flex flex-wrap justify-center gap-2">
        <button type="button" onClick={() => retry()} className={botaoDoMembro}><RotateCw className="size-4" aria-hidden="true" />Tentar de novo</button>
        <Link href="/membro" className={botaoSecundario}><House className="size-4" aria-hidden="true" />Voltar ao início</Link>
      </div>
    </div>
  )
}
