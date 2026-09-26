import Link from 'next/link'
import { notFound } from 'next/navigation'
import QRCode from 'qrcode'
import { CheckCircle2, Clock, Pencil, Printer } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { PageHeader } from '@/components/app/page-header'
import { hojeEmSaoPaulo } from '@/components/app/projetos/comum'
import { SecoesDoPatrimonio } from '@/components/app/patrimonio/secoes'
import { Baixar, Conferir, Devolver, Entregar, ManutencaoPendente, NovaManutencao } from '@/components/app/patrimonio/acoes'
import { cadastrosDoPatrimonio, contextoDoPatrimonio, COLUNAS_DO_BEM, lerBemDoBanco } from '@/lib/patrimonio/acesso'
import { createAdminClient } from '@/lib/supabase/admin'
import { urlBase } from '@/lib/newsletter/contexto'
import { DESTINOS_DE_BAIXA, ESTADOS, ORIGENS, SITUACOES, TIPOS_DE_MANUTENCAO, caminhoDoQr, depreciacao, situacaoDaManutencao, type DestinoDeBaixa, type Estado, type Origem, type TipoDeManutencao } from '@/lib/patrimonio/regras'

export const metadata = { title: 'Bem do patrimônio' }
export const dynamic = 'force-dynamic'

const reais = (n: number) => n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
const data = (d: string | null) => (d ? new Date(d.length === 10 ? `${d}T12:00:00Z` : d).toLocaleDateString('pt-BR', { timeZone: d.length === 10 ? 'UTC' : 'America/Sao_Paulo' }) : '—')
const ACOES: Record<string, string> = {
  cadastrar: 'cadastrou', editar: 'editou', entregar: 'entregou', devolver: 'recebeu de volta', aceitar_termo: 'aceitou o termo', manutencao: 'registrou manutenção',
  agendar_manutencao: 'agendou manutenção', cancelar_manutencao: 'cancelou manutenção', baixar: 'deu baixa', conferir: 'conferiu no inventário',
}

function Dado({ rotulo, children }: { rotulo: string; children: React.ReactNode }) {
  return <div><dt className="text-xs text-muted-foreground">{rotulo}</dt><dd className="text-sm">{children || '—'}</dd></div>
}

