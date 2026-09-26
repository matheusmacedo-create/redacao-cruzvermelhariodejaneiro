import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ArrowLeft, Pencil } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { EstadoDoPedido } from '@/components/app/financeiro/compras/comum'
import { Cotacao, type PropostaNaTela } from '@/components/app/financeiro/compras/cotacao'
import { PedirPropostas, type ConviteNaTela } from '@/components/app/financeiro/compras/convites'
import { Aprovacao, CancelarPedido } from '@/components/app/financeiro/compras/decisao'
import { ContaAPagar, OrdemDeCompra, Recebimento } from '@/components/app/financeiro/compras/ordem'
import { EntradaDoQueChegou } from '@/components/app/financeiro/compras/entrada'
import { comprasParecidas, contextoDeCompras, verbaDaCategoria } from '@/lib/compras/servidor'
import {
  JANELA_DE_FRACIONAMENTO_DIAS, custoComFrete, exigencias, faltaReceber, fracionamento, mapaComparativo, numeroDaOrdem, numeroDoPedido, semDestino, totalEstimado,
  type Destino, type EstadoDoPedido as Estado, type ItemDoPedido,
} from '@/lib/compras/regras'
import { caixasQuePodeUsar } from '@/lib/correio/enviar'
import { prazoPadrao, sugerirFornecedores } from '@/lib/compras/convites'
import { quantidade } from '@/lib/patrimonio/estoque'
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
  recusado: 'recusou', cancelado: 'cancelou', ordem_emitida: 'emitiu a ordem de compra', ordem_enviada: 'enviou a ordem ao fornecedor',
  recebido: 'registrou o recebimento', conta_lancada: 'lançou a conta a pagar',
  propostas_pedidas: 'pediu propostas aos fornecedores', proposta_do_fornecedor: 'mandou a proposta pelo link', convite_recusado: 'avisou que não vai cotar',
  convite_cancelado: 'cancelou o convite',
  entrada_estoque: 'deu entrada no estoque', entrada_patrimonio: 'cadastrou no patrimônio', entrada_consumo: 'registrou sem entrada (consumo)',
}
const DEPOIS_DA_ORDEM: Estado[] = ['emitido', 'recebido_parcial', 'recebido']
const quando = (iso: string) => new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short', timeZone: 'America/Sao_Paulo' }).format(new Date(iso))

/**
 * Um pedido de compra de ponta a ponta: o que se pede e para quê, a verba da
 * categoria, a cotação (mapa comparativo), a aprovação, a ordem de compra, o
 * recebimento, a conta a pagar e o histórico — a trilha que a prestação de
 * contas pede.
 */
