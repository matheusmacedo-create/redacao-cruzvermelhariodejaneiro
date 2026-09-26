import Link from 'next/link'
import { notFound } from 'next/navigation'
import { Card } from '@/components/ui/card'
import { PageHeader } from '@/components/app/page-header'
import { SecoesDoFinanceiro } from '@/components/app/financeiro/secoes'
import { ConciliarSugestoes, Desconciliar, ExcluirImportacao, ImportarExtrato, LinhaPendente, type CandidatoNaTela } from '@/components/app/financeiro/conciliacao'
import { cadastrosDoFinanceiro, contextoDoFinanceiro, lerLinha } from '@/lib/financeiro/acesso'
import { candidatos, normalizarDescricao, sugestoes, type Candidato } from '@/lib/financeiro/extrato'
import { dataCurta, reais, saldos, somarMeses, type Lancamento } from '@/lib/financeiro/regras'

export const metadata = { title: 'Conciliação bancária' }
export const dynamic = 'force-dynamic'

type Linha = { id: string; data: string; valor: number; descricao: string; documento: string | null; situacao: string; lancamento_id: string | null; motivo: string | null; importacao_id: string }

/**
 * Conciliação: o extrato do banco, linha a linha, casado com os lançamentos.
 * O Redação sugere quando há um único lançamento com o mesmo valor e data
 * próxima; o resto quem concilia escolhe, cria ou ignora (com motivo).
 */
