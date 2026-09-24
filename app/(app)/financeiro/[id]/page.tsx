import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ChevronLeft, Landmark, Lock, Pencil } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { PageHeader } from '@/components/app/page-header'
import { hojeEmSaoPaulo } from '@/components/app/projetos/comum'
import { Anexos, Decisao, DesfazerPagamento, Excluir, Pagar, type Anexo } from '@/components/app/financeiro/acoes'
import { cadastrosDoFinanceiro, contextoDoFinanceiro, lerLinha } from '@/lib/financeiro/acesso'
import { COLUNAS_DO_LANCAMENTO, FORMAS, SITUACOES, TIPOS, dataCurta, documentoLegivel, nomeDoMes, reais, situacao, type Lancamento } from '@/lib/financeiro/regras'

export const metadata = { title: 'Lançamento' }
export const dynamic = 'force-dynamic'

const ACOES: Record<string, string> = {
  criar: 'lançou', editar: 'editou', pagar: 'marcou como pago', desfazer_pagamento: 'desfez o pagamento', aprovar: 'aprovou', recusar: 'recusou',
  anexar: 'juntou um arquivo', excluir_anexo: 'excluiu um arquivo',
}

function Dado({ rotulo, children }: { rotulo: string; children: React.ReactNode }) {
  return <div><dt className="text-xs text-muted-foreground">{rotulo}</dt><dd className="text-sm">{children || '—'}</dd></div>
}