export default async function BemPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound()
  const { context, supabase, nivel } = await contextoDoPatrimonio()
  const { data: bruto } = await supabase.from('pat_bens').select(COLUNAS_DO_BEM).eq('id', id).eq('workspace_id', context.workspace.id).maybeSingle()
  if (!bruto) notFound()
  const b = lerBemDoBanco(bruto)
  const hoje = hojeEmSaoPaulo()
  const ws = context.workspace.id
  const c = nivel >= 1 ? await cadastrosDoPatrimonio() : null
  const [{ data: cautelas }, { data: manutencoes }, { data: historico }, { data: inventario }, { data: membros }] = await Promise.all([
    supabase.from('pat_cautelas').select('id,nome,user_id,participante_id,entregue_em,prevista_devolucao,termo,termo_aceito_em,devolvido_em,estado_devolucao,observacao').eq('bem_id', id).order('entregue_em', { ascending: false }),
    supabase.from('pat_manutencoes').select('id,tipo,descricao,prevista_para,realizada_em,fornecedor,custo').eq('bem_id', id).order('realizada_em', { ascending: false, nullsFirst: true }),
    supabase.from('pat_historico').select('acao,created_at,user_id,detalhe').eq('bem_id', id).order('created_at', { ascending: false }).limit(40),
    supabase.from('pat_inventarios').select('id,nome').eq('workspace_id', ws).is('concluido_em', null).maybeSingle(),
    supabase.from('workspace_members').select('user_id,profiles(full_name,active)').eq('workspace_id', ws),
  ])
  const perfil = (m: { profiles: unknown }) => (Array.isArray(m.profiles) ? m.profiles[0] : m.profiles) as { full_name?: string; active?: boolean } | null
  const nomes: Record<string, string> = Object.fromEntries((membros ?? []).map((m) => [m.user_id as string, perfil(m)?.full_name ?? 'Alguém']))
  const { data: conferencia } = inventario ? await supabase.from('pat_conferencias').select('conferido_em').eq('inventario_id', inventario.id).eq('bem_id', id).maybeSingle() : { data: null }
  // Voluntários ativos só pelo nome, para a entrega (quem opera o patrimônio pode não ter acesso ao cadastro do Voluntariado).
  const { data: voluntarios } = nivel >= 2 && b.situacao !== 'baixado'
    ? await createAdminClient().from('participantes').select('id,nome,nome_social').eq('workspace_id', ws).eq('situacao', 'ativo').is('anonimizado_em', null).order('nome').limit(5000)
    : { data: [] }

  const atual = (cautelas ?? []).find((x) => !x.devolvido_em)
  const cat = c?.categorias.find((k) => k.id === b.categoria_id)
  const d = depreciacao({ valor: b.valor, aquisicao_em: b.aquisicao_em, vida_util_meses: cat?.vida_util_meses ?? null, residual_pct: cat?.residual_pct ?? 0, baixado_em: b.baixado_em, origem: b.origem }, hoje.slice(0, 7))
  const qr = await QRCode.toString(`${urlBase()}${caminhoDoQr(b.plaqueta)}`, { type: 'svg', margin: 0, errorCorrectionLevel: 'M', color: { dark: '#000000', light: '#ffffff' } })
  const pendentes = (manutencoes ?? []).filter((m) => !m.realizada_em)
  const feitas = (manutencoes ?? []).filter((m) => m.realizada_em)
  const baixado = b.situacao === 'baixado'
  const locais = (c?.locais ?? []).filter((l) => l.ativo).map((l) => ({ id: l.id, nome: l.nome }))

  return (
    <div className="flex flex-col gap-6">
      <SecoesDoPatrimonio atual="/patrimonio" nivel={nivel} />
      <PageHeader
        title={b.nome}
        description={`${b.plaqueta}${b.plaqueta_antiga ? ` · antiga ${b.plaqueta_antiga}` : ''} · ${cat?.nome ?? ''}`}
        actions={nivel >= 2 && !baixado ? (
          <div className="flex flex-wrap items-start gap-2" data-ajuda="patrimonio.bem-acoes">
            {atual ? <Devolver bemId={b.id} cautelaId={atual.id as string} locais={locais} localAtual={b.local_id} />
              : <Entregar bemId={b.id} equipe={(membros ?? []).filter((m) => perfil(m)?.active !== false).map((m) => ({ id: m.user_id as string, nome: perfil(m)?.full_name ?? 'Alguém' })).sort((x, y) => x.nome.localeCompare(y.nome, 'pt-BR'))}
                voluntarios={(voluntarios ?? []).map((v) => ({ id: v.id as string, nome: (v.nome_social || v.nome) as string }))} />}
            <Button variant="outline" render={<Link href={`/patrimonio/${b.id}/editar`} />}><Pencil className="size-4" />Editar</Button>
            <Button variant="outline" render={<a href={`/api/patrimonio/etiquetas?id=${b.id}`} target="_blank" rel="noreferrer" />}><Printer className="size-4" />Etiqueta</Button>
            {nivel >= 3 && !atual && <Baixar bemId={b.id} hoje={hoje} />}
          </div>
        ) : undefined}
      />

      {inventario && nivel >= 2 && !baixado && (
        <Conferir bemId={b.id} locais={locais} localAtual={b.local_id} estadoAtual={b.estado} conferido={Boolean(conferencia)} />
      )}

      {baixado && (
        <Card className="border-destructive/40 p-4 text-sm" id="baixa">
          <span className="font-medium text-destructive">Baixado em {data(b.baixado_em)}</span> — {DESTINOS_DE_BAIXA[b.destino_baixa as DestinoDeBaixa] ?? b.destino_baixa}. {b.motivo_baixa}
        </Card>
      )}

      <div className="grid gap-6 lg:grid-cols-[1fr_18rem]">
        <div className="flex flex-col gap-6">
          <Card className="p-5">
            <div className="mb-4 flex flex-wrap items-center gap-2">
              <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${SITUACOES[b.situacao].classe}`}>{SITUACOES[b.situacao].rotulo}</span>
              <span className="rounded-full bg-muted px-2.5 py-1 text-xs text-muted-foreground">Estado: {ESTADOS[b.estado as Estado] ?? b.estado}</span>
            </div>
            <dl className="grid gap-4 sm:grid-cols-2">
              <Dado rotulo="Onde está">{b.local_id ? c?.locais.find((l) => l.id === b.local_id)?.nome : null}</Dado>
              <Dado rotulo="Com quem">{atual ? <>{atual.nome as string}{atual.participante_id ? ' (voluntário)' : ''}</> : null}</Dado>
              <Dado rotulo="Marca e modelo">{[b.marca, b.modelo].filter(Boolean).join(' ')}</Dado>
              <Dado rotulo="Número de série">{b.numero_serie}</Dado>
              <Dado rotulo="Origem">{ORIGENS[b.origem as Origem] ?? b.origem}{b.fornecedor ? ` · ${b.fornecedor}` : ''}</Dado>
              <Dado rotulo="Aquisição">{b.aquisicao_em ? data(b.aquisicao_em) : null}{b.nota_fiscal ? ` · NF ${b.nota_fiscal}` : ''}</Dado>
              <Dado rotulo={b.origem === 'doacao' ? 'Valor de mercado' : 'Valor'}>{b.valor !== null ? reais(b.valor) : null}</Dado>
              <Dado rotulo="Garantia">{b.garantia_ate ? <span className={b.garantia_ate < hoje ? 'text-muted-foreground' : ''}>{b.garantia_ate < hoje ? 'Venceu em ' : 'Até '}{data(b.garantia_ate)}</span> : null}</Dado>
              {b.fonte_id && <Dado rotulo="Comprado com">{c?.fontes.find((f) => f.id === b.fonte_id)?.nome ?? 'fonte do Financeiro'}</Dado>}
              {b.projeto_id && <Dado rotulo="Projeto">{c?.projetos.find((p) => p.id === b.projeto_id)?.name}</Dado>}
            </dl>
            {(b.descricao || b.observacao) && <p className="mt-4 whitespace-pre-line border-t border-border pt-4 text-sm text-muted-foreground">{[b.descricao, b.observacao].filter(Boolean).join('\n\n')}</p>}
          </Card>

          <Card className="p-5" id="manutencoes" data-ajuda="patrimonio.bem-manutencao">
            <div className="mb-3 flex items-center justify-between gap-2">
              <h2 className="font-semibold">Manutenção</h2>
              {nivel >= 2 && !baixado && <NovaManutencao bemId={b.id} hoje={hoje} />}
            </div>
            {!pendentes.length && !feitas.length && <p className="text-sm text-muted-foreground">Nenhuma manutenção registrada.{cat?.manutencao_meses || b.manutencao_meses ? ` Periodicidade: a cada ${b.manutencao_meses ?? cat?.manutencao_meses} meses.` : ''}</p>}
            <ul className="flex flex-col divide-y divide-border">
              {pendentes.map((m) => {
                const s = situacaoDaManutencao(m.prevista_para as string | null, null, hoje)
                return (
                  <li key={m.id as string} className="flex flex-wrap items-center justify-between gap-2 py-2.5 text-sm">
                    <span><span className="font-medium">{m.descricao as string}</span>
                      <span className={`block text-xs ${s === 'vencida' ? 'text-destructive' : s === 'proxima' ? 'text-warning-foreground' : 'text-muted-foreground'}`}>
                        <Clock className="mr-1 inline size-3" />{TIPOS_DE_MANUTENCAO[m.tipo as TipoDeManutencao]} · {s === 'vencida' ? 'venceu em' : 'prevista para'} {data(m.prevista_para as string | null)}</span></span>
                    {nivel >= 2 && <ManutencaoPendente bemId={b.id} m={{ id: m.id as string, tipo: m.tipo as string, descricao: m.descricao as string, prevista_para: m.prevista_para as string | null, fornecedor: m.fornecedor as string | null }} hoje={hoje} />}
                  </li>
                )
              })}
              {feitas.map((m) => (
                <li key={m.id as string} className="flex flex-wrap items-center justify-between gap-2 py-2.5 text-sm">
                  <span><span>{m.descricao as string}</span><span className="block text-xs text-muted-foreground"><CheckCircle2 className="mr-1 inline size-3 text-success" />{TIPOS_DE_MANUTENCAO[m.tipo as TipoDeManutencao]} · {data(m.realizada_em as string)}{m.fornecedor ? ` · ${m.fornecedor}` : ''}</span></span>
                  {m.custo !== null && <span className="tabular-nums text-muted-foreground">{reais(Number(m.custo))}</span>}
                </li>
              ))}
            </ul>
          </Card>

          {(cautelas ?? []).length > 0 && (
            <Card className="p-5" id="cautelas">
              <h2 className="mb-3 font-semibold">Com quem esteve</h2>
              <ul className="flex flex-col gap-3 text-sm">
                {(cautelas ?? []).map((x) => (
                  <li key={x.id as string}>
                    <span className="font-medium">{x.nome as string}</span>{x.participante_id ? <span className="text-xs text-muted-foreground"> (voluntário)</span> : null}
                    <span className="block text-xs text-muted-foreground">
                      de {data(x.entregue_em as string)} {x.devolvido_em ? `a ${data(x.devolvido_em as string)}${x.estado_devolucao ? ` · voltou ${(ESTADOS[x.estado_devolucao as Estado] ?? '').toLowerCase()}` : ''}` : x.prevista_devolucao ? `· devolver até ${data(x.prevista_devolucao as string)}` : '· com a pessoa'}
                      {' · '}{x.termo_aceito_em ? `termo aceito em ${data(x.termo_aceito_em as string)}` : <span className="text-warning-foreground">termo ainda não aceito</span>}
                    </span>
                    {x.observacao && <span className="block text-xs text-muted-foreground">“{x.observacao as string}”</span>}
                  </li>
                ))}
              </ul>
            </Card>
          )}
        </div>

        <div className="flex flex-col gap-6">
          <Card className="flex flex-col items-center gap-2 p-5" id="qr" data-ajuda="patrimonio.bem-qr">
            <div className="w-40 [&_svg]:h-auto [&_svg]:w-full" dangerouslySetInnerHTML={{ __html: qr }} />
            <p className="font-mono text-sm font-semibold">{b.plaqueta}</p>
            <p className="text-center text-xs text-muted-foreground">Lido pelo celular, abre esta página. {nivel >= 2 ? 'Com inventário aberto, dá para conferir daqui.' : ''}</p>
          </Card>
          {d && (
            <Card className="p-5" id="depreciacao">
              <h2 className="mb-3 font-semibold">Depreciação</h2>
              <dl className="flex flex-col gap-2 text-sm">
                <div className="flex justify-between"><dt className="text-muted-foreground">Valor</dt><dd className="tabular-nums">{reais(b.valor ?? 0)}</dd></div>
                <div className="flex justify-between"><dt className="text-muted-foreground">Por mês</dt><dd className="tabular-nums">{reais(d.mensal)}</dd></div>
                <div className="flex justify-between"><dt className="text-muted-foreground">Acumulada</dt><dd className="tabular-nums">{reais(d.acumulada)}</dd></div>
                <div className="flex justify-between border-t border-border pt-2 font-medium"><dt>Valor contábil</dt><dd className="tabular-nums">{reais(d.contabil)}</dd></div>
              </dl>
              <p className="mt-2 text-xs text-muted-foreground">{d.meses} de {cat?.vida_util_meses} meses de vida útil{d.terminou ? ' — totalmente depreciado' : ''}. Linear, a partir do mês seguinte à aquisição.</p>
            </Card>
          )}
          {(historico ?? []).length > 0 && (
            <Card className="p-5" id="historico" data-ajuda="patrimonio.bem-historico">
              <h2 className="mb-3 font-semibold">Histórico</h2>
              <ul className="flex flex-col gap-2 text-xs">
                {(historico ?? []).map((h, i) => (
                  <li key={i}><span className="font-medium">{h.user_id ? nomes[h.user_id as string] ?? 'Alguém' : ((h.detalhe as { por?: string })?.por ?? 'Voluntário')}</span> {ACOES[h.acao as string] ?? h.acao}
                    {(h.detalhe as { para?: string })?.para ? ` para ${(h.detalhe as { para: string }).para}` : ''}
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
