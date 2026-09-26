import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ChevronLeft, Eye, EyeOff, GraduationCap } from 'lucide-react'
import { Card } from '@/components/ui/card'
import { PageHeader } from '@/components/app/page-header'
import { contextoDeParticipantes } from '@/lib/participantes/acesso'
import { urlDaCapa } from '@/lib/cursos/capa'
import { urlBase } from '@/lib/newsletter/contexto'
import { NovoCurso } from '@/components/app/cursos/novo'
import { Apostilas, CancelarCertificado, type ApostilaDaEquipe } from '@/components/app/cursos/apostilas'

export const metadata = { title: 'Cursos e apostilas' }

export const dynamic = 'force-dynamic'

/**
 * Cursos, apostilas e certificados da Área do Voluntário, do lado da equipe.
 */
export default async function CursosDaEquipe({ searchParams }: { searchParams: Promise<{ aba?: string }> }) {
  const { aba: pedida } = await searchParams
  const { context, supabase, nivel } = await contextoDeParticipantes()
  if (nivel < 1) notFound()
  const ws = context.workspace.id
  const aba = pedida === 'apostilas' ? 'apostilas' : pedida === 'certificados' ? 'certificados' : 'cursos'

  const [{ data: cursos }, { data: aulas }, { data: feitas }, { data: certificados }, { data: materiais }] = await Promise.all([
    supabase.from('cursos').select('id,titulo,resumo,capa_caminho,publicado,nota_minima,carga_horaria').eq('workspace_id', ws).order('ordem').order('created_at'),
    supabase.from('curso_aulas').select('curso_id').eq('workspace_id', ws).limit(10000),
    supabase.from('membro_aulas_concluidas').select('curso_id,participante_id').limit(50000),
    supabase.from('certificados').select('id,codigo,nome,curso_id,curso_titulo,emitido_em,valido_ate,revogado_em,motivo_revogacao,participante_id').eq('workspace_id', ws).order('emitido_em', { ascending: false }).limit(1000),
    supabase.from('materiais').select('id,titulo,descricao,tamanho,publicado,created_at,curso_id').eq('workspace_id', ws).order('created_at', { ascending: false }).limit(500),
  ])
  const conta = (lista: { curso_id: unknown }[] | null, id: string) => (lista ?? []).filter((x) => x.curso_id === id).length
  const alunos = (id: string) => new Set((feitas ?? []).filter((f) => f.curso_id === id).map((f) => f.participante_id)).size
  const concluintes = (id: string) => (certificados ?? []).filter((c) => c.curso_id === id && !c.revogado_em).length
  const nomeDoCurso = new Map((cursos ?? []).map((c) => [c.id as string, c.titulo as string]))
  const abas = [
    { id: 'cursos', rotulo: `Cursos (${cursos?.length ?? 0})` },
    { id: 'apostilas', rotulo: `Apostilas (${materiais?.length ?? 0})` },
    { id: 'certificados', rotulo: `Certificados (${(certificados ?? []).filter((c) => !c.revogado_em).length})` },
  ]

  return (
    <div className="flex flex-col gap-6">
      <Link href="/voluntariado" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"><ChevronLeft className="size-4" />Voluntários</Link>
      <PageHeader title="Cursos e apostilas" description={`O que o voluntário encontra na Área do Voluntário (${urlBase()}/membro). Vídeos do YouTube não listado; certificado automático ao concluir.`}
        actions={nivel >= 2 && aba === 'cursos' ? <NovoCurso /> : undefined} />
      <nav className="flex flex-wrap gap-1 border-b border-border" aria-label="Abas" data-ajuda="voluntarios.cursos-abas">
        {/* Os passos de cada aba no tour ("Os cursos", "Apostilas", "Certificados")
            apontam o conteúdo da aba aberta; o das outras não existe, e o balão aponta o link delas. */}
        {abas.map((a) => (
          <Link key={a.id} href={`/voluntariado/cursos${a.id === 'cursos' ? '' : `?aba=${a.id}`}`} aria-current={aba === a.id ? 'page' : undefined}
            data-ajuda={a.id === aba ? undefined : a.id === 'cursos' ? 'voluntarios.cursos-grade' : a.id === 'apostilas' ? 'voluntarios.apostilas' : 'voluntarios.certificados'}
            className={`-mb-px border-b-2 px-3 py-2 text-sm ${aba === a.id ? 'border-primary font-medium text-foreground' : 'border-transparent text-muted-foreground hover:text-foreground'}`}>{a.rotulo}</Link>
        ))}
      </nav>

      {aba === 'cursos' && (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3" data-ajuda="voluntarios.cursos-grade">
          {(cursos ?? []).map((c) => {
            const capa = urlDaCapa(c.capa_caminho as string | null)
            return (
              <Link key={c.id} href={`/voluntariado/cursos/${c.id}`} className="group overflow-hidden rounded-xl border border-border bg-card hover:border-primary/50">
                { }
                {capa ? <img src={capa} alt="" className="aspect-video w-full object-cover" /> : <div className="flex aspect-video items-center justify-center bg-muted"><GraduationCap className="size-8 text-muted-foreground" /></div>}
                <div className="flex flex-col gap-1.5 p-4">
                  <p className="font-semibold group-hover:text-primary">{c.titulo}</p>
                  <p className={`flex items-center gap-1.5 text-xs ${c.publicado ? 'text-success' : 'text-muted-foreground'}`}>{c.publicado ? <Eye className="size-3.5" /> : <EyeOff className="size-3.5" />}{c.publicado ? 'Publicado' : 'Rascunho'}</p>
                  <p className="text-xs text-muted-foreground">{conta(aulas, c.id)} aulas · {alunos(c.id)} começaram · {concluintes(c.id)} concluíram{c.nota_minima ? ' · com prova' : ''}</p>
                </div>
              </Link>
            )
          })}
          {!cursos?.length && <Card className="p-10 text-center text-sm text-muted-foreground sm:col-span-2 xl:col-span-3">Nenhum curso ainda. Crie o primeiro: dê um nome, monte os módulos com as aulas e publique.</Card>}
        </div>
      )}

      {aba === 'apostilas' && (
        <Apostilas podeEditar={nivel >= 2} cursos={(cursos ?? []).map((c) => ({ id: c.id as string, titulo: c.titulo as string }))}
          lista={(materiais ?? []).map((m) => ({ ...m, tamanho: Number(m.tamanho), curso: m.curso_id ? nomeDoCurso.get(m.curso_id as string) ?? null : null }) as ApostilaDaEquipe)} />
      )}

      {aba === 'certificados' && (
        <Card className="overflow-hidden p-0" data-ajuda="voluntarios.certificados">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[44rem] text-sm">
              <thead><tr className="border-b border-border bg-muted/40 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                <th className="px-4 py-2.5">Voluntário</th><th className="px-3 py-2.5">Curso</th><th className="px-3 py-2.5">Emitido</th><th className="px-3 py-2.5">Código</th><th className="px-3 py-2.5" />
              </tr></thead>
              <tbody>
                {(certificados ?? []).map((c) => (
                  <tr key={c.id} className="border-b border-border last:border-0">
                    <td className="px-4 py-2.5"><Link href={`/voluntariado/${c.participante_id}`} className="font-medium hover:underline">{c.nome}</Link></td>
                    <td className="px-3 py-2.5">{c.curso_titulo}</td>
                    <td className="px-3 py-2.5 text-xs text-muted-foreground">{new Date(c.emitido_em as string).toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' })}{c.valido_ate ? ` · até ${new Date(`${c.valido_ate}T12:00:00Z`).toLocaleDateString('pt-BR', { timeZone: 'UTC' })}` : ''}</td>
                    <td className="px-3 py-2.5"><a href={`/certificado/${c.codigo}`} target="_blank" rel="noopener noreferrer" className="font-mono text-xs hover:underline">{c.codigo}</a></td>
                    <td className="px-3 py-2.5 text-right">{c.revogado_em ? <span className="text-xs text-destructive" title={c.motivo_revogacao ?? ''}>Cancelado</span> : nivel >= 2 ? <CancelarCertificado id={c.id as string} codigo={c.codigo as string} /> : null}</td>
                  </tr>
                ))}
                {!certificados?.length && <tr><td colSpan={5} className="px-4 py-8 text-center text-muted-foreground">Nenhum certificado emitido ainda.</td></tr>}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  )
}