export default async function LancamentoPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound()
  const { context, supabase, nivel } = await contextoDoFinanceiro()
  if (nivel < 1) notFound()
  const { data } = await supabase.from('fin_lancamentos').select(COLUNAS_DO_LANCAMENTO).eq('id', id).eq('workspace_id', context.workspace.id).maybeSingle()
  if (!data) notFound()
  const l = lerLinha(data) as Lancamento
  const c = await cadastrosDoFinanceiro(l.entidade_id)
  const hoje = hojeEmSaoPaulo()

  const [{ data: anexos }, { data: grupo }, { data: historico }, { data: membros }, { data: noExtrato }] = await Promise.all([
    supabase.from('fin_anexos').select('id,nome_original,tipo_doc,mime,tamanho,sha256,created_at,enviado_por').eq('lancamento_id', id).order('created_at'),
    l.grupo_id ? supabase.from('fin_lancamentos').select('id,descricao,vencimento,valor,pago_em,valor_pago,tipo,aprovacao').eq('grupo_id', l.grupo_id).order('vencimento') : Promise.resolve({ data: [] }),
    nivel >= 4 ? supabase.from('fin_auditoria').select('acao,created_at,user_id,detalhe').eq('lancamento_id', id).order('created_at', { ascending: false }).limit(30) : Promise.resolve({ data: [] }),
    supabase.from('workspace_members').select('user_id,profiles(full_name)').eq('workspace_id', context.workspace.id),
    supabase.from('fin_extrato').select('conta_id,data,descricao').eq('lancamento_id', id),
  ])
  const nomes: Record<string, string> = Object.fromEntries((membros ?? []).map((m) => [m.user_id as string, ((Array.isArray(m.profiles) ? m.profiles[0] : m.profiles) as { full_name?: string } | null)?.full_name ?? 'Alguém']))

  const s = situacao(l, hoje)
  const fechado = Boolean(l.pago_em && c.config.fechado_ate && l.pago_em <= c.config.fechado_ate)
  const conta = (x: string | null) => c.contas.find((k) => k.id === x)?.nome
  const fonte = c.fontes.find((f) => f.id === l.fonte_id)
  const favorecido = c.favorecidos.find((f) => f.id === l.favorecido_id)
  const ehQuemLancou = l.criado_por === context.user.id

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-6">
      <Link href="/financeiro" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"><ChevronLeft className="size-4" />Financeiro</Link>
      <PageHeader
        title={l.descricao}
        description={`${TIPOS[l.tipo].rotulo}${l.parcela ? ` · parcela ${l.parcela} de ${l.parcelas}` : l.recorrente ? ' · todo mês' : ''}`}
        actions={nivel >= 2 && !fechado ? (
          <div className="flex flex-wrap items-start gap-2">
            {!l.pago_em && l.aprovacao !== 'pendente' && l.aprovacao !== 'recusada' && (
              <Pagar id={l.id} tipo={l.tipo} valor={l.valor} contaId={l.conta_id} forma={l.forma} contas={c.contas.filter((x) => x.ativa && x.id !== l.conta_destino_id)} hoje={hoje} />
            )}
            {l.pago_em && <DesfazerPagamento id={l.id} />}
            <Button variant="outline" render={<Link href={`/financeiro/${l.id}/editar`} />}><Pencil className="size-4" />Editar</Button>
            {!l.pago_em && <Excluir id={l.id} emGrupo={Boolean(l.grupo_id)} />}
          </div>
        ) : undefined}
      />

      {fechado && <p className="flex items-center gap-2 rounded-lg bg-muted px-3 py-2 text-sm text-muted-foreground"><Lock className="size-4" />Pago num mês já fechado: não muda mais.</p>}

      {l.aprovacao !== 'nao_exige' && (
        <Card className={`p-5 ${l.aprovacao === 'pendente' ? 'border-warning/60' : l.aprovacao === 'recusada' ? 'border-destructive/40' : ''}`} id="aprovacao">
          {l.aprovacao === 'pendente' && (
            <>
              <p className="font-medium">Esperando aprovação</p>
              <p className="mb-3 text-sm text-muted-foreground">Só pode ser paga depois de aprovada por alguém com nível Aprovar ou Gestão{l.criado_por ? `, que não seja ${nomes[l.criado_por] ?? 'quem lançou'}` : ''}.</p>
              {nivel >= 3 && !ehQuemLancou ? <Decisao id={l.id} /> : ehQuemLancou ? <p className="text-xs text-muted-foreground">Você lançou esta despesa, então outra pessoa precisa aprovar.</p> : null}
            </>
          )}
          {l.aprovacao === 'aprovada' && <p className="text-sm">Aprovada por <span className="font-medium">{l.aprovado_por ? nomes[l.aprovado_por] ?? 'alguém' : 'alguém'}</span>{l.aprovado_em ? ` em ${new Date(l.aprovado_em).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', dateStyle: 'short', timeStyle: 'short' })}` : ''}.</p>}
          {l.aprovacao === 'recusada' && (
            <div className="text-sm">
              <p><span className="font-medium text-destructive">Recusada</span> por {l.aprovado_por ? nomes[l.aprovado_por] ?? 'alguém' : 'alguém'}.</p>
              {l.motivo_recusa && <p className="mt-1 whitespace-pre-line text-muted-foreground">“{l.motivo_recusa}”</p>}
              {nivel >= 2 && <p className="mt-2 text-xs text-muted-foreground">Corrija e salve pela edição para pedir aprovação de novo, ou exclua.</p>}
            </div>
          )}
        </Card>
      )}

      <div className="grid gap-6 lg:grid-cols-[1fr_20rem]">
        <Card className="p-5">
          <div className="mb-4 flex flex-wrap items-baseline justify-between gap-2">
            <p className={`text-3xl font-bold tabular-nums ${l.tipo === 'receita' ? 'text-success' : ''}`}>{reais(l.valor)}</p>
            <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${SITUACOES[s].classe}`}>{SITUACOES[s].rotulo}</span>
          </div>
          <dl className="grid gap-4 sm:grid-cols-2">
            <Dado rotulo={l.tipo === 'receita' ? 'Data prevista' : 'Vencimento'}>{dataCurta(l.vencimento)}</Dado>
            <Dado rotulo="Competência"><span className="capitalize">{nomeDoMes(l.competencia.slice(0, 7))}</span></Dado>
            {l.pago_em && <Dado rotulo={l.tipo === 'receita' ? 'Recebido em' : 'Pago em'}>{dataCurta(l.pago_em)}</Dado>}
            {l.pago_em && <Dado rotulo={l.tipo === 'receita' ? 'Valor recebido' : 'Valor pago'}>{reais(l.valor_pago ?? l.valor)}{l.valor_pago !== null && l.valor_pago !== l.valor ? <span className="text-xs text-muted-foreground"> ({l.valor_pago > l.valor ? 'juros/multa' : 'desconto'} de {reais(Math.abs(l.valor_pago - l.valor))})</span> : null}</Dado>}
            <Dado rotulo={l.tipo === 'transferencia' ? 'De' : 'Conta'}>{conta(l.conta_id)}</Dado>
            {l.tipo === 'transferencia' && <Dado rotulo="Para">{conta(l.conta_destino_id)}</Dado>}
            {l.tipo !== 'transferencia' && <Dado rotulo="Categoria">{c.categorias.find((k) => k.id === l.categoria_id)?.nome}</Dado>}
            <Dado rotulo="Fonte do recurso">{fonte ? <>{fonte.nome}{fonte.restrita && <span className="ml-1.5 rounded-full bg-warning/20 px-1.5 py-0.5 text-[10px] font-semibold text-warning-foreground">com destino</span>}</> : null}</Dado>
            <Dado rotulo="Projeto">{c.projetos.find((p) => p.id === l.projeto_id)?.name}</Dado>
            {l.tipo !== 'transferencia' && <Dado rotulo={l.tipo === 'receita' ? 'Quem pagou' : 'Favorecido'}>{favorecido ? <>{favorecido.nome}{favorecido.documento && <span className="block text-xs text-muted-foreground">{documentoLegivel(favorecido.documento)}{favorecido.chave_pix ? ` · Pix ${favorecido.chave_pix}` : ''}</span>}</> : null}</Dado>}
            <Dado rotulo="Forma">{l.forma ? FORMAS[l.forma as keyof typeof FORMAS] : null}</Dado>
            <Dado rotulo="Nº do documento">{l.documento}</Dado>
          </dl>
          {(noExtrato ?? []).map((x, i) => (
            <p key={i} className="mt-3 flex items-center gap-1.5 text-xs text-success" data-conciliado>
              <Landmark className="size-3.5" />Conciliado com o extrato de {conta(x.conta_id as string)}: {dataCurta(x.data as string)} · {x.descricao as string}
            </p>
          ))}
          {l.observacao && <p className="mt-4 whitespace-pre-line border-t border-border pt-4 text-sm text-muted-foreground">{l.observacao}</p>}
          <p className="mt-4 border-t border-border pt-3 text-xs text-muted-foreground">
            Lançado{l.criado_por ? ` por ${nomes[l.criado_por] ?? 'alguém'}` : ''} em {new Date(l.created_at).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', dateStyle: 'short', timeStyle: 'short' })}
          </p>
        </Card>

        <div className="flex flex-col gap-6">
          <Card className="p-5">
            <h2 className="mb-3 font-semibold">Comprovantes e notas</h2>
            <Anexos lancamentoId={l.id} anexos={(anexos ?? []) as Anexo[]} podeEnviar={nivel >= 2} pago={Boolean(l.pago_em)} nomes={nomes} />
          </Card>
          {(grupo ?? []).length > 1 && (
            <Card className="p-5" id="grupo">
              <h2 className="mb-3 font-semibold">{l.parcelas ? 'Parcelas' : 'Todos os meses'}</h2>
              <ul className="flex flex-col gap-1 text-sm">
                {(grupo ?? []).map((g) => {
                  const sg = situacao({ tipo: g.tipo as Lancamento['tipo'], vencimento: g.vencimento as string, pago_em: g.pago_em as string | null, aprovacao: g.aprovacao as Lancamento['aprovacao'] }, hoje)
                  return (
                    <li key={g.id as string}>
                      <Link href={`/financeiro/${g.id}`} className={`flex items-center justify-between gap-2 rounded px-2 py-1 hover:bg-muted ${g.id === l.id ? 'bg-muted font-medium' : ''}`}>
                        <span className="tabular-nums">{dataCurta(g.vencimento as string)}</span>
                        <span className="tabular-nums">{reais(Number(g.valor_pago ?? g.valor))}</span>
                        <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-semibold ${SITUACOES[sg].classe}`}>{SITUACOES[sg].rotulo}</span>
                      </Link>
                    </li>
                  )
                })}
              </ul>
            </Card>
          )}
          {(historico ?? []).length > 0 && (
            <Card className="p-5" id="historico">
              <h2 className="mb-3 font-semibold">Histórico</h2>
              <ul className="flex flex-col gap-2 text-xs">
                {(historico ?? []).map((h, i) => (
                  <li key={i}><span className="font-medium">{h.user_id ? nomes[h.user_id as string] ?? 'Alguém' : 'Sistema'}</span> {ACOES[h.acao as string] ?? h.acao}
                    <span className="block text-muted-foreground">{new Date(h.created_at as string).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', dateStyle: 'short', timeStyle: 'short' })}</span></li>
                ))}
              </ul>
            </Card>
          )}
        </div>
      </div>
    </div>
  )
}
