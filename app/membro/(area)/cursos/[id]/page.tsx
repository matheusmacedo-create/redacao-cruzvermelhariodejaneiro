import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { Award, CheckCircle2, Circle, ClipboardCheck, Clock, Download, FileText, ListOrdered, PlayCircle, RotateCcw } from 'lucide-react'
import { exigirMembro } from '@/lib/membro/sessao'
import { cursoDoMembro, liberacaoLegivel } from '@/lib/membro/cursos'
import { textoLongo } from '@/lib/membro/texto-da-aula'
import { duracaoLegivel } from '@/lib/cursos/regras'
import { cn } from '@/lib/utils'
import { BarraDeProgresso, Capa, ItemDaProva } from '@/components/membro/cursos'
import { Recolhivel } from '@/components/membro/aula'
import { TextoDaAula } from '@/components/membro/texto-da-aula'
import { CabecalhoDaPagina, Secao, Selo } from '@/components/membro/pecas'
import { botaoDoMembro, botaoSecundario } from '@/components/membro/marca'

export const dynamic = 'force-dynamic'

type Props = { params: Promise<{ id: string }> }

// A aba do navegador leva o nome do curso ("Primeiros Socorros · Área do
// Voluntário"). `cursoDoMembro` está em `cache`: a página não lê o curso de novo.
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const d = await cursoDoMembro(await exigirMembro(), (await params).id)
  if (!d) notFound()
  return { title: d.curso.titulo }
}

const plural = (n: number, um: string, varios: string) => `${n} ${n === 1 ? um : varios}`

