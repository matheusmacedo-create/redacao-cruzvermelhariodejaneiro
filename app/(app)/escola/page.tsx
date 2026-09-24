import Link from 'next/link'
import { notFound } from 'next/navigation'
import { AlertTriangle, ArrowRight, ExternalLink, Megaphone, Newspaper, ReceiptText } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { PageHeader } from '@/components/app/page-header'
import { SecoesDaEscola } from '@/components/app/escola/secoes'
import { COLUNAS_DA_CONTA, lerConta, transacoesDesde } from '@/lib/escola/servidor'
import { contextoDoMarketing } from '@/lib/escola/marketing-servidor'
import { mesDe, reaisDeCentavos, resumoDoMes, somarMeses, variacao } from '@/lib/escola/painel'
import { milhar, pct, reais } from '@/lib/escola/marketing'

export const metadata = { title: 'Escola de Educação e Saúde' }
export const dynamic = 'force-dynamic'

const porcento = (f: number) => `${f > 0 ? '+' : ''}${(f * 100).toLocaleString('pt-BR', { maximumFractionDigits: 0 })}%`

function Bloco({ titulo, icone: Icone, href, rotuloDoLink, children, id }: { titulo: string; icone: typeof ReceiptText; href: string; rotuloDoLink: string; children: React.ReactNode; id: string }) {
  return (
    <Card className="flex flex-col gap-3 p-4" id={id}>
      <h2 className="flex items-center gap-2 text-sm font-medium"><Icone className="size-4 text-muted-foreground" />{titulo}</h2>
      <div className="flex-1">{children}</div>
      <Link href={href} className="flex items-center gap-1 text-sm text-primary hover:underline">{rotuloDoLink}<ArrowRight className="size-3.5" /></Link>
    </Card>
  )
}

function Numero({ rotulo, valor, detalhe }: { rotulo: string; valor: string; detalhe?: React.ReactNode }) {
  return <div className="flex flex-col"><span className="text-xs text-muted-foreground">{rotulo}</span><span className="text-xl font-semibold tabular-nums">{valor}</span>{detalhe && <span className="text-xs text-muted-foreground">{detalhe}</span>}</div>
}

/**
 * A escola como empresa: uma unidade da Cruz Vermelha RJ com receita e
 * gestão próprias. Esta é a porta de entrada — vendas do mês, marketing,
 * advertoriais e o que pede atenção —, cada bloco levando à sua área. Aluno,
 * turma e secretaria continuam no sistema da escola; daqui só o atalho.
 */
