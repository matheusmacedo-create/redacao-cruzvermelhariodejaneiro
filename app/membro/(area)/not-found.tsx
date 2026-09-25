import type { Metadata } from 'next'
import Link from 'next/link'
import { GraduationCap, House, SearchX } from 'lucide-react'
import { botaoDoMembro, botaoSecundario } from '@/components/membro/marca'

export const metadata: Metadata = { title: 'Página não encontrada' }

/**
 * Curso, aula ou conversa que não existe (ou não é desta pessoa): em
 * português e dentro da casca, com caminho de volta — no lugar do 404
 * padrão, em inglês.
 */
export default function NaoEncontrada() {
  return (
    <div className="flex flex-col items-center gap-4 rounded-xl border border-dashed border-input bg-card px-6 py-10 text-center">
      <SearchX className="size-8 text-muted-foreground/70" aria-hidden="true" />
      <div>
        <h1 className="text-xl font-bold tracking-tight">Não encontramos esta página.</h1>
        <p className="mx-auto mt-1 max-w-prose text-sm text-muted-foreground">O link pode ter mudado ou o conteúdo saiu do ar.</p>
      </div>
      <div className="flex flex-wrap justify-center gap-2">
        <Link href="/membro" className={botaoDoMembro}><House className="size-4" aria-hidden="true" />Ir para o início</Link>
        <Link href="/membro/cursos" className={botaoSecundario}><GraduationCap className="size-4" aria-hidden="true" />Ver cursos</Link>
      </div>
    </div>
  )
}
