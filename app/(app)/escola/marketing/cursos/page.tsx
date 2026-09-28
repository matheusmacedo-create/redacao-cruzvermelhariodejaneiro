import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ArrowUpRight, BookOpen, Lightbulb, QrCode, TriangleAlert } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { PageHeader } from '@/components/app/page-header'
import { SecoesDaEscola } from '@/components/app/escola/secoes'
import { SubmenuDoMarketing } from '@/components/app/escola/submenu-marketing'
import { ClassificarProduto, FormularioDoCurso } from '@/components/app/escola/cursos'
import { contextoDoMarketing } from '@/lib/escola/marketing-servidor'
import { dadosDosCursos } from '@/lib/escola/cursos-servidor'
import { conversao, sinalDoCurso } from '@/lib/escola/cursos'
import { milhar, pct, reais } from '@/lib/escola/marketing'

export const metadata = { title: 'Cursos · Marketing · Escola' }
export const dynamic = 'force-dynamic'

const TOM = {
  oportunidade: 'border-primary/40 bg-primary/5 text-foreground',
  atencao: 'border-warning/50 bg-warning/10 text-foreground',
  ok: 'border-success/30 bg-success/5 text-foreground',
} as const

/**
 * Os cursos da escola, cada um com quantos alunos tem (pela Únicopag), quem
 * tentou e não pagou, e o que o marketing já fez para ele — para a equipe
 * saber onde pôr esforço. Regras em lib/escola/cursos.ts.
 */
