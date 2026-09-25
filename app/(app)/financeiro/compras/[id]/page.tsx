import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ArrowLeft, Pencil } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { EstadoDoPedido } from '@/components/app/financeiro/compras/comum'
import { Cotacao, type PropostaNaTela } from '@/components/app/financeiro/compras/cotacao'
import { Aprovacao, CancelarPedido } from '@/components/app/financeiro/compras/decisao'
import { contextoDeCompras, verbaDaCategoria } from '@/lib/compras/servidor'
import { numeroDoPedido, totalEstimado, type EstadoDoPedido as Estado, type ItemDoPedido } from '@/lib/compras/regras'
import { nivelNaEmpresa } from '@/lib/financeiro/acesso'
import { dataCurta, reais } from '@/lib/financeiro/regras'
import { createAdminClient } from '@/lib/supabase/admin'
import { tituloDaArea } from '@/lib/navegacao'

export const metadata = { title: tituloDaArea('/financeiro/compras') }
export const dynamic = 'force-dynamic'

const ACOES: Record<string, string> = {
  criado: 'abriu o pedido', alterado: 'alterou o pedido', proposta_incluida: 'registrou a proposta', proposta_alterada: 'alterou a proposta',
  proposta_excluida: 'excluiu a proposta', proposta_anexada: 'anexou o documento de uma proposta', enviado_aprovacao: 'mandou para aprovação',
  aprovado_financeiro: 'aprovou pelo Financeiro', aprovado_diretoria: 'aprovou pela Diretoria', devolvido: 'devolveu para a cotação',
  recusado: 'recusou', cancelado: 'cancelou',
}
const quando = (iso: string) => new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short', timeZone: 'America/Sao_Paulo' }).format(new Date(iso))

/**
 * Um pedido de compra de ponta a ponta: o que se pede e para quê, a verba da
 * categoria, a cotação (mapa comparativo), a aprovação e o histórico — a
 * trilha que a prestação de contas pede.
 */
