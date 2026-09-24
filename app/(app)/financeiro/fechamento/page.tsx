import Link from 'next/link'
import { notFound } from 'next/navigation'
import { AlertTriangle, CheckCircle2, ChevronLeft, ChevronRight, Download, Lock, XCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { PageHeader } from '@/components/app/page-header'
import { SecoesDoFinanceiro } from '@/components/app/financeiro/secoes'
import { hojeEmSaoPaulo } from '@/components/app/projetos/comum'
import { FecharMes, ReabrirMes, ValorHora } from '@/components/app/financeiro/fechamento'
import { dadosDoMes } from '@/lib/financeiro/fechamento-servidor'
import { cadastrosDoFinanceiro, contextoDoFinanceiro } from '@/lib/financeiro/acesso'
import { somarDias } from '@/lib/financeiro/avisos'
import { ehMes, mesAnterior, mesDe, mesSeguinte, nomeDoMes, reais } from '@/lib/financeiro/regras'

export const metadata = { title: 'Fechamento do mês' }
export const dynamic = 'force-dynamic'

function Tabela({ cabecalho, linhas, id }: { cabecalho: string[]; linhas: (string | number | null)[][]; id?: string }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[36rem] border-collapse text-sm" id={id}>
        <thead><tr className="border-b border-border text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          {cabecalho.map((c, i) => <th key={c} className={`px-3 py-2 ${i ? 'text-right' : ''}`}>{c}</th>)}
        </tr></thead>
        <tbody>
          {linhas.map((l, i) => (
            <tr key={i} className="border-b border-border last:border-0">
              {l.map((v, j) => <td key={j} className={`px-3 py-2 ${j ? 'text-right tabular-nums' : ''}`}>{typeof v === 'number' ? reais(v) : v ?? '—'}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

/**
 * O fechamento do mês: a conferência (o que impede e o que é aviso), o
 * retrato do mês (caixa, categorias, contas, fontes, voluntariado), o pacote
 * do contador e o histórico de fechamentos.
 */
export default async function FechamentoPage({ searchParams }: { searchParams: Promise<{ mes?: string }> }) {
  const sp = await searchParams
  const { nivel, nivelGeral } = await contextoDoFinanceiro()
  if (nivel < 1) notFound()
  const hoje = hojeEmSaoPaulo()
  // Sem mês na URL: o próximo a fechar (ou o mês passado, se nada foi fechado ainda).
  const { config, empresas, empresa } = await cadastrosDoFinanceiro()
  const mes = ehMes(sp.mes) ? sp.mes : config.fechado_ate ? somarDias(config.fechado_ate, 1).slice(0, 7) : mesAnterior(mesDe(hoje))
  const d = await dadosDoMes(mes)
  const r = d.resumo
  const fechadoAte = d.cadastros.config.fechado_ate
  const estaFechado = Boolean(fechadoAte && `${mes}-01` <= fechadoAte)
  const ultimoFechado = fechadoAte ? mesDe(fechadoAte) === mes : false
  const bloqueios = d.itens.filter((i) => i.bloqueia && !i.ok)
  const avisos = d.itens.filter((i) => !i.bloqueia && !i.ok)
  const fechamento = d.fechamentos.find((f) => f.mes === `${mes}-01` && f.situacao === 'fechado')
  const nomes: Record<string, string> = {}
  {
    const { data } = await d.supabase.from('workspace_members').select('user_id,profiles(full_name)').eq('workspace_id', d.context.workspace.id)
    for (const m of data ?? []) nomes[m.user_id as string] = ((Array.isArray(m.profiles) ? m.profiles[0] : m.profiles) as { full_name?: string } | null)?.full_name ?? 'Alguém'
  }
  const quando = (t: string) => new Date(t).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', dateStyle: 'short', timeStyle: 'short' })

  return (
    <div className="flex flex-col gap-6">
      <SecoesDoFinanceiro atual="/financeiro/fechamento" empresas={empresas} empresa={empresa} />
      <PageHeader
        title={`Fechamento de ${nomeDoMes(mes)}`}
        description="Conferir, fechar e mandar ao contador. Fechado, o que foi pago no mês não muda mais."
        actions={<div className="flex flex-wrap items-start gap-2">
          {nivel >= 4 && <Button variant="outline" render={<a href={`/api/financeiro/fechamento/${mes}`} />}><Download className="size-4" />Pacote do contador</Button>}
          {nivel >= 4 && !estaFechado && <FecharMes mes={mes} nome={nomeDoMes(mes)} bloqueado={bloqueios.length > 0} avisos={avisos.map((i) => `${i.rotulo}${i.detalhe ? `: ${i.detalhe}` : ''}`)} />}
          {nivel >= 4 && ultimoFechado && <ReabrirMes nome={nomeDoMes(mes)} />}
        </div>}
      />

      <div className="flex items-center gap-1 text-sm" aria-label="Mês">
        <Button variant="ghost" size="icon" aria-label="Mês anterior" render={<Link href={`/financeiro/fechamento?mes=${mesAnterior(mes)}`} />}><ChevronLeft className="size-4" /></Button>
        <span className="min-w-36 text-center font-medium capitalize">{nomeDoMes(mes)}</span>
        <Button variant="ghost" size="icon" aria-label="Próximo mês" render={<Link href={`/financeiro/fechamento?mes=${mesSeguinte(mes)}`} />}><ChevronRight className="size-4" /></Button>
        {estaFechado
          ? <span className="ml-2 inline-flex items-center gap-1 rounded-full bg-success/15 px-2.5 py-1 text-xs font-semibold text-success"><Lock className="size-3" />Fechado</span>
          : <span className="ml-2 rounded-full bg-muted px-2.5 py-1 text-xs font-semibold text-muted-foreground">Aberto</span>}
      </div>

      {fechamento && (
        <Card className="p-4 text-sm" id="fechado-por">
          Fechado por <span className="font-medium">{fechamento.fechado_por ? nomes[fechamento.fechado_por] ?? 'alguém' : 'alguém'}</span> em {quando(fechamento.fechado_em)}
          {fechamento.avisos.length ? ` com ${fechamento.avisos.length} ${fechamento.avisos.length === 1 ? 'aviso' : 'avisos'}` : ' sem avisos'}.
          {fechamento.observacao && <span className="mt-1 block text-muted-foreground">“{fechamento.observacao}”</span>}
        </Card>
      )}

      {!estaFechado && (
        <Card className="p-5" id="conferencia">
          <h2 className="mb-3 font-semibold">Conferência</h2>
          <ul className="flex flex-col gap-2">
            {d.itens.map((i) => (
              <li key={i.id} className="flex items-start gap-2 text-sm" data-item={i.id} data-ok={i.ok}>
                {i.ok ? <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-success" /> : i.bloqueia ? <XCircle className="mt-0.5 size-4 shrink-0 text-destructive" /> : <AlertTriangle className="mt-0.5 size-4 shrink-0 text-warning-foreground" />}
                <span>
                  <span className={i.ok ? '' : 'font-medium'}>{i.rotulo}</span>
                  {!i.ok && i.bloqueia && <span className="ml-1.5 rounded bg-destructive/10 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-destructive">impede</span>}
                  {i.detalhe && <span className="block text-xs text-muted-foreground">{i.detalhe}{i.link && !i.ok && <> · <Link href={i.link} className="text-primary hover:underline">resolver</Link></>}</span>}
                </span>
              </li>
            ))}
          </ul>
        </Card>
      )}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4" id="numeros-do-mes">
        <Card className="p-4"><p className="text-xl font-bold tabular-nums text-success">{reais(r.caixa.entradas)}</p><p className="text-xs text-muted-foreground">entrou no mês</p></Card>
        <Card className="p-4"><p className="text-xl font-bold tabular-nums">{reais(r.caixa.saidas)}</p><p className="text-xs text-muted-foreground">saiu no mês</p></Card>
        <Card className={`p-4 ${r.caixa.resultado < 0 ? 'border-destructive/40' : ''}`}><p className={`text-xl font-bold tabular-nums ${r.caixa.resultado < 0 ? 'text-destructive' : ''}`}>{reais(r.caixa.resultado)}</p><p className="text-xs text-muted-foreground">resultado (caixa)</p></Card>
        <Card className="p-4"><p className="text-xl font-bold tabular-nums">{r.voluntariado.valor !== null ? reais(r.voluntariado.valor) : `${r.voluntariado.horas.toLocaleString('pt-BR')} h`}</p>
          <p className="text-xs text-muted-foreground">trabalho voluntário{r.voluntariado.valor !== null ? ` (${r.voluntariado.horas.toLocaleString('pt-BR')} h de ${r.voluntariado.pessoas} ${r.voluntariado.pessoas === 1 ? 'pessoa' : 'pessoas'})` : ' (sem valor da hora)'}</p></Card>
      </div>

      <Card className="p-5">
        <h2 className="mb-1 font-semibold">Por categoria</h2>
        <p className="mb-3 text-xs text-muted-foreground">Caixa: o que foi pago ou recebido no mês. Competência: o que é deste mês, pago ou não.</p>
        {r.porCategoria.length ? <Tabela id="por-categoria" cabecalho={['Categoria', 'Caixa', 'Competência']} linhas={r.porCategoria.map((k) => [`${k.codigo ? `${k.codigo} · ` : ''}${k.nome}${k.tipo === 'receita' ? ' (receita)' : ''}`, k.caixa, k.competencia])} />
          : <p className="text-sm text-muted-foreground">Nenhum lançamento no mês.</p>}
      </Card>

      <div className="grid gap-6 xl:grid-cols-2">
        <Card className="p-5">
          <h2 className="mb-3 font-semibold">Por conta</h2>
          <Tabela cabecalho={['Conta', 'Início', 'Entradas', 'Saídas', 'Fim']} linhas={r.porConta.map((k) => [k.nome, k.inicio, k.entradas, k.saidas, k.fim])} />
        </Card>
        <Card className="p-5">
          <h2 className="mb-1 font-semibold">Por fonte do recurso</h2>
          <p className="mb-3 text-xs text-muted-foreground">As fontes com destino só podem pagar o que é do convênio ou projeto delas.</p>
          <Tabela cabecalho={['Fonte', 'Início', 'Entradas', 'Saídas', 'Fim']} linhas={r.porFonte.map((f) => [`${f.nome}${f.restrita ? ' (com destino)' : ''}`, f.inicio, f.entradas, f.saidas, f.fim])} />
        </Card>
      </div>

      {r.patrimonio && (
        <Card className="p-5" id="patrimonio-do-mes">
          <h2 className="mb-1 font-semibold">Patrimônio</h2>
          <p className="mb-3 text-xs text-muted-foreground">Depreciação linear dos bens (vida útil por categoria, em Patrimônio → Cadastros). O contador lança a depreciação do mês; a lista bem a bem vai no pacote.</p>
          <Tabela cabecalho={['', 'Valor']} linhas={[
            ['Bens no patrimônio (valor de aquisição)', r.patrimonio.valor], ['Depreciação do mês', r.patrimonio.depreciacaoDoMes],
            ['Depreciação acumulada', r.patrimonio.acumulada], ['Valor contábil no fim do mês', r.patrimonio.contabil],
          ]} />
          {r.patrimonio.doadosNoMes.length > 0 && <p className="mt-3 text-sm">Bens recebidos em doação no mês (valor de mercado, ITG 2002): {r.patrimonio.doadosNoMes.map((b) => `${b.plaqueta} ${b.nome} (${reais(b.valor)})`).join('; ')}.</p>}
          {r.patrimonio.baixadosNoMes.length > 0 && <p className="mt-2 text-sm">Baixados no mês: {r.patrimonio.baixadosNoMes.map((b) => `${b.plaqueta} ${b.nome} (valor contábil ${reais(b.contabil)})`).join('; ')}.</p>}
        </Card>
      )}

      {r.estoque && (
        <Card className="p-5" id="estoque-do-mes">
          <h2 className="mb-1 font-semibold">Estoque de materiais</h2>
          <p className="mb-3 text-xs text-muted-foreground">Pelo custo médio. Doações entram pelo valor de mercado (ITG 2002). A lista material a material vai no pacote do contador.</p>
          <Tabela cabecalho={['', 'Valor']} linhas={[
            ['Estoque no início do mês', r.estoque.valorInicio], ['Compras', r.estoque.compras], ['Doações recebidas', r.estoque.doacoes],
            ...(r.estoque.outrasEntradas ? [['Outras entradas', r.estoque.outrasEntradas] as [string, number]] : []),
            ['Consumo (saídas para uso)', r.estoque.consumo], ['Perdas (vencidos, avariados, extravio)', r.estoque.perdas],
            ...(r.estoque.ajustes ? [['Ajustes de contagem', r.estoque.ajustes] as [string, number]] : []),
            ['Estoque no fim do mês', r.estoque.valorFim],
          ]} />
        </Card>
      )}

      <Card className="flex flex-col gap-3 p-5" id="voluntariado">
        <h2 className="font-semibold">Trabalho voluntário (ITG 2002)</h2>
        <p className="text-sm text-muted-foreground">
          A norma das entidades sem fins lucrativos pede que o trabalho voluntário seja reconhecido pelo valor de mercado, como se tivesse sido pago.
          As horas vêm de Voluntários ({r.voluntariado.horas.toLocaleString('pt-BR')} h em {nomeDoMes(mes)}); o valor da hora é o de referência que o contador definir.
        </p>
        <ValorHora valor={r.voluntariado.valorHora} pode={nivelGeral >= 4} />
      </Card>

      {d.fechamentos.length > 0 && (
        <Card className="p-5" id="historico-fechamentos">
          <h2 className="mb-3 font-semibold">Histórico</h2>
          <ul className="flex flex-col gap-2 text-sm">
            {d.fechamentos.map((f) => (
              <li key={f.id} className="flex flex-wrap items-baseline gap-x-2">
                <Link href={`/financeiro/fechamento?mes=${f.mes.slice(0, 7)}`} className="font-medium capitalize hover:text-primary hover:underline">{nomeDoMes(f.mes.slice(0, 7))}</Link>
                <span className="text-muted-foreground">fechado por {f.fechado_por ? nomes[f.fechado_por] ?? 'alguém' : 'alguém'} em {quando(f.fechado_em)}{f.avisos.length ? ` · ${f.avisos.length} ${f.avisos.length === 1 ? 'aviso' : 'avisos'}` : ''}</span>
                {f.situacao === 'reaberto' && <span className="text-xs text-warning-foreground">reaberto{f.reaberto_em ? ` em ${quando(f.reaberto_em)}` : ''}{f.motivo_reabertura ? `: ${f.motivo_reabertura}` : ''}</span>}
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  )
}
