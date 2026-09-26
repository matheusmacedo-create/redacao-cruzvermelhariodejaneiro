import Link from 'next/link'
import { notFound } from 'next/navigation'
import { Pencil } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { PageHeader } from '@/components/app/page-header'
import { hojeEmSaoPaulo } from '@/components/app/projetos/comum'
import { SecoesDoPatrimonio } from '@/components/app/patrimonio/secoes'
import { AcoesDoLote, MontarKits, NovaEntrada, NovaSaida } from '@/components/app/patrimonio/estoque'
import { cadastrosDoPatrimonio, contextoDoPatrimonio, COLUNAS_DO_ITEM, lerItemDoBanco } from '@/lib/patrimonio/acesso'
import {
  CAUSAS_DE_PERDA, FINALIDADES, ORIGENS_DE_ENTRADA, TIPOS_DE_MOVIMENTO, UNIDADES, diasAte, kitsPossiveis, quantidade, situacaoDaValidade, situacaoDoSaldo,
  type CausaDePerda, type Finalidade, type Lote, type OrigemDeEntrada, type TipoDeMovimento,
} from '@/lib/patrimonio/estoque'

export const metadata = { title: 'Material do estoque' }
export const dynamic = 'force-dynamic'

const reais = (n: number) => n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
const dataBr = (d: string | null) => (d ? d.split('-').reverse().join('/') : '—')

function Dado({ rotulo, children, destaque }: { rotulo: string; children: React.ReactNode; destaque?: string }) {
  return <div><dt className="text-xs text-muted-foreground">{rotulo}</dt><dd className={`text-lg font-semibold tabular-nums ${destaque ?? ''}`}>{children}</dd></div>
}