export default async function CursosDaEscola() {
  const { context, supabase, nivel, nivelEscola } = await contextoDoMarketing()
  if (nivel < 2) notFound()
  const d = await dadosDosCursos(supabase, context.workspace.id)

  const linhas = d.cursos.map((c) => {
    const n = d.numerosDe(c.id)
    const campanhas = d.campanhasDe(c.id)
    const pecas = d.pecasDe(c.id)
    const investido = pecas.reduce((s, p) => s + (p.investimento ?? 0), 0)
    return {
      c, n, campanhas, pecas, investido,
      noAr: campanhas.filter((x) => x.status === 'no_ar').length,
      sinal: sinalDoCurso(n, { campanhasNoAr: campanhas.filter((x) => x.status === 'no_ar').length, pecas: pecas.length }, c.ativo),
    }
  }).sort((a, b) => Number(b.c.ativo) - Number(a.c.ativo) || b.n.alunos - a.n.alunos || a.c.nome.localeCompare(b.c.nome, 'pt-BR'))
  const ativos = linhas.filter((l) => l.c.ativo)
  const interessados = ativos.reduce((s, l) => s + l.n.interessados, 0)
  const receita = linhas.reduce((s, l) => s + l.n.receita, 0)
  const aClassificar = d.produtosSoltos.filter((p) => p.destino.tipo === 'sem_curso')
  const outros = d.produtosSoltos.filter((p) => p.destino.tipo !== 'sem_curso')
  const manualDe = (produto: string) => {
    const c = d.classificacoes.get(produto)
    return c?.ignorado ? 'ignorar' : c?.curso_id ?? ''
  }
  // Produtos que a equipe associou à mão: aparecem para poder desfazer.
  const associados = [...d.classificacoes.values()].filter((c) => c.curso_id)

  return (
    <div className="flex flex-col gap-6">
      <SecoesDaEscola atual="/escola/marketing" financeiro={nivelEscola >= 2} />
      <SubmenuDoMarketing atual="/escola/marketing/cursos" />
      <PageHeader
        title="Cursos"
        description="Cada curso com os alunos que a Únicopag registrou, quem tentou e não pagou e o que o marketing já fez para ele. Use para decidir onde pôr esforço."
        actions={<div className="flex flex-wrap gap-2">
          {d.pronto && <Button variant="outline" render={<Link href="/escola/cartaz" />} data-ajuda="escola-cursos.cartaz"><QrCode className="size-4" />Cartaz com QR</Button>}
          <FormularioDoCurso />
        </div>}
      />

      {!d.pronto ? (
        <Card className="p-6 text-sm">Os cursos ainda não estão ligados no banco (migração 20260929070000). Avise a administração.</Card>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4" data-ajuda="escola-cursos.numeros">
            {[
              [milhar(ativos.length), 'cursos ativos'],
              [milhar(d.alunosNoTotal), 'alunos (pessoas que pagaram)'],
              [milhar(interessados), 'interessados que não pagaram'],
              [reais(receita), 'recebido nos cursos'],
            ].map(([v, r]) => (
              <Card key={r} className="p-4"><p className="text-2xl font-bold tabular-nums">{v}</p><p className="text-xs text-muted-foreground">{r}</p></Card>
            ))}
          </div>

          <Card className="overflow-x-auto p-0" data-ajuda="escola-cursos.tabela">
            <table className="w-full min-w-[860px] text-sm">
              <thead className="border-b border-border bg-muted/40 text-left text-xs text-muted-foreground">
                <tr>
                  <th className="px-4 py-2.5 font-medium">Curso</th>
                  <th className="px-3 py-2.5 text-right font-medium">Alunos</th>
                  <th className="px-3 py-2.5 text-right font-medium">Novos (30 dias)</th>
                  <th className="px-3 py-2.5 text-right font-medium" title="Tentaram e não pagaram">Interessados</th>
                  <th className="px-3 py-2.5 text-right font-medium">Conversão</th>
                  <th className="px-3 py-2.5 text-right font-medium">Recebido</th>
                  <th className="px-3 py-2.5 text-right font-medium">Campanhas</th>
                  <th className="px-3 py-2.5 text-right font-medium">Peças</th>
                  <th className="px-3 py-2.5 text-right font-medium" title="Investido nas peças ÷ alunos">Custo por aluno</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {linhas.map(({ c, n, campanhas, pecas, investido, noAr, sinal }) => (
                  <tr key={c.id} data-curso={c.nome} className={c.ativo ? '' : 'text-muted-foreground'}>
                    <td className="max-w-80 px-4 py-3">
                      <Link href={`/escola/marketing/cursos/${c.id}`} className="font-medium hover:text-primary hover:underline">{c.nome}</Link>
                      {!c.ativo && <span className="ml-2 rounded-full bg-muted px-1.5 py-0.5 text-[11px]">inativo</span>}
                      <span className="mt-0.5 flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground">
                        {c.pagina_url
                          ? <a href={c.pagina_url} target="_blank" rel="noopener" className="inline-flex items-center gap-0.5 hover:text-primary hover:underline">página do curso<ArrowUpRight className="size-3" /></a>
                          : c.ativo && <span className="text-warning-foreground">sem página cadastrada</span>}
                      </span>
                      {sinal && <span className={`mt-1.5 flex items-start gap-1.5 rounded-md border px-2 py-1 text-xs ${TOM[sinal.tom]}`}>{sinal.tom === 'atencao' ? <TriangleAlert className="mt-0.5 size-3 shrink-0" /> : <Lightbulb className="mt-0.5 size-3 shrink-0" />}{sinal.texto}</span>}
                    </td>
                    <td className="px-3 py-3 text-right text-base font-semibold tabular-nums">{milhar(n.alunos)}</td>
                    <td className="px-3 py-3 text-right tabular-nums">{milhar(n.alunos30)}</td>
                    <td className="px-3 py-3 text-right tabular-nums">{milhar(n.interessados)}</td>
                    <td className="px-3 py-3 text-right tabular-nums">{pct(conversao(n), 0)}</td>
                    <td className="px-3 py-3 text-right tabular-nums">{reais(n.receita)}</td>
                    <td className="px-3 py-3 text-right tabular-nums">{campanhas.length}{noAr > 0 && <span className="block text-[11px] text-success">{noAr} no ar</span>}</td>
                    <td className="px-3 py-3 text-right tabular-nums">{pecas.length}</td>
                    <td className="px-3 py-3 text-right tabular-nums">{investido > 0 && n.alunos > 0 ? reais(investido / n.alunos) : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!linhas.length && (
              <div className="flex flex-col items-center gap-2 p-10 text-center">
                <BookOpen className="size-8 text-muted-foreground" />
                <p className="font-medium">Nenhum curso cadastrado</p>
                <p className="max-w-md text-sm text-muted-foreground">Cadastre os cursos com o mesmo nome do produto na Únicopag: as vendas entram sozinhas.</p>
              </div>
            )}
          </Card>
          <p className="-mt-3 text-xs text-muted-foreground">
            Aluno é a pessoa que pagou algum produto do curso (inscrição e curso contam uma vez). Interessado tentou e não pagou nada do curso: é o público do remarketing.
            Campanhas contam pelo campo “Curso” da campanha; peças, pela campanha delas.
            {(d.semCurso.campanhas > 0 || d.semCurso.pecas > 0) && ` ${d.semCurso.campanhas} campanha(s) e ${d.semCurso.pecas} peça(s) ainda não têm curso.`}
          </p>

          {(aClassificar.length > 0 || associados.length > 0) && (
            <Card className="overflow-hidden p-0" data-ajuda="escola-cursos.produtos">
              <div className="border-b border-border px-4 py-3">
                <h2 className="font-semibold">Produtos da Únicopag sem curso</h2>
                <p className="text-sm text-muted-foreground">Nomes que não batem sozinhos com um curso (“Curso”, “Matrícula”…). Diga a qual curso cada um pertence, ou ignore.</p>
              </div>
              <ul className="divide-y divide-border">
                {[...aClassificar.map((p) => ({ produto: p.produto, pessoas: p.pessoas, alunos: p.alunos })),
                  ...associados.filter((a) => !aClassificar.some((p) => p.produto === a.produto)).map((a) => ({ produto: a.produto, pessoas: null, alunos: null }))].map((p) => (
                  <li key={p.produto} className="flex flex-wrap items-center justify-between gap-3 px-4 py-2.5 text-sm">
                    <span className="min-w-0">
                      <span className="font-medium">{p.produto}</span>
                      {p.pessoas !== null && <span className="block text-xs text-muted-foreground">{p.pessoas} {p.pessoas === 1 ? 'pessoa' : 'pessoas'} · {p.alunos} pagaram</span>}
                    </span>
                    <ClassificarProduto produto={p.produto} cursos={d.cursos.map((c) => ({ id: c.id, nome: c.nome }))} atual={manualDe(p.produto)} />
                  </li>
                ))}
              </ul>
            </Card>
          )}
          {outros.length > 0 && (
            <details className="text-sm">
              <summary className="cursor-pointer text-muted-foreground">Fora da conta: {outros.length} produto(s) de teste ou ignorados</summary>
              <ul className="mt-2 divide-y divide-border rounded-lg border border-border">
                {outros.map((p) => (
                  <li key={p.produto} className="flex flex-wrap items-center justify-between gap-3 px-4 py-2">
                    <span>{p.produto || '(sem nome)'} <span className="text-xs text-muted-foreground">· {p.destino.tipo === 'teste' ? 'teste' : 'ignorado'}</span></span>
                    {p.produto && <ClassificarProduto produto={p.produto} cursos={d.cursos.map((c) => ({ id: c.id, nome: c.nome }))} atual={manualDe(p.produto)} />}
                  </li>
                ))}
              </ul>
            </details>
          )}
        </>
      )}
    </div>
  )
}
