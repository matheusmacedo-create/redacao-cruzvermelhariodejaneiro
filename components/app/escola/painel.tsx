import Link from 'next/link'
import { ChevronLeft, ChevronRight, ExternalLink, GraduationCap } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { PageHeader } from '@/components/app/page-header'
import { SecoesDaEscola } from '@/components/app/escola/secoes'
import { AtualizarAgora } from '@/components/app/escola/atualizar'
import { GraficoMensal } from '@/components/app/escola/grafico'
import type { ContaDaEscola } from '@/lib/escola/servidor'
import { comOutros, mesPorExtenso, reaisDeCentavos, resumoDoMes, serieMensal, somarMeses, variacao, type Fatia, type TransacaoDoPainel } from '@/lib/escola/painel'
import { METODOS, ehMetodo } from '@/lib/escola/unicopag'

const porcento = (f: number) => `${f > 0 ? '+' : ''}${(f * 100).toLocaleString('pt-BR', { maximumFractionDigits: 0 })}%`
const relativo = (iso: string | null) => {
  if (!iso) return null
  const min = Math.round((Date.now() - Date.parse(iso)) / 60_000)
  if (min < 1) return 'agora'
  if (min < 60) return `há ${min} min`
  if (min < 60 * 24) return `há ${Math.round(min / 60)} h`
  return `em ${new Date(iso).toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' })}`
}

function Indicador({ rotulo, valor, detalhe, id }: { rotulo: string; valor: string; detalhe?: React.ReactNode; id?: string }) {
  return (
    <Card className="flex flex-col gap-1 p-4" id={id}>
      <span className="text-sm text-muted-foreground">{rotulo}</span>
      <span className="text-2xl font-semibold tabular-nums">{valor}</span>
      {detalhe && <span className="text-xs text-muted-foreground">{detalhe}</span>}
    </Card>
  )
}

/** Uma lista de "quanto de cada", com a barra da fatia (a barra é o tamanho; o número é o texto). */
function Divisao({ titulo, fatias, total, nome, id }: { titulo: string; fatias: Fatia[]; total: number; nome?: (chave: string) => string; id: string }) {
  return (
    <Card className="p-4" id={id}>
      <h2 className="text-sm font-medium">{titulo}</h2>
      {!fatias.length ? <p className="mt-2 text-sm text-muted-foreground">Nada recebido neste mês.</p> : (
        <ul className="mt-3 flex flex-col gap-2.5">
          {fatias.map((f) => (
            <li key={f.chave} className="text-sm">
              <div className="flex items-baseline justify-between gap-3">
                <span className="min-w-0 truncate" title={nome ? nome(f.chave) : f.chave}>{nome ? nome(f.chave) : f.chave}</span>
                <span className="shrink-0 tabular-nums">{reaisDeCentavos(f.valor)} <span className="text-xs text-muted-foreground">· {f.quantidade}</span></span>
              </div>
              <div className="mt-1 h-1.5 rounded-full bg-muted"><div className="h-1.5 rounded-full bg-[var(--chart-4)]" style={{ width: `${total ? Math.max(2, (f.valor / total) * 100) : 0}%` }} /></div>
            </li>
          ))}
        </ul>
      )}
    </Card>
  )
}

/**
 * O painel da Escola: quanto entrou pelas contas da Únicopag no mês (regime
 * de caixa), o que está aguardando pagamento, o que voltou (estorno e
 * chargeback), o saldo em cada conta e de onde veio o dinheiro — por curso,
 * forma de pagamento e origem da venda. Aluno e turma ficam no sistema da
 * escola; daqui só há o atalho para lá.
 */
