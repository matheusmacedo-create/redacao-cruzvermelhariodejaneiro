import Link from 'next/link'
import { notFound } from 'next/navigation'
import { CheckCircle2, ChevronLeft, Circle, FileDown } from 'lucide-react'
import { exigirMembro } from '@/lib/membro/sessao'
import { cursoDoMembro } from '@/lib/membro/cursos'
import { urlDoVideo, vizinhas } from '@/lib/cursos/regras'
import { BarraDeProgresso } from '@/components/membro/cursos'
import { ConcluirAula } from '@/components/membro/aula'

export const dynamic = 'force-dynamic'

export default async function Aula({ params }: { params: Promise<{ id: string; aulaId: string }> }) {
  const { id, aulaId } = await params
  const m = await exigirMembro()
  const d = await cursoDoMembro(m, id)
  if (!d) notFound()
  const aula = d.modulos.flatMap((mo) => mo.aulas).find((a) => a.id === aulaId)
  if (!aula) notFound()
  const { anterior, seguinte } = vizinhas(d.emOrdem, aulaId)
  const posicao = d.emOrdem.findIndex((a) => a.id === aulaId) + 1

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_20rem]">
      <div className="flex min-w-0 flex-col gap-4">
        <Link href={`/membro/cursos/${id}`} className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"><ChevronLeft className="size-4" />{d.curso.titulo}</Link>
        {aula.youtube_id && (
          <div className="overflow-hidden rounded-xl bg-black">
            <iframe src={urlDoVideo(aula.youtube_id)} title={aula.titulo} className="aspect-video w-full" loading="lazy" referrerPolicy="strict-origin-when-cross-origin"
              allow="accelerometer; encrypted-media; gyroscope; picture-in-picture; fullscreen" allowFullScreen />
          </div>
        )}
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Aula {posicao} de {d.emOrdem.length}</p>
          <h1 className="text-2xl font-bold tracking-tight">{aula.titulo}</h1>
        </div>
        {aula.texto && <div className="whitespace-pre-line rounded-xl border border-border bg-card p-5 leading-relaxed text-foreground" id="texto-da-aula">{aula.texto}</div>}
        {aula.material_id && (
          <a href={`/membro/apostilas/${aula.material_id}`} target="_blank" rel="noopener noreferrer" className="flex items-center gap-3 rounded-xl border border-border bg-card p-4 text-sm hover:border-primary/40">
            <FileDown className="size-5 text-primary" /><span className="font-medium">Abrir a apostila desta aula</span>
          </a>
        )}
        <div className="flex items-center justify-between gap-3 border-t border-border pt-4">
          {anterior ? <Link href={`/membro/cursos/${id}/aulas/${anterior}`} className="text-sm font-medium text-muted-foreground hover:text-foreground">← Anterior</Link> : <span />}
          <ConcluirAula cursoId={id} aulaId={aula.id} feita={aula.feita} seguinte={seguinte} />
        </div>
      </div>
      <aside className="flex flex-col gap-3 lg:sticky lg:top-20 lg:self-start">
        <BarraDeProgresso pct={d.progresso.pct} rotulo="Progresso no curso" />
        <nav className="max-h-[70vh] overflow-y-auto rounded-xl border border-border bg-card" aria-label="Aulas do curso">
          {d.modulos.map((mo) => (
            <div key={mo.id}>
              <p className="sticky top-0 border-b border-border/60 bg-muted/60 px-3 py-2 text-xs font-semibold text-muted-foreground">{mo.titulo}</p>
              <ul>
                {mo.aulas.map((a) => (
                  <li key={a.id}>
                    <Link href={`/membro/cursos/${id}/aulas/${a.id}`} aria-current={a.id === aulaId ? 'page' : undefined}
                      className={`flex items-center gap-2 px-3 py-2 text-sm ${a.id === aulaId ? 'bg-destructive/10 font-medium text-primary' : 'hover:bg-muted/60'}`}>
                      {a.feita ? <CheckCircle2 className="size-4 shrink-0 text-success" /> : <Circle className="size-4 shrink-0 text-muted-foreground/50" />}
                      <span className="min-w-0 truncate">{a.titulo}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </nav>
      </aside>
    </div>
  )
}