export default async function Curso({ params }: Props) {
  const { id } = await params
  const m = await exigirMembro()
  const d = await cursoDoMembro(m, id)
  if (!d) notFound()
  const { curso, progresso: p, tentativas: t } = d
  const total = d.emOrdem.length
  const proxima = d.emOrdem.find((a) => a.id === p.proxima) ?? d.emOrdem[0]
  const duracao = d.emOrdem.reduce((s, a) => s + (a.duracao_min ?? 0), 0)
  const faltaProva = d.temProva && !d.certificado && p.concluido
  // Sem tentativa agora, o painel explica e manda rever as aulas (a prova barraria de todo jeito).
  const semTentativa = faltaProva && t.restantes === 0 && !!t.liberaEm && !m.previa
  const libera = semTentativa && t.liberaEm ? liberacaoLegivel(t.liberaEm) : ''
  // Na visualização, a equipe confere a prova sem precisar concluir as aulas.
  const estadoDaProva = d.certificado ? 'aprovada' : p.concluido || m.previa ? 'liberada' : 'bloqueada'
  // A descrição tem uma linha a menos no layout se não houver: o painel ocupa as linhas que existirem.
  const temDescricao = !!curso.descricao?.trim()

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_20rem] lg:gap-x-8">
      {/* No celular: título, painel (com o botão), descrição e conteúdo — o botão fica acima da dobra. */}
      <div className="flex min-w-0 flex-col gap-4 lg:col-start-1">
        <CabecalhoDaPagina voltar={{ href: '/membro/cursos', rotulo: 'Cursos' }} titulo={curso.titulo} />
        {curso.capa && <div className="overflow-hidden rounded-xl border border-border"><Capa url={curso.capa} /></div>}
      </div>

      <aside className={cn('min-w-0 lg:sticky lg:top-20 lg:col-start-2 lg:row-start-1 lg:self-start', temDescricao ? 'lg:row-span-3' : 'lg:row-span-2')}>
        <section className="flex flex-col gap-4 rounded-xl border border-border bg-card p-4 sm:p-5" id="painel-do-curso" aria-labelledby="painel-do-curso-titulo" data-ajuda="membro.painel-do-curso">
          <h2 id="painel-do-curso-titulo" className="text-base font-semibold">Sobre o curso</h2>
          <ul className="grid grid-cols-2 gap-x-3 gap-y-2.5 text-sm lg:grid-cols-1">
            <li className="flex items-start gap-2"><ListOrdered className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden="true" />{plural(total, 'aula', 'aulas')}</li>
            {(curso.carga_horaria || duracao > 0) && (
              <li className="flex items-start gap-2"><Clock className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                {curso.carga_horaria ? `${curso.carga_horaria.toLocaleString('pt-BR')} h de carga horária` : duracaoLegivel(duracao)}
              </li>
            )}
            {d.temProva && <li className="flex items-start gap-2"><ClipboardCheck className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden="true" />Prova final (nota mínima {curso.nota_minima})</li>}
            <li className="flex items-start gap-2"><Award className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
              {curso.validade_meses ? `Certificado válido por ${curso.validade_meses} meses` : 'Certificado ao concluir'}
            </li>
          </ul>

          <div className="flex flex-col gap-1.5">
            <p className="text-sm font-medium">{p.feitas} de {plural(total, 'aula', 'aulas')}</p>
            <BarraDeProgresso pct={p.pct} rotulo="Progresso no curso" />
          </div>

          {d.certificado ? (
            <>
              <Selo tom="sucesso" icone={Award} className="w-fit">Curso concluído</Selo>
              <a href={`/membro/certificados/${d.certificado}/pdf`} className={cn(botaoDoMembro, 'w-full')}><Download className="size-4" aria-hidden="true" />Baixar certificado</a>
            </>
          ) : faltaProva ? (
            <>
              <p className="text-sm text-muted-foreground">Você concluiu todas as aulas. Com a aprovação na prova, o certificado sai na hora.</p>
              {semTentativa ? (
                <>
                  <p className="flex items-start gap-2 rounded-lg bg-warning/15 px-3 py-2 text-sm text-warning-foreground">
                    <Clock className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
                    <span>Você usou as {t.limite} tentativas das últimas 24 horas. Tente de novo a partir de {libera}.</span>
                  </p>
                  <a href="#conteudo-do-curso" className={cn(botaoSecundario, 'w-full')}><RotateCcw className="size-4" aria-hidden="true" />Rever as aulas</a>
                </>
              ) : (
                <Link href={`/membro/cursos/${curso.id}/prova`} className={cn(botaoDoMembro, 'w-full')}><ClipboardCheck className="size-4" aria-hidden="true" />Fazer a prova final</Link>
              )}
            </>
          ) : (
            <Link href={`/membro/cursos/${curso.id}/aulas/${proxima.id}`} className={cn(botaoDoMembro, 'w-full')}>
              <PlayCircle className="size-4 shrink-0" aria-hidden="true" />
              {p.concluido ? 'Rever as aulas' : p.feitas ? <span className="min-w-0 wrap-break-word">Continuar: {proxima.titulo}</span> : 'Começar o curso'}
            </Link>
          )}

          {d.ultimaProva && !d.certificado && (
            <p className="text-xs text-muted-foreground">
              Última tentativa: nota {d.ultimaProva.nota} (mínimo {curso.nota_minima})
              {t.usadas > 0 && t.restantes > 0 && ` · ${t.restantes === 1 ? 'resta 1 tentativa' : `restam ${t.restantes} tentativas`} (até ${t.limite} a cada 24 horas)`}
            </p>
          )}
        </section>
      </aside>

      {temDescricao && (
        <div className="min-w-0 lg:col-start-1">
          <Recolhivel id="descricao-do-curso" longo={textoLongo(curso.descricao)}>
            <TextoDaAula texto={curso.descricao} nivel={3} />
          </Recolhivel>
        </div>
      )}

      <div className="min-w-0 lg:col-start-1">
        <Secao titulo="Conteúdo do curso" icone={ListOrdered} id="conteudo-do-curso">
          {d.modulos.map((mo, i) => (
            <div key={mo.id} className="overflow-hidden rounded-xl border border-border bg-card" data-ajuda={i === 0 ? 'membro.conteudo-do-curso' : undefined}>
              <h3 className="border-b border-border bg-muted/60 px-4 py-2.5 text-sm font-semibold">Módulo {i + 1} · {mo.titulo}</h3>
              <ol className="divide-y divide-border">
                {mo.aulas.map((a) => {
                  const ehProxima = !d.certificado && !p.concluido && a.id === p.proxima
                  return (
                    <li key={a.id}>
                      <Link href={`/membro/cursos/${curso.id}/aulas/${a.id}`} className={cn('flex min-h-12 items-center gap-3 px-4 py-3 text-sm transition-colors hover:bg-muted/60', ehProxima && 'bg-primary/5 hover:bg-primary/10')}>
                        {a.feita ? <CheckCircle2 className="size-5 shrink-0 text-success" aria-hidden="true" /> : <Circle className="size-5 shrink-0 text-muted-foreground/50" aria-hidden="true" />}
                        <span className="min-w-0 flex-1">
                          {a.feita && <span className="sr-only">Concluída: </span>}
                          <span className="wrap-break-word">{a.titulo}</span>
                          {ehProxima && <span className="mt-1 flex"><Selo icone={PlayCircle}>Próxima</Selo></span>}
                        </span>
                        <span className="flex shrink-0 items-center gap-1.5 text-xs text-muted-foreground">
                          {a.youtube_id ? <PlayCircle className="size-3.5" aria-hidden="true" /> : <FileText className="size-3.5" aria-hidden="true" />}
                          <span className="sr-only">{a.youtube_id ? 'Vídeo' : 'Leitura'}{a.duracao_min ? ', ' : ''}</span>
                          {a.duracao_min ? duracaoLegivel(a.duracao_min) : ''}
                        </span>
                      </Link>
                    </li>
                  )
                })}
              </ol>
            </div>
          ))}
          {d.temProva && (
            <div className="overflow-hidden rounded-xl border border-border bg-card" data-ajuda="membro.item-da-prova">
              <ItemDaProva cursoId={curso.id} estado={estadoDaProva} aulas={total}
                detalhe={semTentativa ? `Nova tentativa a partir de ${libera}` : faltaProva ? `${plural(d.questoes, 'questão', 'questões')} · nota mínima ${curso.nota_minima}` : undefined} />
            </div>
          )}
        </Secao>
      </div>
    </div>
  )
}
