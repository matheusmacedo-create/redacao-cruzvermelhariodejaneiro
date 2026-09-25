import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { CheckCircle2, Circle, FileText } from 'lucide-react'
import { exigirMembro } from '@/lib/membro/sessao'
import { cursoDoMembro } from '@/lib/membro/cursos'
import { urlDoVideo, vizinhas } from '@/lib/cursos/regras'
import { cn } from '@/lib/utils'
import { BarraDeProgresso, ItemDaProva } from '@/components/membro/cursos'
import { ConcluirAula } from '@/components/membro/aula'
import { TextoDaAula } from '@/components/membro/texto-da-aula'
import { CabecalhoDaPagina, LinkExterno } from '@/components/membro/pecas'

export const dynamic = 'force-dynamic'

type Props = { params: Promise<{ id: string; aulaId: string }> }

/** O curso e a aula pedidos; qualquer um dos dois fora do alcance da pessoa é 404. */
async function carregar({ params }: Props) {
  const { id, aulaId } = await params
  const m = await exigirMembro()
  // Em `cache`: o título da aba e a página leem o curso uma vez só.
  const d = await cursoDoMembro(m, id)
  if (!d) notFound()
  const aula = d.modulos.flatMap((mo) => mo.aulas).find((a) => a.id === aulaId)
  if (!aula) notFound()
  return { m, d, aula, id, aulaId }
}

export async function generateMetadata(props: Props): Promise<Metadata> {
  const { aula } = await carregar(props)
  return { title: aula.titulo }
}

export default async function Aula(props: Props) {
  const { m, d, aula, id, aulaId } = await carregar(props)
  const { anterior, seguinte } = vizinhas(d.emOrdem, aulaId)
  const total = d.emOrdem.length
  const posicao = d.emOrdem.findIndex((a) => a.id === aulaId) + 1
  const modulo = d.modulos.findIndex((mo) => mo.aulas.some((a) => a.id === aulaId)) + 1
  // Quem já fez a última aula segue para a prova, se ela ainda falta; senão, volta ao curso.
  const faltaProva = d.temProva && !d.certificado && d.progresso.concluido
  const fim = faltaProva ? { href: `/membro/cursos/${id}/prova`, rotulo: 'Ir para a prova final' } : { href: `/membro/cursos/${id}`, rotulo: 'Voltar ao curso' }

  return (
    <div className="grid grid-cols-1 gap-8 lg:grid-cols-[minmax(0,1fr)_18rem] lg:items-start">
      <div className="flex min-w-0 flex-col gap-5">
        <CabecalhoDaPagina voltar={{ href: `/membro/cursos/${id}`, rotulo: d.curso.titulo }} sobretitulo={`Aula ${posicao} de ${total} · Módulo ${modulo}`} titulo={aula.titulo} />
        {aula.youtube_id && (
          <div className="overflow-hidden rounded-xl bg-black">
            {/* Tela cheia vem do `allow` (fullscreen); o `allowFullScreen` antigo junto só gerava aviso no console. */}
            <iframe src={urlDoVideo(aula.youtube_id)} title={`Vídeo da aula: ${aula.titulo}`} className="aspect-video w-full" loading="lazy" referrerPolicy="strict-origin-when-cross-origin"
              allow="accelerometer; encrypted-media; gyroscope; picture-in-picture; fullscreen" />
          </div>
        )}
        {aula.texto?.trim() && (
          <div className="rounded-xl border border-border bg-card p-4 sm:p-6" id="texto-da-aula">
            <TextoDaAula texto={aula.texto} />
          </div>
        )}
        {aula.material_id && (
          <LinkExterno href={`/membro/apostilas/${aula.material_id}`} className="flex min-h-14 items-center gap-3 rounded-xl border border-border bg-card p-3 text-sm font-medium text-foreground transition-colors hover:border-foreground/20 sm:p-4">
            <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-muted"><FileText className="size-5 text-muted-foreground" aria-hidden="true" /></span>
            <span className="min-w-0 flex-1">Abrir a apostila desta aula<span className="block text-xs font-normal text-muted-foreground">PDF</span></span>
          </LinkExterno>
        )}
        <ConcluirAula cursoId={id} aulaId={aula.id} feita={aula.feita} anterior={anterior} seguinte={seguinte} fim={fim} />
      </div>

      <aside className="flex min-w-0 flex-col gap-3 lg:sticky lg:top-20" aria-labelledby="aulas-do-curso">
        <div className="flex flex-col gap-1.5">
          <h2 id="aulas-do-curso" className="text-base font-semibold">Aulas do curso</h2>
          <p className="text-sm text-muted-foreground">{d.progresso.feitas} de {total} {total === 1 ? 'aula concluída' : 'aulas concluídas'}</p>
          <BarraDeProgresso pct={d.progresso.pct} rotulo="Progresso no curso" />
        </div>
        {/* A rolagem própria só no computador; no celular a lista vem inteira, depois da aula. */}
        <nav className="overflow-hidden rounded-xl border border-border bg-card lg:max-h-[calc(100dvh-13rem)] lg:overflow-y-auto" aria-label="Aulas do curso">
          {d.modulos.map((mo, i) => (
            <div key={mo.id}>
              <h3 className="border-b border-border bg-muted px-3 py-2 text-xs font-semibold text-muted-foreground lg:sticky lg:top-0">Módulo {i + 1} · {mo.titulo}</h3>
              <ul>
                {mo.aulas.map((a) => {
                  const atual = a.id === aulaId
                  return (
                    <li key={a.id}>
                      <Link href={`/membro/cursos/${id}/aulas/${a.id}`} aria-current={atual ? 'page' : undefined}
                        className={cn('flex min-h-11 items-center gap-2 px-3 py-2 text-sm transition-colors', atual ? 'bg-primary/10 font-medium text-foreground' : 'hover:bg-muted/60')}>
                        {a.feita ? <CheckCircle2 className="size-4 shrink-0 text-success" aria-hidden="true" /> : <Circle className="size-4 shrink-0 text-muted-foreground/50" aria-hidden="true" />}
                        <span className="min-w-0 flex-1 wrap-break-word">{a.feita && <span className="sr-only">Concluída: </span>}{a.titulo}</span>
                      </Link>
                    </li>
                  )
                })}
              </ul>
            </div>
          ))}
          {d.temProva && (
            <div className="border-t border-border">
              <ItemDaProva cursoId={id} aulas={total} compacto estado={d.certificado ? 'aprovada' : d.progresso.concluido || m.previa ? 'liberada' : 'bloqueada'} />
            </div>
          )}
        </nav>
      </aside>
    </div>
  )
}
