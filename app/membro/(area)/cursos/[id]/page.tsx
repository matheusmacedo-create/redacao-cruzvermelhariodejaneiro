import Link from 'next/link'
import { notFound } from 'next/navigation'
import { Award, CheckCircle2, ChevronLeft, Circle, Download, FileText, PlayCircle } from 'lucide-react'
import { exigirMembro } from '@/lib/membro/sessao'
import { cursoDoMembro } from '@/lib/membro/cursos'
import { BarraDeProgresso, Capa } from '@/components/membro/cursos'
import { duracaoLegivel } from '@/lib/cursos/regras'
import { botaoDoMembro } from '@/components/membro/marca'

export const dynamic = 'force-dynamic'

export default async function Curso({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const m = await exigirMembro()
  const d = await cursoDoMembro(m, id)
  if (!d) notFound()
  const { curso, progresso: p } = d
  const proxima = p.proxima ?? d.emOrdem[0].id
  const duracao = d.emOrdem.reduce((s, a) => s + (a.duracao_min ?? 0), 0)

  return (
    <div className="flex flex-col gap-6">
      <Link href="/membro/cursos" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"><ChevronLeft className="size-4" />Cursos</Link>
      <div className="grid gap-6 lg:grid-cols-[1.4fr_1fr]">
        <div className="flex flex-col gap-4">
          <div className="overflow-hidden rounded-xl"><Capa url={curso.capa} titulo={curso.titulo} /></div>
          <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">{curso.titulo}</h1>
          {curso.descricao && <p className="whitespace-pre-line text-foreground/85">{curso.descricao}</p>}
        </div>
        <aside className="flex flex-col gap-4 lg:sticky lg:top-20 lg:self-start">
          <section className="flex flex-col gap-3 rounded-xl border border-border bg-card p-5" id="painel-do-curso">
            <p className="text-sm text-muted-foreground">
              {d.emOrdem.length} {d.emOrdem.length === 1 ? 'aula' : 'aulas'}
              {curso.carga_horaria ? ` · ${curso.carga_horaria.toLocaleString('pt-BR')} h de carga horária` : duracao ? ` · ${duracaoLegivel(duracao)}` : ''}
              {d.temProva ? ` · prova final (nota mínima ${curso.nota_minima})` : ''}
              {curso.validade_meses ? ` · certificado válido por ${curso.validade_meses} meses` : ''}
            </p>
            <BarraDeProgresso pct={p.pct} rotulo="Progresso no curso" />
            {d.certificado ? (
              <>
                <p className="flex items-center gap-2 rounded-lg bg-success/10 px-3 py-2 text-sm font-medium text-success"><Award className="size-4" />Curso concluído</p>
                <a href={`/membro/certificados/${d.certificado}/pdf`} className={botaoDoMembro}><Download className="size-4" />Baixar certificado</a>
              </>
            ) : p.concluido && d.temProva ? (
              <Link href={`/membro/cursos/${curso.id}/prova`} className={botaoDoMembro}>Fazer a prova final</Link>
            ) : (
              <Link href={`/membro/cursos/${curso.id}/aulas/${proxima}`} className={botaoDoMembro}><PlayCircle className="size-4" />{p.feitas ? 'Continuar' : 'Começar o curso'}</Link>
            )}
            {d.ultimaProva && !d.certificado && <p className="text-xs text-muted-foreground">Última tentativa: nota {d.ultimaProva.nota}.</p>}
          </section>
        </aside>
      </div>

      <section className="flex flex-col gap-4" id="conteudo">
        <h2 className="text-lg font-semibold">Conteúdo</h2>
        {d.modulos.map((mo, i) => (
          <div key={mo.id} className="overflow-hidden rounded-xl border border-border bg-card">
            <p className="border-b border-border/60 bg-muted/60 px-4 py-2.5 text-sm font-semibold">Módulo {i + 1} · {mo.titulo}</p>
            <ul className="divide-y divide-border">
              {mo.aulas.map((a) => (
                <li key={a.id}>
                  <Link href={`/membro/cursos/${curso.id}/aulas/${a.id}`} className="flex items-center gap-3 px-4 py-3 text-sm hover:bg-muted/60">
                    {a.feita ? <CheckCircle2 className="size-5 shrink-0 text-success" aria-label="Concluída" /> : <Circle className="size-5 shrink-0 text-muted-foreground/50" aria-label="A fazer" />}
                    <span className="min-w-0 flex-1">{a.titulo}</span>
                    <span className="flex shrink-0 items-center gap-1.5 text-xs text-muted-foreground">
                      {a.youtube_id ? <PlayCircle className="size-3.5" /> : <FileText className="size-3.5" />}{a.duracao_min ? duracaoLegivel(a.duracao_min) : ''}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        ))}
        {d.temProva && (
          <div className="flex items-center gap-3 rounded-xl border border-border bg-card px-4 py-3 text-sm">
            {d.certificado ? <CheckCircle2 className="size-5 text-success" /> : <Circle className="size-5 text-muted-foreground/50" />}
            <span className="flex-1">Prova final</span>
            {p.concluido && !d.certificado && <Link href={`/membro/cursos/${curso.id}/prova`} className="font-medium text-primary hover:underline">Fazer</Link>}
            {!p.concluido && <span className="text-xs text-muted-foreground">Libera ao concluir as aulas</span>}
          </div>
        )}
      </section>
    </div>
  )
}
