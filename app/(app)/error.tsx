'use client'

import { useEffect } from 'react'
import Link from 'next/link'
import { AlertTriangle, RotateCw } from 'lucide-react'
import { Button } from '@/components/ui/button'

export default function AppError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error)
  }, [error])

  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4 px-6 text-center">
      <span className="flex size-12 items-center justify-center rounded-full bg-destructive/10 text-destructive">
        <AlertTriangle className="size-6" />
      </span>
      <div>
        <h1 className="text-lg font-semibold">Algo deu errado ao carregar esta página</h1>
        <p className="mt-1 max-w-md text-sm text-muted-foreground">
          Se você acabou de salvar algo, a alteração provavelmente foi registrada — apenas esta tela não
          conseguiu atualizar. Tente novamente ou volte para o Dashboard.
        </p>
      </div>
      <div className="flex items-center gap-2">
        <Button onClick={() => reset()}>
          <RotateCw className="size-4" />
          Tentar novamente
        </Button>
        <Button variant="outline" render={<Link href="/dashboard" />}>
          Ir para o Dashboard
        </Button>
      </div>
    </div>
  )
}