export default async function Conciliacao({ searchParams }: { searchParams: Promise<{ conta?: string; aba?: string }> }) {
  const sp = await searchParams
  const { context, supabase, nivel } = await contextoDoFinanceiro()
  if (nivel < 1) notFound()
  const ws = context.workspace.id
  const c = await cadastrosDoFinanceiro()
  const contas = c.contas.filter((x) => x.ativa)
  const conta = contas.find((x) => x.id === sp.conta) ?? contas[0]
  const aba = sp.aba === 'conciliadas' || sp.aba === 'importacoes' ? sp.aba : 'pendentes'

  if (!conta) {
    return (
      <div className="flex flex-col gap-6">
        <SecoesDoFinanceiro atual="/financeiro/conciliacao" empresas={c.empresas} empresa={c.empresa} />
        <PageHeader title="Conciliação bancária" />
        <Card className="p-6 text-sm text-muted-foreground">Cadastre antes uma conta em <Link href="/financeiro/cadastros" className="font-medium text-primary hover:underline">Cadastros</Link>.</Card>
      </div>
    )
  }

  const [{ data: brutas }, { data: importacoes }, { data: contagem }] = await Promise.all([
    supabase.from('fin_extrato').select('id,data,valor,descricao,documento,situacao,lancamento_id,motivo,importacao_id').eq('conta_id', conta.id)
      .eq('situacao', aba === 'pendentes' ? 'pendente' : aba === 'conciliadas' ? 'conciliado' : 'pendente')
      .order('data', { ascending: aba === 'pendentes' }).limit(aba === 'pendentes' ? 2000 : 300),
    supabase.from('fin_importacoes').select('id,arquivo,formato,inicio,fim,linhas,novas,saldo_banco,saldo_em,importado_por,created_at').eq('conta_id', conta.id).order('created_at', { ascending: false }).limit(50),
    supabase.from('fin_extrato').select('situacao').eq('conta_id', conta.id).limit(20000),
  ])
  const linhas = (brutas ?? []).map((l) => ({ ...l, valor: Number(l.valor) })) as Linha[]
  const porSituacao = (s: string) => (contagem ?? []).filter((x) => x.situacao === s).length
  const { data: ignoradasBrutas } = aba === 'conciliadas'
    ? await supabase.from('fin_extrato').select('id,data,valor,descricao,documento,situacao,lancamento_id,motivo,importacao_id').eq('conta_id', conta.id).eq('situacao', 'ignorado').order('data', { ascending: false }).limit(100)
    : { data: [] }

  // Lançamentos desta conta que ainda não têm linha nesta conta, perto das datas pendentes.
  let pares: { extrato: string; lancamento: string }[] = []
  const candidatosPorLinha = new Map<string, CandidatoNaTela[]>()
  const sugestaoPorLinha = new Map<string, CandidatoNaTela>()
  const padraoPorDescricao = new Map<string, { categoria_id: string; fonte_id: string; favorecido_id: string }>()
  let lancamentosPorId = new Map<string, Lancamento>()
  if (aba === 'pendentes' && linhas.length) {
    const datas = linhas.map((l) => l.data).sort()
    const de = somarMeses(datas[0], -2)
    const ate = somarMeses(datas[datas.length - 1], 2)
    const [{ data: lancs }, { data: jaLigados }, { data: historico }] = await Promise.all([
      supabase.from('fin_lancamentos').select('id,tipo,descricao,valor,valor_pago,conta_id,conta_destino_id,vencimento,pago_em,aprovacao,favorecido_id')
        .eq('workspace_id', ws).or(`conta_id.eq.${conta.id},conta_destino_id.eq.${conta.id}`)
        .or(`and(pago_em.gte.${de},pago_em.lte.${ate}),and(pago_em.is.null,vencimento.gte.${de},vencimento.lte.${ate})`).limit(5000),
      supabase.from('fin_extrato').select('lancamento_id').eq('conta_id', conta.id).not('lancamento_id', 'is', null).limit(20000),
      // O que já foi criado a partir do extrato ensina a categoria das próximas linhas parecidas.
      supabase.from('fin_extrato').select('descricao,fin_lancamentos(categoria_id,fonte_id,favorecido_id)').eq('conta_id', conta.id).eq('situacao', 'conciliado').order('data', { ascending: false }).limit(500),
    ])
    const ligados = new Set((jaLigados ?? []).map((x) => x.lancamento_id as string))
    const livres = (lancs ?? []).filter((l) => !ligados.has(l.id as string)).map((l) => lerLinha(l)) as (Candidato & { favorecido_id: string | null })[]
    lancamentosPorId = new Map(livres.map((l) => [l.id, l as unknown as Lancamento]))
    const favorecido = new Map(c.favorecidos.map((f) => [f.id, f.nome]))
    const rotulo = (l: Candidato & { favorecido_id: string | null }) => `${l.descricao}${l.favorecido_id && favorecido.get(l.favorecido_id) ? ` (${favorecido.get(l.favorecido_id)})` : ''} · ${reais(l.pago_em ? (l.valor_pago ?? l.valor) : l.valor)} · ${l.pago_em ? `pago ${dataCurta(l.pago_em)}` : `vence ${dataCurta(l.vencimento)}`}`
    for (const linha of linhas) {
      candidatosPorLinha.set(linha.id, candidatos(linha, conta.id, livres).slice(0, 12).map((x) => ({ id: x.id, rotulo: rotulo(x), mesmoValor: x.mesmoValor })))
    }
    for (const [linha, lanc] of sugestoes(linhas, conta.id, livres)) {
      const l = livres.find((x) => x.id === lanc)!
      sugestaoPorLinha.set(linha, { id: lanc, rotulo: rotulo(l), mesmoValor: true })
    }
    pares = [...sugestaoPorLinha].map(([extrato, s]) => ({ extrato, lancamento: s.id }))
    for (const h of historico ?? []) {
      const l = (Array.isArray(h.fin_lancamentos) ? h.fin_lancamentos[0] : h.fin_lancamentos) as { categoria_id: string | null; fonte_id: string; favorecido_id: string | null } | null
      const chave = normalizarDescricao(h.descricao as string)
      if (l?.categoria_id && chave && !padraoPorDescricao.has(chave)) padraoPorDescricao.set(chave, { categoria_id: l.categoria_id, fonte_id: l.fonte_id, favorecido_id: l.favorecido_id ?? '' })
    }
  }

  // Saldo do banco (do último OFX com saldo) contra o saldo do Redação na mesma data.
  const ultimoSaldo = (importacoes ?? []).find((i) => i.saldo_banco !== null && i.saldo_em)
  let conferencia: { banco: number; redacao: number; em: string } | null = null
  if (ultimoSaldo) {
    const { data: pagos } = await supabase.from('fin_lancamentos').select('tipo,conta_id,conta_destino_id,valor,valor_pago,pago_em').eq('workspace_id', ws)
      .or(`conta_id.eq.${conta.id},conta_destino_id.eq.${conta.id}`).not('pago_em', 'is', null).lte('pago_em', ultimoSaldo.saldo_em as string).limit(50000)
    const s = saldos([conta], (pagos ?? []).map(lerLinha) as Lancamento[], ultimoSaldo.saldo_em as string)
    conferencia = { banco: Number(ultimoSaldo.saldo_banco), redacao: s.get(conta.id) ?? 0, em: ultimoSaldo.saldo_em as string }
  }

  const fontePadrao = conta.fonte_id ?? c.fontes.find((f) => !f.restrita)?.id ?? c.fontes[0]?.id ?? ''
  const opcoes = {
    categorias: c.categorias.filter((x) => x.ativa).map((x) => ({ id: x.id, rotulo: x.nome, tipo: x.tipo })),
    fontes: c.fontes.filter((f) => f.ativa).map((f) => ({ id: f.id, rotulo: `${f.nome}${f.restrita ? ' (com destino)' : ''}` })),
    favorecidos: c.favorecidos.map((f) => ({ id: f.id, rotulo: f.nome })),
    projetos: c.projetos.map((p) => ({ id: p.id, rotulo: p.name })),
  }
  const url = (mudar: Record<string, string | undefined>) => {
    const p = new URLSearchParams(Object.entries({ conta: conta.id, aba: aba === 'pendentes' ? undefined : aba, ...mudar }).filter((e): e is [string, string] => Boolean(e[1])))
    return `/financeiro/conciliacao?${p.toString()}`
  }
  const nomeDoLancamento = async (ids: string[]) => {
    if (!ids.length) return new Map<string, string>()
    const { data } = await supabase.from('fin_lancamentos').select('id,descricao').in('id', ids)
    return new Map((data ?? []).map((l) => [l.id as string, l.descricao as string]))
  }
  const nomes = aba === 'conciliadas' ? await nomeDoLancamento(linhas.map((l) => l.lancamento_id!).filter(Boolean)) : new Map<string, string>()

  return (
    <div className="flex flex-col gap-6">
      <SecoesDoFinanceiro atual="/financeiro/conciliacao" empresas={c.empresas} empresa={c.empresa} />
      <PageHeader title="Conciliação bancária" description="Importe o extrato do banco e confirme, linha a linha, qual lançamento é cada movimento. O que o banco diz (data e valor) passa a valer no lançamento." />

      {contas.length > 1 && (
        <nav className="flex flex-wrap gap-2" aria-label="Conta" data-ajuda="financeiro.conciliacao-contas">
          {contas.map((x) => (
            <Link key={x.id} href={`/financeiro/conciliacao?conta=${x.id}`} aria-current={x.id === conta.id ? 'page' : undefined}
              className={`rounded-lg border px-3 py-1.5 text-sm ${x.id === conta.id ? 'border-primary bg-primary/5 font-medium text-primary' : 'border-border text-muted-foreground hover:bg-muted'}`}>{x.nome}</Link>
          ))}
        </nav>
      )}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4" id="resumo-conciliacao" data-ajuda="financeiro.conciliacao-resumo">
        <Card className={`p-4 ${porSituacao('pendente') ? 'border-warning/60' : ''}`}><p className="text-2xl font-bold tabular-nums">{porSituacao('pendente')}</p><p className="text-xs text-muted-foreground">linhas para conciliar</p></Card>
        <Card className="p-4"><p className="text-2xl font-bold tabular-nums">{porSituacao('conciliado')}</p><p className="text-xs text-muted-foreground">conciliadas</p></Card>
        <Card className="p-4"><p className="text-2xl font-bold tabular-nums">{porSituacao('ignorado')}</p><p className="text-xs text-muted-foreground">ignoradas (com motivo)</p></Card>
        <Card className={`p-4 ${conferencia && Math.abs(conferencia.banco - conferencia.redacao) >= 0.01 ? 'border-destructive/40' : ''}`} id="conferencia-saldo">
          {conferencia ? (
            <>
              <p className={`text-2xl font-bold tabular-nums ${Math.abs(conferencia.banco - conferencia.redacao) >= 0.01 ? 'text-destructive' : 'text-success'}`}>
                {Math.abs(conferencia.banco - conferencia.redacao) < 0.01 ? 'Bate' : reais(conferencia.redacao - conferencia.banco)}
              </p>
              <p className="text-xs text-muted-foreground">em {dataCurta(conferencia.em)}: banco {reais(conferencia.banco)}, Palácio Virtual {reais(conferencia.redacao)}</p>
            </>
          ) : <p className="text-xs text-muted-foreground">O saldo do banco aparece aqui quando o extrato vem em OFX.</p>}
        </Card>
      </div>

      {nivel >= 2 && <ImportarExtrato contaId={conta.id} contaNome={conta.nome} />}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <nav className="flex flex-wrap gap-1 border-b border-border" aria-label="Abas">
          {([['pendentes', 'Para conciliar'], ['conciliadas', 'Conciliadas e ignoradas'], ['importacoes', 'Importações']] as const).map(([id, rotulo]) => (
            <Link key={id} href={url({ aba: id === 'pendentes' ? undefined : id })} aria-current={aba === id ? 'page' : undefined}
              className={`-mb-px border-b-2 px-3 py-2 text-sm ${aba === id ? 'border-primary font-medium text-foreground' : 'border-transparent text-muted-foreground hover:text-foreground'}`}>{rotulo}</Link>
          ))}
        </nav>
        {aba === 'pendentes' && nivel >= 2 && <ConciliarSugestoes pares={pares} />}
      </div>

      {aba === 'pendentes' && (
        <Card className="overflow-hidden p-0" data-ajuda="financeiro.conciliacao-linhas">
          {!linhas.length ? <p className="p-10 text-center text-sm text-muted-foreground">{porSituacao('conciliado') ? 'Tudo conciliado nesta conta.' : 'Nenhum extrato importado nesta conta ainda.'}</p> : (
            <ul className="divide-y divide-border" id="pendentes">
              {linhas.map((l) => (
                <LinhaPendente key={l.id} linha={l} sugestao={sugestaoPorLinha.get(l.id) ?? null} candidatos={candidatosPorLinha.get(l.id) ?? []} {...opcoes}
                  padrao={padraoPorDescricao.get(normalizarDescricao(l.descricao)) ?? { categoria_id: '', fonte_id: fontePadrao, favorecido_id: '' }} podeMexer={nivel >= 2} />
              ))}
            </ul>
          )}
          {lancamentosPorId.size === 0 && linhas.length > 0 && <p className="border-t border-border px-4 py-3 text-xs text-muted-foreground">Não há lançamentos desta conta perto destas datas: use “Criar lançamento” nas linhas.</p>}
        </Card>
      )}

      {aba === 'conciliadas' && (
        <Card className="overflow-hidden p-0">
          <ul className="divide-y divide-border">
            {[...linhas, ...((ignoradasBrutas ?? []).map((l) => ({ ...l, valor: Number(l.valor) })) as Linha[])].sort((a, b) => b.data.localeCompare(a.data)).map((l) => (
              <li key={l.id} className="flex items-center gap-3 px-4 py-2.5 text-sm">
                <span className="w-20 shrink-0 tabular-nums text-muted-foreground">{dataCurta(l.data)}</span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate">{l.descricao}</span>
                  <span className="block truncate text-xs text-muted-foreground">
                    {l.situacao === 'conciliado' && l.lancamento_id ? <Link href={`/financeiro/${l.lancamento_id}`} className="hover:text-primary hover:underline">→ {nomes.get(l.lancamento_id) ?? 'lançamento'}</Link> : `Ignorada: ${l.motivo ?? ''}`}
                  </span>
                </span>
                <span className={`whitespace-nowrap font-medium tabular-nums ${l.valor > 0 ? 'text-success' : ''}`}>{l.valor > 0 ? '+' : '−'}{reais(Math.abs(l.valor))}</span>
                {nivel >= 2 && <Desconciliar id={l.id} />}
              </li>
            ))}
            {!linhas.length && !(ignoradasBrutas ?? []).length && <li className="p-10 text-center text-sm text-muted-foreground">Nada conciliado ainda.</li>}
          </ul>
        </Card>
      )}

      {aba === 'importacoes' && (
        <Card className="overflow-hidden p-0">
          <ul className="divide-y divide-border">
            {(importacoes ?? []).map((i) => (
              <li key={i.id as string} className="flex items-center gap-3 px-4 py-2.5 text-sm">
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium">{i.arquivo as string} <span className="text-xs font-normal uppercase text-muted-foreground">{i.formato as string}</span></span>
                  <span className="block text-xs text-muted-foreground">
                    {i.inicio && i.fim ? `${dataCurta(i.inicio as string)} a ${dataCurta(i.fim as string)} · ` : ''}{i.novas as number} novas de {i.linhas as number}
                    {i.saldo_banco !== null && i.saldo_em ? ` · saldo ${reais(Number(i.saldo_banco))} em ${dataCurta(i.saldo_em as string)}` : ''}
                    {' · '}{new Date(i.created_at as string).toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' })}
                  </span>
                </span>
                {nivel >= 2 && <ExcluirImportacao id={i.id as string} />}
              </li>
            ))}
            {!(importacoes ?? []).length && <li className="p-10 text-center text-sm text-muted-foreground">Nenhuma importação.</li>}
          </ul>
        </Card>
      )}
      <p className="text-xs text-muted-foreground">Linhas de mês fechado não mudam mais.</p>
    </div>
  )
}
