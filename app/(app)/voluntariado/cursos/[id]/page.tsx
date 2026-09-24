import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ChevronLeft } from 'lucide-react'
import { Card } from '@/components/ui/card'
import { contextoDeParticipantes } from '@/lib/participantes/acesso'
import { urlDaCapa } from '@/lib/cursos/capa'
import { aulasEmOrdem } from '@/lib/cursos/regras'
import { CapaDoCurso, ConteudoDoCurso, DadosDoCurso, ProvaDoCurso, PublicacaoDoCurso, type AulaNoEditor } from '@/components/app/cursos/editor'

export const dynamic = 'force-dynamic'

function Secao({ titulo, descricao, children }: { titulo: string; descricao?: string; children: React.ReactNode }) {
  return (
    <Card className="flex flex-col gap-4 p-5">
      <div><h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">{titulo}</h2>{descricao && <p className="mt-0.5 text-xs text-muted-foreground">{descricao}</p>}</div>
      {children}
    </Card>
  )
}

export default async function EditorDeCurso({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound()
  const { context, supabase, nivel } = await contextoDeParticipantes()
  if (nivel < 2) notFound()
  const [{ data: c }, { data: modulos }, { data: aulas }, { data: questoes }, { data: materiais }, { data: feitas }, { data: certificados }] = await Promise.all([
    supabase.from('cursos').select('id,titulo,resumo,descricao,capa_caminho,carga_horaria,nota_minima,validade_meses,publicado').eq('id', id).eq('workspace_id', context.workspace.id).maybeSingle(),
    supabase.from('curso_modulos').select('id,titulo,ordem').eq('curso_id', id).order('ordem').order('id'),
    supabase.from('curso_aulas').select('id,modulo_id,titulo,youtube_id,texto,material_id,duracao_min,ordem').eq('curso_id', id),
    supabase.from('curso_questoes').select('id,enunciado,alternativas,correta').eq('curso_id', id).order('ordem').order('id'),
    supabase.from('materiais').select('id,titulo').eq('workspace_id', context.workspace.id).order('titulo'),
    supabase.from('membro_aulas_concluidas').select('participante_id').eq('curso_id', id).limit(50000),
    supabase.from('certificados').select('id').eq('curso_id', id).is('revogado_em', null),
  ])
  if (!c) notFound()
  const emOrdem = aulasEmOrdem(modulos ?? [], (aulas ?? []) as (AulaNoEditor & { ordem: number; duracao_min: number | null })[])
  const porModulo = (modulos ?? []).map((m) => ({ id: m.id as string, titulo: m.titulo as string, aulas: emOrdem.filter((a) => a.modulo_id === m.id) }))
  const alunos = new Set((feitas ?? []).map((f) => f.participante_id)).size

  return (
    <div className="flex flex-col gap-5">
      <Link href="/voluntariado/cursos" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"><ChevronLeft className="size-4" />Cursos e apostilas</Link>
      <div>
        <h1 className="text-2xl font-bold tracking-tight">{c.titulo}</h1>
        <p className="text-sm text-muted-foreground">{emOrdem.length} aulas em {porModulo.length} módulos · {questoes?.length ?? 0} questões · {alunos} voluntários começaram · {certificados?.length ?? 0} concluíram</p>
      </div>
      <div className="grid gap-5 xl:grid-cols-[1.5fr_1fr]">
        <div className="flex flex-col gap-5">
          <Secao titulo="Dados do curso"><DadosDoCurso c={{ ...c, capa: null, carga_horaria: c.carga_horaria === null ? null : Number(c.carga_horaria) }} /></Secao>
          <Secao titulo="Conteúdo" descricao="Módulos e aulas, na ordem em que o voluntário vai ver. Cada aula tem vídeo, texto ou apostila (ou os três).">
            <ConteudoDoCurso cursoId={id} modulos={porModulo} apostilas={(materiais ?? []) as { id: string; titulo: string }[]} />
          </Secao>
          <Secao titulo="Prova final" descricao="Opcional. O voluntário faz depois de concluir as aulas; até 3 tentativas a cada 24 horas. O gabarito nunca vai para a tela dele.">
            <ProvaDoCurso cursoId={id} questoes={(questoes ?? []) as { id: string; enunciado: string; alternativas: string[]; correta: number }[]} notaMinima={c.nota_minima as number | null} />
          </Secao>
        </div>
        <div className="flex flex-col gap-5 xl:sticky xl:top-4 xl:self-start">
          <Secao titulo="Publicação"><PublicacaoDoCurso id={id} publicado={c.publicado as boolean} podeExcluir={!certificados?.length} /></Secao>
          <Secao titulo="Capa"><CapaDoCurso id={id} capa={urlDaCapa(c.capa_caminho as string | null)} /></Secao>
        </div>
      </div>
    </div>
  )
}
