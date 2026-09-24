import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { ChevronLeft } from 'lucide-react'
import { exigirMembro } from '@/lib/membro/sessao'
import { cursoDoMembro, questoesDaProva } from '@/lib/membro/cursos'
import { Prova } from '@/components/membro/prova'

export const dynamic = 'force-dynamic'

export default async function ProvaDoCurso({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const m = await exigirMembro()
  const d = await cursoDoMembro(m, id)
  if (!d || !d.temProva) notFound()
  // Na visualização, a equipe confere a prova sem precisar concluir as aulas.
  if (!m.previa && (d.certificado || !d.progresso.concluido)) redirect(`/membro/cursos/${id}`)
  const questoes = await questoesDaProva(id)
  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-5">
      <Link href={`/membro/cursos/${id}`} className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"><ChevronLeft className="size-4" />{d.curso.titulo}</Link>
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Prova final</h1>
        <p className="text-sm text-muted-foreground">{questoes.length} questões · nota mínima {d.curso.nota_minima} · até 3 tentativas a cada 24 horas.</p>
      </div>
      <Prova cursoId={id} questoes={questoes} minima={d.curso.nota_minima ?? 0} />
    </div>
  )
}