export default async function PedidoPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound()
  const ctx = await contextoDeCompras()
  const { context, supabase, diretoria, regras } = ctx
  const eu = context.user.id
  const [{ data: p }, { data: itensBrutos }, { data: propostasBrutas }, { data: historico }] = await Promise.all([
    supabase.from('compras_pedidos').select('*').eq('id', id).eq('workspace_id', context.workspace.id).maybeSingle(),
    supabase.from('compras_itens').select('id,descricao,especificacao,quantidade,unidade,valor_estimado_unit,ordem').eq('pedido_id', id).order('ordem'),
    supabase.from('compras_propostas').select('id,favorecido_id,recebida_em,validade,prazo_entrega,condicao_pagamento,frete,observacao,arquivo_nome,arquivo_caminho,compras_proposta_itens(item_id,valor_unitario)').eq('pedido_id', id).order('created_at'),
    supabase.from('compras_historico').select('id,acao,detalhe,por,em').eq('pedido_id', id).order('em'),
  ])
  if (!p) notFound()
  const estado = p.estado as Estado
  const nivel = nivelNaEmpresa(ctx, p.entidade_id)
  const itens: ItemDoPedido[] = (itensBrutos ?? []).map((i) => ({ ...i, quantidade: Number(i.quantidade), valor_estimado_unit: i.valor_estimado_unit === null ? null : Number(i.valor_estimado_unit) }))

  // Nomes: o RLS já confirmou que esta pessoa vê o pedido; fornecedor, categoria e fonte
  // vêm pelo serviço porque quem pediu (sem acesso ao Financeiro) não lê esses cadastros.
  const admin = createAdminClient()
  const favIds = [...new Set((propostasBrutas ?? []).map((x) => x.favorecido_id as string))]
  const pessoasIds = [...new Set([p.solicitante_id, p.aprovado_fin_por, p.aprovado_dir_por, p.encerrado_por, ...(historico ?? []).map((h) => h.por)].filter(Boolean))] as string[]
  const podeCotar = nivel >= 2 && (estado === 'aberto' || estado === 'em_cotacao')
  const [{ data: favs }, { data: perfis }, { data: setor }, { data: projeto }, { data: categoria }, { data: fonte }, { data: fornecedores }, verba] = await Promise.all([
    favIds.length ? admin.from('fin_favorecidos').select('id,nome').in('id', favIds) : Promise.resolve({ data: [] as { id: string; nome: string }[] }),
    pessoasIds.length ? admin.from('profiles').select('id,full_name').in('id', pessoasIds) : Promise.resolve({ data: [] as { id: string; full_name: string }[] }),
    p.setor_id ? supabase.from('setores').select('nome').eq('id', p.setor_id).maybeSingle() : Promise.resolve({ data: null }),
    p.projeto_id ? supabase.from('projects').select('name').eq('id', p.projeto_id).maybeSingle() : Promise.resolve({ data: null }),
    p.categoria_id ? admin.from('fin_categorias').select('nome').eq('id', p.categoria_id).maybeSingle() : Promise.resolve({ data: null }),
    p.fonte_id ? admin.from('fin_fontes').select('nome,restrita').eq('id', p.fonte_id).maybeSingle() : Promise.resolve({ data: null }),
    podeCotar ? supabase.from('fin_favorecidos').select('id,nome').eq('workspace_id', context.workspace.id).eq('entidade_id', p.entidade_id).order('nome').limit(5000) : Promise.resolve({ data: [] as { id: string; nome: string }[] }),
    nivel >= 1 && p.categoria_id ? verbaDaCategoria(supabase, context.workspace.id, p.entidade_id, p.categoria_id, new Date().toISOString().slice(0, 7), p.id) : Promise.resolve(null),
  ])
  const fornecedorDe = new Map((favs ?? []).map((f) => [f.id, f.nome as string]))
  const nomeDe = new Map((perfis ?? []).map((x) => [x.id, x.full_name as string]))
  const propostas: PropostaNaTela[] = (propostasBrutas ?? []).map((x) => ({
    id: x.id, favorecido_id: x.favorecido_id, fornecedor: fornecedorDe.get(x.favorecido_id) ?? 'Fornecedor', frete: Number(x.frete),
    recebida_em: x.recebida_em, validade: x.validade, prazo_entrega: x.prazo_entrega, condicao_pagamento: x.condicao_pagamento, observacao: x.observacao,
    arquivo_nome: x.arquivo_nome, tem_arquivo: Boolean(x.arquivo_caminho),
    precos: ((x.compras_proposta_itens ?? []) as { item_id: string; valor_unitario: number | null }[]).map((pi) => ({ item_id: pi.item_id, valor_unitario: pi.valor_unitario === null ? null : Number(pi.valor_unitario) })),
  }))

  const ehSolicitante = p.solicitante_id === eu
  const podeEditar = (estado === 'aberto' && (ehSolicitante || nivel >= 2)) || (estado === 'em_cotacao' && nivel >= 2)
  const podeCancelar = !['cancelado', 'recusado'].includes(estado) && ((ehSolicitante && ['aberto', 'em_cotacao', 'em_aprovacao'].includes(estado)) || nivel >= 2)
  const etapas = [
    { papel: 'financeiro' as const, rotulo: 'Financeiro', feita: p.aprovado_fin_em ? { por: nomeDe.get(p.aprovado_fin_por) ?? 'alguém', em: quando(p.aprovado_fin_em) } : null, minhaVez: nivel >= 3 && !ehSolicitante && p.aprovado_dir_por !== eu },
    ...(p.exige_diretoria ? [{ papel: 'diretoria' as const, rotulo: 'Diretoria', feita: p.aprovado_dir_em ? { por: nomeDe.get(p.aprovado_dir_por) ?? 'alguém', em: quando(p.aprovado_dir_em) } : null, minhaVez: diretoria && !ehSolicitante && p.aprovado_fin_por !== eu }] : []),
  ]
  const estimado = totalEstimado(itens)

  return (
    <div className="flex flex-col gap-5">
      <div>
        <Link href="/financeiro/compras" className="mb-3 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"><ArrowLeft className="size-4" />Pedidos de compra</Link>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="font-mono text-sm text-muted-foreground">{numeroDoPedido(p.ano, p.numero)}</p>
            <h1 className="text-xl font-semibold">{p.titulo}</h1>
            <p className="mt-1 flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
              <EstadoDoPedido estado={estado} />
              Pedido por {nomeDe.get(p.solicitante_id) ?? 'alguém'} em {quando(p.created_at)}
            </p>
          </div>
          <div className="flex flex-wrap items-start gap-2">
            {podeEditar && <Button variant="outline" size="sm" render={<Link href={`/financeiro/compras/${id}/editar`} />}><Pencil className="size-4" />Alterar</Button>}
            {podeCancelar && <CancelarPedido pedidoId={id} />}
          </div>
        </div>
      </div>

      {(estado === 'cancelado' || estado === 'recusado') && p.motivo_encerramento && (
        <Card className="border-destructive/30 bg-destructive/5 p-4 text-sm">
          <span className="font-medium">{estado === 'cancelado' ? 'Cancelado' : 'Recusado'}</span> por {nomeDe.get(p.encerrado_por) ?? 'alguém'}{p.encerrado_em && ` em ${quando(p.encerrado_em)}`}: {p.motivo_encerramento}
        </Card>
      )}

      <Card className="grid gap-4 p-5 text-sm sm:grid-cols-2 lg:grid-cols-4">
        <Dado rotulo="Para quê" largo>{p.justificativa}</Dado>
        <Dado rotulo="Setor">{setor?.nome ?? '—'}</Dado>
        <Dado rotulo="Projeto">{projeto?.name ?? '—'}</Dado>
        <Dado rotulo="Precisa até">{p.necessario_ate ? dataCurta(p.necessario_ate) : '—'}</Dado>
        <Dado rotulo="Onde entregar">{p.local_entrega ?? '—'}</Dado>
        <Dado rotulo="Categoria">{categoria?.nome ?? <span className="text-warning-foreground">a classificar</span>}</Dado>
        <Dado rotulo="Fonte do dinheiro">{fonte ? `${fonte.nome}${fonte.restrita ? ' (com restrição)' : ''}` : <span className="text-warning-foreground">a classificar</span>}</Dado>
        <Dado rotulo={p.valor_aprovado !== null ? 'Valor da proposta escolhida' : 'Valor estimado'}>
          <span className="font-semibold tabular-nums">{p.valor_aprovado !== null ? reais(Number(p.valor_aprovado)) : estimado ? reais(estimado) : '—'}</span>
        </Dado>
      </Card>

      {verba && (
        <Card className="p-4 text-sm" data-verba>
          {verba.verba === null
            ? <p className="text-muted-foreground">A categoria {categoria?.nome} não tem verba no Orçamento deste ano (Financeiro → Saúde do caixa → Orçamento).</p>
            : (
              <p>
                Verba de <span className="font-medium">{categoria?.nome}</span> neste mês: {reais(verba.verba)} · já lançado {reais(verba.lancado)} · em outras compras {reais(verba.emCompras)} ·{' '}
                <span className={verba.sobra !== null && verba.sobra < Number(p.valor_aprovado ?? estimado) ? 'font-semibold text-destructive' : 'font-semibold text-success'}>sobra {reais(verba.sobra ?? 0)}</span>
                {verba.sobra !== null && verba.sobra < Number(p.valor_aprovado ?? estimado) && ' — esta compra passa da verba do mês.'}
              </p>
            )}
        </Card>
      )}

      <section className="rounded-xl border border-border bg-card p-5" aria-label="Itens">
        <p className="mb-3 font-medium">Itens <span className="text-sm font-normal text-muted-foreground">— a mesma especificação vai para todos os fornecedores</span></p>
        <ol className="flex flex-col divide-y divide-border">
          {itens.map((i, n) => (
            <li key={i.id} className="flex flex-wrap items-baseline gap-x-4 gap-y-1 py-2 text-sm">
              <span className="w-6 text-muted-foreground">{n + 1}.</span>
              <span className="min-w-0 flex-1"><span className="font-medium">{i.descricao}</span>{i.especificacao && <span className="block whitespace-pre-wrap text-xs text-muted-foreground">{i.especificacao}</span>}</span>
              <span className="tabular-nums">{String(i.quantidade).replace('.', ',')} {i.unidade}</span>
              {i.valor_estimado_unit !== null && <span className="text-xs text-muted-foreground">~ {reais(i.valor_estimado_unit)} / {i.unidade}</span>}
            </li>
          ))}
        </ol>
      </section>

      {(propostas.length > 0 || podeCotar) && (
        <Cotacao pedidoId={id} itens={itens} propostas={propostas} fornecedores={fornecedores ?? []} regras={regras} podeCotar={podeCotar}
          escolhida={p.proposta_id} justificativa={p.justificativa_escolha} emCotacao={podeCotar} />
      )}
      {!podeCotar && estado !== 'aberto' && p.justificativa_escolha && (
        <Card className="p-4 text-sm"><span className="font-medium">Justificativa da escolha:</span> {p.justificativa_escolha}</Card>
      )}
      {estado === 'aberto' && nivel < 2 && (
        <Card className="p-4 text-sm text-muted-foreground">O Financeiro vai pedir as propostas aos fornecedores. Você recebe um aviso quando o pedido for cotado e quando for decidido.</Card>
      )}

      {['em_aprovacao', 'aprovado', 'recusado'].includes(estado) && p.enviado_aprovacao_em && (
        <Aprovacao pedidoId={id} etapas={etapas} emAprovacao={estado === 'em_aprovacao'} />
      )}

      <section className="rounded-xl border border-border bg-card p-5" aria-label="Histórico">
        <p className="mb-3 font-medium">Histórico</p>
        <ol className="flex flex-col gap-2 text-sm" data-historico>
          {(historico ?? []).map((h) => {
            const d = (h.detalhe ?? {}) as Record<string, unknown>
            return (
              <li key={h.id} className="flex flex-wrap gap-x-2">
                <span className="tabular-nums text-muted-foreground">{quando(h.em)}</span>
                <span><span className="font-medium">{nomeDe.get(h.por) ?? 'Alguém'}</span> {ACOES[h.acao] ?? h.acao}
                  {typeof d.fornecedor === 'string' && ` de ${d.fornecedor}`}
                  {typeof d.total === 'number' && ` — ${reais(d.total)}`}
                  {typeof d.motivo === 'string' && d.motivo && `: ${d.motivo}`}
                  {typeof d.observacao === 'string' && d.observacao && `: ${d.observacao}`}
                </span>
              </li>
            )
          })}
        </ol>
      </section>
    </div>
  )
}

function Dado({ rotulo, children, largo }: { rotulo: string; children: React.ReactNode; largo?: boolean }) {
  return (
    <div className={largo ? 'sm:col-span-2 lg:col-span-4' : ''}>
      <p className="text-xs font-medium text-muted-foreground">{rotulo}</p>
      <div className="mt-0.5 whitespace-pre-wrap">{children}</div>
    </div>
  )
}