export function PainelDaEscola({ contas, ts, mes, meses, hoje, nivel }: { contas: ContaDaEscola[]; ts: TransacaoDoPainel[]; mes: string; meses: string[]; hoje: string; nivel: number }) {
  const nomeDaConta = new Map(contas.map((c) => [c.id, c.nome]))
  const r = resumoDoMes(ts, mes)
  const anterior = resumoDoMes(ts, somarMeses(mes, -1))
  const serie = serieMensal(ts, meses)
  const delta = variacao(r.recebido, anterior.recebido)
  const disponivel = contas.reduce((s, c) => s + (c.saldo_disponivel ?? 0), 0)
  const aLiberar = contas.reduce((s, c) => s + (c.saldo_a_liberar ?? 0), 0)
  const ultima = contas.map((c) => c.sincronizada_em).filter(Boolean).sort().pop() ?? null
  const comErro = contas.filter((c) => c.ativa && c.chave_final && c.sincronizacao_erro)
  const semChave = contas.filter((c) => c.ativa && !c.chave_final)
  const sistemas = contas.filter((c) => c.sistema_url)

  return (
    <div className="flex flex-col gap-6">
      <SecoesDaEscola atual="/escola/vendas" />
      <PageHeader
        title="Escola de Educação e Saúde"
        description="A administração da escola: o que entra pelas contas da Únicopag, o que está pendente e o que voltou. Alunos e turmas continuam no sistema da escola."
        actions={contas.length ? <AtualizarAgora quando={relativo(ultima)} /> : undefined}
      />

      {!contas.length ? (
        <Card className="flex flex-col items-center gap-3 p-10 text-center" id="escola-vazia">
          <GraduationCap className="size-8 text-muted-foreground" />
          <p className="font-medium">Nenhuma conta da Únicopag ligada ainda</p>
          <p className="max-w-md text-sm text-muted-foreground">Ligue as contas por onde a escola recebe (matrícula e curso) para ver aqui o dinheiro de cada mês, por curso e por forma de pagamento.</p>
          {nivel >= 3 ? <Button render={<Link href="/escola/configuracoes" />}>Ligar uma conta</Button> : <p className="text-sm text-muted-foreground">Peça a um admin para ligar as contas.</p>}
        </Card>
      ) : (
        <>
          {(comErro.length > 0 || semChave.length > 0) && (
            <Card className="border-warning/60 p-4 text-sm" id="alerta-contas">
              <p className="font-medium text-warning-foreground">Contas que precisam de atenção</p>
              <ul className="mt-1 list-disc pl-5">
                {semChave.map((c) => <li key={`k${c.id}`}>{c.nome}: sem chave de API — os números dela não estão sendo lidos.</li>)}
                {comErro.map((c) => <li key={`e${c.id}`}>{c.nome}: {c.sincronizacao_erro}</li>)}
              </ul>
              {nivel >= 3 && <Link href="/escola/configuracoes" className="mt-2 inline-block text-primary hover:underline">Abrir as contas</Link>}
            </Card>
          )}

          <div className="flex items-center justify-between gap-3">
            <Button variant="ghost" size="sm" render={<Link href={`/escola/vendas?mes=${somarMeses(mes, -1)}`} aria-label="Mês anterior" />}><ChevronLeft className="size-4" /></Button>
            <h2 className="text-base font-medium" id="mes-do-painel">{mesPorExtenso(mes).replace(/^./, (l) => l.toUpperCase())}</h2>
            {mes < hoje ? <Button variant="ghost" size="sm" render={<Link href={`/escola/vendas?mes=${somarMeses(mes, 1)}`} aria-label="Próximo mês" />}><ChevronRight className="size-4" /></Button> : <span className="w-9" />}
          </div>

          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4" id="indicadores">
            <Indicador id="ind-recebido" rotulo="Recebido no mês" valor={reaisDeCentavos(r.recebido)}
              detalhe={<>{r.pagamentos} {r.pagamentos === 1 ? 'pagamento' : 'pagamentos'}{r.pagamentos ? ` · ticket médio ${reaisDeCentavos(r.ticketMedio)}` : ''}{delta !== null ? <> · <span className={delta < 0 ? 'text-destructive' : 'text-success'}>{porcento(delta)}</span> sobre o mês anterior</> : ''}</>} />
            <Indicador id="ind-aguardando" rotulo="Aguardando pagamento" valor={reaisDeCentavos(r.aguardando)}
              detalhe={`${r.cobrancasAbertas} ${r.cobrancasAbertas === 1 ? 'cobrança aberta' : 'cobranças abertas'} criadas no mês${r.aprovacao !== null ? ` · ${Math.round(r.aprovacao * 100)}% das decididas foram pagas` : ''}`} />
            <Indicador id="ind-devolvido" rotulo="Estornos e contestações" valor={reaisDeCentavos(r.devolvido)}
              detalhe={`${r.devolucoes} no mês${r.emDisputa ? ` · ${r.emDisputa} em disputa agora` : ''}`} />
            <Indicador id="ind-saldo" rotulo="Saldo nas contas" valor={reaisDeCentavos(disponivel)} detalhe={`${reaisDeCentavos(aLiberar)} a liberar · lido ${relativo(contas.map((c) => c.saldo_lido_em).filter(Boolean).sort().pop() ?? null) ?? '—'}`} />
          </div>

          <Card className="p-4">
            <h2 className="mb-3 text-sm font-medium">Recebido por mês, nos últimos 12 meses</h2>
            <GraficoMensal pontos={serie.map((p) => ({ mes: p.mes, recebido: p.recebido }))} atual={mes} />
          </Card>

          <div className="grid gap-3 lg:grid-cols-2">
            <Divisao id="por-curso" titulo="Por curso" fatias={comOutros(r.porProduto, 8)} total={r.recebido} />
            <Divisao id="por-metodo" titulo="Por forma de pagamento" fatias={r.porMetodo} total={r.recebido} nome={(k) => (ehMetodo(k) ? METODOS[k] : k)} />
            <Divisao id="por-origem" titulo="Por origem da venda" fatias={comOutros(r.porOrigem, 6)} total={r.recebido} />
            {contas.length > 1 && <Divisao id="por-conta" titulo="Por conta" fatias={r.porConta} total={r.recebido} nome={(k) => nomeDaConta.get(k) ?? 'Conta removida'} />}
          </div>

          <div className="flex justify-end"><Button variant="outline" render={<Link href={`/escola/vendas/transacoes?mes=${mes}`} />}>Ver as transações de {mesPorExtenso(mes)}</Button></div>
        </>
      )}

      <Card className="p-4" id="sistema-da-escola">
        <h2 className="text-sm font-medium">Alunos, turmas e secretaria</h2>
        <p className="mt-1 text-sm text-muted-foreground">Ficha do aluno, turma, triagem e presença ficam no sistema da escola. A Redação guarda só a parte administrativa.</p>
        {sistemas.length > 0 ? (
          <div className="mt-3 flex flex-wrap gap-2">
            {sistemas.map((c) => <Button key={c.id} variant="outline" size="sm" render={<a href={c.sistema_url!} target="_blank" rel="noopener noreferrer" />}>{c.nome}<ExternalLink className="size-3.5" /></Button>)}
          </div>
        ) : nivel >= 3 && contas.length > 0 ? <p className="mt-2 text-sm text-muted-foreground">Informe o endereço do sistema em <Link href="/escola/configuracoes" className="text-primary hover:underline">Contas e integrações</Link> para o atalho aparecer aqui.</p> : null}
      </Card>
    </div>
  )
}
