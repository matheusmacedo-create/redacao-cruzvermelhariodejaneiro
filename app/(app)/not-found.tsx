import type { Metadata } from 'next'
import Link from 'next/link'
import { BookOpen, House, SearchX } from 'lucide-react'
import { buttonVariants } from '@/components/ui/button'
import { cn } from '@/lib/utils'

export const metadata: Metadata = { title: 'Página não encontrada' }

/**
 * Registro que não existe mais, que não é do seu acesso ou link antigo: as
 * telas chamam notFound() e caem aqui, dentro do Palácio (com o menu), em
 * português e com caminho de volta — no lugar do 404 padrão do Next, em
 * inglês e sem saída. Endereço sem rota nenhuma vai para app/not-found.tsx.
 */
export default function NaoEncontrada() {
  return (
    <div className="mx-auto flex max-w-xl flex-col items-center gap-4 rounded-xl border border-dashed border-border bg-card px-6 py-10 text-center">
      <SearchX className="size-8 text-muted-foreground/70" aria-hidden="true" />
      <div>
        <h1 className="text-xl font-bold tracking-tight">Não encontramos esta página.</h1>
        <p className="mx-auto mt-1 max-w-prose text-sm text-muted-foreground">
          O registro pode ter sido excluído, o link pode ser antigo ou a área não faz parte do seu acesso. A busca, no alto (Ctrl K), acha as áreas pelo nome.
        </p>
      </div>
      <div className="flex flex-wrap justify-center gap-2">
        {/* Links com cara de botão (e não <Button render>): continuam sendo anunciados como link. */}
        <Link href="/dashboard" className={cn(buttonVariants({ size: 'lg' }), 'h-11 sm:h-10')}><House aria-hidden="true" />Ir para o Início</Link>
        <Link href="/ajuda" className={cn(buttonVariants({ size: 'lg', variant: 'outline' }), 'h-11 sm:h-10')}><BookOpen aria-hidden="true" />Central de ajuda</Link>
      </div>
    </div>
  )
}