export default async function EscolaPage() {
  const { context, supabase, nivel: nivelMkt, nivelEscola } = await contextoDoMarketing()
  if (nivelMkt < 2 && nivelEscola < 2) notFound()
  const ws = context.workspace.id
  const hoje = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date())
  const mes = mesDe(new Date().toISOString())
  const trintaDias = new Date(Date.parse(`${hoje}T12:00:00Z`) - 29 * 86_400_000).toISOString().slice(0, 10)
  const vazio = Promise.resolve({ data: null })

  const [{ data: contasBrutas }, ts, { data: campanhas }, { data: pecas }, { data: receitas }, { data: metricas }, { data: materias }, { data: metaContas }] = await Promise.all([
    nivelEscola >= 2 ? supabase.from('escola_contas').select(COLUNAS_DA_CONTA).eq('workspace_id', ws) : vazio,
    nivelEscola >= 2 ? transacoesDesde(supabase, ws, new Date(`${somarMeses(mes, -1)}-01T03:00:00Z`).toISOString()) : Promise.resolve([]),
    nivelMkt >= 2 ? supabase.from('escola_campanhas').select('id,nome,status,utm_campaign').eq('workspace_id', ws) : vazio,
    nivelMkt >= 2 ? supabase.from('escola_pecas').select('id,tipo,referencia,investimento,content_id,status').eq('workspace_id', ws).limit(10000) : vazio,
    nivelMkt >= 2 ? supabase.rpc('escola_receita_por_campanha', { p_workspace_id: ws }) : vazio,
    nivelMkt >= 2 ? supabase.from('escola_adv_metricas').select('visitas,cliques').eq('workspace_id', ws).gte('dia', trintaDias).limit(20000) : vazio,
    nivelMkt >= 2 ? supabase.rpc('escola_advertoriais', { p_workspace_id: ws }) : vazio,
    nivelMkt >= 2 ? supabase.from('escola_meta_contas').select('act_id,nome,ativa,sincronizacao_erro').eq('workspace_id', ws) : vazio,
  ])

  const contas = ((contasBrutas ?? []) as Record<string, unknown>[]).map((c) => lerConta(c))
  const r = resumoDoMes(ts, mes), anterior = resumoDoMes(ts, somarMeses(mes, -1))
  const delta = variacao(r.recebido, anterior.recebido)
  const saldo = contas.reduce((s, c) => s + (c.saldo_disponivel ?? 0), 0)

  const cs = (campanhas ?? []) as { id: string; nome: string; status: string; utm_campaign: string | null }[]
  const ps = ((pecas ?? []) as { tipo: string; referencia: boolean; investimento: number | null; content_id: string | null; status: string }[])
  const investido = ps.filter((p) => !p.referencia).reduce((s, p) => s + Number(p.investimento ?? 0), 0)
  const receitaAtribuida = ((receitas ?? []) as { campanha: string; recebido: number }[]).filter((x) => cs.some((c) => c.utm_campaign === x.campanha)).reduce((s, x) => s + Number(x.recebido), 0) / 100
  const noAr = cs.filter((c) => c.status === 'no_ar')
  const advs = (materias ?? []) as { site_url: string | null; publicada_em: string | null; titulo: string }[]
  const visitas30 = ((metricas ?? []) as { visitas: number; cliques: number }[]).reduce((s, m) => s + Number(m.visitas), 0)
  const cliques30 = ((metricas ?? []) as { visitas: number; cliques: number }[]).reduce((s, m) => s + Number(m.cliques), 0)

  // O que pede atenção, só com o que tem número maior que zero.
  const atencao: { texto: string; href: string }[] = []
  for (const c of contas.filter((x) => x.ativa)) {
    if (!c.chave_final) atencao.push({ texto: `Conta ${c.nome} da Únicopag sem chave: as vendas dela não estão sendo lidas.`, href: '/escola/configuracoes#unicopag' })
    else if (c.sincronizacao_erro) atencao.push({ texto: `Conta ${c.nome} da Únicopag: ${c.sincronizacao_erro}`, href: '/escola/configuracoes#unicopag' })
  }
  for (const m of ((metaContas ?? []) as { act_id: string; nome: string | null; ativa: boolean; sincronizacao_erro: string | null }[]).filter((x) => x.ativa && x.sincronizacao_erro)) {
    atencao.push({ texto: `Anúncios do Meta (${m.nome ?? m.act_id}): ${m.sincronizacao_erro}`, href: '/escola/configuracoes#meta' })
  }
  const semUtm = noAr.filter((c) => !c.utm_campaign)
  if (semUtm.length) atencao.push({ texto: `${semUtm.length === 1 ? `A campanha ${semUtm[0].nome} está` : `${semUtm.length} campanhas estão`} no ar sem utm_campaign: a receita não chega a ela${semUtm.length === 1 ? '' : 's'}.`, href: '/escola/marketing' })
  if (r.emDisputa) atencao.push({ texto: `${r.emDisputa} ${r.emDisputa === 1 ? 'pagamento em disputa' : 'pagamentos em disputa'} (pré-chargeback) no cartão.`, href: '/escola/vendas/transacoes?situacao=em_disputa' })
  const rascunhos = advs.filter((a) => !a.site_url).length
  if (rascunhos) atencao.push({ texto: `${rascunhos} ${rascunhos === 1 ? 'advertorial ainda não publicado' : 'advertoriais ainda não publicados'}.`, href: '/escola/marketing/advertoriais' })

  const sistemas = contas.filter((c) => c.sistema_url)

  return (
    <div className="flex flex-col gap-6">
      <SecoesDaEscola atual="/escola" financeiro={nivelEscola >= 2} marketing={nivelMkt >= 2} />
      <PageHeader
        title="Escola de Educação e Saúde"
        description="Uma empresa da Cruz Vermelha RJ, com receita e gestão próprias. A administração dela mora aqui: vendas, marketing e advertoriais. Alunos, turmas e secretaria ficam no sistema da escola."
      />

      {atencao.length > 0 && (
        <Card className="border-warning/60 p-4 text-sm" id="pede-atencao">
          <p className="flex items-center gap-2 font-medium text-warning-foreground"><AlertTriangle className="size-4" />Pede atenção</p>
          <ul className="mt-2 flex flex-col gap-1.5">
            {atencao.map((a) => <li key={a.texto}><Link href={a.href} className="hover:underline">{a.texto}</Link></li>)}
          </ul>
        </Card>
      )}

      <div className="grid gap-3 lg:grid-cols-3">
        {nivelEscola >= 2 && (
          <Bloco id="bloco-vendas" titulo="Vendas do mês" icone={ReceiptText} href="/escola/vendas" rotuloDoLink="Abrir vendas">
            {!contas.length ? <p className="text-sm text-muted-foreground">Nenhuma conta da Únicopag ligada. {nivelEscola >= 3 && <Link href="/escola/configuracoes" className="text-primary hover:underline">Ligar agora</Link>}</p> : (
              <div className="grid grid-cols-2 gap-3">
                <Numero rotulo="Recebido" valor={reaisDeCentavos(r.recebido)} detalhe={delta !== null ? <span className={delta < 0 ? 'text-destructive' : 'text-success'}>{porcento(delta)} sobre o mês anterior</span> : `${r.pagamentos} pagamentos`} />
                <Numero rotulo="Aguardando" valor={reaisDeCentavos(r.aguardando)} detalhe={`${r.cobrancasAbertas} cobranças abertas`} />
                <Numero rotulo="Saldo nas contas" valor={reaisDeCentavos(saldo)} />
                <Numero rotulo="Ticket médio" valor={r.pagamentos ? reaisDeCentavos(r.ticketMedio) : '—'} />
              </div>
            )}
          </Bloco>
        )}
        {nivelMkt >= 2 && (
          <Bloco id="bloco-marketing" titulo="Marketing" icone={Megaphone} href="/escola/marketing" rotuloDoLink="Abrir o marketing">
            <div className="grid grid-cols-2 gap-3">
              <Numero rotulo="Campanhas no ar" valor={milhar(noAr.length)} detalhe={`${cs.length} no total`} />
              <Numero rotulo="Investido em anúncios" valor={reais(investido)} />
              <Numero rotulo="Receita das campanhas" valor={reais(receitaAtribuida)} />
              <Numero rotulo="Retorno" valor={investido > 0 ? `${(receitaAtribuida / investido).toLocaleString('pt-BR', { maximumFractionDigits: 1 })}×` : '—'} detalhe="receita ÷ investido" />
            </div>
          </Bloco>
        )}
        {nivelMkt >= 2 && (
          <Bloco id="bloco-advertoriais" titulo="Advertoriais" icone={Newspaper} href="/escola/marketing/advertoriais" rotuloDoLink="Abrir o banco de advertoriais">
            <div className="grid grid-cols-2 gap-3">
              <Numero rotulo="No site" valor={milhar(advs.filter((a) => a.site_url).length)} detalhe={`${advs.length} no total`} />
              <Numero rotulo="Visitas (30 dias)" valor={milhar(visitas30)} />
              <Numero rotulo="Cliques no botão (30 dias)" valor={milhar(cliques30)} detalhe={visitas30 ? `${pct(cliques30 / visitas30, 1)} das visitas` : undefined} />
            </div>
          </Bloco>
        )}
      </div>

      {sistemas.length > 0 && (
        <Card className="p-4" id="sistema-da-escola">
          <h2 className="text-sm font-medium">Alunos, turmas e secretaria</h2>
          <p className="mt-1 text-sm text-muted-foreground">Ficha do aluno, turma, triagem e presença ficam no sistema da escola.</p>
          <div className="mt-3 flex flex-wrap gap-2">
            {sistemas.map((c) => <Button key={c.id} variant="outline" size="sm" render={<a href={c.sistema_url!} target="_blank" rel="noopener noreferrer" />}>{c.nome}<ExternalLink className="size-3.5" /></Button>)}
          </div>
        </Card>
      )}
    </div>
  )
}