export default async function PedidoPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound()
  const ctx = await contextoDeCompras()
  const { context, supabase, diretoria, regras, patrimonio } = ctx
  const eu = context.user.id
  const [{ data: p }, { data: itensBrutos }, { data: propostasBrutas }, { data: historico }, { data: convitesBrutos }] = await Promise.all([
    supabase.from('compras_pedidos').select('*').eq('id', id).eq('workspace_id', context.workspace.id).maybeSingle(),
    supabase.from('compras_itens').select('id,descricao,especificacao,quantidade,unidade,valor_estimado_unit,ordem').eq('pedido_id', id).order('ordem'),
    supabase.from('compras_propostas').select('id,favorecido_id,recebida_em,validade,prazo_entrega,condicao_pagamento,frete,observacao,arquivo_nome,arquivo_caminho,compras_proposta_itens(item_id,valor_unitario)').eq('pedido_id', id).order('created_at'),
    supabase.from('compras_historico').select('id,acao,detalhe,por,em').eq('pedido_id', id).order('em'),
    // Os convites aos fornecedores (sem o token: o RLS não deixa ler). Sem a migração, vem vazio.
    supabase.from('compras_convites').select('id,favorecido_id,email,enviado_em,envio_erro,visto_em,respondido_em,recusado_em,motivo_recusa,cancelado_em,lembrete_em').eq('pedido_id', id).order('created_at'),
  ])
  if (!p) notFound()
  const estado = p.estado as Estado
  const nivel = nivelNaEmpresa(ctx, p.entidade_id)
  const itens: ItemDoPedido[] = (itensBrutos ?? []).map((i) => ({ ...i, quantidade: Number(i.quantidade), valor_estimado_unit: i.valor_estimado_unit === null ? null : Number(i.valor_estimado_unit) }))
  const depoisDaOrdem = DEPOIS_DA_ORDEM.includes(estado)

  // Nomes: o RLS já confirmou que esta pessoa vê o pedido; fornecedor, categoria e fonte
  // vêm pelo serviço porque quem pediu (sem acesso ao Financeiro) não lê esses cadastros.
  const admin = createAdminClient()
  const favIds = [...new Set([...(propostasBrutas ?? []), ...(convitesBrutos ?? [])].map((x) => x.favorecido_id as string))]
  const chegou = estado === 'recebido_parcial' || estado === 'recebido'
  const [{ data: recebimentos }, { data: destinos }] = await Promise.all([
    depoisDaOrdem
      ? supabase.from('compras_recebimentos').select('id,recebido_em,nota_fiscal,observacao,por,compras_recebimento_itens(item_id,quantidade)').eq('pedido_id', id).order('recebido_em').order('created_at')
      : Promise.resolve({ data: [] as { id: string; recebido_em: string; nota_fiscal: string | null; observacao: string | null; por: string | null; compras_recebimento_itens: { item_id: string; quantidade: number }[] }[] }),
    chegou
      ? supabase.from('compras_destinos').select('id,item_id,tipo,quantidade,est_item_id,est_quantidade,bens,observacao,por,created_at').eq('pedido_id', id).order('created_at')
      : Promise.resolve({ data: [] as { id: string; item_id: string; tipo: Destino; quantidade: number; est_item_id: string | null; est_quantidade: number | null; bens: string[]; observacao: string | null; por: string | null; created_at: string }[] }),
  ])
  const pessoasIds = [...new Set([p.solicitante_id, p.aprovado_fin_por, p.aprovado_dir_por, p.encerrado_por, p.oc_emitida_por, p.oc_enviada_por,
    ...(historico ?? []).map((h) => h.por), ...(recebimentos ?? []).map((r) => r.por), ...(destinos ?? []).map((d) => d.por)].filter(Boolean))] as string[]
  const darEntrada = patrimonio && chegou && !p.entrada_concluida_em
  const bensIds = (destinos ?? []).flatMap((d) => (d.bens ?? []) as string[])
  const estIds = [...new Set((destinos ?? []).map((d) => d.est_item_id).filter(Boolean))] as string[]
  const podeCotar = nivel >= 2 && (estado === 'aberto' || estado === 'em_cotacao')
  const podeEnviar = nivel >= 2 && p.oc_numero !== null && depoisDaOrdem
  const podeLancar = nivel >= 2 && depoisDaOrdem && !p.lancamento_id
  const [
    { data: favs }, { data: perfis }, { data: setor }, { data: projeto }, { data: categoria }, { data: fonte }, { data: fornecedores }, verba, caixas, { data: contas }, { data: lancamento },
    { data: bens }, { data: estNomes }, { data: estOpcoes }, { data: locais }, { data: patCategorias },
  ] = await Promise.all([
    favIds.length ? admin.from('fin_favorecidos').select('id,nome,email').in('id', favIds) : Promise.resolve({ data: [] as { id: string; nome: string; email: string | null }[] }),
    pessoasIds.length ? admin.from('profiles').select('id,full_name').in('id', pessoasIds) : Promise.resolve({ data: [] as { id: string; full_name: string }[] }),
    p.setor_id ? supabase.from('setores').select('nome').eq('id', p.setor_id).maybeSingle() : Promise.resolve({ data: null }),
    p.projeto_id ? supabase.from('projects').select('name').eq('id', p.projeto_id).maybeSingle() : Promise.resolve({ data: null }),
    p.categoria_id ? admin.from('fin_categorias').select('nome').eq('id', p.categoria_id).maybeSingle() : Promise.resolve({ data: null }),
    p.fonte_id ? admin.from('fin_fontes').select('nome,restrita').eq('id', p.fonte_id).maybeSingle() : Promise.resolve({ data: null }),
    podeCotar ? supabase.from('fin_favorecidos').select('id,nome,email').eq('workspace_id', context.workspace.id).eq('entidade_id', p.entidade_id).order('nome').limit(5000) : Promise.resolve({ data: [] as { id: string; nome: string; email: string | null }[] }),
    nivel >= 1 && p.categoria_id ? verbaDaCategoria(supabase, context.workspace.id, p.entidade_id, p.categoria_id, new Date().toISOString().slice(0, 7), p.id) : Promise.resolve(null),
    podeEnviar || podeCotar ? caixasQuePodeUsar(context) : Promise.resolve([]),
    podeLancar ? supabase.from('fin_contas').select('id,nome').eq('workspace_id', context.workspace.id).eq('entidade_id', p.entidade_id).eq('ativa', true).order('nome') : Promise.resolve({ data: [] as { id: string; nome: string }[] }),
    p.lancamento_id ? supabase.from('fin_lancamentos').select('id,descricao').eq('id', p.lancamento_id).maybeSingle() : Promise.resolve({ data: null }),
    // Plaquetas e nomes do estoque: quem pediu não lê o Patrimônio, mas vê para onde foi o que comprou.
    bensIds.length ? admin.from('pat_bens').select('id,plaqueta').in('id', bensIds) : Promise.resolve({ data: [] as { id: string; plaqueta: string }[] }),
    estIds.length ? admin.from('est_itens').select('id,nome,unidade').in('id', estIds) : Promise.resolve({ data: [] as { id: string; nome: string; unidade: string }[] }),
    darEntrada ? supabase.from('est_itens').select('id,nome,unidade,controla_validade').eq('workspace_id', context.workspace.id).eq('ativo', true).eq('eh_kit', false).order('nome').limit(2000) : Promise.resolve({ data: [] as { id: string; nome: string; unidade: string; controla_validade: boolean }[] }),
    darEntrada ? supabase.from('pat_locais').select('id,nome').eq('workspace_id', context.workspace.id).eq('ativo', true).order('nome') : Promise.resolve({ data: [] as { id: string; nome: string }[] }),
    darEntrada ? supabase.from('pat_categorias').select('id,nome').eq('workspace_id', context.workspace.id).eq('ativa', true).order('nome') : Promise.resolve({ data: [] as { id: string; nome: string }[] }),
  ])
  const fornecedorDe = new Map((favs ?? []).map((f) => [f.id, f.nome as string]))

  // Os habituais: quem vende a categoria do pedido e quem já mandou proposta em compras dela.
  const [{ data: vendem }, { data: jaCotaram }] = podeCotar && p.categoria_id
    ? await Promise.all([
        supabase.from('fin_favorecido_categorias').select('favorecido_id').eq('categoria_id', p.categoria_id).limit(5000),
        supabase.from('compras_propostas').select('favorecido_id,compras_pedidos!inner(categoria_id)').eq('workspace_id', context.workspace.id)
          .eq('compras_pedidos.categoria_id', p.categoria_id).neq('pedido_id', id).limit(5000),
      ])
    : [{ data: [] as { favorecido_id: string }[] }, { data: [] as { favorecido_id: string }[] }]
  const cotacoes = new Map<string, number>()
  for (const x of jaCotaram ?? []) cotacoes.set(x.favorecido_id as string, (cotacoes.get(x.favorecido_id as string) ?? 0) + 1)
  const convites: ConviteNaTela[] = (convitesBrutos ?? []).map((c) => ({ ...c, fornecedor: fornecedorDe.get(c.favorecido_id) ?? 'Fornecedor' })) as ConviteNaTela[]
  const sugestoes = podeCotar
    ? sugerirFornecedores((fornecedores ?? []) as { id: string; nome: string; email: string | null }[], {
        vendem: new Set((vendem ?? []).map((x) => x.favorecido_id as string)), cotacoes,
        convidados: new Set(convites.filter((c) => !c.cancelado_em).map((c) => c.favorecido_id)),
      })
    : []
  const nomeDe = new Map((perfis ?? []).map((x) => [x.id, x.full_name as string]))
  const propostas: PropostaNaTela[] = (propostasBrutas ?? []).map((x) => ({
    id: x.id, favorecido_id: x.favorecido_id, fornecedor: fornecedorDe.get(x.favorecido_id) ?? 'Fornecedor', frete: Number(x.frete),
    recebida_em: x.recebida_em, validade: x.validade, prazo_entrega: x.prazo_entrega, condicao_pagamento: x.condicao_pagamento, observacao: x.observacao,
    arquivo_nome: x.arquivo_nome, tem_arquivo: Boolean(x.arquivo_caminho),
    precos: ((x.compras_proposta_itens ?? []) as { item_id: string; valor_unitario: number | null }[]).map((pi) => ({ item_id: pi.item_id, valor_unitario: pi.valor_unitario === null ? null : Number(pi.valor_unitario) })),
  }))

  const ehSolicitante = p.solicitante_id === eu
  const podeEditar = (estado === 'aberto' && (ehSolicitante || nivel >= 2)) || (estado === 'em_cotacao' && nivel >= 2)
  // Depois que algo chegou ou a conta foi lançada, a compra não se cancela mais (o banco confere o mesmo).
  const podeCancelar = !['cancelado', 'recusado', 'recebido_parcial', 'recebido'].includes(estado) && !p.lancamento_id
    && ((ehSolicitante && ['aberto', 'em_cotacao', 'em_aprovacao'].includes(estado)) || nivel >= 2)
  const etapas = [
    { papel: 'financeiro' as const, rotulo: 'Financeiro', feita: p.aprovado_fin_em ? { por: nomeDe.get(p.aprovado_fin_por) ?? 'alguém', em: quando(p.aprovado_fin_em) } : null, minhaVez: nivel >= 3 && !ehSolicitante && p.aprovado_dir_por !== eu },
    ...(p.exige_diretoria ? [{ papel: 'diretoria' as const, rotulo: 'Diretoria', feita: p.aprovado_dir_em ? { por: nomeDe.get(p.aprovado_dir_por) ?? 'alguém', em: quando(p.aprovado_dir_em) } : null, minhaVez: diretoria && !ehSolicitante && p.aprovado_fin_por !== eu }] : []),
  ]
  const estimado = totalEstimado(itens)
  const hoje = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date())
  const codigoDaOrdem = p.oc_numero ? numeroDaOrdem(p.oc_ano, p.oc_numero) : null
  const escolhida = propostas.find((x) => x.id === p.proposta_id)
  const emailDoFornecedor = escolhida ? ((favs ?? []).find((f) => f.id === escolhida.favorecido_id)?.email ?? '') : ''
  const recebidos = (recebimentos ?? []).flatMap((r) => ((r.compras_recebimento_itens ?? []) as { item_id: string; quantidade: number }[]).map((x) => ({ item_id: x.item_id, quantidade: Number(x.quantidade) })))
  const falta = faltaReceber(itens, recebidos)
  const podeReceber = (ehSolicitante || nivel >= 2) && (estado === 'emitido' || estado === 'recebido_parcial')
  const itemDe = new Map(itens.map((i) => [i.id, i]))
  const custo = escolhida ? custoComFrete(itens, escolhida) : new Map<string, number>()
  const livre = semDestino(recebidos, (destinos ?? []).map((d) => ({ item_id: d.item_id, quantidade: Number(d.quantidade) })))
  const plaqueta = new Map((bens ?? []).map((b) => [b.id, b.plaqueta as string]))
  const estDe = new Map((estNomes ?? []).map((e) => [e.id, e as { id: string; nome: string; unidade: string }]))
  const registros = (destinos ?? []).map((d) => {
    const item = itemDe.get(d.item_id)
    const q = quantidade(Number(d.quantidade), item?.unidade)
    const est = d.est_item_id ? estDe.get(d.est_item_id) : undefined
    const detalhe = d.tipo === 'estoque'
      ? `${q} de ${item?.descricao ?? 'item'}${est ? ` → ${quantidade(Number(d.est_quantidade ?? d.quantidade), est.unidade)} em “${est.nome}”` : ''}`
      : d.tipo === 'patrimonio'
        ? `${q} de ${item?.descricao ?? 'item'} → ${((d.bens ?? []) as string[]).map((b) => plaqueta.get(b) ?? 'bem').join(', ')}`
        : `${q} de ${item?.descricao ?? 'item'}${d.observacao ? ` — ${d.observacao}` : ''}`
    return { id: d.id, item_id: d.item_id, tipo: d.tipo as Destino, quantidade: Number(d.quantidade), detalhe, por: nomeDe.get(d.por ?? '') ?? 'alguém', em: quando(d.created_at) }
  })

  // Fracionamento: só enquanto a compra está sendo cotada ou decidida, para quem cota ou aprova.
  const mapa = mapaComparativo(itens, propostas)
  const valorDaCompra = p.valor_aprovado !== null ? Number(p.valor_aprovado) : mapa.maisBarata ? (mapa.totais.get(mapa.maisBarata)?.total ?? 0) : estimado
  const alerta = ['aberto', 'em_cotacao', 'em_aprovacao'].includes(estado) && (nivel >= 2 || diretoria)
    ? fracionamento(valorDaCompra, await comprasParecidas(admin, p, escolhida?.favorecido_id ?? null), regras)
    : null

  return (
    <div className="flex flex-col gap-5">
      <div>
        <Link href="/financeiro/compras" className="mb-3 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"><ArrowLeft className="size-4" />Pedidos de compra</Link>
        <div data-ajuda="compras.estado" className="flex flex-wrap items-start justify-between gap-3">
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

      {alerta && (
        <Card className="border-warning/40 bg-warning/10 p-4 text-sm" data-fracionamento role="note">
          <p className="font-medium">Atenção: possível fracionamento</p>
          <p className="mt-1">
            Somada a {alerta.parecidas.length === 1 ? 'outra compra parecida' : `${alerta.parecidas.length} compras parecidas`} dos últimos {JANELA_DE_FRACIONAMENTO_DIAS} dias
            (mesma categoria ou mesmo fornecedor), esta compra chega a <span className="font-semibold">{reais(alerta.soma)}</span>, faixa que pede {alerta.juntas.propostas} {alerta.juntas.propostas === 1 ? 'proposta' : 'propostas'}
            {alerta.juntas.diretoria && ' e a aprovação da Diretoria'}. Sozinha, pediria {alerta.sozinha.propostas} {alerta.sozinha.propostas === 1 ? 'proposta' : 'propostas'}{alerta.sozinha.diretoria && ' e a Diretoria'}.
          </p>
          <ul className="mt-2 flex flex-col gap-0.5 text-xs">
            {alerta.parecidas.map((c) => (
              <li key={c.id}>
                <Link href={`/financeiro/compras/${c.id}`} className="font-mono underline underline-offset-2">{c.codigo}</Link> {c.titulo} — {reais(c.valor)}
                <span className="text-muted-foreground"> ({[c.mesmaCategoria && 'mesma categoria', c.mesmoFornecedor && 'mesmo fornecedor'].filter(Boolean).join(', ')})</span>
              </li>
            ))}
          </ul>
          <p className="mt-2 text-xs text-muted-foreground">Se forem necessidades independentes, pode seguir. Se for a mesma necessidade dividida, junte num pedido só: as regras de compra valem pelo total.</p>
        </Card>
      )}

      {(podeCotar || convites.length > 0) && (
        <PedirPropostas pedidoId={id} podeCotar={podeCotar} convites={convites} sugestoes={sugestoes} categoria={categoria?.nome ?? null}
          caixas={caixas.map((c) => ({ id: c.id, email: c.email }))} prazoSugerido={prazoPadrao(hoje)} prazoAtual={(p.cotacao_prazo as string | null) ?? null} hoje={hoje}
          minimas={exigencias(Number(p.valor_aprovado ?? estimado), regras).propostas} />
      )}
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

      {['em_aprovacao', 'aprovado', 'recusado', ...DEPOIS_DA_ORDEM].includes(estado) && p.enviado_aprovacao_em && (
        <Aprovacao pedidoId={id} etapas={etapas} emAprovacao={estado === 'em_aprovacao'} />
      )}

      {(estado === 'aprovado' || depoisDaOrdem) && (
        <OrdemDeCompra pedidoId={id} codigo={codigoDaOrdem} podeEmitir={nivel >= 2 && estado === 'aprovado'} podeEnviar={podeEnviar}
          emitida={p.oc_emitida_em ? { por: nomeDe.get(p.oc_emitida_por) ?? 'alguém', em: quando(p.oc_emitida_em) } : null}
          enviada={p.oc_enviada_em ? { para: p.oc_enviada_para ?? '', por: nomeDe.get(p.oc_enviada_por) ?? 'alguém', em: quando(p.oc_enviada_em) } : null}
          caixas={caixas.map((c) => ({ id: c.id, email: c.email }))} paraInicial={emailDoFornecedor}
          mensagemInicial={codigoDaOrdem ? mensagemAoFornecedor(codigoDaOrdem, p.titulo, Number(p.valor_aprovado ?? 0)) : ''} />
      )}

      {depoisDaOrdem && (
        <section data-ajuda="compras.recebimento" className="flex flex-col gap-3 rounded-xl border border-border bg-card p-5" aria-label="Recebimento" data-recebimentos>
          <p className="font-medium">Recebimento</p>
          {(recebimentos ?? []).length === 0
            ? <p className="text-sm text-muted-foreground">Nada chegou ainda.{podeReceber && ' Quando chegar, confira contra a ordem e registre aqui.'}</p>
            : (
              <ul className="flex flex-col gap-2 text-sm">
                {(recebimentos ?? []).map((r) => (
                  <li key={r.id}>
                    <span className="font-medium">{dataCurta(r.recebido_em)}</span>
                    {r.nota_fiscal && <> · NF {r.nota_fiscal}</>} · registrado por {nomeDe.get(r.por) ?? 'alguém'}:{' '}
                    {((r.compras_recebimento_itens ?? []) as { item_id: string; quantidade: number }[]).map((x) => {
                      const item = itemDe.get(x.item_id)
                      return `${quantidade(Number(x.quantidade), item?.unidade)} de ${item?.descricao ?? 'item'}`
                    }).join('; ')}
                    {r.observacao && <span className="block text-xs text-muted-foreground">{r.observacao}</span>}
                  </li>
                ))}
              </ul>
            )}
          {estado === 'recebido' && <p className="text-sm text-success">Tudo o que foi pedido chegou.</p>}
          {podeReceber && (
            <Recebimento pedidoId={id} hoje={hoje}
              itens={itens.map((i) => ({ id: i.id, descricao: i.descricao, unidade: i.unidade, pedido: i.quantidade, falta: falta.get(i.id) ?? 0 }))} />
          )}
        </section>
      )}

      {chegou && (
        <EntradaDoQueChegou pedidoId={id} registros={registros} pode={patrimonio} concluida={Boolean(p.entrada_concluida_em)}
          opcoes={{ estoque: estOpcoes ?? [], locais: locais ?? [], categorias: patCategorias ?? [] }}
          itens={itens.map((i) => ({ id: i.id, descricao: i.descricao, unidade: i.unidade, semDestino: livre.get(i.id) ?? 0, custo: custo.get(i.id) ?? null }))} />
      )}

      {depoisDaOrdem && (nivel >= 2 || p.lancamento_id) && (
        <section className="flex flex-col gap-3 rounded-xl border border-border bg-card p-5" aria-label="Conta a pagar">
          <p className="font-medium">Conta a pagar</p>
          {p.lancamento_id && !lancamento
            ? <p className="text-sm">A conta a pagar desta compra já foi lançada no Financeiro.</p>
            : nivel >= 2 && (
              <ContaAPagar pedidoId={id} contas={contas ?? []} aprovado={Number(p.valor_aprovado ?? 0)} hoje={hoje}
                lancamento={lancamento ? { id: lancamento.id, descricao: lancamento.descricao } : null} />
            )}
          {!p.lancamento_id && estado !== 'recebido' && nivel >= 2 && (
            <p className="text-xs text-muted-foreground">Dá para lançar antes de chegar tudo (pagamento antecipado), mas o costume é conferir o recebimento e a nota fiscal primeiro.</p>
          )}
        </section>
      )}

      <section data-ajuda="compras.historico" className="rounded-xl border border-border bg-card p-5" aria-label="Histórico">
        <p className="mb-3 font-medium">Histórico</p>
        <ol className="flex flex-col gap-2 text-sm" data-historico>
          {(historico ?? []).map((h) => {
            const d = (h.detalhe ?? {}) as Record<string, unknown>
            // Sem autor e com fornecedor: foi o próprio fornecedor, pelo link.
            const peloFornecedor = !h.por && typeof d.fornecedor === 'string'
            return (
              <li key={h.id} className="flex flex-wrap gap-x-2">
                <span className="tabular-nums text-muted-foreground">{quando(h.em)}</span>
                <span><span className="font-medium">{peloFornecedor ? d.fornecedor as string : nomeDe.get(h.por) ?? 'Alguém'}</span> {ACOES[h.acao] ?? h.acao}
                  {typeof d.fornecedor === 'string' && !peloFornecedor && ` de ${d.fornecedor}`}
                  {h.acao === 'propostas_pedidas' && typeof d.quantos === 'number' && ` (${d.quantos} ${d.quantos === 1 ? 'fornecedor' : 'fornecedores'}${typeof d.prazo === 'string' ? `, prazo ${dataCurta(d.prazo)}` : ''})`}
                  {typeof d.total === 'number' && ` — ${reais(d.total)}`}
                  {typeof d.motivo === 'string' && d.motivo && `: ${d.motivo}`}
                  {typeof d.observacao === 'string' && d.observacao && `: ${d.observacao}`}
                  {typeof d.ordem === 'string' && ` ${d.ordem}`}
                  {typeof d.para === 'string' && d.para && ` (${d.para})`}
                  {h.acao === 'recebido' && d.completo === false && ' (em parte)'}
                  {typeof d.nota_fiscal === 'string' && d.nota_fiscal && ` — NF ${d.nota_fiscal}`}
                  {typeof d.parcelas === 'number' && d.parcelas > 1 && ` em ${d.parcelas} parcelas`}
                  {typeof d.item === 'string' && typeof d.quantidade === 'number' && `: ${quantidade(d.quantidade)} de ${d.item}`}
                </span>
              </li>
            )
          })}
        </ol>
      </section>
    </div>
  )
}

function mensagemAoFornecedor(codigo: string, titulo: string, total: number) {
  return [
    'Prezados,',
    `Segue anexa a ordem de compra ${codigo}, referente a “${titulo}”, no valor total de ${reais(total)}.`,
    `Pedimos que a nota fiscal seja emitida em nome do comprador indicado na ordem, citando o número ${codigo}, e que a entrega siga o prazo e o local descritos no documento.`,
    'Por favor, confirmem o recebimento desta mensagem e a previsão de entrega.',
    'Obrigado,',
  ].join('\n\n')
}

function Dado({ rotulo, children, largo }: { rotulo: string; children: React.ReactNode; largo?: boolean }) {
  return (
    <div className={largo ? 'sm:col-span-2 lg:col-span-4' : ''}>
      <p className="text-xs font-medium text-muted-foreground">{rotulo}</p>
      <div className="mt-0.5 whitespace-pre-wrap">{children}</div>
    </div>
  )
}
