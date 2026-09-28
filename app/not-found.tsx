import type { Metadata } from 'next'
import Link from 'next/link'
import { SearchX } from 'lucide-react'
import { BrandMark } from '@/components/app/brand-mark'
import { buttonVariants } from '@/components/ui/button'
import { cn } from '@/lib/utils'

export const metadata: Metadata = { title: 'Página não encontrada — Palácio Virtual' }

/**
 * Endereço que não existe (digitado errado, link cortado, QR antigo): em
 * português e com caminho de volta, no lugar do 404 padrão do Next, em
 * inglês. Vale para quem não entrou (visitante, voluntário, fornecedor):
 * por isso oferece as duas portas, a do Palácio e a da Área do Voluntário.
 */
export default function NaoEncontrada() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-6 py-12">
      <div className="flex w-full max-w-md flex-col items-center gap-5 text-center">
        <BrandMark selo className="w-72 items-start text-left" />
        <SearchX className="size-8 text-muted-foreground/70" aria-hidden="true" />
        <div>
          <h1 className="text-xl font-bold tracking-tight">Não encontramos esta página.</h1>
          <p className="mt-1 text-sm text-muted-foreground">Confira o endereço. Se veio de um link ou de um QR code, ele pode ter mudado ou saído do ar.</p>
        </div>
        <div className="flex flex-wrap justify-center gap-2">
          <Link href="/" className={cn(buttonVariants({ size: 'lg' }), 'h-11 sm:h-10')}>Entrar no Palácio Virtual</Link>
          <Link href="/membro" className={cn(buttonVariants({ size: 'lg', variant: 'outline' }), 'h-11 sm:h-10')}>Área do Voluntário</Link>
        </div>
      </div>
    </main>
  )
}
