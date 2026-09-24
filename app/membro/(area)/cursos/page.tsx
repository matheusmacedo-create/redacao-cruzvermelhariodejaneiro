import Link from 'next/link'
import { BookOpen, GraduationCap } from 'lucide-react'
import { exigirMembro } from '@/lib/membro/sessao'
import { catalogoDoMembro } from '@/lib/membro/cursos'
import { CartaoDeCurso } from '@/components/membro/cursos'

export const dynamic = 'force-dynamic'

export default async function Cursos() {
  const m = await exigirMembro()
  const cursos = await catalogoDoMembro(m)
  const andamento = cursos.filter((c) => c.progresso.feitas > 0 && !c.certificado)
  const resto = cursos.filter((c) => !andamento.includes(c))
  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Cursos</h1>
          <p className="text-sm text-neutral-600">Formação da Cruz Vermelha RJ para voluntários. Concluiu, o certificado sai na hora.</p>
        </div>
        <Link href="/membro/apostilas" className="flex items-center gap-1.5 rounded-lg border border-neutral-200 bg-white px-3 py-2 text-sm font-medium hover:border-neutral-300"><BookOpen className="size-4 text-[#e32219]" />Apostilas</Link>
      </div>
      {!cursos.length && (
        <div className="flex flex-col items-center gap-2 rounded-2xl border border-dashed border-neutral-300 bg-white p-10 text-center">
          <GraduationCap className="size-8 text-neutral-400" />
          <p className="font-medium">Os cursos estão sendo preparados.</p>
          <p className="text-sm text-neutral-500">Assim que a coordenação publicar, eles aparecem aqui.</p>
        </div>
      )}
      {andamento.length > 0 && (
        <section>
          <h2 className="mb-3 font-semibold">Continuar</h2>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{andamento.map((c) => <CartaoDeCurso key={c.id} c={c} />)}</div>
        </section>
      )}
      {resto.length > 0 && (
        <section>
          {andamento.length > 0 && <h2 className="mb-3 font-semibold">Todos os cursos</h2>}
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{resto.map((c) => <CartaoDeCurso key={c.id} c={c} />)}</div>
        </section>
      )}
    </div>
  )
}