export default async function MaterialPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound()
  const { context, supabase, nivel } = await contextoDoPatrimonio()
  if (nivel < 1) notFound()
  const ws = context.workspace.id
  const { data: bruto } = await supabase.from('est_itens').select(COLUNAS_DO_ITEM).eq('id', id).eq('workspace_id', ws).maybeSingle()
  if (!bruto) notFound()
  const i = lerItemDoBanco(bruto)
  const hoje = hojeEmSaoPaulo()
  const c = await cadastrosDoPatrimonio()
  const [{ data: saldos }, { data: composicao }, { data: usadoEm }, { data: movimentos }, { data: membros }] = await Promise.all([
    supabase.from('est_saldos').select('id,item_id,local_id,lote,validade,quantidade').eq('item_id', id).gt('quantidade', 0).order('validade', { nullsFirst: false }),
    supabase.from('est_composicao').select('componente_id,quantidade,est_itens!est_composicao_componente_id_fkey(codigo,nome,unidade)').eq('kit_id', id),
    supabase.from('est_composicao').select('kit_id,quantidade,est_itens!est_composicao_kit_id_fkey(codigo,nome)').eq('componente_id', id),
    supabase.from('est_movimentos').select('id,data,tipo,quantidade,valor,local_id,origem,finalidade,causa,detalhe,documento,criado_por,created_at').eq('item_id', id)
      .order('data', { ascending: false }).order('created_at', { ascending: false }).limit(150),
    supabase.from('workspace_members').select('user_id,profiles(full_name)').eq('workspace_id', ws),
  ])
  const perfil = (m: { profiles: unknown }) => (Array.isArray(m.profiles) ? m.profiles[0] : m.profiles) as { full_name?: string } | null
  const nomes = new Map((membros ?? []).map((m) => [m.user_id as string, perfil(m)?.full_name ?? 'Alguém']))
  const local = new Map(c.locais.map((l) => [l.id, l.nome]))
  const lotes = (saldos ?? []).map((l) => ({ ...l, quantidade: Number(l.quantidade) })) as (Lote & { item_id: string })[]
  const um = <T,>(x: T | T[] | null) => (Array.isArray(x) ? x[0] : x)
  const componentes = (composicao ?? []).map((x) => ({ item_id: x.componente_id as string, quantidade: Number(x.quantidade), ...(um(x.est_itens as unknown as { codigo: string; nome: string; unidade: string }) ?? { codigo: '', nome: '?', unidade: '' }) }))
  // Para "dá para montar N": os lotes dos componentes.
  const { data: lotesDosComponentes } = i.eh_kit && componentes.length
    ? await supabase.from('est_saldos').select('id,item_id,local_id,lote,validade,quantidade').in('item_id', componentes.map((x) => x.item_id)).gt('quantidade', 0)
    : { data: [] }
  const locaisAtivos = c.locais.filter((l) => l.ativo).map((l) => ({ id: l.id, nome: l.nome }))
  const possiveis = Object.fromEntries(locaisAtivos.map((l) => [l.id, kitsPossiveis(componentes, (lotesDosComponentes ?? []).map((x) => ({ ...x, quantidade: Number(x.quantidade) })) as (Lote & { item_id: string })[], l.id, hoje)]))
  const situacao = situacaoDoSaldo(i.saldo, i.estoque_minimo)
  const opcao = { id: i.id, codigo: i.codigo, nome: i.nome, unidade: i.unidade, controla_validade: i.controla_validade, eh_kit: i.eh_kit }
  const projetos = c.projetos.map((p) => ({ id: p.id, nome: p.name }))
  const categoria = c.estCategorias.find((k) => k.id === i.categoria_id)?.nome ?? ''
  const pode = nivel >= 2 && i.ativo

  return (
    <div className="flex flex-col gap-6">
      <SecoesDoPatrimonio atual="/patrimonio/estoque" nivel={nivel} />
      <PageHeader
        title={i.nome}
        description={`${i.codigo} · ${categoria} · contado em ${UNIDADES[i.unidade as keyof typeof UNIDADES] ?? i.unidade}${i.ativo ? '' : ' · ARQUIVADO'}`}
        actions={nivel >= 2 ? (
          <div className="flex flex-wrap items-start gap-2" data-ajuda="patrimonio.material-acoes">
            {pode && <NovaEntrada itens={[opcao]} itemFixo={i.id} locais={locaisAtivos} fontes={c.fontes.map((f) => ({ id: f.id, nome: f.nome }))} projetos={projetos} hoje={hoje} />}
            {pode && i.saldo > 0 && <NovaSaida itens={[opcao]} itemFixo={i.id} locais={locaisAtivos} projetos={projetos} lotes={lotes} hoje={hoje} />}
            {pode && i.eh_kit && <MontarKits kitId={i.id} locais={locaisAtivos} possiveis={possiveis} />}
            <Button variant="outline" render={<Link href={`/patrimonio/estoque/${i.id}/editar`} />}><Pencil className="size-4" />Editar</Button>
          </div>
        ) : undefined}
      />

      <Card className="p-5" data-ajuda="patrimonio.material-saldo">
        <dl className="grid grid-cols-2 gap-4 sm:grid-cols-4" id="saldo-do-material">
          <Dado rotulo="Saldo (todos os locais)" destaque={situacao === 'zerado' && i.estoque_minimo > 0 ? 'text-destructive' : situacao === 'abaixo' ? 'text-warning-foreground' : ''}>{quantidade(i.saldo, i.unidade)}</Dado>
          <Dado rotulo="Mínimo">{i.estoque_minimo > 0 ? quantidade(i.estoque_minimo, i.unidade) : '—'}</Dado>
          <Dado rotulo="Custo médio">{i.saldo > 0 ? reais(i.valor_estoque / i.saldo) : '—'}</Dado>
          <Dado rotulo="Valor em estoque">{reais(i.valor_estoque)}</Dado>
        </dl>
        {situacao !== 'ok' && i.estoque_minimo > 0 && <p className="mt-3 text-sm text-warning-foreground">{situacao === 'zerado' ? 'Zerado.' : 'Abaixo do mínimo.'} Hora de repor.</p>}
        {i.descricao && <p className="mt-3 text-sm text-muted-foreground">{i.descricao}</p>}
      </Card>

      <Card className="overflow-hidden p-0" id="lotes" data-ajuda="patrimonio.material-lotes">
        <h2 className="px-5 pt-5 font-semibold">Onde está{i.controla_validade ? ' (por lote e validade)' : ''}</h2>
        {!lotes.length ? <p className="px-5 pb-5 pt-2 text-sm text-muted-foreground">Sem saldo.</p> : (
          <div className="overflow-x-auto">
            <table className="mt-3 w-full min-w-[36rem] border-collapse text-sm">
              <thead><tr className="border-y border-border bg-muted/40 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                <th className="px-5 py-2">Local</th><th className="px-3 py-2">Lote</th><th className="px-3 py-2">Validade</th><th className="px-3 py-2 text-right">Quantidade</th><th className="px-5 py-2"><span className="sr-only">Ações</span></th>
              </tr></thead>
              <tbody>
                {lotes.slice().sort((a, b) => (local.get(a.local_id) ?? '').localeCompare(local.get(b.local_id) ?? '', 'pt-BR') || (a.validade ?? '9999').localeCompare(b.validade ?? '9999')).map((l) => {
                  const v = situacaoDaValidade(l.validade, hoje, i.aviso_validade_dias)
                  return (
                    <tr key={l.id} className="border-b border-border last:border-0" data-lote={l.lote || 'sem-lote'}>
                      <td className="px-5 py-2.5">{local.get(l.local_id) ?? '—'}</td>
                      <td className="px-3 py-2.5 font-mono text-xs">{l.lote || '—'}</td>
                      <td className="px-3 py-2.5 text-xs">
                        {l.validade ? <span className={v === 'vencido' ? 'font-semibold text-destructive' : v === 'vencendo' ? 'font-medium text-warning-foreground' : ''}>
                          {dataBr(l.validade)}{v === 'vencido' ? ' · vencido' : v === 'vencendo' ? ` · vence em ${diasAte(l.validade, hoje)} dias` : ''}
                        </span> : '—'}
                      </td>
                      <td className="px-3 py-2.5 text-right tabular-nums">{quantidade(l.quantidade, i.unidade)}</td>
                      <td className="px-5 py-1.5">{nivel >= 2 && <AcoesDoLote itemId={i.id} lote={l} locais={locaisAtivos} unidade={i.unidade} vencido={v === 'vencido'} />}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {(componentes.length > 0 || (usadoEm ?? []).length > 0) && (
        <Card className="p-5" id="composicao">
          {componentes.length > 0 && (
            <>
              <h2 className="mb-2 font-semibold">Cada kit leva</h2>
              <ul className="flex flex-col gap-1 text-sm">
                {componentes.map((x) => <li key={x.item_id}><span className="tabular-nums">{quantidade(x.quantidade, x.unidade)}</span> · <Link href={`/patrimonio/estoque/${x.item_id}`} className="hover:text-primary hover:underline">{x.nome}</Link> <span className="font-mono text-xs text-muted-foreground">{x.codigo}</span></li>)}
              </ul>
              <p className="mt-2 text-xs text-muted-foreground">Dá para montar agora: {locaisAtivos.filter((l) => possiveis[l.id] > 0).map((l) => `${possiveis[l.id]} em ${l.nome}`).join(', ') || 'nenhum (falta componente)'}.</p>
            </>
          )}
          {(usadoEm ?? []).length > 0 && (
            <p className={`text-sm ${componentes.length ? 'mt-3' : ''}`}>Faz parte de: {(usadoEm ?? []).map((x, k) => {
              const kit = um(x.est_itens as unknown as { codigo: string; nome: string })
              return <span key={x.kit_id as string}>{k ? ', ' : ''}<Link href={`/patrimonio/estoque/${x.kit_id}`} className="hover:text-primary hover:underline">{kit?.nome}</Link> ({quantidade(Number(x.quantidade), i.unidade)} por kit)</span>
            })}.</p>
          )}
        </Card>
      )}

      <Card className="overflow-hidden p-0" id="movimentos" data-ajuda="patrimonio.material-movimentos">
        <h2 className="px-5 pt-5 font-semibold">Movimentos</h2>
        {!(movimentos ?? []).length ? <p className="px-5 pb-5 pt-2 text-sm text-muted-foreground">Nenhum movimento ainda.</p> : (
          <div className="overflow-x-auto">
            <table className="mt-3 w-full min-w-[44rem] border-collapse text-sm">
              <thead><tr className="border-y border-border bg-muted/40 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                <th className="px-5 py-2">Data</th><th className="px-3 py-2">Movimento</th><th className="px-3 py-2 text-right">Quantidade</th><th className="px-3 py-2">Local</th><th className="px-3 py-2">Detalhe</th><th className="px-5 py-2 text-right">Valor</th>
              </tr></thead>
              <tbody>
                {(movimentos ?? []).map((m) => {
                  const q = Number(m.quantidade)
                  const motivo = m.origem ? ORIGENS_DE_ENTRADA[m.origem as OrigemDeEntrada]?.split(' (')[0] : m.finalidade ? FINALIDADES[m.finalidade as Finalidade]?.split(' (')[0] : m.causa === 'contagem' ? null : m.causa ? CAUSAS_DE_PERDA[m.causa as CausaDePerda] : null
                  return (
                    <tr key={m.id as string} className="border-b border-border align-top last:border-0">
                      <td className="whitespace-nowrap px-5 py-2.5 text-xs">{dataBr(m.data as string)}</td>
                      <td className="px-3 py-2.5 text-xs"><span className="font-medium">{TIPOS_DE_MOVIMENTO[m.tipo as TipoDeMovimento]}</span>{motivo && <span className="block text-muted-foreground">{motivo}</span>}</td>
                      <td className={`whitespace-nowrap px-3 py-2.5 text-right tabular-nums ${q > 0 ? 'text-success' : ''}`}>{q > 0 ? '+' : '−'}{quantidade(Math.abs(q), i.unidade)}</td>
                      <td className="px-3 py-2.5 text-xs">{local.get(m.local_id as string) ?? '—'}</td>
                      <td className="max-w-72 px-3 py-2.5 text-xs">
                        {m.detalhe && <span className="block">{m.detalhe as string}</span>}
                        {m.documento && <span className="block text-muted-foreground">Doc. {m.documento as string}</span>}
                        <span className="block text-muted-foreground">{m.criado_por ? nomes.get(m.criado_por as string) ?? 'Alguém' : 'Sistema'}</span>
                      </td>
                      <td className="whitespace-nowrap px-5 py-2.5 text-right tabular-nums text-xs">{reais(Number(m.valor))}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  )
}
