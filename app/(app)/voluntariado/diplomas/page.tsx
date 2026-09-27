import Link from 'next/link'
import { ArrowLeft, Lock, Search } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { PageHeader } from '@/components/app/page-header'
import { contextoDeParticipantes } from '@/lib/participantes/acesso'
import { todasAsLinhas } from '@/lib/supabase/paginar'
import { filtrarDiplomas, lerFiltro, pertoDoMarco, proximoMarco } from '@/lib/participantes/diplomas'
import { EmitirDiplomas, ListaDeDiplomas, type DiplomaNaLista, type VoluntarioParaDiploma } from '@/components/app/participantes/area-de-diplomas'

export const metadata = { title: 'Diplomas — Voluntariado' }
export const dynamic = 'force-dynamic'

const selectClass = 'rounded-lg border border-border bg-background px-3 py-2 text-sm'

/**
 * Diplomas de Reconhecimento num lugar só (antes, só dentro de cada ficha):
 * emitir o mesmo reconhecimento para vários voluntários, ver quem está perto
 * dos 100, 500 e 1.000 horas, e baixar vários num PDF para a cerimônia. O
 * desenho é o modelo oficial (lib/cursos/diploma-pdf.ts); quem grava e
 * confere o nível é o banco (migração 20260929040000).
 */
export default async function DiplomasPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const filtro = lerFiltro(await searchParams)
  const { context, supabase, nivel } = await contextoDeParticipantes()
  const ws = context.workspace.id

  if (nivel < 1) {
    return (
      <div>
        <PageHeader title="Diplomas" description="Diplomas de Reconhecimento dos voluntários." />
        <Card className="flex items-start gap-3 p-6">
          <Lock className="mt-0.5 size-5 text-muted-foreground" />
          <p className="text-sm">Você ainda não tem acesso ao cadastro de voluntários. Peça a um administrador.</p>
        </Card>
      </div>
    )
  }

  const [participantes, horas, diplomas] = await Promise.all([
    todasAsLinhas<{ id: string; nome: string; nome_social: string | null; situacao: string; vinculo: string }>((de, ate) => supabase.from('participantes')
      .select('id,nome,nome_social,situacao,vinculo').eq('workspace_id', ws).is('anonimizado_em', null).neq('situacao', 'candidato').order('id').range(de, ate)),
    todasAsLinhas<{ participante_id: string; horas: number | string }>((de, ate) => supabase.from('participante_horas')
      .select('participante_id,horas').eq('workspace_id', ws).order('id').range(de, ate)),
    // Sem a migração dos diplomas, a consulta falha e a lista só mostra "nenhum".
    todasAsLinhas<DiplomaNaLista>((de, ate) => supabase.from('diplomas')
      .select('id,participante_id,codigo,nome,motivo,marco_horas,texto,emitido_em,revogado_em,motivo_revogacao').eq('workspace_id', ws).order('id').range(de, ate)),
  ])

  const totalPorPessoa = new Map<string, number>()
  for (const h of horas.data) totalPorPessoa.set(h.participante_id, (totalPorPessoa.get(h.participante_id) ?? 0) + Number(h.horas))
  const voluntarios: VoluntarioParaDiploma[] = participantes.data
    .map((p) => ({ id: p.id, nome: p.nome_social || p.nome, situacao: p.situacao, vinculo: p.vinculo, horas: Math.round((totalPorPessoa.get(p.id) ?? 0) * 10) / 10 }))
    .sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'))
  const perto = voluntarios.filter((v) => v.situacao === 'ativo' && pertoDoMarco(v.horas))
    .map((v) => ({ ...v, proximo: proximoMarco(v.horas)! }))
    .sort((a, b) => a.proximo.faltam - b.proximo.faltam)

  const todos = [...diplomas.data].sort((a, b) => b.emitido_em.localeCompare(a.emitido_em))
  const lista = filtrarDiplomas(todos, filtro)
  const validos = todos.filter((d) => !d.revogado_em)
  const anoAtual = new Date().getFullYear().toString()

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Diplomas de Reconhecimento"
        description="O diploma oficial da Cruz Vermelha Brasileira, com código de verificação. Aos 100, 500 e 1.000 horas ele sai sozinho; aqui a coordenação homenageia vários voluntários de uma vez e baixa todos para imprimir."
        actions={<Button variant="outline" render={<Link href="/voluntariado" />}><ArrowLeft className="size-4" />Voluntários</Button>}
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[
          [validos.length, 'diplomas válidos'],
          [validos.filter((d) => d.emitido_em.startsWith(anoAtual)).length, `emitidos em ${anoAtual}`],
          [validos.filter((d) => d.motivo === 'horas').length, 'por marco de horas'],
          [perto.length, 'perto do próximo marco'],
        ].map(([v, r]) => (
          <Card key={String(r)} className="p-4"><p className="text-2xl font-bold tabular-nums">{v}</p><p className="text-xs text-muted-foreground">{r}</p></Card>
        ))}
      </div>

      {nivel >= 2 && <EmitirDiplomas voluntarios={voluntarios} />}

      {perto.length > 0 && (
        <Card className="p-5" data-ajuda="diplomas.perto">
          <h2 className="font-semibold">Perto do próximo diploma</h2>
          <p className="mt-1 text-sm text-muted-foreground">Voluntários ativos a menos de 20% do próximo marco de horas. O diploma sai sozinho quando as horas registradas chegam lá.</p>
          <ul className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {perto.slice(0, 30).map((v) => (
              <li key={v.id} className="flex items-center justify-between gap-2 rounded-lg border border-border px-3 py-2 text-sm">
                <Link href={`/voluntariado/${v.id}`} className="min-w-0 truncate font-medium hover:text-primary hover:underline">{v.nome}</Link>
                <span className="shrink-0 text-xs text-muted-foreground">faltam {v.proximo.faltam.toLocaleString('pt-BR')} h para {v.proximo.marco.toLocaleString('pt-BR')}</span>
              </li>
            ))}
          </ul>
        </Card>
      )}

      <section className="flex flex-col gap-3">
        <h2 className="font-semibold">Emitidos</h2>
        <form className="flex flex-wrap items-center gap-2" role="search">
          <div className="relative min-w-52 flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <input name="q" defaultValue={filtro.q} placeholder="Nome, código ou motivo" aria-label="Buscar diploma" className="w-full rounded-lg border border-border bg-background py-2 pl-9 pr-3 text-sm" />
          </div>
          <select name="tipo" defaultValue={filtro.tipo} aria-label="Tipo" className={selectClass}>
            <option value="">Todos os tipos</option><option value="horas">Por marco de horas</option><option value="coordenacao">Concedidos pela coordenação</option>
          </select>
          <select name="situacao" defaultValue={filtro.situacao} aria-label="Situação" className={selectClass}>
            <option value="validos">Válidos</option><option value="cancelados">Cancelados</option><option value="todos">Todos</option>
          </select>
          <Button type="submit" variant="outline">Filtrar</Button>
        </form>
        {diplomas.error
          ? <Card className="p-6 text-sm text-muted-foreground">Os diplomas não carregaram agora. Recarregue a página.</Card>
          : <ListaDeDiplomas diplomas={lista} podeCancelar={nivel >= 2} />}
      </section>
    </div>
  )
}
