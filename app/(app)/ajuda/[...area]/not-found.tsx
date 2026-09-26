import type { Metadata } from 'next'
import Link from 'next/link'
import { BookOpen, SearchX } from 'lucide-react'
import { buttonVariants } from '@/components/ui/button'
import { cn } from '@/lib/utils'

export const metadata: Metadata = { title: 'Ajuda não encontrada' }

/**
 * A ajuda de uma área que não existe ou que o acesso da pessoa não abre
 * (a página chama notFound() de propósito, para não mostrar o que ela não
 * vê no menu): em português e com o caminho de volta para a Central — no
 * lugar do 404 padrão do Next, em inglês.
 */
export default function AjudaNaoEncontrada() {
  return (
    <div className="mx-auto flex max-w-xl flex-col items-center gap-4 rounded-xl border border-dashed border-border bg-card px-6 py-10 text-center">
      <SearchX className="size-8 text-muted-foreground/70" aria-hidden="true" />
      <div>
        <h1 className="text-xl font-bold tracking-tight">Esta ajuda não está disponível.</h1>
        <p className="mx-auto mt-1 max-w-prose text-sm text-muted-foreground">O endereço pode estar errado, ou a área não faz parte do seu acesso. A Central mostra a ajuda de todas as áreas que você pode abrir.</p>
      </div>
      {/* Link com cara de botão (e não <Button render>): continua sendo anunciado como link. */}
      <Link href="/ajuda" className={cn(buttonVariants({ size: 'lg' }), 'h-11 sm:h-10')}>
        <BookOpen aria-hidden="true" />Ir para a Central de ajuda
      </Link>
    </div>
  )
}
