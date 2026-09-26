import Link from 'next/link'
import { notFound } from 'next/navigation'
import { Card } from '@/components/ui/card'
import { PageHeader } from '@/components/app/page-header'
import { SecoesDoPatrimonio } from '@/components/app/patrimonio/secoes'
import { AbrirInventario, ConcluirInventario } from '@/components/app/patrimonio/acoes'
import { cadastrosDoPatrimonio, contextoDoPatrimonio } from '@/lib/patrimonio/acesso'

export const metadata = { title: 'Inventário do patrimônio' }
export const dynamic = 'force-dynamic'

const quando = (t: string) => new Date(t).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', dateStyle: 'short', timeStyle: 'short' })

/**
 * Inventário físico: com um inventário aberto, quem opera o patrimônio lê o
 * QR de cada bem com o celular e marca "está aqui" (com o lugar e o estado
 * encontrados). A tela mostra o que falta, por local.
 */
export default async function InventarioPage() {
  const { context, supabase, nivel } = await contextoDoPatrimonio()
  if (nivel < 1) notFound()
  const ws = context.workspace.id
  const c = await cadastrosDoPatrimonio()
  const [{ data: aberto }, { data: anteriores }] = await Promise.all([
    supabase.from('pat_inventarios').select('id,nome,iniciado_em').eq('workspace_id', ws).is('concluido_em', null).maybeSingle(),
    supabase.from('pat_inventarios').select('id,nome,iniciado_em,concluido_em,resumo').eq('workspace_id', ws).not('concluido_em', 'is', null).order('concluido_em', { ascending: false }).limit(10),
  ])
  let bens: { id: string; plaqueta: string; nome: string; local_id: string | null }[] = []
  let conferidos = new Map<string, { conferido_em: string; local_id: string | null }>()
  if (aberto) {
    const [{ data: b }, { data: conf }] = await Promise.all([
      supabase.from('pat_bens').select('id,plaqueta,nome,local_id').eq('workspace_id', ws).neq('situacao', 'baixado').order('numero').limit(10000),
      supabase.from('pat_conferencias').select('bem_id,conferido_em,local_id').eq('inventario_id', aberto.id).limit(10000),
    ])
    bens = (b ?? []) as typeof bens
    conferidos = new Map((conf ?? []).map((x) => [x.bem_id as string, { conferido_em: x.conferido_em as string, local_id: x.local_id as string | null }]))
  }
  const local = new Map(c.locais.map((l) => [l.id, l.nome]))
  const faltam = bens.filter((b) => !conferidos.has(b.id))
  const porLocal = new Map<string, typeof bens>()
  for (const b of faltam) porLocal.set(b.local_id ? local.get(b.local_id) ?? 'Sem local' : 'Sem local', [...(porLocal.get(b.local_id ? local.get(b.local_id) ?? 'Sem local' : 'Sem local') ?? []), b])
  const pct = bens.length ? Math.round((conferidos.size / bens.length) * 100) : 0

  return (
    <div className="flex flex-col gap-6">
      <SecoesDoPatrimonio atual="/patrimonio/inventario" nivel={nivel} />
      <PageHeader title="Inventário físico" description="Conferir, bem a bem, que tudo está onde o Palácio Virtual diz. Leia o QR da etiqueta com o celular e marque “Está aqui”." />

      {aberto ? (
        <>
          <Card className="flex flex-col gap-3 p-5" id="inventario-aberto" data-ajuda="patrimonio.inventario-progresso">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h2 className="font-semibold">{aberto.nome as string}</h2>
              <span className="text-xs text-muted-foreground">aberto em {quando(aberto.iniciado_em as string)}</span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-muted" role="img" aria-label={`${pct}% conferido`}><div className="h-full rounded-full bg-[var(--chart-4)]" style={{ width: `${pct}%` }} /></div>
            <p className="text-sm"><span className="font-semibold tabular-nums">{conferidos.size}</span> de {bens.length} bens conferidos ({pct}%)</p>
            {nivel >= 3 && <ConcluirInventario faltam={faltam.length} />}
          </Card>
          <Card className="p-5" id="faltam" data-ajuda="patrimonio.inventario-faltam">
            <h2 className="mb-3 font-semibold">Faltam conferir ({faltam.length})</h2>
            {!faltam.length ? <p className="text-sm text-success">Todos os bens foram conferidos.</p> : (
              <div className="flex flex-col gap-4">
                {[...porLocal].sort(([a], [b]) => a.localeCompare(b, 'pt-BR')).map(([nome, lista]) => (
                  <div key={nome}>
                    <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{nome} · {lista.length}</p>
                    <ul className="flex flex-wrap gap-2">
                      {lista.map((b) => <li key={b.id}><Link href={`/patrimonio/${b.id}`} className="inline-block rounded-lg border border-border px-2.5 py-1 text-xs hover:border-primary/50 hover:text-primary"><span className="font-mono">{b.plaqueta}</span> {b.nome}</Link></li>)}
                    </ul>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </>
      ) : (
        <Card className="flex flex-col gap-3 p-5">
          <p className="text-sm">Nenhum inventário aberto.{nivel >= 3 ? ' Abra um para começar a conferir.' : ' A gestão do Patrimônio abre o inventário.'}</p>
          {nivel >= 3 && <AbrirInventario />}
        </Card>
      )}

      {(anteriores ?? []).length > 0 && (
        <Card className="p-5" id="inventarios-anteriores">
          <h2 className="mb-3 font-semibold">Inventários anteriores</h2>
          <ul className="flex flex-col gap-3 text-sm">
            {(anteriores ?? []).map((i) => {
              const r = (i.resumo ?? {}) as { bens?: number; conferidos?: number; nao_encontrados?: { id: string; plaqueta: string; nome: string }[] }
              return (
                <li key={i.id as string}>
                  <span className="font-medium">{i.nome as string}</span> <span className="text-xs text-muted-foreground">concluído em {quando(i.concluido_em as string)} · {r.conferidos ?? 0} de {r.bens ?? 0} conferidos</span>
                  {!!r.nao_encontrados?.length && (
                    <span className="mt-1 block text-xs text-warning-foreground">Não encontrados: {r.nao_encontrados.map((b, k) => <span key={b.id}>{k ? ', ' : ''}<Link href={`/patrimonio/${b.id}`} className="hover:underline">{b.plaqueta}</Link></span>)}</span>
                  )}
                </li>
              )
            })}
          </ul>
        </Card>
      )}
    </div>
  )
}
